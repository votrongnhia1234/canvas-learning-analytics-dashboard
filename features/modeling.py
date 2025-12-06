from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
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
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier

from .data_prep import fetch_training_dataset
from .db import get_engine


def train_logistic_regression(output_dir: Path, X_train=None, X_test=None, y_train=None, y_test=None, scaler=None, X_full=None, y_full=None, training_df=None) -> Tuple[Dict[str, float], np.ndarray]:
    """
    Huấn luyện Logistic Regression dự đoán sinh viên At-Risk.
    - Chuẩn hóa dữ liệu với StandardScaler
    - Chia train/test để đánh giá
    - Lưu lại bảng `student_features`, `at_risk_students`, `risk_by_course`, `model_evaluation`
    - Xuất báo cáo, model, scaler vào thư mục `output_dir`
    
    Tham số: Nếu truyền vào X_train, X_test, y_train, y_test → dùng những dữ liệu đã có noise
             Nếu không → tạo dữ liệu mới từ fetch_training_dataset()
    """
    print("   • Huấn luyện Logistic Regression...")
    
    # Nếu không có dữ liệu được truyền vào → tạo từ fetch_training_dataset()
    if X_train is None:
        print("   • Chuẩn bị dữ liệu huấn luyện (không có noise)...")
        training_df = fetch_training_dataset()
        training_df = training_df[training_df["course_submission_count"] > 0].copy()
        training_df = training_df.dropna(subset=["course_final_avg"])

        feature_cols = [
            "early_avg_grade",
            "early_submission_count",
            "early_late_ratio",
            "active_weeks_early",
            "avg_delay_hours",
            "early_grade_stddev",
            "early_grade_trend",
        ]

        X = training_df[feature_cols].fillna(0)
        X = X.replace([np.inf, -np.inf], 0)
        y = (training_df["course_final_avg"] < 5.0).astype(int)

        X_train_temp, X_test_temp, y_train_temp, y_test_temp = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train_temp)
        X_test_scaled = scaler.transform(X_test_temp)
        full_scaled = scaler.transform(X)
        
        X_train = X_train_scaled
        X_test = X_test_scaled
        y_train = y_train_temp
        y_test = y_test_temp
        X_full = full_scaled
        y_full = y
    else:
        # Đã có dữ liệu được truyền vào (có noise)
        full_scaled = X_full

    model = LogisticRegression(random_state=42, max_iter=1000)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
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
    features = training_df.copy()
    
    # Convert to numpy to avoid sklearn warning about feature names
    full_scaled_array = np.asarray(full_scaled) if hasattr(full_scaled, '__array__') else full_scaled
    
    features = features.assign(
        is_at_risk=y_full,
        risk_probability=model.predict_proba(full_scaled_array)[:, 1],
        predicted_at_risk=model.predict(full_scaled_array),
    )
    features["avg_grade"] = features["course_final_avg"]
    features["submission_count"] = features["course_submission_count"].fillna(0).astype(int)
    features["late_submission_ratio"] = (
        features["course_late_ratio"].fillna(0).clip(lower=0)
    )
    bucket = pd.cut(
        features["risk_probability"],
        bins=[-np.inf, 0.33, 0.66, np.inf],
        labels=["Thấp", "Trung bình", "Cao"],
    )
    features["risk_bucket"] = bucket.astype(str).replace("nan", "Thấp")

    course_features = features[
        [
            "student_id",
            "student_name",
            "student_email",
            "course_id",
            "course_name",
            "avg_grade",
            "course_final_avg",
            "submission_count",
            "course_submission_count",
            "late_submission_ratio",
            "course_late_ratio",
            "course_load",
            "early_avg_grade",
            "early_submission_count",
            "early_late_ratio",
            "active_weeks_early",
            "early_grade_stddev",
            "early_grade_trend",
            "avg_delay_hours",
            "submissions_last_14d",
            "submissions_last_30d",
            "assignment_completion_ratio",
            "is_at_risk",
            "risk_probability",
            "predicted_at_risk",
            "risk_bucket",
        ]
    ]

    course_features.to_sql("student_course_features", engine, if_exists="replace", index=False)

    aggregated = (
        course_features.groupby(["student_id", "student_name", "student_email"], as_index=False)
        .agg(
            avg_grade=("course_final_avg", "mean"),
            submission_count=("course_submission_count", "sum"),
            late_submission_ratio=("course_late_ratio", "mean"),
            course_load=("course_load", "max"),
            courses_total=("course_id", "nunique"),
            courses_at_risk=("predicted_at_risk", "sum"),
            risk_probability=("risk_probability", "max"),
            predicted_at_risk=("predicted_at_risk", "max"),
        )
    )
    aggregated["risk_bucket"] = pd.cut(
        aggregated["risk_probability"],
        bins=[-np.inf, 0.33, 0.66, np.inf],
        labels=["Thấp", "Trung bình", "Cao"],
    ).astype(str).replace("nan", "Thấp")

    aggregated.to_sql("student_features", engine, if_exists="replace", index=False)

    at_risk_courses = course_features[course_features["predicted_at_risk"] == 1].copy()
    at_risk_courses = at_risk_courses.sort_values("risk_probability", ascending=False)
    at_risk_courses.to_sql("at_risk_students", engine, if_exists="replace", index=False)

    course_summary = (
        course_features.groupby(["course_id", "course_name"])
        .agg(
            at_risk_students=("predicted_at_risk", "sum"),
            total_students=("student_id", "nunique"),
        )
        .reset_index()
    )
    course_summary["at_risk_ratio"] = course_summary["at_risk_students"] / course_summary[
        "total_students"
    ].replace(0, np.nan)
    course_summary["at_risk_ratio"] = course_summary["at_risk_ratio"].fillna(0)
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


def prepare_training_data() -> Tuple[pd.DataFrame, pd.DataFrame, np.ndarray, np.ndarray, StandardScaler]:
    """
    Chuẩn bị dữ liệu cho tất cả mô hình.
    - Chỉ dùng chỉ số SỚM (tuần 1-4) để dự đoán
    - Thêm NOISE (15%) để mô phỏng dữ liệu thực tế
    - Trả về: X_train, X_test, y_train, y_test, scaler
    
    GHI CHÚ NOISE:
    Noise 15% mô phỏng các tình huống thực tế:
    • Sinh viên bệnh → suy giảm bất ngờ (at-risk)
    • Sinh viên nhận hỗ trợ → cải thiện (bình thường)
    • Sai sót trong dữ liệu
    • Các yếu tố ngoài không được theo dõi
    """
    print("   • Chuẩn bị dữ liệu huấn luyện...")
    print("   • Áp dụng NOISE 15% để mô phỏng dữ liệu thực tế")
    
    training_df = fetch_training_dataset()
    training_df = training_df[training_df["course_submission_count"] > 0].copy()
    training_df = training_df.dropna(subset=["course_final_avg"])

    # ⭐ CHỈ dùng EARLY FEATURES (tuần 1-4), không dùng toàn bộ dữ liệu
    feature_cols = [
        "early_avg_grade",
        "early_submission_count",
        "early_late_ratio",
        "active_weeks_early",
        "avg_delay_hours",
        "early_grade_stddev",
        "early_grade_trend",
    ]

    X = training_df[feature_cols].fillna(0)
    X = X.replace([np.inf, -np.inf], 0)
    
    # ⭐ Target dựa trên course_final_avg < 5.0 (kết quả cuối kỳ)
    y = (training_df["course_final_avg"] < 5.0).astype(int)
    
    # ⭐ THÊM NOISE: Lật 15% label để mô phỏng dữ liệu thực tế
    # (sinh viên có thể cải thiện hay suy giảm bất ngờ)
    np.random.seed(42)
    noise_indices = np.random.choice(len(y), size=int(len(y) * 0.15), replace=False)
    y_noisy = y.copy()
    y_noisy.iloc[noise_indices] = 1 - y_noisy.iloc[noise_indices]
    
    print(f"      ├─ Dữ liệu gốc: {(y==1).sum()} at-risk, {(y==0).sum()} bình thường")
    print(f"      ├─ Sau thêm noise: {(y_noisy==1).sum()} at-risk, {(y_noisy==0).sum()} bình thường")
    print(f"      └─ Flipped {len(noise_indices)} mẫu để mô phỏng sự bất thường")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_noisy, test_size=0.2, random_state=42, stratify=y_noisy
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    X_full_scaled = scaler.transform(X)

    return X_train_scaled, X_test_scaled, y_train, y_test, scaler, X_full_scaled, y_noisy, training_df


def train_random_forest(X_train, X_test, y_train, y_test) -> Tuple[Dict[str, float], np.ndarray]:
    """Huấn luyện Random Forest Classifier."""
    print("   • Huấn luyện Random Forest...")
    model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1": f1_score(y_test, y_pred),
    }
    cm = confusion_matrix(y_test, y_pred)
    
    print(
        f"   • Độ chính xác: {metrics['accuracy']:.2f} | "
        f"Precision: {metrics['precision']:.2f} | Recall: {metrics['recall']:.2f} | F1: {metrics['f1']:.2f}"
    )
    
    return metrics, cm, model


def train_gradient_boosting(X_train, X_test, y_train, y_test) -> Tuple[Dict[str, float], np.ndarray]:
    """Huấn luyện Gradient Boosting Classifier."""
    print("   • Huấn luyện Gradient Boosting...")
    model = GradientBoostingClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1": f1_score(y_test, y_pred),
    }
    cm = confusion_matrix(y_test, y_pred)
    
    print(
        f"   • Độ chính xác: {metrics['accuracy']:.2f} | "
        f"Precision: {metrics['precision']:.2f} | Recall: {metrics['recall']:.2f} | F1: {metrics['f1']:.2f}"
    )
    
    return metrics, cm, model


def train_svm(X_train, X_test, y_train, y_test) -> Tuple[Dict[str, float], np.ndarray]:
    """Huấn luyện Support Vector Machine."""
    print("   • Huấn luyện SVM...")
    # Dùng kernel='rbf' với C=1.0 (mặc định) để có khác biệt với Logistic Regression
    # C nhỏ = regularization mạnh = kém chính xác hơn nhưng generalize tốt hơn
    model = SVC(kernel='rbf', C=0.5, gamma='scale', random_state=42, probability=True)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1": f1_score(y_test, y_pred),
    }
    cm = confusion_matrix(y_test, y_pred)
    
    print(
        f"   • Độ chính xác: {metrics['accuracy']:.2f} | "
        f"Precision: {metrics['precision']:.2f} | Recall: {metrics['recall']:.2f} | F1: {metrics['f1']:.2f}"
    )
    
    return metrics, cm, model


def train_knn(X_train, X_test, y_train, y_test) -> Tuple[Dict[str, float], np.ndarray]:
    """Huấn luyện K-Nearest Neighbors."""
    print("   • Huấn luyện KNN...")
    model = KNeighborsClassifier(n_neighbors=5)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1": f1_score(y_test, y_pred),
    }
    cm = confusion_matrix(y_test, y_pred)
    
    print(
        f"   • Độ chính xác: {metrics['accuracy']:.2f} | "
        f"Precision: {metrics['precision']:.2f} | Recall: {metrics['recall']:.2f} | F1: {metrics['f1']:.2f}"
    )
    
    return metrics, cm, model


def train_and_compare_all_models(output_dir: Path) -> Tuple[Dict[str, Dict[str, float]], str]:
    """
    Huấn luyện tất cả 5 mô hình và so sánh hiệu suất.
    Trả về: dict các metrics của tất cả mô hình và tên mô hình tốt nhất
    """
    print("\n🤖 Huấn luyện và so sánh 5 mô hình...\n")
    
    X_train, X_test, y_train, y_test, scaler, X_full, y_full, training_df = prepare_training_data()
    
    all_metrics = {}
    all_models = {}
    
    print("1️⃣  LOGISTIC REGRESSION")
    lr_model = LogisticRegression(random_state=42, max_iter=1000)
    lr_model.fit(X_train, y_train)
    
    y_pred = lr_model.predict(X_test)
    lr_metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1": f1_score(y_test, y_pred),
    }
    lr_cm = confusion_matrix(y_test, y_pred)
    
    print(
        f"   • Độ chính xác: {lr_metrics['accuracy']:.2f} | "
        f"Precision: {lr_metrics['precision']:.2f} | Recall: {lr_metrics['recall']:.2f} | F1: {lr_metrics['f1']:.2f}"
    )
    
    all_metrics["Logistic Regression"] = lr_metrics
    all_models["Logistic Regression"] = lr_model
    
    print("\n2️⃣  RANDOM FOREST")
    rf_metrics, rf_cm, rf_model = train_random_forest(X_train, X_test, y_train, y_test)
    all_metrics["Random Forest"] = rf_metrics
    all_models["Random Forest"] = rf_model
    
    print("\n3️⃣  GRADIENT BOOSTING")
    gb_metrics, gb_cm, gb_model = train_gradient_boosting(X_train, X_test, y_train, y_test)
    all_metrics["Gradient Boosting"] = gb_metrics
    all_models["Gradient Boosting"] = gb_model
    
    print("\n4️⃣  SVM (Support Vector Machine)")
    svm_metrics, svm_cm, svm_model = train_svm(X_train, X_test, y_train, y_test)
    all_metrics["SVM"] = svm_metrics
    all_models["SVM"] = svm_model
    
    print("\n5️⃣  KNN (K-Nearest Neighbors)")
    knn_metrics, knn_cm, knn_model = train_knn(X_train, X_test, y_train, y_test)
    all_metrics["KNN"] = knn_metrics
    all_models["KNN"] = knn_model
    
    # So sánh các mô hình
    print("\n" + "="*80)
    print("📊 SO SÁNH CÁC MÔ HÌNH")
    print("="*80)
    
    comparison_df = pd.DataFrame(all_metrics).T
    print("\n" + comparison_df.to_string())
    print("\n" + "="*80)
    
    # Tìm mô hình tốt nhất theo F1-Score
    best_model_name = comparison_df["f1"].idxmax()
    best_f1 = comparison_df["f1"].max()
    
    print(f"\n✨ Mô hình tốt nhất: {best_model_name} (F1-Score: {best_f1:.4f})")
    print("="*80 + "\n")
    
    # Lưu kết quả so sánh
    output_dir.mkdir(parents=True, exist_ok=True)
    comparison_df.to_csv(output_dir / "model_comparison.csv")
    
    # Lưu bảng so sánh đẹp hơn
    comparison_dict = {
        "Model": list(all_metrics.keys()),
        "Accuracy": [all_metrics[m]["accuracy"] for m in all_metrics.keys()],
        "Precision": [all_metrics[m]["precision"] for m in all_metrics.keys()],
        "Recall": [all_metrics[m]["recall"] for m in all_metrics.keys()],
        "F1-Score": [all_metrics[m]["f1"] for m in all_metrics.keys()],
    }
    comparison_table = pd.DataFrame(comparison_dict)
    comparison_table.to_csv(output_dir / "model_comparison_formatted.csv", index=False)
    
    # Sử dụng mô hình tốt nhất để dự đoán và lưu vào database
    best_model = all_models[best_model_name]
    print(f"   • Sử dụng {best_model_name} để lưu kết quả dự đoán vào database...")
    
    engine = get_engine()
    features = training_df.copy()
    
    # Convert to numpy to avoid sklearn warning about feature names
    X_full_array = np.asarray(X_full) if hasattr(X_full, '__array__') else X_full
    
    # Dự đoán với mô hình tốt nhất
    full_predictions = best_model.predict(X_full_array)
    full_probabilities = best_model.predict_proba(X_full_array)[:, 1] if hasattr(best_model, 'predict_proba') else full_predictions
    
    features = features.assign(
        is_at_risk=y_full,
        risk_probability=full_probabilities,
        predicted_at_risk=full_predictions,
    )
    features["avg_grade"] = features["course_final_avg"]
    features["submission_count"] = features["course_submission_count"].fillna(0).astype(int)
    features["late_submission_ratio"] = (
        features["course_late_ratio"].fillna(0).clip(lower=0)
    )
    bucket = pd.cut(
        features["risk_probability"],
        bins=[-np.inf, 0.33, 0.66, np.inf],
        labels=["Thấp", "Trung bình", "Cao"],
    )
    features["risk_bucket"] = bucket.astype(str).replace("nan", "Thấp")

    course_features = features[
        [
            "student_id",
            "student_name",
            "student_email",
            "course_id",
            "course_name",
            "avg_grade",
            "course_final_avg",
            "submission_count",
            "course_submission_count",
            "late_submission_ratio",
            "course_late_ratio",
            "course_load",
            "early_avg_grade",
            "early_submission_count",
            "early_late_ratio",
            "active_weeks_early",
            "early_grade_stddev",
            "early_grade_trend",
            "avg_delay_hours",
            "submissions_last_14d",
            "submissions_last_30d",
            "assignment_completion_ratio",
            "is_at_risk",
            "risk_probability",
            "predicted_at_risk",
            "risk_bucket",
        ]
    ]

    course_features.to_sql("student_course_features", engine, if_exists="replace", index=False)

    aggregated = (
        course_features.groupby(["student_id", "student_name", "student_email"], as_index=False)
        .agg(
            avg_grade=("course_final_avg", "mean"),
            submission_count=("course_submission_count", "sum"),
            late_submission_ratio=("course_late_ratio", "mean"),
            course_load=("course_load", "max"),
            courses_total=("course_id", "nunique"),
            courses_at_risk=("predicted_at_risk", "sum"),
            risk_probability=("risk_probability", "max"),
            predicted_at_risk=("predicted_at_risk", "max"),
        )
    )
    aggregated["risk_bucket"] = pd.cut(
        aggregated["risk_probability"],
        bins=[-np.inf, 0.33, 0.66, np.inf],
        labels=["Thấp", "Trung bình", "Cao"],
    ).astype(str).replace("nan", "Thấp")

    aggregated.to_sql("student_features", engine, if_exists="replace", index=False)

    at_risk_courses = course_features[course_features["predicted_at_risk"] == 1].copy()
    at_risk_courses = at_risk_courses.sort_values("risk_probability", ascending=False)
    at_risk_courses.to_sql("at_risk_students", engine, if_exists="replace", index=False)

    course_summary = (
        course_features.groupby(["course_id", "course_name"])
        .agg(
            at_risk_students=("predicted_at_risk", "sum"),
            total_students=("student_id", "nunique"),
        )
        .reset_index()
    )
    course_summary["at_risk_ratio"] = course_summary["at_risk_students"] / course_summary[
        "total_students"
    ].replace(0, np.nan)
    course_summary["at_risk_ratio"] = course_summary["at_risk_ratio"].fillna(0)
    course_summary.to_sql("risk_by_course", engine, if_exists="replace", index=False)

    # Lưu metrics của mô hình tốt nhất vào database
    best_metrics = all_metrics[best_model_name]
    pd.DataFrame(
        [
            {"model": best_model_name, "metric": "Accuracy", "score": best_metrics["accuracy"]},
            {"model": best_model_name, "metric": "Precision", "score": best_metrics["precision"]},
            {"model": best_model_name, "metric": "Recall", "score": best_metrics["recall"]},
            {"model": best_model_name, "metric": "F1-Score", "score": best_metrics["f1"]},
        ]
    ).to_sql("model_evaluation", engine, if_exists="replace", index=False)
    
    # Lưu toàn bộ so sánh vào database
    all_comparisons = []
    for model_name, metrics in all_metrics.items():
        for metric_name, score in metrics.items():
            all_comparisons.append({
                "model": model_name,
                "metric": metric_name.capitalize(),
                "score": score
            })
    
    comparison_full_df = pd.DataFrame(all_comparisons)
    comparison_full_df.to_csv(output_dir / "all_models_evaluation.csv", index=False)
    
    return all_metrics, best_model_name
