# 🧠 Canvas LMS – Database Setup & Reset Guide
## 🧩 1️⃣ Kiểm tra container hiện tại

docker compose ps
Kết quả mẫu:

NAME                   STATUS
canvas-web-1           Up
canvas-postgres-1      Up
canvas-redis-1         Up

🧹 2️⃣ Ngắt toàn bộ kết nối tới database
Canvas thường giữ kết nối tới DB → cần terminate trước khi xóa.

docker compose exec postgres psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='canvas_development';"

💣 3️⃣ Xóa & tạo lại database

docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS canvas_development;"

Nếu lỗi “role "canvas" does not exist”, hãy tạo lại user:

docker compose exec postgres psql -U postgres -c "CREATE ROLE canvas WITH LOGIN PASSWORD 'canvas';"
docker compose exec postgres psql -U postgres -c "ALTER ROLE canvas CREATEDB;"
Sau đó tạo lại database:

docker compose exec postgres psql -U postgres -c "CREATE DATABASE canvas_development OWNER canvas;"
🏗️ 4️⃣ Migrate & seed lại database gốc Canvas
docker compose exec web bundle exec rake db:initial_setup
docker compose exec web bundle exec rake db:migrate
Sau khi chạy xong, Canvas sẽ có dữ liệu mặc định (admin, courses demo...).

🎓 5️⃣ Seed dữ liệu học tập nâng cao (Learning Analytics Demo)
Gồm: 4 khóa học (JavaScript, Java, Python, C++), 100 sinh viên thật, phân loại điểm số và trễ hạn.

docker compose exec web bundle exec rake custom:reset_and_seed
Kết quả hiển thị:

📈 Phân loại sinh viên:
  - At-Risk (Yếu <5): 54
  - At-Risk (Lười 5–7 + trễ): 19
  - Khá/Giỏi (≥7): 26
✅ Seed dữ liệu hoàn tất!

🚀 6️⃣ Truy cập giao diện Canvas
Mở trình duyệt:
👉 http://localhost:3000

🧩 Cách 1️⃣: Kiểm tra tài khoản admin trong container Canvas (chuẩn nhất)
Bước 1. Mở terminal vào container web:
docker compose exec web bash


⚙️ Bạn sẽ thấy prompt kiểu:

root@39af773ece1c:/usr/src/app#

Bước 2. Mở console Rails để thao tác trực tiếp với DB
bundle exec rails console
Tạo mới tài khoản admin thủ công

Nếu admin@example.com không tồn tại hoặc bị xóa trong seed:

root = Account.default
admin = User.create!(name: "Võ Trọng Nghĩa (Admin)")
admin.pseudonyms.create!(
  unique_id: "admin@example.com",
  password: "admin@12345",
  password_confirmation: "admin@12345",
  account: root
)
cc = admin.communication_channels.create!(path: "admin@example.com", path_type: "email")
cc.confirm!
admin.save!
puts "🎉 Đã tạo mới admin@example.com (admin@12345)"

sau đó exits 2 lần khỏi console Rails và container web.

⚡ 7️⃣ Script tự động hóa (Tùy chọn)

# 🧹 Tự động reset database Canvas
docker compose exec postgres psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='canvas_development';"
docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS canvas_development;"
docker compose exec postgres psql -U postgres -c "CREATE ROLE canvas WITH LOGIN PASSWORD 'canvas';"
docker compose exec postgres psql -U postgres -c "ALTER ROLE canvas CREATEDB;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE canvas_development OWNER canvas;"
docker compose exec web bundle exec rake db:migrate
docker compose exec web bundle exec rake db:seed
docker compose exec web bundle exec rake custom:reset_and_seed

Võ Trọng Nghĩa
HUTECH – Learning Analytics Dashboard Project
Canvas LMS Local ETL & Dashboard Pipeline