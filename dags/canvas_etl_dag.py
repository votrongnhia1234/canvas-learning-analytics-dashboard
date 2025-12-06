"""
Canvas ETL Pipeline (Local API + PostgreSQL DWH)

End-to-end DAG:
- Extract: courses, students, assignments, submissions
- Load: dim_courses, dim_students, dim_assignments, fact_submissions
- Train ML: run local pipeline to refresh analytic tables
"""

from airflow import DAG
from airflow.exceptions import AirflowFailException
from airflow.operators.python import PythonOperator
from datetime import datetime
import os
import requests
from requests.adapters import HTTPAdapter
from urllib.parse import urlparse
from urllib3.util.retry import Retry
import pandas as pd
from sqlalchemy import create_engine, text
import subprocess
from dotenv import load_dotenv


# --- Load environment variables (.env.local) ---
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local")
if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)
else:
    load_dotenv()

CANVAS_API_BASE_URL = os.getenv("CANVAS_API_BASE_URL", "http://web/api/v1/").rstrip("/") + "/"
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN", "")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING", "postgresql+psycopg2://postgres:sekret@postgres:5432/canvas_dwh")
parsed_base = urlparse(CANVAS_API_BASE_URL)
CANVAS_API_HOST = os.getenv("CANVAS_API_HOST", parsed_base.netloc)
CANVAS_API_TIMEOUT = float(os.getenv("CANVAS_API_TIMEOUT", "30"))
CANVAS_API_RETRIES = int(os.getenv("CANVAS_API_RETRIES", "3"))
CANVAS_API_RETRY_BACKOFF = float(os.getenv("CANVAS_API_RETRY_BACKOFF", "1.0"))

HEADERS = {
    "Authorization": f"Bearer {CANVAS_API_TOKEN}",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}
if CANVAS_API_HOST:
    HEADERS["Host"] = CANVAS_API_HOST

# Persistent session with retries to avoid transient Canvas API failures leaving the DAG "successful"
_session = requests.Session()
retry_strategy = Retry(
    total=CANVAS_API_RETRIES,
    connect=CANVAS_API_RETRIES,
    read=CANVAS_API_RETRIES,
    status=CANVAS_API_RETRIES,
    allowed_methods=frozenset(["GET"]),
    backoff_factor=CANVAS_API_RETRY_BACKOFF,
    status_forcelist=[408, 429, 500, 502, 503, 504],
    raise_on_status=False,
)
adapter = HTTPAdapter(max_retries=retry_strategy)
_session.mount("http://", adapter)
_session.mount("https://", adapter)

def _engine():
    return create_engine(DB_CONNECTION_STRING)


def _get_json(url):
    try:
        response = _session.get(url, headers=HEADERS, timeout=CANVAS_API_TIMEOUT)
    except requests.exceptions.RequestException as exc:
        raise AirflowFailException(f"GET {url} failed after retries: {exc}") from exc

    if response.status_code != 200:
        snippet = response.text[:200] if response.text else ""
        raise AirflowFailException(f"GET {url} -> {response.status_code} {snippet}")

    try:
        return response.json()
    except ValueError as exc:
        raise AirflowFailException(f"GET {url} returned invalid JSON: {exc}") from exc


def get_all_course_ids():
    """Auto-discover all active (available) course IDs."""
    all_ids = []
    page = 1
    while True:
        url = f"{CANVAS_API_BASE_URL}courses?state[]=available&per_page=100&page={page}"
        data = _get_json(url)
        if not data:
            break
        ids = [int(c.get("id")) for c in data if c.get("id")]
        all_ids.extend(ids)
        print(f"page {page}: found {len(ids)} courses (total {len(all_ids)})")
        if len(data) < 100:
            break
        page += 1
        if page > 200:
            print("WARN: stop discovery after 200 pages")
            break
    print(f"[ETL] Discovered total courses: {len(all_ids)}")
    return all_ids


def extract_courses():
    course_ids = get_all_course_ids()
    if not course_ids:
        print("[ETL] No courses found, skipping dim_courses")
        return 0
    print(f"[ETL] Will process courses: {course_ids}")
    rows = []
    for cid in course_ids:
        data = _get_json(f"{CANVAS_API_BASE_URL}courses/{cid}")
        if not data:
            continue
        rows.append({
            "course_id": cid,
            "course_name": data.get("name"),
            "course_code": data.get("course_code"),
        })

    if not rows:
        print("[ETL] No course details fetched")
        return 0

    df = pd.DataFrame(rows)
    eng = _engine()
    df.to_sql("dim_courses", eng, if_exists="replace", index=False)
    print(f"[ETL] Wrote dim_courses: {len(df)} rows")
    # share course list for next task
    pd.DataFrame({"course_id": [r["course_id"] for r in rows]}).to_csv("/tmp/course_ids.csv", index=False)
    return len(df)

def extract_submissions_data():
    # Đọc danh sách course IDs từ file tạm
    if not os.path.exists("/tmp/course_ids.csv"):
        print("⚠️ Không tìm thấy danh sách khóa học. Hãy chạy task extract_courses trước.")
        return
    
    df_courses = pd.read_csv("/tmp/course_ids.csv")
    course_ids = df_courses["course_id"].astype(str).tolist()
    print(f"🎓 Sẽ xử lý {len(course_ids)} khóa học: {course_ids}")
    
    all_students = []
    all_submissions = []
    all_assignments = []

    for course_id in course_ids:
        print(f"\n🎓 Đang xử lý khóa học {course_id}")
        page = 1
        prev_students = None
        total_students = 0

        # --- Lấy toàn bộ sinh viên ---
        while True:
            url = f"{CANVAS_API_BASE_URL}courses/{course_id}/students?per_page=100&page={page}"
            res = requests.get(url, headers=HEADERS)
            if res.status_code != 200:
                print(f"⚠️ Lỗi khi lấy sinh viên khóa {course_id}: {res.status_code}")
                break

            students = res.json()
            if not students:
                print(f"✅ Hết dữ liệu sinh viên sau {page-1} trang.")
                break

            # 🚫 Phát hiện trùng dữ liệu
            if prev_students == students:
                print(f"⚠️ Phát hiện dữ liệu lặp lại ở trang {page}, dừng vòng lặp.")
                break

            sanitized_students = [
                {
                    "id": stu.get("id"),
                    "name": stu.get("name"),
                    "login_id": stu.get("login_id") or stu.get("email"),
                }
                for stu in students
            ]
            all_students.extend(sanitized_students)
            total_students += len(sanitized_students)
            print(f"📘 Trang {page}: {len(sanitized_students)} sinh viên (Tổng: {total_students})")

            prev_students = students
            page += 1

            if page > 200:
                print("⚠️ Dừng vòng lặp sau 200 trang để tránh loop vô hạn.")
                break

        # --- Lấy danh sách bài tập ---
        assign_url = f"{CANVAS_API_BASE_URL}courses/{course_id}/assignments?per_page=100"
        res = requests.get(assign_url, headers=HEADERS)
        if res.status_code != 200:
            print(f"⚠️ Lỗi khi lấy assignments khóa {course_id}")
            continue

        assignments = res.json()
        sanitized_assignments = [
            {
                "assignment_id": a.get("id"),
                "course_id": str(course_id),
                "assignment_name": a.get("name"),
                "due_at": a.get("due_at"),
                "points_possible": a.get("points_possible"),
                "created_at": a.get("created_at"),
            }
            for a in assignments
        ]
        all_assignments.extend(sanitized_assignments)
        print(f"📚 {len(assignments)} bài tập trong khóa {course_id}")

        # --- Lấy bài nộp của từng assignment ---
        for a in assignments:
            a_id = a["id"]
            sub_page = 1
            prev_subs = None
            while True:
                sub_url = (
                    f"{CANVAS_API_BASE_URL}courses/{course_id}/assignments/{a_id}/submissions"
                    f"?include[]=user&per_page=100&page={sub_page}"
                )
                subs = requests.get(sub_url, headers=HEADERS)
                if subs.status_code != 200:
                    break

                data = subs.json()
                if not data:
                    break

                if prev_subs == data:
                    print(f"⚠️ Dữ liệu submissions lặp lại ở trang {sub_page}, dừng.")
                    break

                cleaned_batch = []
                missing_user_ids = 0
                for s in data:
                    user_info = s.get("user") or {}
                    user_id = user_info.get("id")
                    if user_id is None:
                        missing_user_ids += 1

                    cleaned_batch.append(
                        {
                            "id": s.get("id"),
                            "user_id": user_id,
                            "assignment_id": s.get("assignment_id"),
                            "submitted_at": s.get("submitted_at"),
                            "grade": s.get("grade"),
                            "late": s.get("late"),
                            "course_id": str(course_id),
                        }
                    )

                all_submissions.extend(cleaned_batch)
                print(f"📄 {len(cleaned_batch)} submissions (assignment {a_id}, page {sub_page})")
                if missing_user_ids:
                    print(
                        f"⚠️ Có {missing_user_ids} submissions thiếu user.id ở assignment {a_id} (course {course_id})"
                    )

                prev_subs = data
                sub_page += 1

                if sub_page > 200:
                    print("⚠️ Dừng lấy submissions sau 200 trang.")
                    break

    # --- Lưu tạm dữ liệu ---
    pd.DataFrame(all_students).to_csv("/tmp/raw_students.csv", index=False)
    pd.DataFrame(all_submissions).to_csv("/tmp/raw_submissions.csv", index=False)
    assignment_columns = [
        "assignment_id",
        "course_id",
        "assignment_name",
        "due_at",
        "points_possible",
        "created_at",
    ]
    assignments_df = pd.DataFrame(all_assignments, columns=assignment_columns)
    assignments_df.to_csv("/tmp/raw_assignments.csv", index=False)
    print(f"📦 Hoàn tất trích xuất: {len(all_students)} sinh viên, {len(all_submissions)} submissions.")

def transform_and_load_data():
    students_csv = "/tmp/raw_students.csv"
    submissions_csv = "/tmp/raw_submissions.csv"
    assignments_csv = "/tmp/raw_assignments.csv"

    if (
        not os.path.exists(students_csv)
        or not os.path.exists(submissions_csv)
        or not os.path.exists(assignments_csv)
    ):
        print("⚠️ Thiếu file dữ liệu thô. Hãy chạy task extract trước.")
        return

    try:
        df_students_raw = pd.read_csv(students_csv)
        df_subs_raw = pd.read_csv(submissions_csv)
        df_assignments_raw = pd.read_csv(assignments_csv)
    except pd.errors.EmptyDataError:
        print("⚠️ File CSV rỗng. Không có dữ liệu để xử lý.")
        return

    if df_students_raw.empty or df_subs_raw.empty:
        print("⚠️ Dữ liệu rỗng. Không thể tiếp tục transform.")
        return

    # --- Làm sạch dữ liệu sinh viên ---
    df_students = (
        df_students_raw[["id", "name", "login_id"]]
        .drop_duplicates(subset=["id"])
        .rename(columns={"id": "student_id", "name": "student_name", "login_id": "student_email"})
    )
    df_students["student_email"] = df_students["student_email"].fillna("")
    df_students["student_id"] = pd.to_numeric(df_students["student_id"], errors="coerce")
    missing_student_ids = df_students["student_id"].isna().sum()
    if missing_student_ids:
        print(f"⚠️ Bỏ {missing_student_ids} bản ghi sinh viên vì thiếu student_id")
        df_students = df_students.dropna(subset=["student_id"])
    # Keep numeric type to align with dim/fact schemas (BIGINT)
    df_students["student_id"] = df_students["student_id"].astype("Int64")

    assignment_cols = [
        "assignment_id",
        "course_id",
        "assignment_name",
        "due_at",
        "points_possible",
        "created_at",
    ]
    if df_assignments_raw.empty:
        print("[ETL] Assignment dataset empty. Creating placeholder table.")
        df_assignments = pd.DataFrame(columns=assignment_cols)
    else:
        df_assignments = df_assignments_raw.copy()
        missing_assignment_ids = df_assignments["assignment_id"].isna().sum()
        if missing_assignment_ids:
            print(f"[ETL] Dropping {missing_assignment_ids} assignments missing assignment_id")
            df_assignments = df_assignments.dropna(subset=["assignment_id"])
        df_assignments["assignment_id"] = pd.to_numeric(
            df_assignments["assignment_id"], errors="coerce"
        )
        df_assignments = df_assignments.dropna(subset=["assignment_id"])
        df_assignments["assignment_id"] = df_assignments["assignment_id"].astype("Int64")
        df_assignments["course_id"] = pd.to_numeric(
            df_assignments["course_id"], errors="coerce"
        ).astype("Int64")
        df_assignments["points_possible"] = pd.to_numeric(
            df_assignments.get("points_possible"), errors="coerce"
        )
        df_assignments["due_at"] = pd.to_datetime(df_assignments.get("due_at"), errors="coerce")
        df_assignments["created_at"] = pd.to_datetime(
            df_assignments.get("created_at"), errors="coerce"
        )
        df_assignments = df_assignments[assignment_cols]

    # --- Làm sạch dữ liệu submissions ---
    # Một số submissions có thể không có "user_id" → loại bỏ nếu thiếu
    if "user_id" not in df_subs_raw.columns:
        print("⚠️ Không tìm thấy cột 'user_id' trong submissions. Sẽ bỏ qua phần student_id.")
        df_subs_raw["user_id"] = None

    cols_needed = [
        "id",
        "user_id",
        "assignment_id",
        "submitted_at",
        "grade",
        "late",
        "course_id",
    ]
    df_facts = (
        df_subs_raw[[c for c in cols_needed if c in df_subs_raw.columns]]
        .rename(columns={"id": "submission_id", "user_id": "student_id"})
    )
    missing_submission_ids = df_facts["student_id"].isna().sum()
    if missing_submission_ids:
        print(f"⚠️ Bỏ {missing_submission_ids} submissions vì thiếu student_id")
        df_facts = df_facts.dropna(subset=["student_id"])

    # --- Làm sạch kiểu dữ liệu ---
    df_facts["submitted_at"] = pd.to_datetime(df_facts["submitted_at"], errors="coerce")
    # Loại các bản ghi chưa từng nộp (Canvas vẫn trả về submission với submitted_at null)
    df_facts = df_facts.dropna(subset=["submitted_at"])
    df_facts["grade"] = pd.to_numeric(df_facts["grade"], errors="coerce")
    df_facts["late"] = df_facts["late"].fillna(False).astype(bool)
    df_facts["student_id"] = pd.to_numeric(df_facts["student_id"], errors="coerce")
    coercion_missing = df_facts["student_id"].isna().sum()
    if coercion_missing:
        print(f"⚠️ Bỏ thêm {coercion_missing} submissions vì không thể chuyển student_id sang số")
        df_facts = df_facts.dropna(subset=["student_id"])
    # Ensure IDs are numeric BIGINT-compatible for consistent joins
    df_facts["student_id"] = df_facts["student_id"].astype("Int64")
    df_facts["course_id"] = pd.to_numeric(df_facts["course_id"], errors="coerce").astype("Int64")

    # --- Gắn thông tin sinh viên (JOIN từ dim_students) ---
    df_facts = df_facts.merge(
        df_students[["student_id", "student_name"]],
        on="student_id",
        how="left"
    )

    # --- Ghi vào Data Warehouse ---
    engine = create_engine(DB_CONNECTION_STRING)
    with engine.connect() as conn:
        df_students.to_sql("dim_students", conn, if_exists="replace", index=False)
        df_facts.to_sql("fact_submissions", conn, if_exists="replace", index=False)
        df_assignments.to_sql("dim_assignments", conn, if_exists="replace", index=False)
    print(f"[ETL] Wrote {len(df_assignments)} assignments to dim_assignments")

    print(f"👩‍🎓 {len(df_students)} sinh viên → dim_students")
    print(f"📊 {len(df_facts)} submissions (có student_id) → fact_submissions")



def run_ml_pipeline():
    print("[ML] Starting build_visualizations()")
    try:
        from learning_analytics.features.pipeline import build_visualizations
    except Exception as e:
        print(f"[ML] Import error: {e}")
        raise
    try:
        build_visualizations()
    except Exception as e:
        print(f"[ML] Pipeline failed: {e}")
        raise
    print("[ML] Pipeline completed successfully")
    return 0


def build_student_course_features():
    """Tạo bảng student_course_features từ dữ liệu DWH để dashboard sử dụng."""
    print("[FEATURES] Building student_course_features table...")
    engine = create_engine(DB_CONNECTION_STRING)
    
    sql = """
        DROP TABLE IF EXISTS student_course_features;
        
        CREATE TABLE student_course_features AS
        WITH latest_ts AS (
            SELECT COALESCE(MAX(submitted_at), NOW()) AS latest_submission FROM fact_submissions
        ),
        student_courses AS (
            SELECT DISTINCT student_id, course_id FROM fact_submissions
        ),
        submissions_per_course AS (
            SELECT
                fs.student_id,
                fs.course_id,
                AVG(fs.grade) FILTER (WHERE fs.grade IS NOT NULL) AS course_final_avg,
                COUNT(*) AS course_submission_count,
                SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS course_late_ratio,
                COUNT(*) FILTER (
                    WHERE fs.submitted_at >= (SELECT latest_submission - INTERVAL '14 days' FROM latest_ts)
                ) AS submissions_last_14d,
                COUNT(*) FILTER (
                    WHERE fs.submitted_at >= (SELECT latest_submission - INTERVAL '30 days' FROM latest_ts)
                ) AS submissions_last_30d,
                AVG(EXTRACT(EPOCH FROM (fs.submitted_at - COALESCE(da.due_at, fs.submitted_at))) / 3600.0) FILTER (
                    WHERE fs.submitted_at > COALESCE(da.due_at, fs.submitted_at)
                ) AS avg_delay_hours
            FROM fact_submissions fs
            LEFT JOIN dim_assignments da ON da.assignment_id = fs.assignment_id
            GROUP BY fs.student_id, fs.course_id
        ),
        early_submissions AS (
            SELECT
                fs.student_id,
                fs.course_id,
                AVG(fs.grade) FILTER (WHERE fs.grade IS NOT NULL) AS early_avg_grade,
                COUNT(*) AS early_submission_count,
                SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS early_late_ratio,
                COUNT(DISTINCT DATE_TRUNC('week', fs.submitted_at)) AS active_weeks_early
            FROM fact_submissions fs
            WHERE fs.submission_id IN (
                SELECT submission_id FROM (
                    SELECT 
                        *,
                        ROW_NUMBER() OVER (PARTITION BY student_id, course_id ORDER BY submitted_at) AS rn,
                        COUNT(*) OVER (PARTITION BY student_id, course_id) AS total_count
                    FROM fact_submissions
                ) sub
                WHERE rn <= CEIL(total_count * 0.6)::int
            )
            GROUP BY fs.student_id, fs.course_id
        ),
        course_assignments AS (
            SELECT course_id, COUNT(*) AS total_assignments FROM dim_assignments GROUP BY course_id
        ),
        student_assignment_completion AS (
            SELECT
                fs.student_id,
                fs.course_id,
                COUNT(DISTINCT fs.assignment_id) AS completed_assignments
            FROM fact_submissions fs
            GROUP BY fs.student_id, fs.course_id
        )
        SELECT
            ds.student_id,
            ds.student_name,
            ds.student_email,
            sc.course_id,
            dc.course_name,
            COALESCE(spc.course_final_avg, 0) AS course_final_avg,
            COALESCE(spc.course_submission_count, 0) AS course_submission_count,
            COALESCE(spc.course_late_ratio, 0) AS course_late_ratio,
            COALESCE(es.early_avg_grade, 0) AS early_avg_grade,
            COALESCE(es.early_submission_count, 0)::int AS early_submission_count,
            COALESCE(es.early_late_ratio, 0) AS early_late_ratio,
            COALESCE(es.active_weeks_early, 0)::int AS active_weeks_early,
            COALESCE(spc.avg_delay_hours, 0) AS avg_delay_hours,
            COALESCE(spc.submissions_last_14d, 0)::int AS submissions_last_14d,
            COALESCE(spc.submissions_last_30d, 0)::int AS submissions_last_30d,
            CASE 
                WHEN COALESCE(ca.total_assignments, 0) = 0 THEN 0
                ELSE COALESCE(sac.completed_assignments, 0)::numeric / ca.total_assignments
            END AS assignment_completion_ratio,
            1 AS course_load,
            COALESCE(sf.risk_probability, 0) AS risk_probability,
            COALESCE(sf.risk_bucket, 'Thấp') AS risk_bucket,
            COALESCE(sf.predicted_at_risk, 0) AS predicted_at_risk
        FROM student_courses sc
        JOIN dim_students ds ON ds.student_id = sc.student_id
        JOIN dim_courses dc ON dc.course_id = sc.course_id
        LEFT JOIN submissions_per_course spc ON spc.student_id = sc.student_id AND spc.course_id = sc.course_id
        LEFT JOIN early_submissions es ON es.student_id = sc.student_id AND es.course_id = sc.course_id
        LEFT JOIN course_assignments ca ON ca.course_id = sc.course_id
        LEFT JOIN student_assignment_completion sac ON sac.student_id = sc.student_id AND sac.course_id = sc.course_id
        LEFT JOIN student_features sf ON sf.student_id = ds.student_id;
    """
    
    try:
        with engine.begin() as conn:
            conn.execute(text(sql))
        
        # Verify table was created
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM student_course_features"))
            row_count = result.scalar()
            print(f"[FEATURES] ✅ student_course_features created with {row_count} rows")
    except Exception as e:
        print(f"[FEATURES] ❌ Error building student_course_features: {e}")
        raise
    
    return 0


with DAG(
    dag_id="canvas_etl_pipeline_local",
    start_date=datetime(2025, 10, 1),
    schedule="@hourly",
    catchup=False,
    tags=["canvas", "etl", "local"],
) as dag:

    extract_courses_task = PythonOperator(
        task_id="extract_courses",
        python_callable=extract_courses,
    )

    extract_submissions_task = PythonOperator(
        task_id="extract_submissions_data",
        python_callable=extract_submissions_data,
    )

    transform_and_load_task = PythonOperator(
        task_id="transform_and_load",
        python_callable=transform_and_load_data,
    )

    train_ml_task = PythonOperator(
        task_id="train_ml",
        python_callable=run_ml_pipeline,
    )

    build_features_task = PythonOperator(
        task_id="build_student_course_features",
        python_callable=build_student_course_features,
    )

    extract_courses_task >> extract_submissions_task >> transform_and_load_task >> train_ml_task >> build_features_task
