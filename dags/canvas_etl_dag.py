# =====================================================
# 🧠 Canvas ETL Pipeline (Local API + PostgreSQL DWH)
# Author: Võ Trọng Nghĩa (HUTECH)
# =====================================================

from airflow import DAG
from airflow.operators.python import PythonOperator
import subprocess
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
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING")
# Force Host header to match Canvas dev domain to avoid 403 on internal service name
CANVAS_API_HOST = os.getenv("CANVAS_API_HOST", "localhost:3000")

print(f"🔧 API URL: {CANVAS_API_BASE_URL}")
print(f"🔧 Token exists: {bool(CANVAS_API_TOKEN)}")

HEADERS = {
    "Authorization": f"Bearer {CANVAS_API_TOKEN}",
    "Host": CANVAS_API_HOST,
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}


# =====================================================
# 🔍 Auto-discover all active courses
# =====================================================
def get_all_course_ids():
    """Tự động lấy danh sách tất cả khóa học active từ Canvas API"""
    all_courses = []
    page = 1
    
    while True:
        url = f"{CANVAS_API_BASE_URL}courses?state[]=available&per_page=100&page={page}"
        res = requests.get(url, headers=HEADERS)
        
        if res.status_code != 200:
            print(f"⚠️ Không thể lấy danh sách khóa học (HTTP {res.status_code})")
            break
        
        courses = res.json()
        if not courses:
            break
        
        all_courses.extend([str(c['id']) for c in courses])
        print(f"📘 Tìm thấy {len(courses)} khóa học ở trang {page}")
        page += 1
        
        if page > 50:  # Safety limit
            break
    
    print(f"🎓 Tổng cộng: {len(all_courses)} khóa học active")
    return all_courses


# =====================================================
# 1️⃣ Extract Courses Info (Auto-discovery)
# =====================================================
def extract_courses():
    """Tự động lấy tất cả khóa học active và lưu vào DWH"""
    course_ids = get_all_course_ids()
    
    if not course_ids:
        print("⚠️ Không tìm thấy khóa học nào.")
        return
    
    courses_data = []
    for cid in course_ids:
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
    
    # Lưu danh sách course IDs vào file tạm để các task khác sử dụng
    pd.DataFrame({"course_id": course_ids}).to_csv("/tmp/course_ids.csv", index=False)


# =====================================================
# 2️⃣ Extract Students + Submissions (Auto-discovery)
# =====================================================
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
