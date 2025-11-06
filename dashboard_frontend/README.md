# Learning Analytics Dashboard Frontend

SPA React + D3.js tiêu thụ API từ backend (`learning_analytics/backend`).

## Chạy phát triển

```bash
cd learning_analytics/dashboard_frontend
npm install
npm run dev             # http://localhost:5173
```

- Vite proxy `/api` → `http://localhost:4000` (backend) theo cấu hình `vite.config.js`.
- Nếu backend yêu cầu API key, đặt file `.env`:
  ```
  VITE_API_BASE_URL=http://localhost:4000
  VITE_API_KEY=changme
  ```

## Build production

```
npm run build
```

Output trong `dist/`. Có thể serve static bằng backend Express, Nginx hoặc bất kỳ static host nào.

## Cấu trúc

- `src/App.jsx`: bố cục chính (3 tab dashboard).
- `src/components/…`: các chart D3 (overview, pie, bar, line, heatmap, scatter, KPI, top list).
- `src/styles/main.scss`: style tổng thể.

## Nhúng Canvas

Sau khi deploy (ví dụ `https://analytics.example.com`):
```html
<iframe src="https://analytics.example.com?api_key=changme"
        width="100%" height="900" frameborder="0"></iframe>
```

Hoặc tạo LTI/External Tool để đóng gói dashboard.

Frontend này đồng bộ với dữ liệu từ `canvas_dwh` thông qua API backend, phục vụ dashboard phân tích học tập trên Canvas LMS.***
