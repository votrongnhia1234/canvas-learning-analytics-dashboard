"""
Canvas ETL Pipeline (Local API + PostgreSQL DWH)

End-to-end DAG:
- Extract: courses, students, assignments, submissions
- Load: dim_courses, dim_students, dim_assignments, fact_submissions
- Train ML: run local pipeline to refresh analytic tables
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
import os
import requests
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

CANVAS_API_BASE_URL = os.getenv("CANVAS_API_BASE_URL", "http://web/api/v1/")
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN", "")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING", "postgresql+psycopg2://postgres:sekret@postgres:5432/canvas_dwh")
CANVAS_API_HOST = os.getenv("CANVAS_API_HOST", "localhost:3000")

HEADERS = {
    "Authorization": f"Bearer {CANVAS_API_TOKEN}",
    "Host": CANVAS_API_HOST,
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}


def _engine():
    return create_engine(DB_CONNECTION_STRING)


def _get_json(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code != 200:
            print(f"WARN: GET {url} -> {r.status_code} {r.text[:200] if r.text else ''}")
            return None
        return r.json()
    except Exception as e:
        print(f"ERROR: GET {url} failed: {e}")
        return None


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
    print(f"📦 Hoàn tất trích xuất: {len(all_students)} sinh viên, {len(all_submissions)} submissions.")

def transform_and_load_data():
    students_csv = "/tmp/raw_students.csv"
    submissions_csv = "/tmp/raw_submissions.csv"

    if not os.path.exists(students_csv) or not os.path.exists(submissions_csv):
        print("⚠️ Thiếu file dữ liệu thô. Hãy chạy task extract trước.")
        return

    try:
        df_students_raw = pd.read_csv(students_csv)
        df_subs_raw = pd.read_csv(submissions_csv)
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

    extract_courses_task >> extract_submissions_task >> transform_and_load_task >> train_ml_task
