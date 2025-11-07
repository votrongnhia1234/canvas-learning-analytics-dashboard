from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from .db import get_engine


def fetch_student_summary() -> pd.DataFrame:
    """
    Lấy bảng tổng hợp theo sinh viên với đủ cột:
      - điểm trung bình (avg_grade)
      - số lần nộp bài (submission_count)
      - số lần nộp trễ & tỷ lệ nộp trễ (late_count / late_ratio)
      - nhãn phân loại rủi ro (risk_bucket)
    """
    engine = get_engine()
    query = """
        WITH summary AS (
            SELECT
                fs.student_id,
                ds.student_name,
                ds.student_email,
                AVG(fs.grade) FILTER (WHERE fs.grade IS NOT NULL) AS avg_grade,
                COUNT(*) AS submission_count,
                SUM(CASE WHEN fs.late THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric
                    / NULLIF(COUNT(*), 0) AS late_ratio
            FROM fact_submissions fs
            JOIN dim_students ds ON ds.student_id = fs.student_id
            GROUP BY fs.student_id, ds.student_name, ds.student_email
        )
        SELECT
            *,
            CASE
                WHEN avg_grade < 5 THEN 'Cao'
                ELSE 'Thấp'
            END AS risk_bucket
        FROM summary
    """
    df = pd.read_sql(query, engine)
    df["avg_grade"] = df["avg_grade"].fillna(0)
    df["late_ratio"] = df["late_ratio"].fillna(0)
    return df


def fetch_overview_counts() -> Dict[str, int]:
    """
    Lấy các chỉ số tổng quan: số sinh viên, số khóa học, số lượt nộp bài.
    """
    engine = get_engine()
    query = """
        SELECT
            (SELECT COUNT(*) FROM dim_students) AS total_students,
            (SELECT COUNT(*) FROM dim_courses) AS total_courses,
            (SELECT COUNT(*) FROM fact_submissions) AS total_submissions
    """
    row = pd.read_sql(query, engine).iloc[0]
    return {
        "total_students": int(row["total_students"]),
        "total_courses": int(row["total_courses"]),
        "total_submissions": int(row["total_submissions"]),
    }


def fetch_course_summary() -> pd.DataFrame:
    """
    Lấy thống kê theo khóa học để phục vụ so sánh:
      - điểm trung bình toàn khóa
      - tỷ lệ nộp trễ
      - số sinh viên tham gia và tổng lượt nộp
    """
    engine = get_engine()
    query = """
        SELECT
            fs.course_id,
            dc.course_name,
            AVG(fs.grade) FILTER (WHERE fs.grade IS NOT NULL) AS avg_grade,
            SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(*), 0) AS late_ratio,
            COUNT(DISTINCT fs.student_id) AS student_count,
            COUNT(*) AS submission_count
        FROM fact_submissions fs
        JOIN dim_courses dc ON dc.course_id = fs.course_id
        GROUP BY fs.course_id, dc.course_name
        ORDER BY fs.course_id
    """
    df = pd.read_sql(query, engine)
    df["avg_grade"] = df["avg_grade"].fillna(0)
    df["late_ratio"] = df["late_ratio"].fillna(0)
    return df


def fetch_weekly_trends() -> pd.DataFrame:
    """
    Lấy dữ liệu theo tuần (week) để dựng biểu đồ xu hướng:
      - điểm trung bình từng tuần
      - tỷ lệ nộp trễ từng tuần
      - tổng số lượt nộp
    """
    engine = get_engine()
    query = """
        SELECT
            DATE_TRUNC('week', submitted_at)::date AS week,
            AVG(grade) FILTER (WHERE grade IS NOT NULL) AS avg_grade,
            SUM(CASE WHEN late THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(*), 0) AS late_ratio,
            COUNT(*) AS submissions
        FROM fact_submissions
        GROUP BY 1
        ORDER BY 1
    """
    df = pd.read_sql(query, engine)
    df["avg_grade"] = df["avg_grade"].fillna(0)
    df["late_ratio"] = df["late_ratio"].fillna(0)
    return df


def fetch_course_risk_late_matrix() -> pd.DataFrame:
    """
    Lấy dữ liệu heatmap: tỷ lệ nộp trễ trung bình của từng nhóm rủi ro theo khóa học.
    """
    engine = get_engine()
    query = """
        WITH course_late AS (
            SELECT
                course_id,
                student_id,
                SUM(CASE WHEN late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS late_ratio
            FROM fact_submissions
            GROUP BY course_id, student_id
        )
        SELECT
            dc.course_name,
            sf.risk_bucket,
            AVG(course_late.late_ratio) AS late_ratio
        FROM course_late
        JOIN student_features sf ON sf.student_id = course_late.student_id
        JOIN dim_courses dc ON dc.course_id = course_late.course_id
        GROUP BY dc.course_name, sf.risk_bucket
        ORDER BY dc.course_name, sf.risk_bucket
    """
    df = pd.read_sql(query, engine)
    df["late_ratio"] = df["late_ratio"].fillna(0)
    return df


def export_datasets(output_dir: Path) -> Dict[str, Path]:
    """
    Xuất toàn bộ dataset ra file CSV để dùng ngoài notebook/dashboards.
    Trả về dict {tên_dataset: đường_dẫn_file}.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    datasets = {
        "student_summary": fetch_student_summary(),
        "course_summary": fetch_course_summary(),
        "weekly_trends": fetch_weekly_trends(),
    }

    exported: Dict[str, Path] = {}
    for name, df in datasets.items():
        csv_path = output_dir / f"{name}.csv"
        df.to_csv(csv_path, index=False)
        exported[name] = csv_path
    return exported
