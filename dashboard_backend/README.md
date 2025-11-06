# Learning Analytics Dashboard Backend

Service Node.js cung cấp API dữ liệu cho dashboard học tập (Canvas LMS).

## Cài đặt

```bash
cd learning_analytics/backend
cp .env.example .env   # cập nhật DATABASE_URL, API_KEY nếu cần
npm install
npm run start          # service lắng trên cổng 4000
```

- Khi gọi API, nhớ gửi header `X-API-Key` trùng với giá trị trong `.env`.
- Có thể đặt `CORS_ORIGIN=https://canvas.example.com` để giới hạn domain.

## Endpoint chính

| Method | URL | Mô tả |
|--------|-----|-------|
| GET | `/api/overview` | Tổng quan (sinh viên, khóa học, lượt nộp, % at-risk) |
| GET | `/api/courses` | Điểm trung bình, tỉ lệ trễ, at-risk theo khóa |
| GET | `/api/students/top?limit=20` | Top sinh viên nguy cơ cao |
| GET | `/api/trends/weekly` | Xu hướng theo tuần |
| GET | `/api/heatmap/late` | Heatmap tỉ lệ trễ (khóa × risk bucket) |
| GET | `/api/all` | Gộp toàn bộ dữ liệu phục vụ frontend |

## Frontend React + D3

Phần giao diện đã được tách sang thư mục riêng:  
`learning_analytics/dashboard_frontend/`

Chạy thử:

```bash
cd learning_analytics/dashboard_frontend
npm install
npm run dev          # http://localhost:5173 (proxy tới backend)
```

Tuỳ môi trường deploy, đặt biến:
```
VITE_API_BASE_URL=https://analytics.example.com
VITE_API_KEY=changme
```

## Triển khai & nhúng Canvas

- Deploy backend (PM2/systemd + HTTPS).  
- Build frontend (`npm run build`) và phục vụ static qua Node/Nginx.  
- Nhúng vào Canvas qua iframe (hoặc LTI) trỏ đến URL dashboard, truyền API key/SSO tuỳ nhu cầu.

Backend + frontend này là nền tảng để trình bày Learning Analytics tách rời nhưng dễ embed vào Canvas.***
