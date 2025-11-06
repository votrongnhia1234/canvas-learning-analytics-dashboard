# Bộ công cụ trực quan hóa & dự đoán (Canvas Learning Analytics)

Thư mục `learning_analytics/features` cung cấp trọn bộ script Python để:

1. **Chuẩn bị dữ liệu** từ PostgreSQL `canvas_dwh`.
2. **Huấn luyện mô hình Logistic Regression** dự đoán sinh viên *At-Risk*.
3. **Xuất bộ dữ liệu, biểu đồ và mô hình** phục vụ dashboard hoặc notebook.

## 1. Yêu cầu môi trường

- Python ≥ 3.10
- Các package đã cài: `pandas`, `sqlalchemy`, `psycopg2`, `python-dotenv`, `scikit-learn`, `matplotlib`, `seaborn`, `joblib`.
- Database `canvas_dwh` đang hoạt động (mặc định: `postgresql://postgres:sekret@localhost:5432/canvas_dwh`).
- Nếu chạy trong Docker (hostname DB = `postgres`) cứ giữ nguyên chuỗi kết nối; khi chạy trên máy thật, script tự đổi `postgres` → `localhost`.

## 2. Cấu trúc thư mục

| File | Chức năng |
|------|-----------|
| `db.py` | Khởi tạo kết nối database (đọc `.env.local` nếu có). |
| `data_prep.py` | Gom dữ liệu tổng hợp: sinh viên, khóa học, tuần, heatmap, KPI. |
| `modeling.py` | Huấn luyện Logistic Regression, cập nhật các bảng `student_features`, `at_risk_students`, `risk_by_course`, `model_evaluation`. |
| `visualize.py` | Hỗ trợ vẽ bar chart, pie chart, line chart, heatmap, scatter, KPI text, confusion matrix. |
| `pipeline.py` | Điều phối toàn bộ quy trình: xuất CSV → huấn luyện → vẽ biểu đồ → lưu kết quả. |

## 3. Chạy nhanh toàn bộ pipeline

```bash
cd D:\DoAnChuyenNghanh\canvas
$env:PYTHONIOENCODING = 'utf-8'   # Nếu dùng PowerShell trên Windows
python -m learning_analytics.features.pipeline
```

Log trên màn hình sẽ hiển thị từng bước:

```
📦 Đang xuất dữ liệu tổng hợp ra CSV...
📊 Đang tải dữ liệu để vẽ biểu đồ...
🤖 Huấn luyện mô hình Logistic Regression...
   • Chuẩn bị dữ liệu huấn luyện...
   • Huấn luyện Logistic Regression...
   • Lưu kết quả dự đoán vào database...
   • Độ chính xác: 1.00 | Precision: 1.00 | Recall: 1.00 | F1: 1.00
🖼️ Vẽ biểu đồ và lưu file PNG...
✅ Hoàn tất! Kiểm tra thư mục features/output để xem kết quả.
```

## 4. Kết quả sau khi chạy

```
learning_analytics/features/output/
├── data/
│   ├── student_summary.csv
│   ├── course_summary.csv
│   ├── weekly_trends.csv
│   ├── overview_counts.csv
│   └── late_ratio_heatmap.csv
├── figures/
│   ├── overview_counts.png
│   ├── risk_bucket_pie.png
│   ├── course_avg_grade.png
│   ├── students_avg_grade.png
│   ├── weekly_trends.png
│   ├── late_ratio_heatmap.png
│   ├── course_heatmap.png
│   ├── course_scatter_grade_late.png
│   ├── grade_distribution.png
│   ├── confusion_matrix.png
│   ├── kpi_at_risk.png
│   └── top_at_risk_students.png
├── model/
│   ├── logistic_regression.joblib
│   ├── scaler.joblib
│   ├── model_metrics.csv
│   └── classification_report.txt
├── top_at_risk_students.csv
└── model_metrics.csv
```

Các biểu đồ được sắp xếp theo bố cục dashboard gợi ý:

- **Trang 1 – Tổng quan**: `overview_counts.png`, `risk_bucket_pie.png`, `course_avg_grade.png`.
- **Trang 2 – Phân tích sinh viên**: `students_avg_grade.png`, `weekly_trends.png`, `late_ratio_heatmap.png`, `grade_distribution.png`.
- **Trang 3 – Phân tích khóa học**: `course_heatmap.png`, `course_scatter_grade_late.png`, `kpi_at_risk.png`.
- **Phần mô hình**: `confusion_matrix.png`, `model_metrics.csv`, `classification_report.txt`.

## 5. Kiểm tra nhanh

- Mở các file CSV để đối chiếu số liệu.
- Sử dụng `psql` để xem bảng vừa cập nhật:

```bash
psql "postgresql://postgres:sekret@localhost:5432/canvas_dwh" -c "SELECT * FROM model_evaluation;"
```

- Nếu muốn khai thác riêng trong notebook:

```python
from learning_analytics.features.data_prep import fetch_student_summary
df = fetch_student_summary()
df.head()
```

## 6. Notes

- Nếu cần tùy chỉnh thư mục đầu ra, gọi `build_visualizations(Path("duong_dan_moi"))`.
- Dữ liệu `student_features` được ghi đè mỗi lần chạy để đồng bộ với mô hình mới.
- KPI “% sinh viên at-risk” được tính trên cột `predicted_at_risk` của mô hình.

Chúc bạn khai thác dữ liệu Canvas hiệu quả! 🎓📊
