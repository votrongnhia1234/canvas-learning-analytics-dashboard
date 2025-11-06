from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .data_prep import fetch_student_summary
from .db import get_engine


def train_logistic_regression(output_dir: Path) -> Tuple[Dict[str, float], np.ndarray]:
    """
    Huấn luyện Logistic Regression dự đoán sinh viên At-Risk.
    - Chuẩn hóa dữ liệu với StandardScaler
    - Chia train/test để đánh giá
    - Lưu lại bảng `student_features`, `at_risk_students`, `risk_by_course`, `model_evaluation`
    - Xuất báo cáo, model, scaler vào thư mục `output_dir`
    """
    print("   • Chuẩn bị dữ liệu huấn luyện...")
    features = fetch_student_summary()
    features["late_ratio"] = features["late_ratio"].fillna(0)
    features["avg_grade"] = features["avg_grade"].fillna(0)

    X = features[["avg_grade", "submission_count", "late_ratio"]].copy()
    y = (features["avg_grade"] < 5).astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print("   • Huấn luyện Logistic Regression...")
    model = LogisticRegression(random_state=42, max_iter=1000)
    model.fit(X_train_scaled, y_train)

    y_pred = model.predict(X_test_scaled)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1": f1_score(y_test, y_pred),
    }
    cm = confusion_matrix(y_test, y_pred)

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "classification_report.txt").write_text(
        classification_report(y_test, y_pred), encoding="utf-8"
    )
    pd.DataFrame.from_dict(metrics, orient="index", columns=["score"]).to_csv(
        output_dir / "model_metrics.csv"
    )

    joblib.dump(scaler, output_dir / "scaler.joblib")
    joblib.dump(model, output_dir / "logistic_regression.joblib")

    print("   • Lưu kết quả dự đoán vào database...")
    engine = get_engine()
    features = features.assign(
        is_at_risk=y,
        risk_probability=model.predict_proba(scaler.transform(X))[:, 1],
        predicted_at_risk=model.predict(scaler.transform(X)),
        late_submission_ratio=features["late_ratio"],
    )

    features_to_store = features[
        [
            "student_id",
            "student_name",
            "student_email",
            "avg_grade",
            "submission_count",
            "late_submission_ratio",
            "is_at_risk",
            "risk_probability",
            "predicted_at_risk",
            "risk_bucket",
        ]
    ]

    features_to_store.to_sql("student_features", engine, if_exists="replace", index=False)

    at_risk = features_to_store[features_to_store["predicted_at_risk"] == 1].copy()
    at_risk = at_risk.sort_values("risk_probability", ascending=False)
    at_risk.to_sql("at_risk_students", engine, if_exists="replace", index=False)

    course_students = pd.read_sql(
        "SELECT DISTINCT student_id, course_id FROM fact_submissions", engine
    )
    course_lookup = pd.read_sql("SELECT course_id, course_name FROM dim_courses", engine)
    course_summary = (
        course_students.merge(
            features_to_store[["student_id", "predicted_at_risk"]], on="student_id", how="left"
        )
        .merge(course_lookup, on="course_id", how="left")
        .groupby(["course_id", "course_name"])
        .agg(
            at_risk_students=("predicted_at_risk", lambda s: int((s == 1).sum())),
            total_students=("student_id", "nunique"),
        )
        .reset_index()
    )
    course_summary["at_risk_ratio"] = (
        course_summary["at_risk_students"] / course_summary["total_students"]
    )
    course_summary.to_sql("risk_by_course", engine, if_exists="replace", index=False)

    pd.DataFrame(
        [
            {"metric": "Accuracy", "score": metrics["accuracy"]},
            {"metric": "Precision", "score": metrics["precision"]},
            {"metric": "Recall", "score": metrics["recall"]},
            {"metric": "F1-Score", "score": metrics["f1"]},
        ]
    ).to_sql("model_evaluation", engine, if_exists="replace", index=False)

    print(
        f"   • Độ chính xác: {metrics['accuracy']:.2f} | "
        f"Precision: {metrics['precision']:.2f} | Recall: {metrics['recall']:.2f} | F1: {metrics['f1']:.2f}"
    )

    return metrics, cm
