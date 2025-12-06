# 🚀 Canvas ETL Pipeline - Airflow DAG Guide

## 📋 Giới thiệu

**`canvas_etl_dag.py`** là DAG chính của hệ thống Learning Analytics, chịu trách nhiệm:
- ✅ Trích xuất dữ liệu từ Canvas LMS API
- ✅ Chuyển đổi và nạp vào Data Warehouse (PostgreSQL)
- ✅ Huấn luyện ML model dự đoán sinh viên at-risk
- ✅ Tạo bảng features cho dashboard sử dụng

---

## 🏗️ Kiến trúc DAG

```
extract_courses
      ↓
extract_submissions_data
      ↓
transform_and_load
      ↓
train_ml
      ↓
build_student_course_features (Cuối cùng)
```

### Chi tiết các Task

| Task | Mô tả | Thời gian | Output |
|------|-------|----------|--------|
| **extract_courses** | Lấy danh sách khóa học từ Canvas API | ~5s | `dim_courses` |
| **extract_submissions_data** | Lấy sinh viên, bài tập, bài nộp | ~30-60s | CSV files (temp) |
| **transform_and_load** | Làm sạch, gộp dữ liệu vào DWH | ~10-20s | `dim_students`, `fact_submissions`, `dim_assignments` |
| **train_ml** | Huấn luyện Logistic Regression | ~10-15s | `student_features`, `at_risk_students`, `model_evaluation` |
| **build_student_course_features** | Tạo bảng tính năng cho dashboard | ~5s | `student_course_features` (396 rows) |

**Tổng thời gian:** ~1-2 phút/lần chạy

---

## 🔧 Cấu hình DAG

### Lịch chạy

```python
DAG(
    dag_id="canvas_etl_pipeline_local",
    schedule="@hourly",      # Chạy mỗi giờ
    start_date=datetime(2025, 10, 1),
    catchup=False,           # Không catch-up các run cũ
    tags=["canvas", "etl", "local"],
)
```

**Các lựa chọn schedule:**
- `@hourly` - Mỗi giờ (hiện tại)
- `@daily` - Mỗi ngày lúc 00:00 UTC
- `@weekly` - Mỗi thứ Hai 00:00 UTC
- `*/15 * * * *` - Mỗi 15 phút (cron format)

### Biến môi trường (từ `.env.local`)

```bash
CANVAS_API_BASE_URL=http://web/api/v1/
CANVAS_API_TOKEN=<your_canvas_api_token>
DB_CONNECTION_STRING=postgresql+psycopg2://postgres:sekret@postgres:5432/canvas_dwh
CANVAS_API_HOST=localhost:3000
```

---

## 📚 Hướng dẫn Airflow Commands

### 1️⃣ Xem danh sách DAGs

```bash
docker compose exec airflow-webserver airflow dags list
```

**Output:**
```
dag_id                    | filepath          | owner   | paused
==========================+===================+=========+=======
canvas_etl_pipeline_local | canvas_etl_dag.py | airflow | False
```

### 2️⃣ Xem chi tiết DAG

```bash
docker compose exec airflow-webserver airflow dags info canvas_etl_pipeline_local
```

### 3️⃣ Liệt kê các tasks trong DAG

```bash
docker compose exec airflow-webserver airflow tasks list canvas_etl_pipeline_local
```

**Output:**
```
canvas_etl_pipeline_local
├── extract_courses
├── extract_submissions_data
├── transform_and_load
├── train_ml
└── build_student_course_features
```

---

## ⚡ Chạy DAG

### A. Trigger DAG từ CLI (chạy toàn bộ)

```bash
# Trigger DAG ngay lập tức
docker compose exec airflow-webserver airflow dags trigger canvas_etl_pipeline_local

# Output:
# Created <DagRun canvas_etl_pipeline_local @ 2025-12-02 10:00:00+00:00 [running]>
```

### B. Test 1 Task cụ thể (⚡ nhanh nhất)

```bash
# Test 1 task mà không chạy DAG
docker compose exec airflow-webserver airflow tasks test <DAG_ID> <TASK_ID> <EXECUTION_DATE>

# Ví dụ:
docker compose exec airflow-webserver airflow tasks test canvas_etl_pipeline_local build_student_course_features 2025-12-02
```

**Lợi ích:**
- ✅ Chạy ngay (không chờ scheduler)
- ✅ Xem log trực tiếp
- ✅ Không lưu vào DAG history
- ✅ Dùng để debug

**Kết quả nhanh:**
```
[FEATURES] Building student_course_features table...
[FEATURES] ✅ student_course_features created with 396 rows
```

### C. Trigger DAG từ Airflow UI

1. Mở http://localhost:8080
2. Login: `admin` / `admin`
3. Tìm DAG: `canvas_etl_pipeline_local`
4. Click **Trigger DAG** (nút play)

---

## 📊 Xem lịch sử chạy

### 1️⃣ Liệt kê các lần chạy

```bash
docker compose exec airflow-webserver airflow dags list-runs --dag-id canvas_etl_pipeline_local
```

### 2️⃣ Xem chi tiết 1 lần chạy

```bash
docker compose exec airflow-webserver airflow dags list-runs --dag-id canvas_etl_pipeline_local --state success
```

### 3️⃣ Xem trạng thái các tasks trong 1 lần chạy

```bash
docker compose exec airflow-webserver airflow tasks list-runs --dag-id canvas_etl_pipeline_local --state success
```

---

## 🔍 Xem Logs

### 1️⃣ Logs từ CLI

```bash
# Xem logs của task
docker compose exec airflow-webserver airflow tasks log canvas_etl_pipeline_local build_student_course_features 2025-12-02
```

### 2️⃣ Logs từ UI

1. Mở Airflow UI → http://localhost:8080
2. Click vào DAG
3. Click vào task
4. Tab **Logs**

### 3️⃣ Logs file trực tiếp

```bash
# Logs được lưu ở:
docker compose exec airflow-webserver ls -la /opt/airflow/logs/dag_id=canvas_etl_pipeline_local/
```

---

## ⚠️ Xử lý Lỗi

### Task Failed

**Khi task fail:**

```bash
# 1. Xem log
docker compose exec airflow-webserver airflow tasks log canvas_etl_pipeline_local train_ml 2025-12-02

# 2. Fix code/data
# ... fix the issue ...

# 3. Test lại task
docker compose exec airflow-webserver airflow tasks test canvas_etl_pipeline_local train_ml 2025-12-02

# 4. Clear failed state (nếu cần)
docker compose exec airflow-webserver airflow tasks clear canvas_etl_pipeline_local --start-date 2025-12-02
```

### Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-----------|---------|
| `Connection refused` | Postgres/Canvas không chạy | `docker compose up -d` |
| `No such table` | DWH chưa có schema | Trigger `transform_and_load` task |
| `AttributeError: 'Connection' has no attribute 'commit'` | SQLAlchemy version mismatch | Dùng `engine.begin()` thay vì `engine.connect()` |
| `CANVAS_API_TOKEN invalid` | Token hết hạn hoặc sai | Update `.env.local` |

---

## 🔄 Clear DAG History

### Xóa toàn bộ runs của DAG

```bash
# Clear tất cả tasks của DAG
docker compose exec airflow-webserver airflow dags delete canvas_etl_pipeline_local
```

### Xóa các runs cũ

```bash
# Clear runs trước ngày nào đó
docker compose exec airflow-webserver airflow dags delete-runs --dag-id canvas_etl_pipeline_local --start-date 2025-11-01 --end-date 2025-11-30
```

### Xóa logs cũ

```bash
# Xóa logs folder
docker compose exec airflow-webserver rm -rf /opt/airflow/logs/dag_id=canvas_etl_pipeline_local/
```

---

## 📝 Thêm Task Mới vào DAG

### Bước 1: Viết hàm task

```python
def my_new_task():
    """Mô tả task."""
    print("[TASK] Starting my_new_task...")
    # ... code logic ...
    print("[TASK] ✅ my_new_task completed")
    return 0
```

### Bước 2: Thêm vào DAG

```python
with DAG(...) as dag:
    # Existing tasks...
    train_ml_task = PythonOperator(...)
    
    # Task mới
    my_task = PythonOperator(
        task_id="my_new_task",
        python_callable=my_new_task,
    )
    
    # Set dependencies
    train_ml_task >> my_task  # Chạy sau train_ml
```

### Bước 3: Restart Airflow

```bash
docker compose restart airflow-scheduler airflow-webserver
```

### Bước 4: Test task

```bash
docker compose exec airflow-webserver airflow tasks test canvas_etl_pipeline_local my_new_task 2025-12-02
```

---

## 🎯 Best Practices

### ✅ DO

- ✅ Dùng `airflow tasks test` để debug task nhanh
- ✅ Thêm log messages chi tiết với `print()`
- ✅ Xử lý exceptions rõ ràng
- ✅ Test task trước khi trigger DAG
- ✅ Kiểm tra `.env.local` có các biến cần thiết

### ❌ DON'T

- ❌ Không hardcode credentials vào code
- ❌ Không trigger DAG quá thường xuyên (chờ 1-2 phút)
- ❌ Không xóa logs khi task còn running
- ❌ Không modify DAG khi đang chạy (restart sau)

---

## 📞 Hỗ trợ

### Airflow UI

- **URL:** http://localhost:8080
- **Tài khoản:** admin / admin
- **Features:**
  - 📊 Visualize DAG graph
  - 📈 Monitor task status
  - 📝 Xem logs
  - 🔄 Retry failed tasks
  - ⏰ Schedule management

### Logs & Debugging

```bash
# Monitor logs real-time
docker compose logs -f airflow-scheduler

# Tail logs của 1 task
docker compose exec airflow-webserver tail -f /opt/airflow/logs/dag_id=canvas_etl_pipeline_local/run_id=*/task_id=train_ml/attempt=1.log
```

### Kiểm tra Database

```bash
# Xem dữ liệu sau ETL
docker compose exec postgres psql -U postgres -d canvas_dwh -c "SELECT COUNT(*) FROM fact_submissions;"
```

---

## 📚 Tài liệu tham khảo

- [Airflow Documentation](https://airflow.apache.org/docs/)
- [Airflow CLI Reference](https://airflow.apache.org/docs/apache-airflow/stable/cli-and-env-variables-ref.html)
- [Python Operators](https://airflow.apache.org/docs/apache-airflow/stable/howto/operator/python.html)
- [Task Dependencies](https://airflow.apache.org/docs/apache-airflow/stable/concepts/dags.html#task-dependencies)

---

## 🔗 Liên kết nhanh

| Liên kết | Mô tả |
|---------|-------|
| [Airflow UI](http://localhost:8080) | Dashboard chính |
| [DAG: canvas_etl_pipeline_local](http://localhost:8080/dags/canvas_etl_pipeline_local) | DAG graph |
| [Database: canvas_dwh](http://localhost:5050) | PgAdmin (postgres:sekret@postgres:5432) |
| [Canvas LMS](http://localhost:3000) | Canvas web UI |
| [Dashboard API](http://localhost:4000) | REST API |
| [Dashboard Frontend](http://localhost:5173) | React dashboard |

---

## 💡 Quick Commands Cheatsheet

```bash
# Xem DAG
docker compose exec airflow-webserver airflow dags list

# Test task
docker compose exec airflow-webserver airflow tasks test canvas_etl_pipeline_local build_student_course_features 2025-12-02

# Trigger DAG
docker compose exec airflow-webserver airflow dags trigger canvas_etl_pipeline_local

# Xem lịch sử
docker compose exec airflow-webserver airflow dags list-runs --dag-id canvas_etl_pipeline_local

# Xem logs
docker compose exec airflow-webserver airflow tasks log canvas_etl_pipeline_local train_ml 2025-12-02

# Restart Airflow
docker compose restart airflow-scheduler airflow-webserver

# Kiểm tra database
docker compose exec postgres psql -U postgres -d canvas_dwh -c "SELECT COUNT(*) FROM fact_submissions;"
```

---

**Last Updated:** 2025-12-03  
**Author:** Canvas Learning Analytics Team  
**Version:** 1.0
