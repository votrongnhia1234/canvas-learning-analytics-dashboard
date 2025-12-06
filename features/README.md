# Bộ công cụ trực quan hóa & dự đoán (Canvas Learning Analytics)

Thư mục `learning_analytics/features` cung cấp trọn bộ script Python để:

1. **Chuẩn bị dữ liệu** từ PostgreSQL `canvas_dwh`.
2. **Huấn luyện và so sánh 5 mô hình máy học** để dự đoán sinh viên *At-Risk*:
   - **1. Logistic Regression** - Mô hình tuyến tính cơ bản
   - **2. Random Forest** - Mô hình rừng cây (ensemble)
   - **3. Gradient Boosting** - Mô hình boosting mạnh mẽ
   - **4. SVM (Support Vector Machine)** - Mô hình phân loại phi tuyến
   - **5. KNN (K-Nearest Neighbors)** - Mô hình dựa trên khoảng cách
3. **Tự động chọn mô hình tốt nhất** dựa trên F1-Score
4. **Xuất bộ dữ liệu, biểu đồ và mô hình** phục vụ dashboard hoặc notebook.

## 1. Yêu cầu môi trường

- Python ≥ 3.10
- Các package đã cài: `pandas`, `sqlalchemy`, `psycopg2`, `python-dotenv`, `scikit-learn`, `matplotlib`, `seaborn`, `joblib`.
- Database `canvas_dwh` đang hoạt động (mặc định: `postgresql://postgres:sekret@localhost:5432/canvas_dwh`).
- Nếu chạy trong Docker (hostname DB = `postgres`) cứ giữ nguyên chuỗi kết nối; khi chạy trên máy thật, script tự đổi `postgres` → `localhost`.

## 2. Cấu trúc thư mục

| File | Chức năng |
|------|-----------|
| `db.py` | Khởi tạo kết nối database (đọc `.env.local` nếu có). |
| `data_prep.py` | Gom dữ liệu tổng hợp: sinh viên, khóa học, tuần, heatmap, KPI, và dataset huấn luyện sạch leakage. |
| `modeling.py` | **Huấn luyện 5 mô hình** (Logistic Regression, Random Forest, Gradient Boosting, SVM, KNN), so sánh hiệu suất, tự động chọn mô hình tốt nhất, cập nhật bảng dự đoán. |
| `visualize.py` | Hỗ trợ vẽ bar chart, pie chart, line chart, heatmap, scatter, KPI text, confusion matrix. |
| `pipeline.py` | Điều phối toàn bộ quy trình: xuất CSV → huấn luyện 5 mô hình → so sánh → chọn mô hình tốt nhất → vẽ biểu đồ → lưu kết quả. |

## 3. Bộ đặc trưng theo từng môn học

- `fetch_training_dataset()` xây dựng dataset ở cấp **sinh viên – khóa học**. Mỗi bản ghi mô tả hành vi của một sinh viên trong một môn, với tín hiệu sớm: `early_avg_grade`, `early_late_ratio`, `avg_delay_hours`, `active_weeks_early`, `early_grade_trend`, `submissions_last_14d`, `assignment_completion_ratio`, `course_submission_count`, `course_late_ratio`, `course_load`, v.v.
- Nhãn `is_at_risk` = 1 nếu **điểm trung bình của môn đó** (`course_final_avg`) < 5. Điểm cuối kỳ chỉ dùng để gán nhãn, không nằm trong tập đặc trưng -> tránh leakage.
- Sau khi dự đoán, mô hình ghi `student_course_features` (per-course) rồi tổng hợp lại thành `student_features` ở cấp sinh viên (dùng max xác suất để cảnh báo nếu bất kỳ môn nào rủi ro).

## 4. Chạy nhanh toàn bộ pipeline

```bash
cd D:\DoAnChuyenNghanh\canvas
$env:PYTHONIOENCODING = 'utf-8'   # Nếu dùng PowerShell trên Windows
python -m learning_analytics.features.pipeline
```

Log trên màn hình sẽ hiển thị từng bước:

```
📦 Đang xuất dữ liệu tổng hợp ra CSV...
📊 Đang tải dữ liệu để vẽ biểu đồ...
🤖 Huấn luyện và so sánh 5 mô hình...

1️⃣  LOGISTIC REGRESSION
   • Chuẩn bị dữ liệu huấn luyện...
   • Huấn luyện Logistic Regression...
   • Lưu kết quả dự đoán vào database...
   • Độ chính xác: 0.95 | Precision: 0.93 | Recall: 0.92 | F1: 0.92

2️⃣  RANDOM FOREST
   • Huấn luyện Random Forest...
   • Độ chính xác: 0.97 | Precision: 0.96 | Recall: 0.94 | F1: 0.95

3️⃣  GRADIENT BOOSTING
   • Huấn luyện Gradient Boosting...
   • Độ chính xác: 0.98 | Precision: 0.97 | Recall: 0.96 | F1: 0.96

4️⃣  SVM (Support Vector Machine)
   • Huấn luyện SVM...
   • Độ chính xác: 0.94 | Precision: 0.91 | Recall: 0.89 | F1: 0.90

5️⃣  KNN (K-Nearest Neighbors)
   • Huấn luyện KNN...
   • Độ chính xác: 0.92 | Precision: 0.89 | Recall: 0.87 | F1: 0.88

================================================================================
📊 SO SÁNH CÁC MÔ HÌNH
================================================================================

                        accuracy  precision    recall        f1
Logistic Regression        0.95       0.93      0.92      0.92
Random Forest              0.97       0.96      0.94      0.95
Gradient Boosting          0.98       0.97      0.96      0.96
SVM                        0.94       0.91      0.89      0.90
KNN                        0.92       0.89      0.87      0.88

================================================================================

✨ Mô hình tốt nhất: Gradient Boosting (F1-Score: 0.9621)

================================================================================

🖼️ Vẽ biểu đồ và lưu file PNG...
✅ Hoàn tất! Kiểm tra thư mục features/output để xem kết quả.
```

## 5. Kết quả sau khi chạy

```
learning_analytics/features/output/
├── data/
│   ├── student_summary.csv
│   ├── course_summary.csv
│   ├── weekly_trends.csv
│   ├── overview_counts.csv
│   ├── late_ratio_heatmap.csv
│   └── training_dataset.csv
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
│   ├── kpi_at_risk.png
│   └── top_at_risk_students.png
├── model/
│   ├── logistic_regression/
│   │   ├── logistic_regression.joblib
│   │   ├── scaler.joblib
│   │   ├── model_metrics.csv
│   │   └── classification_report.txt
│   ├── model_comparison.csv
│   ├── model_comparison_formatted.csv
│   └── all_models_evaluation.csv
├── top_at_risk_students.csv
└── model_metrics.csv
```

### Tệp so sánh mô hình

- **`model_comparison.csv`** - Bảng so sánh chi tiết tất cả 5 mô hình với các metrics: Accuracy, Precision, Recall, F1-Score
- **`model_comparison_formatted.csv`** - Bảng so sánh định dạng đẹp hơn, dễ đọc
- **`all_models_evaluation.csv`** - Toàn bộ metrics của tất cả mô hình (định dạng dài)

### Cách chọn mô hình tốt nhất

Hệ thống tự động:
1. **Huấn luyện 5 mô hình** trên dữ liệu giống nhau
2. **So sánh F1-Score** của từng mô hình (cân bằng Precision & Recall)
3. **Chọn mô hình có F1-Score cao nhất**
4. **Sử dụng mô hình đó** để dự đoán sinh viên At-Risk
5. **Lưu kết quả vào database** với xác suất dự đoán

Các biểu đồ được sắp xếp theo bố cục dashboard gợi ý:

- **Trang 1 – Tổng quan**: `overview_counts.png`, `risk_bucket_pie.png`, `course_avg_grade.png`.
- **Trang 2 – Phân tích sinh viên**: `students_avg_grade.png`, `weekly_trends.png`, `late_ratio_heatmap.png`, `grade_distribution.png`.
- **Trang 3 – Phân tích khóa học**: `course_heatmap.png`, `course_scatter_grade_late.png`, `kpi_at_risk.png`.
- **Phần mô hình**: Bảng so sánh `model_comparison_formatted.csv` (mỗi dòng là một mô hình với các metrics), CSV `top_at_risk_students.csv` (mỗi dòng là một sinh viên - khóa học kèm xác suất rủi ro từ mô hình tốt nhất).

## 6. Kiểm tra nhanh

- Mở các file CSV để đối chiếu số liệu.
- Sử dụng `psql` để xem bảng vừa cập nhật:

```bash
psql "postgresql://postgres:sekret@localhost:5432/canvas_dwh" -c "SELECT * FROM model_evaluation;"
```

- Nếu muốn khai thác riêng trong notebook:

```python
from learning_analytics.features.data_prep import fetch_training_dataset
df = fetch_training_dataset()
df.head()
```

## 7. Ưu điểm của từng mô hình

| Mô hình | Ưu điểm | Nhược điểm | Độ phức tạp |
|---------|--------|-----------|------------|
| **Logistic Regression** | Nhanh, dễ hiểu, cấu trúc đơn giản | Chỉ cho phép ranh giới tuyến tính | Thấp |
| **Random Forest** | Xử lý phi tuyến, không cần chuẩn hóa dữ liệu | Tiêu thụ bộ nhớ lớn, có thể overfit | Trung bình |
| **Gradient Boosting** | Hiệu suất cao, xử lý tốt dữ liệu không cân bằng | Huấn luyện chậm, dễ overfit | Cao |
| **SVM** | Hiệu quả với dữ liệu chiều cao, tốt với ranh giới phức tạp | Chậm với dữ liệu lớn, cần chuẩn hóa | Cao |
| **KNN** | Đơn giản, không cần huấn luyện | Chậm với dữ liệu lớn, cần tiêu chuẩn khoảng cách | Thấp |

## 8. Notes

- Nếu cần tùy chỉnh thư mục đầu ra, gọi `build_visualizations(Path("duong_dan_moi"))`.
- Dữ liệu `student_features` được ghi đè mỗi lần chạy để đồng bộ với mô hình mới, đồng thời chứa sẵn các đặc trưng nâng cao (để backend/các dịch vụ khác tái sử dụng).
- Bảng `student_course_features` lưu đầy đủ thông tin theo từng môn học; bảng `student_features` chỉ là tổng hợp theo sinh viên (lấy max xác suất rủi ro theo môn).
- KPI “% sinh viên at-risk” được tính trên cột `predicted_at_risk` của mô hình.


CREATE TABLE student_course_features AS                                                                     │
 SELECT                                                                                                      │
 ars.student_id,                                                                                           │
 ars.student_name,                                                                                         │
 ars.student_email,                                                                                        │
 ars.course_id,                                                                                            │
 ars.course_name,                                                                                          │
 ars.avg_grade AS course_final_avg,                                                                        │
 ars.submission_count AS course_submission_count,                                                          │
 ars.late_submission_ratio AS course_late_ratio,                                                           │
 1 AS course_load,                                                                                         │
 COALESCE(ars.early_avg_grade, ars.avg_grade) AS early_avg_grade,                                          │
 COALESCE(ars.early_submission_count, ars.submission_count)::int AS early_submission_count,                │
 COALESCE(ars.early_late_ratio, ars.late_submission_ratio) AS early_late_ratio,                            │
 1::int AS active_weeks_early,                                                                             │
 COALESCE(ars.avg_delay_hours, 0)::numeric AS avg_delay_hours,                                             │
 COALESCE(ars.submissions_last_14d, 0)::int AS submissions_last_14d,                                       │
 COALESCE(ars.submissions_last_30d, 0)::int AS submissions_last_30d,                                       │
 COALESCE(ars.assignment_completion_ratio, 0)::numeric AS assignment_completion_ratio,                     │
 ars.risk_probability,                                                                                     │
 ars.risk_bucket,                                                                                          │
 ars.predicted_at_risk                                                                                     │
 FROM at_risk_students ars; 