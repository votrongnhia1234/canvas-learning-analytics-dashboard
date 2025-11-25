# Learning Analytics

> Nền tảng phân tích học tập cho Canvas LMS: ETL + DWH + API + Dashboard + Chatbot AI.

## Tính năng nổi bật

- **Pipeline dữ liệu end-to-end**: Airflow thu thập dữ liệu từ Canvas, chuẩn hóa vào kho `canvas_dwh`, tính toán chỉ số và đặc trưng ML.
- **Dashboard realtime**: React + D3 hiển thị tổng quan hệ thống, phân bổ rủi ro, so sánh khóa học, danh sách sinh viên, heatmap nộp muộn, xu hướng theo tuần.
- **Chatbot EduBot**: API Node.js + Gemini, hiểu ngữ cảnh theo vai trò (student/teacher/admin), bám sát số liệu thực tế và trả lời đa lượt.
- **Triển khai dễ dàng**: Docker Compose chạy Canvas + Postgres + Airflow + dashboard backend/frontend; có thể nhúng iframe trong Canvas.

## Kiến trúc tổng quan

```
Canvas (Rails/Postgres)
   │  Canvas API (@hourly)
   ▼
Airflow ETL (dags/)
   │  extract(course, submission) + Transform + Load + ML
   ▼
Postgres DWH (canvas_dwh)
   │  Feature Engineering
   ▼
ML Pipeline (train_ml task)
   │  Predictions
   ▼
Backend API (Node/Express :4000)
   │  REST/JSON
   ▼
Frontend Dashboard (Vite :5173)
   │  iframe/embed
   ▼
Canvas trang /learning_analytics
```

## Cấu trúc thư mục chính

| Thư mục | Mô tả |
|---------|-------|
| `dags/`, `plugins/`, `logs/` | Airflow DAGs, plugin orchestration ETL. |
| `dashboard_backend/` | API Express + chatbot (Node 20, Postgres). |
| `dashboard_frontend/` | Ứng dụng React + D3 (Vite). |
| `docs/` | Sơ đồ kiến trúc, flow vận hành, mô tả pipeline. |
| `sql/` | Câu lệnh dựng schema/cube cho kho `canvas_dwh`. |
| `.env.local` | Biến môi trường chung cho Airflow/Pipeline (được nạp vào container). |

## Khởi chạy nhanh bằng Docker Compose

1. Cài Docker Desktop (>= 4.29) và Docker Compose V2.
2. Sao chép file mẫu và chỉnh sửa biến cần thiết:
   ```bash
   cp docker-compose.example.yaml docker-compose.yaml
   # cập nhật mật khẩu, API key, URL Canvas nếu cần
   ```
3. Khởi động toàn bộ stack (Canvas + Postgres + Airflow + dashboard):
   ```bash
   docker compose up -d
   ```
4. Các dịch vụ mặc định:

   | Dịch vụ | Cổng | Ghi chú |
   |---------|------|---------|
   | Canvas web | `http://localhost:3000` | ứng dụng LMS để embed dashboard. |
   | Postgres Canvas | `localhost:5432` | dùng cho Canvas + Airflow + dashboard backend. |
   | Airflow UI | `http://localhost:8080` | user/pass: `admin` / `admin` (sửa trong compose). |
   | Dashboard backend | `http://localhost:4000` | API JSON + chatbot. |
   | Dashboard frontend | `http://localhost:5173` | gắn vào Canvas hoặc mở độc lập. |
   | PgAdmin | `http://localhost:5050` | tiện kiểm tra dữ liệu. |

5. Kích hoạt DAG trong Airflow (`canvas_etl_pipeline_local`) để ETL chạy định kỳ.

## Airflow & Pipeline

- DAG chính (trong `dags/`) chạy mỗi giờ: đồng bộ dữ liệu Canvas → staging → fact/sub dim → bảng đặc trưng `student_features`, `risk_by_course`, `fact_submissions`.
- Task `train_ml` tạo dự báo rủi ro (`predicted_at_risk`, `risk_probability`) lưu vào DWH để backend sử dụng.
- File cấu hình `.env.local` chứa token Canvas API, thông số batch size, email alert… Airflow mount file này vào container.

## Chatbot EduBot

- Sử dụng Gemini API (mặc định `gemini-2.5-flash`). Thiết lập `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL` trong backend `.env`.
- Tham số request:
  ```json
  POST /api/chat
  {
    "message": "Điểm trung bình của tôi?",
    "sessionId": "student-42",
    "role": "student",
    "userId": 42
  }
  ```
- Response gồm `reply`, `charts`, `tips`, `sources` giúp frontend hiển thị biểu đồ và gợi ý học tập.
- Rate limit mặc định: 30 yêu cầu/phút mỗi session, lưu lịch sử 20 tin nhắn.

