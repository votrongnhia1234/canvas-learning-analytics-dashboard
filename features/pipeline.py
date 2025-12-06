from __future__ import annotations

from pathlib import Path

import pandas as pd

from .data_prep import (
    export_datasets,
    fetch_course_risk_late_matrix,
    fetch_course_summary,
    fetch_overview_counts,
    fetch_student_summary,
    fetch_weekly_trends,
)
from .db import get_engine
from .modeling import train_and_compare_all_models
from .visualize import (
    plot_at_risk_kpi,
    plot_confusion_matrix,
    plot_course_average_bar,
    plot_course_heatmap,
    plot_course_scatter,
    plot_grade_distribution,
    plot_late_heatmap_matrix,
    plot_late_ratio_pie,
    plot_overview_counts,
    plot_student_average,
    plot_top_at_risk,
    plot_weekly_trends,
)


def build_visualizations(output_root: Path | None = None) -> None:
    """
    Pipeline chính để:
      1. Trích xuất dữ liệu ra CSV
      2. Huấn luyện mô hình Logistic Regression
      3. Vẽ toàn bộ biểu đồ phục vụ dashboard/báo cáo
      4. Lưu top sinh viên nguy cơ cao và bộ chỉ số đánh giá
    Đầu ra nằm trong thư mục `learning_analytics/features/output`.
    """
    base_dir = output_root or Path(__file__).resolve().parent / "output"
    data_dir = base_dir / "data"
    figure_dir = base_dir / "figures"
    model_dir = base_dir / "model"

    data_dir.mkdir(parents=True, exist_ok=True)
    figure_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    print("📦 Đang xuất dữ liệu tổng hợp ra CSV...")
    export_datasets(data_dir)

    print("📊 Đang tải dữ liệu để vẽ biểu đồ...")
    student_df = fetch_student_summary()
    course_df = fetch_course_summary()
    weekly_df = fetch_weekly_trends()
    overview_counts = fetch_overview_counts()

    print("🤖 Huấn luyện và so sánh 5 mô hình...")
    all_metrics, best_model_name = train_and_compare_all_models(model_dir)

    engine = get_engine()
    prediction_df = pd.read_sql(
        "SELECT * FROM student_features ORDER BY risk_probability DESC", engine
    )
    course_prediction_df = pd.read_sql(
        "SELECT * FROM student_course_features ORDER BY risk_probability DESC", engine
    )
    
    # Lấy metrics của mô hình tốt nhất
    metrics = all_metrics[best_model_name]
    heatmap_df = fetch_course_risk_late_matrix()
    overview_df = pd.DataFrame([overview_counts])
    overview_df.to_csv(data_dir / "overview_counts.csv", index=False)
    heatmap_df.to_csv(data_dir / "late_ratio_heatmap.csv", index=False)

    print("🖼️ Vẽ biểu đồ và lưu file PNG...")
    plot_overview_counts(overview_counts, figure_dir / "overview_counts.png")
    plot_student_average(prediction_df, figure_dir / "students_avg_grade.png")
    plot_grade_distribution(prediction_df, figure_dir / "grade_distribution.png")
    plot_late_ratio_pie(prediction_df, figure_dir / "risk_bucket_pie.png")
    plot_weekly_trends(weekly_df, figure_dir / "weekly_trends.png")
    plot_course_heatmap(course_df, figure_dir / "course_heatmap.png")
    plot_course_average_bar(course_df, figure_dir / "course_avg_grade.png")
    plot_course_scatter(course_df, figure_dir / "course_scatter_grade_late.png")
    plot_late_heatmap_matrix(heatmap_df, figure_dir / "late_ratio_heatmap.png")
    # Note: confusion_matrix không thể vẽ được nếu xóa cm, skip nó
    at_risk_ratio = prediction_df["predicted_at_risk"].mean()
    plot_at_risk_kpi(at_risk_ratio, figure_dir / "kpi_at_risk.png")
    course_plot_df = course_prediction_df.copy()
    course_plot_df["student_name"] = (
        course_plot_df["student_name"] + " (" + course_plot_df["course_name"] + ")"
    )
    plot_top_at_risk(course_plot_df, figure_dir / "top_at_risk_students.png")

    course_prediction_df[
        [
            "student_id",
            "student_name",
            "student_email",
            "course_id",
            "course_name",
            "avg_grade",
            "course_final_avg",
            "submission_count",
            "late_submission_ratio",
            "risk_probability",
            "risk_bucket",
        ]
    ].head(25).to_csv(base_dir / "top_at_risk_students.csv", index=False)

    pd.DataFrame.from_dict(metrics, orient="index", columns=["score"]).to_csv(
        base_dir / "model_metrics.csv"
    )

    print("✅ Hoàn tất! Kiểm tra thư mục features/output để xem kết quả.")


if __name__ == "__main__":
    build_visualizations()
