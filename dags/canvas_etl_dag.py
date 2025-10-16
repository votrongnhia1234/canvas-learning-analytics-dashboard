#
# canvas_etl_dag.py — FINAL VERSION (multi-course + stable)
#
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
import requests
import pandas as pd
from sqlalchemy import create_engine
import os
from dotenv import load_dotenv

# --- LOAD ENVIRONMENT VARIABLES ---
load_dotenv()

CANVAS_API_BASE_URL = os.getenv("CANVAS_API_BASE_URL")
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN")
COURSE_IDS = os.getenv("COURSE_IDS").split(",")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING")

HEADERS = {"Authorization": f"Bearer {CANVAS_API_TOKEN}"}


# --- TASK 1: EXTRACT COURSE INFO ---
def extract_courses():
    """Lấy thông tin tên khóa học từ Canvas API và lưu vào dim_courses"""
    courses_data = []

    for cid in COURSE_IDS:
        res = requests.get(f"{CANVAS_API_BASE_URL}courses/{cid}", headers=HEADERS)
        if res.status_code == 200:
            data = res.json()
            course_name = data.get("name", f"Course {cid}")
            courses_data.append({"course_id": str(cid), "course_name": course_name})
            print(f"✅ {cid} - {course_name}")
        else:
            print(f"⚠️ Không lấy được thông tin cho course {cid}")

    df_courses = pd.DataFrame(courses_data)
    engine = create_engine(DB_CONNECTION_STRING)

    # 🧩 Dùng 'replace' chỉ 1 lần để cập nhật lại toàn bộ danh sách khóa học
    try:
        df_courses.to_sql("dim_courses", engine, if_exists="replace", index=False)
        print(f"📚 Đã lưu {len(df_courses)} khóa học vào dim_courses.")
    except Exception as e:
        print(f"⚠️ Lỗi khi tải dim_courses: {e}")

def extract_submissions_data():
    all_submissions = []

    for course_id in COURSE_IDS:
        print(f"\n🎓 Đang xử lý khóa học: {course_id}")
        url = f"{CANVAS_API_BASE_URL}courses/{course_id}/assignments"
        res = requests.get(url, headers=HEADERS)

        if res.status_code != 200:
            print(f"⚠️ Không thể truy cập khóa học {course_id} — status {res.status_code}")
            continue

        assignments = res.json()
        if not isinstance(assignments, list) or len(assignments) == 0:
            print(f"⚠️ Khóa học {course_id} không có assignments.")
            continue

        print(f"📚 {len(assignments)} bài tập tìm thấy trong khóa {course_id}")

        for a in assignments:
            assignment_id = a["id"]
            submissions_url = (
                f"{CANVAS_API_BASE_URL}courses/{course_id}/assignments/{assignment_id}/submissions?include[]=user"
            )
            subs = requests.get(submissions_url, headers=HEADERS).json()
            for s in subs:
                s["course_id"] = str(course_id)
            all_submissions.extend(subs)
            print(f"✅ {len(subs)} submissions từ {a['name']} (course {course_id})")

    if len(all_submissions) == 0:
        print("⚠️ Không có submissions nào được lấy — kiểm tra lại các course ID hoặc assignments trên Canvas.")
        return

    df = pd.json_normalize(all_submissions)
    df.to_csv("/tmp/raw_submissions.csv", index=False)
    print(f"📦 Đã trích xuất {len(df)} submissions từ {len(COURSE_IDS)} khóa học.")



# --- TASK 3: TRANSFORM & LOAD ---
def transform_and_load_data():
    """Làm sạch và tải dữ liệu submissions vào Data Warehouse"""
    df = pd.read_csv("/tmp/raw_submissions.csv")

    # 🧠 Đảm bảo có cột course_id
    if "course_id" not in df.columns:
        print("⚠️ Thiếu cột course_id trong dữ liệu! Kiểm tra lại hàm extract_submissions_data.")
        return

    # --- DIM STUDENTS ---
    df_students = df[["user.id", "user.name", "user.login_id"]].drop_duplicates()
    df_students.columns = ["student_id", "student_name", "student_email"]

    # --- FACT SUBMISSIONS ---
    df_facts = df[["id", "user.id", "assignment_id", "submitted_at", "grade", "late", "course_id"]].rename(
        columns={"id": "submission_id", "user.id": "student_id"}
    )
    df_facts["submitted_at"] = pd.to_datetime(df_facts["submitted_at"], errors="coerce")
    df_facts["grade"] = pd.to_numeric(df_facts["grade"], errors="coerce")
    df_facts["course_id"] = df_facts["course_id"].astype(str)

    # --- LOAD TO DATABASE ---
    engine = create_engine(DB_CONNECTION_STRING)
    with engine.connect() as conn:
        try:
            # Ghi thêm sinh viên (append)
            df_students.to_sql("dim_students", conn, if_exists="append", index=False)
            print(f"👩‍🎓 Đã tải {len(df_students)} bản ghi vào dim_students.")
        except Exception as e:
            print(f"⚠️ Lỗi tải dim_students (có thể trùng khóa): {e}")

        # Ghi thêm submissions
        df_facts.to_sql("fact_submissions", conn, if_exists="append", index=False)
        print(f"📊 Đã tải {len(df_facts)} bản ghi vào fact_submissions.")


# --- DAG DEFINITION ---
with DAG(
    dag_id="canvas_etl_pipeline",
    start_date=datetime(2025, 10, 10),
    schedule="@daily",
    catchup=False,
    tags=["canvas", "etl"],
) as dag:

    extract_courses_task = PythonOperator(
        task_id="extract_courses_info",
        python_callable=extract_courses,
    )

    extract_submissions_task = PythonOperator(
        task_id="extract_canvas_submissions",
        python_callable=extract_submissions_data,
    )

    transform_load_task = PythonOperator(
        task_id="transform_and_load_to_dwh",
        python_callable=transform_and_load_data,
    )

    extract_courses_task >> extract_submissions_task >> transform_load_task
