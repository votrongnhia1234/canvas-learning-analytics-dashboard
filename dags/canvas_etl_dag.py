# =====================================================
# 🧠 Canvas ETL Pipeline (Local API + PostgreSQL DWH)
# Author: Võ Trọng Nghĩa (HUTECH)
# =====================================================

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
import requests
import pandas as pd
from sqlalchemy import create_engine
import os
from dotenv import load_dotenv

# --- Load environment variables (.env.local) ---
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

CANVAS_API_BASE_URL = os.getenv("CANVAS_API_BASE_URL", "http://web/api/v1/")
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN")
COURSE_IDS = os.getenv("COURSE_IDS", "1,2,3,4").split(",")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING")

print(f"🔧 API URL: {CANVAS_API_BASE_URL}")
print(f"🔧 Token exists: {bool(CANVAS_API_TOKEN)}")
print(f"🔧 Course IDs: {COURSE_IDS}")

HEADERS = {"Authorization": f"Bearer {CANVAS_API_TOKEN}"}


# =====================================================
# 1️⃣ Extract Courses Info
# =====================================================
def extract_courses():
    courses_data = []

    for cid in COURSE_IDS:
        res = requests.get(f"{CANVAS_API_BASE_URL}courses/{cid}", headers=HEADERS)
        if res.status_code == 200:
            data = res.json()
            courses_data.append({
                "course_id": str(cid),
                "course_name": data.get("name", f"Course {cid}")
            })
            print(f"✅ Lấy thông tin khóa học: {data.get('name')}")
        else:
            print(f"⚠️ Không lấy được course {cid} (HTTP {res.status_code})")

    if not courses_data:
        print("⚠️ Không có khóa học nào được lấy.")
        return

    df = pd.DataFrame(courses_data)
    engine = create_engine(DB_CONNECTION_STRING)
    df.to_sql("dim_courses", engine, if_exists="replace", index=False)
    print(f"📚 Đã lưu {len(df)} khóa học vào bảng dim_courses.")


# =====================================================
# 2️⃣ Extract Students + Submissions (fix pagination)
# =====================================================
def extract_submissions_data():
    all_students = []
    all_submissions = []

    for course_id in COURSE_IDS:
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

            all_students.extend(students)
            total_students += len(students)
            print(f"📘 Trang {page}: {len(students)} sinh viên (Tổng: {total_students})")

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

                for s in data:
                    s["course_id"] = str(course_id)
                all_submissions.extend(data)
                print(f"📄 {len(data)} submissions (assignment {a_id}, page {sub_page})")

                prev_subs = data
                sub_page += 1

                if sub_page > 200:
                    print("⚠️ Dừng lấy submissions sau 200 trang.")
                    break

    # --- Lưu tạm dữ liệu ---
    pd.DataFrame(all_students).to_csv("/tmp/raw_students.csv", index=False)
    pd.DataFrame(all_submissions).to_csv("/tmp/raw_submissions.csv", index=False)
    print(f"📦 Hoàn tất trích xuất: {len(all_students)} sinh viên, {len(all_submissions)} submissions.")


# =====================================================
# 3️⃣ Transform + Load
# =====================================================
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
    df_students = df_students_raw[["id", "name", "login_id"]].drop_duplicates(subset=["id"])
    df_students.columns = ["student_id", "student_name", "student_email"]

    # --- Làm sạch submissions ---
    cols_needed = ["id", "user.id", "assignment_id", "submitted_at", "grade", "late", "course_id"]
    df_facts = df_subs_raw[[c for c in cols_needed if c in df_subs_raw.columns]].rename(
        columns={"id": "submission_id", "user.id": "student_id"}
    )
    df_facts["submitted_at"] = pd.to_datetime(df_facts["submitted_at"], errors="coerce")
    df_facts["grade"] = pd.to_numeric(df_facts["grade"], errors="coerce")

    # --- Nạp vào DB ---
    engine = create_engine(DB_CONNECTION_STRING)
    with engine.connect() as conn:
        df_students.to_sql("dim_students", conn, if_exists="replace", index=False)
        df_facts.to_sql("fact_submissions", conn, if_exists="replace", index=False)

    print(f"👩‍🎓 {len(df_students)} sinh viên → dim_students")
    print(f"📊 {len(df_facts)} submissions → fact_submissions")


# =====================================================
# DAG Definition
# =====================================================
with DAG(
    dag_id="canvas_etl_pipeline_local",
    start_date=datetime(2025, 10, 1),
    schedule="@daily",
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

    extract_courses_task >> extract_submissions_task >> transform_and_load_task
