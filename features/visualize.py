from __future__ import annotations

from pathlib import Path
from typing import Dict

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from matplotlib.ticker import PercentFormatter

sns.set_theme(style="whitegrid")


def _prepare_output(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def plot_student_average(df: pd.DataFrame, output_path: Path, top_n: int = 20) -> Path:
    """
    Vẽ biểu đồ cột ngang top N sinh viên theo điểm trung bình.
    """
    subset = df.sort_values("avg_grade", ascending=False).head(top_n)
    plt.figure(figsize=(10, 8))
    sns.barplot(
        data=subset,
        x="avg_grade",
        y="student_name",
        hue="risk_bucket",
        dodge=False,
        palette="coolwarm",
    )
    plt.xlabel("Điểm trung bình")
    plt.ylabel("")
    plt.title(f"Top {top_n} sinh viên theo điểm trung bình")
    plt.legend(title="Nhóm rủi ro", loc="lower right")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_grade_distribution(df: pd.DataFrame, output_path: Path) -> Path:
    """
    Vẽ histogram phân bố điểm trung bình của toàn bộ sinh viên.
    """
    plt.figure(figsize=(8, 5))
    sns.histplot(df["avg_grade"], bins=20, color="#1f77b4", edgecolor="black")
    plt.xlabel("Điểm trung bình")
    plt.ylabel("Số lượng sinh viên")
    plt.title("Phân bố điểm trung bình")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_late_ratio_pie(df: pd.DataFrame, output_path: Path) -> Path:
    """
    Vẽ biểu đồ tròn tỷ lệ sinh viên theo từng nhóm rủi ro.
    """
    buckets = (
        df.assign(
            risk_bucket=lambda d: d["risk_bucket"].fillna("Unknown"),
        )["risk_bucket"]
        .value_counts()
        .sort_index()
    )
    plt.figure(figsize=(6, 6))
    plt.pie(buckets, labels=buckets.index, autopct="%1.1f%%", startangle=90)
    plt.title("Tỷ lệ sinh viên theo nhóm rủi ro")
    _prepare_output(output_path)
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_weekly_trends(df: pd.DataFrame, output_path: Path) -> Path:
    """
    Vẽ biểu đồ đường thể hiện điểm trung bình và tỷ lệ nộp trễ theo tuần.
    """
    df = df.dropna(subset=["week"])
    plt.figure(figsize=(10, 5))
    sns.lineplot(data=df, x="week", y="avg_grade", marker="o", label="Điểm trung bình")
    sns.lineplot(
        data=df,
        x="week",
        y=df["late_ratio"] * 10,
        marker="o",
        label="Tỷ lệ nộp trễ (x10)",
    )
    plt.xlabel("Tuần")
    plt.ylabel("Giá trị")
    plt.title("Xu hướng điểm và nộp trễ theo tuần")
    plt.legend()
    plt.xticks(rotation=45)
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_course_heatmap(df: pd.DataFrame, output_path: Path) -> Path:
    """
    Vẽ heatmap so sánh điểm trung bình giữa các môn học.
    """
    pivot = df.pivot(index="course_name", columns="course_id", values="avg_grade")
    plt.figure(figsize=(8, 4))
    sns.heatmap(pivot, annot=True, fmt=".2f", cmap="viridis")
    plt.xlabel("Mã khóa học")
    plt.ylabel("Tên khóa học")
    plt.title("Điểm trung bình theo khóa học")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_confusion_matrix(cm: np.ndarray, output_path: Path) -> Path:
    """
    Vẽ ma trận nhầm lẫn của mô hình phân loại.
    """
    plt.figure(figsize=(4, 4))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        cbar=False,
        xticklabels=["Dự đoán: Bình thường", "Dự đoán: At-Risk"],
        yticklabels=["Thực tế: Bình thường", "Thực tế: At-Risk"],
    )
    plt.title("Ma trận nhầm lẫn")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_overview_counts(counts: Dict[str, int], output_path: Path) -> Path:
    labels = ["Sinh viên", "Khóa học", "Bài nộp"]
    values = [
        counts.get("total_students", 0),
        counts.get("total_courses", 0),
        counts.get("total_submissions", 0),
    ]
    colors = ["#1f77b4", "#2892c7", "#31addb"]
    plt.figure(figsize=(6, 4))
    plt.bar(labels, values, color=colors)
    for idx, val in enumerate(values):
        plt.text(idx, val + max(values) * 0.02, f"{val:,}", ha="center", va="bottom")
    plt.ylabel("Số lượng")
    plt.title("Tổng quan hệ thống")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_course_average_bar(df: pd.DataFrame, output_path: Path) -> Path:
    plt.figure(figsize=(8, 5))
    plt.bar(df["course_name"], df["avg_grade"], color="#6baed6")
    plt.xlabel("Khóa học")
    plt.ylabel("Điểm trung bình")
    plt.title("Điểm trung bình theo khóa học")
    plt.xticks(rotation=20, ha="right")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_late_heatmap_matrix(df: pd.DataFrame, output_path: Path) -> Path:
    if df.empty:
        return output_path
    pivot = (
        df.pivot(index="risk_bucket", columns="course_name", values="late_ratio")
        .fillna(0)
        .sort_index()
    )
    plt.figure(figsize=(8, 4))
    sns.heatmap(pivot, annot=True, fmt=".2f", cmap="Reds", cbar_kws={"label": "Tỷ lệ nộp trễ"})
    plt.xlabel("Khóa học")
    plt.ylabel("Nhóm rủi ro")
    plt.title("Heatmap tỷ lệ nộp trễ theo nhóm rủi ro")
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_course_scatter(df: pd.DataFrame, output_path: Path) -> Path:
    plt.figure(figsize=(7, 5))
    plt.scatter(df["avg_grade"], df["late_ratio"], s=df["student_count"] * 2 + 20, c="#ff7f0e")
    for _, row in df.iterrows():
        plt.text(row["avg_grade"], row["late_ratio"] + 0.005, row["course_name"], ha="center", fontsize=9)
    plt.xlabel("Điểm trung bình")
    plt.ylabel("Tỷ lệ nộp trễ")
    plt.title("Liên hệ giữa điểm và tỷ lệ nộp trễ (theo khóa)")
    plt.gca().yaxis.set_major_formatter(PercentFormatter(1.0))
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path


def plot_at_risk_kpi(at_risk_ratio: float, output_path: Path) -> Path:
    pct = at_risk_ratio * 100
    plt.figure(figsize=(4, 4))
    plt.axis("off")
    plt.text(
        0.5,
        0.6,
        f"{pct:.1f}%",
        ha="center",
        va="center",
        fontsize=48,
        fontweight="bold",
        color="#d62728",
    )
    plt.text(
        0.5,
        0.3,
        "% sinh viên At-Risk (dự đoán)",
        ha="center",
        va="center",
        fontsize=12,
    )
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches="tight", transparent=True)
    plt.close()
    return output_path


def plot_top_at_risk(df: pd.DataFrame, output_path: Path, top_n: int = 10) -> Path:
    """
    Vẽ biểu đồ cột cho Top N sinh viên có risk_probability cao nhất.
    """
    top_df = df.sort_values("risk_probability", ascending=False).head(top_n)
    plt.figure(figsize=(8, 6))
    plt.barh(
        top_df["student_name"],
        top_df["risk_probability"],
        color="#ff6961",
    )
    plt.gca().invert_yaxis()
    plt.xlabel("Xác suất At-Risk")
    plt.ylabel("")
    plt.title(f"Top {top_n} sinh viên có nguy cơ cao nhất")
    plt.xlim(0, 1)
    _prepare_output(output_path)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()
    return output_path
