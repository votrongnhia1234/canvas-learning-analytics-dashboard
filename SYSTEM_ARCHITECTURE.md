# 🏗️ Canvas Learning Analytics - Kiến Trúc Hệ Thống Toàn Diện

**Phiên bản:** 1.0  
**Cập nhật:** 2025-12-04  
**Tác giả:** Canvas Learning Analytics Team

---

## 📋 Mục Lục

1. [Tổng Quan Hệ Thống](#tổng-quan-hệ-thống)
2. [Kiến Trúc Tổng Quát](#kiến-trúc-tổng-quát)
3. [Các Component Chính](#các-component-chính)
4. [Data Flow & Pipeline](#data-flow--pipeline)
5. [Workflow Chi Tiết](#workflow-chi-tiết)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Deployment Architecture](#deployment-architecture)
9. [Flow Biểu Đồ](#flow-biểu-đồ)

---

## 🎯 Tổng Quan Hệ Thống 

### Mục Đích

Hệ thống **Canvas Learning Analytics** là nền tảng phân tích học tập end-to-end cho Canvas LMS:

- ✅ **ETL Pipeline**: Tự động trích xuất dữ liệu từ Canvas LMS
- ✅ **Data Warehouse**: Chuẩn hóa & lưu trữ dữ liệu tập trung
- ✅ **ML Pipeline**: Dự đoán sinh viên at-risk bằng Logistic Regression
- ✅ **REST API**: Cung cấp dữ liệu cho frontend
- ✅ **Modern Dashboard**: Hiển thị analytics realtime với React + D3
- ✅ **AI Chatbot**: Hỗ trợ học tập thông minh bằng Gemini API

### Định Hướng

- 📊 Giúp giáo viên phát hiện sinh viên đang gặp khó khăn sớm
- 🎯 Hỗ trợ sinh viên với gợi ý học tập cá nhân hóa
- 📈 Phân tích xu hướng học tập và hiệu suất khóa học

---

## 🏗️ Kiến Trúc Tổng Quát
### Level 1: High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CANVAS LEARNING ANALYTICS                        │
│                         (Complete Stack)                             │
└─────────────────────────────────────────────────────────────────────┘

DATA SOURCES              INGESTION            STORAGE              PROCESSING
┌────────────┐          ┌────────────┐      ┌──────────┐          ┌──────────┐
│  Canvas    │──API────►│  Airflow   │─────►│Postgres  │─────────►│   ML           │
│  LMS       │ @hourly  │   ETL      │      │   DWH    │ Features │ Pipeline     │
│            │          │            │      │          │          │            │
│ (Rails)    │          │ (Python)   │      │(canvas_) │          │(Sklearn)   │
└────────────┘          │            │      │  dwh     │          │          │
                        │ - Extract  │      │          │          │          │
                        │ - Transform│      │          │          │          │
                        │ - Load     │      │          │          │          │
                        └────────────┘      └──────────┘          └──────────┘
                                                  ▲
                                                  │
PRESENTATION LAYER              BACKEND           │
┌─────────────┐       ┌──────────────────┐       │
│   Canvas    │◄──────│  Node.js API     │◄──────┘
│   Page      │ REST  │  (Express.js)    │
│  iFrame     │       │  & Chatbot       │
│             │       │  (:4000)         │
└──────┬──────┘       └────────┬─────────┘
       │                       │
       ▼                       ▼
   ┌────────────────────────────────┐
   │ React Dashboard + D3 Charts    │
   │ (:5173 - Vite Dev Server)      │
   └────────────────────────────────┘
```

---

## 🔧 Các Component Chính

### 1️⃣ Canvas LMS (Rails + PostgreSQL)

**Vai trò:** Nguồn dữ liệu chính

- 📍 **URL:** `http://localhost:3000`
- 🗂️ **Database:** Postgres (shared)
- 📡 **API:** Canvas API v1 (REST)
- 🔐 **Authentication:** API Token (CANVAS_API_TOKEN)

**Dữ liệu cung cấp:**

- Danh sách khóa học (courses)
- Danh sách sinh viên (users/students)
- Bài tập (assignments)
- Bài nộp (submissions)
- Điểm số (grades)

---

### 2️⃣ Airflow ETL (Python)

**Vai trò:** Trích xuất, chuyển đổi, tải dữ liệu

- 📍 **UI:** `http://localhost:8080` (admin/admin)
- 🗂️ **Database:** Postgres (airflow_db)
- 📅 **Schedule:** @hourly (mỗi giờ)
- ⚙️ **Executor:** LocalExecutor

**DAG chính:** `canvas_etl_pipeline_local`

**5 Tasks chính:**

1. **extract_courses** (5s)

   - Lấy danh sách khóa học từ Canvas API
   - Output: `dim_courses` table

2. **extract_submissions_data** (30-60s)

   - Lấy sinh viên, bài tập, bài nộp
   - Phân trang: ~200 trang tối đa
   - Output: CSV temp files

3. **transform_and_load** (10-20s)

   - Làm sạch dữ liệu
   - Kiểm tra tính hợp lệ
   - Load vào DWH (dim_students, fact_submissions, dim_assignments)
   - Output: 3 DWH tables

4. **train_ml** (10-15s)

   - Đặc trưng từ fact_submissions
   - Huấn luyện Logistic Regression
   - Dự đoán at-risk (risk_probability > 0.5)
   - Output: student_features, at_risk_students, risk_by_course, model_evaluation

5. **build_student_course_features** (5s)
   - Tạo bảng aggregated cho dashboard
   - Output: 396 rows (99 students × 4 courses)

**Thời gian chạy:** ~1-2 phút/lần

---

### 3️⃣ PostgreSQL Data Warehouse

**Vai trò:** Lưu trữ tập trung tất cả dữ liệu

- 📍 **Host:** postgres:5432
- 🗂️ **Database:** `canvas_dwh` (cho dashboard)
- 👤 **User:** postgres / sekret
- 💾 **Volume:** Persistent storage

**Schema DWH:**

#### Dimension Tables (Metadata)

```
dim_courses
├── course_id (PK)
├── course_name
├── course_code
└── course_slug

dim_students
├── student_id (PK)
├── student_name
└── email

dim_assignments
├── assignment_id (PK)
├── course_id (FK)
├── assignment_name
└── points_possible
```

#### Fact Tables (Events)

```
fact_submissions (~9,564 rows)
├── submission_id (PK)
├── student_id (FK)
├── course_id (FK)
├── assignment_id (FK)
├── grade
├── late (boolean)
├── submitted_at (timestamp)
└── student_name (denormalized)
```

#### Analytic Tables (Predictions & Features)

```
student_features (99 rows)
├── student_id
├── avg_grade
├── submission_count
├── risk_probability
├── risk_bucket
└── predicted_at_risk

at_risk_students (40 rows)
├── All columns từ student_features
└── WHERE risk_probability > 0.5

risk_by_course (4 rows)
├── course_id
├── at_risk_students
└── at_risk_ratio

student_course_features (396 rows) ⭐ DASHBOARD DATA
├── student_id
├── course_id
├── course_final_avg
├── early_avg_grade
├── submissions_last_14d
├── late_ratio
└── predicted_risk (from ML model)
```

---

### 4️⃣ Backend API (Node.js + Express)

**Vai trò:** REST API cung cấp dữ liệu cho frontend

- 📍 **URL:** `http://localhost:4000`
- 🔧 **Runtime:** Node.js v20
- 📦 **Framework:** Express.js
- 🗂️ **Database:** PostgreSQL (canvas_dwh)

**Các Endpoint Chính:**

| Endpoint             | Method | Mô Tả                      | Output                                            |
| -------------------- | ------ | -------------------------- | ------------------------------------------------- |
| `/api/overview`      | GET    | Tổng quan hệ thống         | { students, courses, submissions, at_risk_pct }   |
| `/api/courses`       | GET    | Danh sách khóa học + stats | [ { course_id, name, avg_grade, at_risk_ratio } ] |
| `/api/students/top`  | GET    | Top sinh viên at-risk      | [ { student_id, name, risk_probability } ]        |
| `/api/trends/weekly` | GET    | Xu hướng theo tuần         | [ { week, late_count, grades_trend } ]            |
| `/api/heatmap/late`  | GET    | Heatmap tỷ lệ nộp muộn     | [ { course, risk_bucket, late_ratio } ]           |
| `/api/all`           | GET    | Toàn bộ dữ liệu            | { overview, courses, students, trends, heatmap }  |
| `/api/chat`          | POST   | Chatbot EduBot             | { reply, sessionId }                              |
| `/api/chat/history`  | GET    | Lịch sử chat               | [ { message, reply, timestamp } ]                 |

**Chatbot Integration:**

- 🤖 **LLM:** Gemini API (mặc định gemini-2.5-flash)
- 🔑 **Auth:** GEMINI_API_KEY
- 💬 **Features:**
  - Multi-turn conversation
  - Context-aware (role: student/teacher/admin)
  - Data-driven responses
  - Rate limiting: 30 req/min per session
  - History: 20 messages per session

---

### 5️⃣ Frontend Dashboard (React + Vite)

**Vai trò:** Giao diện người dùng hiển thị analytics

- 📍 **URL:** `http://localhost:5173`
- 🔧 **Build Tool:** Vite
- 🎨 **UI Library:** React + D3.js / Recharts
- 🎯 **Target:** Embed vào Canvas hoặc standalone

**Pages & Components:**

```
Dashboard
├── Overview Page
│   ├── Key Metrics (students, courses, submissions, at-risk %)
│   ├── Risk Distribution Chart
│   └── Courses Comparison
├── Courses Page
│   ├── Course List
│   ├── Grades Distribution
│   └── At-Risk Students per Course
├── Students Page
│   ├── Student List (searchable, filterable)
│   ├── Risk Level Badges
│   ├── Individual Student Details
│   └── Student Performance Trend
├── Analytics Page
│   ├── Late Submission Heatmap
│   ├── Grade Trend Chart
│   ├── Weekly Submissions Trend
│   └── Risk Probability Histogram
└── Chatbot Panel
    ├── Chat Interface
    ├── Message History
    └── AI Suggestions
```

---

## 📊 Data Flow & Pipeline

### Complete Data Journey

```
STEP 1: EXTRACTION (Canvas API)
┌──────────────────────────────────┐
│ Canvas LMS (Rails + PostgreSQL)  │
│ - Courses: 4                     │
│ - Students: 99                   │
│ - Assignments: ~300              │
│ - Submissions: ~9,564            │
└────────────┬─────────────────────┘
             │ Canvas API (REST)
             │ - GET /courses
             │ - GET /users
             │ - GET /assignments
             │ - GET /submissions
             ▼
┌──────────────────────────────────┐
│ Airflow Task: extract_courses    │
│ Airflow Task: extract_submissions│
│ (Output: CSV temp files)         │
└──────────────┬────────────────────┘
               │

STEP 2: TRANSFORMATION & VALIDATION
               │
               ▼
┌──────────────────────────────────┐
│ Airflow Task: transform_and_load │
│ ├─ Data Cleaning                 │
│ ├─ Type Conversion               │
│ ├─ Null Handling                 │
│ └─ Duplicate Removal             │
└──────────────┬────────────────────┘
               │

STEP 3: LOAD INTO DWH
               │
               ▼
┌──────────────────────────────────┐
│ PostgreSQL Data Warehouse        │
│ Database: canvas_dwh             │
│ ├─ dim_courses                   │
│ ├─ dim_students                  │
│ ├─ dim_assignments               │
│ └─ fact_submissions              │
└──────────────┬────────────────────┘
               │

STEP 4: FEATURE ENGINEERING & ML
               │
               ▼
┌──────────────────────────────────┐
│ Airflow Task: train_ml           │
│ ├─ Feature Extraction            │
│ │  ├─ avg_grade                  │
│ │  ├─ submission_count           │
│ │  ├─ late_ratio                 │
│ │  └─ ... (more features)        │
│ ├─ Model Training                │
│ │  ├─ Logistic Regression        │
│ │  ├─ Train/Test Split: 80/20    │
│ │  └─ Cross-validation           │
│ └─ Predictions                   │
│    ├─ risk_probability           │
│    └─ predicted_at_risk          │
└──────────────┬────────────────────┘
               │

STEP 5: DASHBOARD DATA PREPARATION
               │
               ▼
┌──────────────────────────────────┐
│ Airflow Task:                    │
│ build_student_course_features    │
│ ├─ Aggregation                   │
│ ├─ Feature Calculation           │
│ └─ Output: 396 rows              │
│    (99 students × 4 courses)     │
└──────────────┬────────────────────┘
               │

STEP 6: ANALYTICS TABLES
               │
               ▼
┌──────────────────────────────────┐
│ PostgreSQL Analytics Tables      │
│ ├─ student_features              │
│ ├─ at_risk_students              │
│ ├─ risk_by_course                │
│ └─ student_course_features ⭐    │
└──────────────┬────────────────────┘
               │

STEP 7: API SERVING
               │
               ▼
┌──────────────────────────────────┐
│ Backend API (Node.js)            │
│ - Query DWH Tables               │
│ - Format JSON Responses          │
│ - Chatbot Integration            │
│ - Rate Limiting & Caching        │
└──────────────┬────────────────────┘
               │

STEP 8: VISUALIZATION
               │
               ▼
┌──────────────────────────────────┐
│ Frontend Dashboard (React)       │
│ - Overview Charts                │
│ - Student List                   │
│ - Heatmaps                       │
│ - Trend Analysis                 │
│ - Chatbot Panel                  │
└──────────────┬────────────────────┘
               │

STEP 9: PRESENTATION
               │
               ▼
┌──────────────────────────────────┐
│ Canvas LMS Page                  │
│ - iframe Embed                   │
│ - SSO Integration                │
│ - Real-time Updates              │
└──────────────────────────────────┘
```

---

## ⚙️ Workflow Chi Tiết

### Airflow DAG Execution Flow

```
TIME: T+0:00:00 UTC
Airflow Scheduler detects @hourly trigger
        ↓
TIME: T+0:00:05
┌─────────────────────────────────┐
│ DAG Run Created                 │
│ run_id: scheduled_2025-12-04... │
│ status: QUEUED                  │
└────────┬────────────────────────┘
         ↓
TIME: T+0:00:10
┌─────────────────────────────────┐
│ TASK 1: extract_courses         │
│ ├─ Canvas API: GET /courses     │
│ ├─ Rows: 4 courses              │
│ ├─ Output: dim_courses table    │
│ ├─ Status: RUNNING → SUCCESS    │
│ └─ Duration: ~5 seconds         │
└────────┬────────────────────────┘
         ↓
TIME: T+0:00:15
┌─────────────────────────────────┐
│ TASK 2: extract_submissions_data│
│ ├─ Canvas API: GET /users       │
│ ├─ Canvas API: GET /assignments │
│ ├─ Canvas API: GET /submissions │
│ ├─ Pagination: ~200 pages       │
│ ├─ Output: CSV temp files       │
│ │  ├─ /tmp/raw_students.csv     │
│ │  ├─ /tmp/raw_submissions.csv  │
│ │  └─ /tmp/raw_assignments.csv  │
│ ├─ Status: RUNNING → SUCCESS    │
│ └─ Duration: ~30-60 seconds     │
└────────┬────────────────────────┘
         ↓
TIME: T+0:01:15
┌─────────────────────────────────┐
│ TASK 3: transform_and_load      │
│ ├─ Read: CSV temp files         │
│ ├─ Validate: null, types        │
│ ├─ Clean: duplicates, outliers  │
│ ├─ Output: DWH tables           │
│ │  ├─ dim_students (99 rows)    │
│ │  ├─ fact_submissions (9.5K)   │
│ │  └─ dim_assignments (~300)    │
│ ├─ Status: RUNNING → SUCCESS    │
│ └─ Duration: ~15 seconds        │
└────────┬────────────────────────┘
         ↓
TIME: T+0:01:30
┌─────────────────────────────────┐
│ TASK 4: train_ml                │
│ ├─ Feature Extraction           │
│ │  ├─ avg_grade, submission_... │
│ │  └─ late_ratio, etc.          │
│ ├─ Model Training               │
│ │  ├─ Algorithm: Log Regression │
│ │  ├─ Train: 79 students        │
│ │  ├─ Test: 20 students         │
│ │  └─ Accuracy: ~75-80%         │
│ ├─ Predictions                  │
│ │  ├─ risk_probability          │
│ │  ├─ risk_bucket (Low/Med/High)│
│ │  └─ predicted_at_risk         │
│ ├─ Output: Analytic tables      │
│ │  ├─ student_features (99)     │
│ │  ├─ at_risk_students (40)     │
│ │  ├─ risk_by_course (4)        │
│ │  └─ model_evaluation          │
│ ├─ Status: RUNNING → SUCCESS    │
│ └─ Duration: ~12 seconds        │
└────────┬────────────────────────┘
         ↓
TIME: T+0:01:42
┌─────────────────────────────────┐
│ TASK 5: build_student_course_   │
│         features                │
│ ├─ Aggregation: 99 × 4 courses  │
│ ├─ Feature Calc: grades, risk   │
│ ├─ Output: Dashboard table      │
│ │  └─ student_course_features   │
│ │     (396 rows)                │
│ ├─ Status: RUNNING → SUCCESS    │
│ └─ Duration: ~5 seconds         │
└────────┬────────────────────────┘
         ↓
TIME: T+0:01:47
┌─────────────────────────────────┐
│ ✅ DAG RUN COMPLETE             │
│ status: SUCCESS                 │
│ duration: ~107 seconds (~2 min) │
│ next_run: T+1:00:00             │
│ data_ready: for API/Dashboard   │
└─────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Data Warehouse (canvas_dwh) - Detailed Schema

#### Dimension Tables

```sql
-- Dimension: Courses
CREATE TABLE dim_courses (
    course_id BIGINT PRIMARY KEY,
    course_name VARCHAR(255),
    course_code VARCHAR(50),
    course_slug VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Dimension: Students
CREATE TABLE dim_students (
    student_id BIGINT PRIMARY KEY,
    student_name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Dimension: Assignments
CREATE TABLE dim_assignments (
    assignment_id BIGINT PRIMARY KEY,
    course_id BIGINT REFERENCES dim_courses(course_id),
    assignment_name VARCHAR(255),
    points_possible DECIMAL(10, 2),
    due_at TIMESTAMP,
    created_at TIMESTAMP
);
```

#### Fact Tables

```sql
-- Fact: Submissions
CREATE TABLE fact_submissions (
    submission_id BIGINT PRIMARY KEY,
    student_id BIGINT REFERENCES dim_students(student_id),
    course_id BIGINT REFERENCES dim_courses(course_id),
    assignment_id BIGINT REFERENCES dim_assignments(assignment_id),
    grade DECIMAL(10, 2),
    late BOOLEAN,
    submitted_at TIMESTAMP,
    student_name VARCHAR(255), -- denormalized
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Index for common queries
CREATE INDEX idx_submissions_student ON fact_submissions(student_id);
CREATE INDEX idx_submissions_course ON fact_submissions(course_id);
CREATE INDEX idx_submissions_assignment ON fact_submissions(assignment_id);
```

#### Analytic Tables

```sql
-- Analytics: Student Features & Predictions
CREATE TABLE student_features (
    student_id BIGINT PRIMARY KEY REFERENCES dim_students(student_id),
    avg_grade DECIMAL(5, 2),
    submission_count INT,
    late_count INT,
    late_ratio DECIMAL(5, 2), -- %
    risk_probability DECIMAL(5, 4), -- 0.0-1.0
    risk_bucket VARCHAR(20), -- 'Low', 'Medium', 'High'
    predicted_at_risk BOOLEAN,
    model_id VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Analytics: At-Risk Students (View or materialized)
CREATE VIEW at_risk_students AS
SELECT * FROM student_features
WHERE risk_probability > 0.5 AND predicted_at_risk = true;

-- Analytics: Risk Summary by Course
CREATE TABLE risk_by_course (
    course_id BIGINT PRIMARY KEY REFERENCES dim_courses(course_id),
    total_students INT,
    at_risk_students INT,
    at_risk_ratio DECIMAL(5, 2), -- %
    avg_grade DECIMAL(5, 2),
    late_submission_ratio DECIMAL(5, 2), -- %
    created_at TIMESTAMP
);

-- Analytics: Student-Course Features (for Dashboard)
CREATE TABLE student_course_features (
    student_course_id BIGSERIAL PRIMARY KEY,
    student_id BIGINT REFERENCES dim_students(student_id),
    course_id BIGINT REFERENCES dim_courses(course_id),
    course_final_avg DECIMAL(5, 2),
    early_avg_grade DECIMAL(5, 2), -- first 50% assignments
    submissions_last_14d INT,
    late_ratio DECIMAL(5, 2), -- % in this course
    predicted_risk DECIMAL(5, 4),
    risk_bucket VARCHAR(20),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(student_id, course_id)
);
```

---

## 🔌 API Endpoints

### REST API Specification

#### 1. Overview Endpoint

```
GET /api/overview
Response:
{
    "total_students": 99,
    "total_courses": 4,
    "total_submissions": 9564,
    "at_risk_percentage": 40.4,
    "at_risk_count": 40,
    "timestamp": "2025-12-04T12:30:00Z"
}
```

#### 2. Courses Endpoint

```
GET /api/courses
Response:
[
    {
        "course_id": 1,
        "course_name": "Data Science 101",
        "avg_grade": 78.5,
        "at_risk_students": 12,
        "at_risk_ratio": 48.0,
        "total_students": 25,
        "total_submissions": 2500
    },
    ...
]
```

#### 3. Top At-Risk Students

```
GET /api/students/top?limit=20
Response:
[
    {
        "student_id": 42,
        "student_name": "John Doe",
        "avg_grade": 45.2,
        "risk_probability": 0.89,
        "risk_bucket": "High",
        "submission_count": 15,
        "late_count": 8
    },
    ...
]
```

#### 4. Weekly Trends

```
GET /api/trends/weekly
Response:
[
    {
        "week": "2025-11-24",
        "late_submissions": 45,
        "avg_grade": 76.8,
        "submission_rate": 0.95
    },
    ...
]
```

#### 5. Late Submission Heatmap

```
GET /api/heatmap/late
Response:
[
    {
        "course": "Data Science 101",
        "risk_bucket": "High",
        "late_ratio": 0.45
    },
    ...
]
```

#### 6. Chatbot Endpoint

```
POST /api/chat
Body:
{
    "message": "How many students are at risk?",
    "sessionId": "user-42",
    "role": "teacher",
    "userId": 42
}

Response:
{
    "reply": "Based on the latest data, 40 students (40.4%) are at risk...",
    "sessionId": "user-42",
    "sources": [
        { "table": "student_features", "rows": 40 }
    ],
    "timestamp": "2025-12-04T12:30:15Z"
}
```

#### 7. Chat History

```
GET /api/chat/history?sessionId=user-42
Response:
[
    {
        "message": "How many students are at risk?",
        "reply": "Based on the latest data...",
        "timestamp": "2025-12-04T12:30:15Z",
        "role": "teacher"
    },
    ...
]
```

---

## 🚀 Deployment Architecture

### Docker Compose Services

```
┌──────────────────────────────────────────────────────────┐
│              Docker Compose Stack                        │
└──────────────────────────────────────────────────────────┘

SERVICE TIER 1: SOURCE DATA
┌────────────────────────────────────────────────────────┐
│ Canvas LMS Web (Port 3000)                             │
│ ├─ Image: Custom (Dockerfile in root)                 │
│ ├─ Depends: postgres, redis                           │
│ ├─ Link: http://localhost:3000                        │
│ └─ Data: Canvas database (canvas schema)              │
├────────────────────────────────────────────────────────┤
│ Canvas Jobs Service (Port 3001)                       │
│ ├─ Image: Same as web                                 │
│ ├─ Command: delayed_job run                           │
│ └─ Purpose: Background jobs                           │
└────────────────────────────────────────────────────────┘

SERVICE TIER 2: INFRASTRUCTURE
┌────────────────────────────────────────────────────────┐
│ PostgreSQL Database (Port 5432)                        │
│ ├─ Image: Custom (docker-compose/postgres)            │
│ ├─ Password: sekret                                    │
│ ├─ Databases: canvas, airflow, canvas_dwh             │
│ ├─ Volume: canvas_postgres_data:/var/lib/postgresql   │
│ └─ Restart: always                                     │
├────────────────────────────────────────────────────────┤
│ Redis Cache (Port 6379)                               │
│ ├─ Image: redis:alpine                                │
│ ├─ Purpose: Caching for Canvas                        │
│ └─ Restart: always                                     │
├────────────────────────────────────────────────────────┤
│ PgAdmin (Port 5050)                                   │
│ ├─ Image: dpage/pgadmin4:latest                       │
│ ├─ User: admin@pgadmin.com / admin123                 │
│ ├─ Purpose: Database GUI management                   │
│ └─ Link: http://localhost:5050                        │
└────────────────────────────────────────────────────────┘

SERVICE TIER 3: ETL & ORCHESTRATION
┌────────────────────────────────────────────────────────┐
│ Airflow Init (one-off container)                       │
│ ├─ Purpose: Initialize Airflow DB & users             │
│ └─ Depends: postgres (for airflow DB)                  │
├────────────────────────────────────────────────────────┤
│ Airflow PostgreSQL (Port 5432, internal)              │
│ ├─ Image: postgres:14                                 │
│ ├─ Database: airflow (metadata)                       │
│ ├─ Volume: airflow_postgres_data                      │
│ └─ Restart: always                                     │
├────────────────────────────────────────────────────────┤
│ Airflow Webserver (Port 8080)                         │
│ ├─ Image: Custom (learning_analytics)                 │
│ ├─ User: admin / admin                                │
│ ├─ Link: http://localhost:8080                        │
│ ├─ Executor: LocalExecutor                            │
│ ├─ Command: webserver                                 │
│ └─ Volumes:                                            │
│    ├─ ./dags:/opt/airflow/dags                        │
│    ├─ ./logs:/opt/airflow/logs                        │
│    ├─ ./plugins:/opt/airflow/plugins                  │
│    └─ ./.env.local:/opt/airflow/.env.local            │
├────────────────────────────────────────────────────────┤
│ Airflow Scheduler (no port)                           │
│ ├─ Image: Custom (learning_analytics)                 │
│ ├─ Command: scheduler                                 │
│ ├─ Executor: LocalExecutor                            │
│ ├─ Volumes: (same as webserver)                       │
│ └─ Restart: always                                     │
└────────────────────────────────────────────────────────┘

SERVICE TIER 4: ANALYTICS & API
┌────────────────────────────────────────────────────────┐
│ Dashboard Backend API (Port 4000)                      │
│ ├─ Image: node:20                                     │
│ ├─ Framework: Express.js                              │
│ ├─ Database: postgres (canvas_dwh)                    │
│ ├─ Command: npm ci && npm run dev                     │
│ ├─ Depends: postgres (for DWH)                        │
│ ├─ Link: http://localhost:4000                        │
│ └─ Volume: ./dashboard_backend:/app                   │
├────────────────────────────────────────────────────────┤
│ Dashboard Frontend (Port 5173)                         │
│ ├─ Image: node:20                                     │
│ ├─ Build Tool: Vite                                   │
│ ├─ Framework: React + D3                              │
│ ├─ Command: npm ci && npm run dev -- --host 0.0.0.0   │
│ ├─ Depends: dashboard-backend                         │
│ ├─ Link: http://localhost:5173                        │
│ └─ Volume: ./dashboard_frontend:/app                  │
└────────────────────────────────────────────────────────┘

VOLUMES (Persistent Data)
├─ canvas_postgres_data: Canvas + DWH database
├─ airflow_postgres_data: Airflow metadata
└─ pgadmin_data: PgAdmin configuration
```

### Port Mapping Summary

| Service            | Port | URL                                  | Purpose                  |
| ------------------ | ---- | ------------------------------------ | ------------------------ |
| Canvas LMS Web     | 3000 | http://localhost:3000                | Rails LMS interface      |
| Canvas Jobs        | 3001 | http://localhost:3001                | Background job service   |
| Dashboard Backend  | 4000 | http://localhost:4000                | REST API                 |
| Dashboard Frontend | 5173 | http://localhost:5173                | React dashboard          |
| PostgreSQL         | 5432 | postgres://postgres:sekret@localhost | Main database            |
| PgAdmin            | 5050 | http://localhost:5050                | DB GUI tool              |
| Airflow Webserver  | 8080 | http://localhost:8080                | Airflow UI (admin/admin) |

---

## 📈 Flow Biểu Đồ

### 1. Complete System Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ CANVAS LMS                                                  │
│ (Rails + Postgres)                                          │
│ - Courses, Users, Assignments, Submissions                  │
└────────────────┬────────────────────────────────────────────┘
                 │ Canvas API v1 (REST)
                 │ GET /courses
                 │ GET /users
                 │ GET /assignments
                 │ GET /submissions
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ AIRFLOW ORCHESTRATION (LOCAL EXECUTOR)                      │
│ Schedule: @hourly                                           │
│                                                              │
│ Task 1: extract_courses (5s)                                │
│ ├─ Canvas API → CSV                                         │
│ └─ Output: dim_courses                                      │
│                                                              │
│ Task 2: extract_submissions_data (30-60s)                   │
│ ├─ Canvas API → Pagination (200 pages)                      │
│ └─ Output: raw_students.csv, raw_submissions.csv            │
│                                                              │
│ Task 3: transform_and_load (10-20s)                         │
│ ├─ CSV → DWH Tables                                         │
│ ├─ Validation & Cleaning                                    │
│ └─ Output: dim_students, fact_submissions, dim_assignments  │
│                                                              │
│ Task 4: train_ml (10-15s)                                   │
│ ├─ Feature Engineering                                      │
│ ├─ Logistic Regression (80/20 split)                        │
│ └─ Output: student_features, at_risk_students               │
│                                                              │
│ Task 5: build_student_course_features (5s)                  │
│ ├─ Aggregation (99 students × 4 courses)                    │
│ └─ Output: 396 records for dashboard                        │
│                                                              │
│ Total: ~1-2 minutes                                         │
└─────────────┬───────────────────────────────────────────────┘
              │ INSERT/UPDATE
              ▼
┌─────────────────────────────────────────────────────────────┐
│ POSTGRESQL DATA WAREHOUSE (canvas_dwh)                      │
│                                                              │
│ Dimension Tables:                                           │
│ - dim_courses (4 rows)                                      │
│ - dim_students (99 rows)                                    │
│ - dim_assignments (~300 rows)                               │
│                                                              │
│ Fact Tables:                                                │
│ - fact_submissions (~9,564 rows)                            │
│                                                              │
│ Analytic Tables:                                            │
│ - student_features (99 rows) ← ML Predictions               │
│ - at_risk_students (40 rows) ← Filtered                     │
│ - risk_by_course (4 rows) ← Aggregated                      │
│ - student_course_features (396 rows) ← ⭐ FOR DASHBOARD    │
└─────────────┬───────────────────────────────────────────────┘
              │ SQL SELECT
              ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND API (Node.js + Express)                             │
│ Port: 4000                                                  │
│                                                              │
│ Endpoints:                                                  │
│ - GET /api/overview → { students, courses, at_risk_pct }   │
│ - GET /api/courses → [ { course stats } ]                   │
│ - GET /api/students/top → [ { at-risk students } ]          │
│ - GET /api/trends/weekly → [ { weekly trends } ]            │
│ - GET /api/heatmap/late → [ { heatmap data } ]              │
│ - GET /api/all → { all data }                               │
│ - POST /api/chat → { chatbot responses } (Gemini)           │
│ - GET /api/chat/history → [ { chat history } ]              │
└─────────────┬───────────────────────────────────────────────┘
              │ REST/JSON
              ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND DASHBOARD (React + Vite)                           │
│ Port: 5173                                                  │
│                                                              │
│ Pages:                                                      │
│ ├─ Overview: Key Metrics, Charts                            │
│ ├─ Courses: Course List, Student Risk per Course            │
│ ├─ Students: Student List, Individual Details               │
│ ├─ Analytics: Heatmaps, Trends, Histograms                  │
│ └─ Chatbot: AI-powered Q&A with Gemini                      │
│                                                              │
│ Components:                                                 │
│ ├─ Charts: D3.js / Recharts                                 │
│ ├─ Tables: Searchable, Filterable                           │
│ ├─ Maps: Heatmaps                                           │
│ └─ Chat UI: Message bubbles, History                        │
└─────────────┬───────────────────────────────────────────────┘
              │ iframe / embed
              ▼
┌─────────────────────────────────────────────────────────────┐
│ CANVAS LMS PAGE (/learning_analytics)                       │
│ Displays: Dashboard embedded in Canvas                      │
│           Teachers & Students can view analytics            │
└─────────────────────────────────────────────────────────────┘
```

### 2. Airflow DAG Dependency Graph

```
                      START
                        │
                        ▼
              ┌───────────────────┐
              │ extract_courses   │  ◄─── Canvas API
              │ (5s)              │       GET /courses
              └──────────┬────────┘
                         │
                         ▼
           ┌─────────────────────────┐
           │ extract_submissions_    │  ◄─── Canvas API
           │ data (30-60s)           │       GET /users, /assignments,
           │                         │       /submissions (pagination)
           └──────────┬──────────────┘
                      │
                      ▼
           ┌─────────────────────────┐
           │ transform_and_load      │  ◄─── CSV Cleaning
           │ (10-20s)                │       Type Conversion
           │                         │       Validation
           └──────────┬──────────────┘
                      │
                      ▼
           ┌─────────────────────────┐
           │ train_ml                │  ◄─── Feature Engineering
           │ (10-15s)                │       Logistic Regression
           │                         │       Predictions
           └──────────┬──────────────┘
                      │
                      ▼
      ┌───────────────────────────────────┐
      │ build_student_course_features     │  ◄─── Aggregation
      │ (5s)                              │       Feature Calc
      └──────────┬────────────────────────┘
                 │
                 ▼
            SUCCESS ✅
            (Data Ready for API/Dashboard)
```

### 3. ML Pipeline Detail

```
┌─────────────────────────────────────────┐
│ TRAINING DATA (fact_submissions)        │
│ - 9,564 submissions                     │
│ - 99 unique students                    │
│ - 4 courses                             │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ FEATURE ENGINEERING                     │
│ From fact_submissions create features:  │
│ ├─ avg_grade                            │
│ ├─ submission_count                     │
│ ├─ late_count                           │
│ ├─ late_ratio (late / total)            │
│ ├─ grade_trend (early vs recent)        │
│ └─ days_since_last_submission           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ DATA SPLITTING                          │
│ ├─ Train: 80% (79 students)             │
│ ├─ Test: 20% (20 students)              │
│ └─ Stratified by risk level             │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ MODEL TRAINING                          │
│ ├─ Algorithm: Logistic Regression       │
│ ├─ Scaler: StandardScaler()             │
│ ├─ Features: 7 features above           │
│ ├─ Target: at_risk (binary)             │
│ └─ Regularization: L2                   │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ MODEL EVALUATION                        │
│ ├─ Accuracy: ~75-80%                    │
│ ├─ Precision: ~0.78                     │
│ ├─ Recall: ~0.72                        │
│ ├─ F1-Score: ~0.75                      │
│ └─ Saved to: model_evaluation table     │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ PREDICTIONS ON ALL STUDENTS             │
│ ├─ Input: student_features + new data   │
│ ├─ Output: risk_probability (0.0-1.0)   │
│ ├─ Threshold: > 0.5 → at_risk           │
│ └─ Results: 40 students at-risk         │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ STORE PREDICTIONS                       │
│ ├─ Update: student_features table       │
│ ├─ Update: at_risk_students view        │
│ ├─ Update: risk_by_course aggregates    │
│ └─ Ready for: API, Dashboard, Chatbot   │
└─────────────────────────────────────────┘
```

### 4. Chatbot Flow

```
┌───────────────────────────────────┐
│ USER MESSAGE                       │
│ "How many students are at risk?"   │
│ sessionId: user-42                 │
│ role: teacher                      │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ RATE LIMITING CHECK                │
│ ├─ 30 req/min per session (Redis)  │
│ └─ Allow: YES ✅                   │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ CONTEXT BUILD                      │
│ ├─ Get session history (20 msgs)   │
│ ├─ Query DWH:                      │
│ │  ├─ at_risk_students COUNT       │
│ │  ├─ student_features AVG         │
│ │  └─ risk_by_course STATS         │
│ └─ Format as context               │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ GEMINI API REQUEST                 │
│ ├─ Model: gemini-2.5-flash         │
│ ├─ Prompt:                         │
│ │  "You are an educational AI..."  │
│ │  "Current data: 40 at-risk..."   │
│ │  "User: How many at risk?"       │
│ └─ Temperature: 0.7                │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ AI RESPONSE GENERATION             │
│ "Based on the latest data..."      │
│ (40 students, 40.4% of class)"     │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ RESPONSE BUILDING                  │
│ ├─ reply: AI text                  │
│ ├─ sessionId: user-42              │
│ ├─ sources: data tables used       │
│ └─ timestamp: ISO 8601             │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ STORE IN HISTORY                   │
│ ├─ Redis/Postgres                  │
│ ├─ sessionId: user-42              │
│ ├─ user_message: original          │
│ ├─ ai_reply: response              │
│ └─ timestamp: now                  │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ RETURN TO FRONTEND                 │
│ {                                  │
│   "reply": "Based on...",          │
│   "sessionId": "user-42",          │
│   "sources": [...]                 │
│ }                                  │
└───────────────────────────────────┘
```

---

## 📝 Tóm Tắt Kiến Trúc

### Key Characteristics

| Aspekt                   | Chi Tiết                                           |
| ------------------------ | -------------------------------------------------- |
| **Architecture Pattern** | ETL + Data Warehouse + Analytics + API             |
| **Data Sources**         | Canvas LMS API (REST)                              |
| **Orchestration**        | Apache Airflow (LocalExecutor, @hourly)            |
| **Storage**              | PostgreSQL (Multi-DB: canvas, canvas_dwh, airflow) |
| **ML Approach**          | Logistic Regression (scikit-learn)                 |
| **Backend**              | Node.js + Express.js (REST API)                    |
| **Frontend**             | React + Vite + D3.js                               |
| **AI Integration**       | Gemini API for Chatbot                             |
| **Deployment**           | Docker Compose (7 main services)                   |
| **Data Volume**          | ~9.5K submissions per run                          |
| **Runtime**              | ~1-2 minutes per pipeline execution                |
| **Scalability**          | Currently local/single-machine                     |

### Success Indicators ✅

- ✅ Airflow DAG runs every hour without errors
- ✅ 9,564 submissions ingested and processed
- ✅ 99 students profiled with risk scores
- ✅ 40 students identified as at-risk (40.4%)
- ✅ Dashboard displays 396 student-course features
- ✅ Chatbot responds with data-driven insights
- ✅ API serves all endpoints within <200ms
- ✅ Persistent data volumes survive container restarts

---

## 🔗 Liên Kết Nhanh

| Component          | Link                                      | Credentials                  |
| ------------------ | ----------------------------------------- | ---------------------------- |
| Canvas LMS         | http://localhost:3000                     | (set in .env)                |
| Airflow UI         | http://localhost:8080                     | admin / admin                |
| Database UI        | http://localhost:5050                     | admin@pgadmin.com / admin123 |
| Backend API        | http://localhost:4000                     | (API_KEY in .env)            |
| Frontend Dashboard | http://localhost:5173                     | (public)                     |
| PostgreSQL         | postgres://postgres:sekret@localhost:5432 | psql                         |

---

**End of Document**  
Ngày cập nhật: 2025-12-04  
Tác giả: Canvas Learning Analytics Team
