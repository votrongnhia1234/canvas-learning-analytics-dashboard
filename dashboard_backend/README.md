# Learning Analytics Dashboard Backend

Node.js service cung cap API du lieu cho dashboard hoc tap (Canvas LMS).

## Cai dat nhanh

```bash
cd learning_analytics/dashboard_backend
cp .env.example .env   # cap nhat DATABASE_URL, API_KEY neu can
npm install
npm run start          # service lang tren cong 4000
```

- Khi goi API, neu `API_KEY` duoc dat thi gui header `X-API-Key` khop gia tri trong `.env`.
- Dat `CORS_ORIGIN=https://canvas.example.com` de gioi han domain goi API.

## Endpoint chinh

| Method | URL | Mo ta |
|--------|-----|-------|
| GET | `/api/overview` | Tong quan (sinh vien, khoa hoc, luot nop, % at-risk) |
| GET | `/api/courses` | Diem trung binh, ty le tre, at-risk theo khoa |
| GET | `/api/students/top?limit=20` | Top sinh vien nguy co cao |
| GET | `/api/trends/weekly` | Xu huong theo tuan |
| GET | `/api/heatmap/late` | Heatmap ty le tre (khoa x risk bucket) |
| GET | `/api/all` | Gom toan bo du lieu phuc vu frontend |
| POST | `/api/chat` | Chatbot hoc tap: body `{ message, sessionId }`, tra ve text + sessionId |
| GET | `/api/chat/history?sessionId=...` | Lay lich su hoi thoai |
| POST | `/api/chat/clear` | Xoa lich su hoi thoai |

## Frontend React + D3

Phan giao dien nam o: `learning_analytics/dashboard_frontend/`

Chay dev:

```bash
cd learning_analytics/dashboard_frontend
npm install
npm run dev          # http://localhost:5173 (proxy toi backend)
```

Bien moi truong de deploy:
```
VITE_API_BASE_URL=https://analytics.example.com
VITE_API_KEY=changme
```

## LLM tuy chon cho chatbot

**Gemini API (Trang thai mac dinh):**

Dat `GEMINI_API_KEY` trong `.env` de kich hoat chatbot. Chatbot se:
- Tich hop du lieu analytics (so luong SV, khoa hoc, luot nop, SV nguy co)
- Nho lich su hoi thoai tren moi session (multi-turn conversation)
- Ap dung rate limiting (30 request/phut tren moi session)

Cau truc request:
```json
POST /api/chat
{
  "message": "Co bao nhieu sinh vien dang gan nguy co?",
  "sessionId": "user-123"  // Optional, will use IP if not provided
}
```

Cau truc response:
```json
{
  "reply": "Hien tai co 45 sinh vien co nguy co...",
  "sessionId": "user-123"
}
```

**Quan ly lich su hoi thoai:**

```bash
# Lay lich su
GET /api/chat/history?sessionId=user-123

# Xoa lich su
POST /api/chat/clear
{ "sessionId": "user-123" }
```

## Trien khai & nhung Canvas

- Deploy backend (PM2/systemd + HTTPS).
- Build frontend (`npm run build`) va phuc vu static qua Node/Nginx.
- Nhung vao Canvas qua iframe (hoac LTI) tro den URL dashboard, truyen API key/SSO tuy nhu cau.

Backend + frontend nay la nen tang trinh bay Learning Analytics tach roi nhung de embed vao Canvas.
