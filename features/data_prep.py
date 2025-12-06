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
            scf.risk_bucket,
            AVG(course_late.late_ratio) AS late_ratio
        FROM course_late
        JOIN student_course_features scf
            ON scf.student_id = course_late.student_id
            AND scf.course_id = course_late.course_id
        JOIN dim_courses dc ON dc.course_id = course_late.course_id
        GROUP BY dc.course_name, scf.risk_bucket
        ORDER BY dc.course_name, scf.risk_bucket
    """
    df = pd.read_sql(query, engine)
    df["late_ratio"] = df["late_ratio"].fillna(0)
    return df


def fetch_training_dataset() -> pd.DataFrame:
    """
    Xây dataset huấn luyện cho từng cặp sinh viên - khóa học.
    Nhãn = 1 nếu điểm trung bình của khóa học đó < 5.
    """
    engine = get_engine()
    query = """
        WITH submissions AS (
            SELECT
                fs.student_id,
                fs.course_id,
                fs.assignment_id,
                fs.grade,
                fs.late,
                fs.submitted_at,
                da.due_at,
                EXTRACT(EPOCH FROM (fs.submitted_at - da.due_at)) / 3600.0 AS hours_after_deadline,
                ROW_NUMBER() OVER (
                    PARTITION BY fs.student_id, fs.course_id
                    ORDER BY COALESCE(da.due_at, fs.submitted_at), fs.submitted_at, fs.submission_id
                ) AS rn,
                COUNT(*) OVER (PARTITION BY fs.student_id, fs.course_id) AS total_count,
                COUNT(*) OVER (PARTITION BY fs.student_id) AS course_load
            FROM fact_submissions fs
            LEFT JOIN dim_assignments da ON da.assignment_id = fs.assignment_id
        ),
        latest_ts AS (
            SELECT COALESCE(MAX(submitted_at), NOW()) AS latest_submission
            FROM fact_submissions
        ),
        early AS (
            SELECT
                s.*,
                GREATEST(1, CEIL(s.total_count * 0.6))::int AS cutoff
            FROM submissions s
        ),
        early_window AS (
            SELECT * FROM early WHERE rn <= cutoff
        ),
        agg_total AS (
            SELECT
                student_id,
                course_id,
                AVG(grade) FILTER (WHERE grade IS NOT NULL) AS course_final_avg,
                COUNT(*) AS course_submission_count,
                COUNT(*) FILTER (WHERE late) AS course_late_count,
                MAX(course_load) AS course_load
            FROM submissions
            GROUP BY student_id, course_id
        ),
        agg_early AS (
            SELECT
                student_id,
                course_id,
                AVG(grade) FILTER (WHERE grade IS NOT NULL) AS early_avg_grade,
                COUNT(*) AS early_submission_count,
                COUNT(*) FILTER (WHERE late) AS early_late_count,
                COUNT(DISTINCT DATE_TRUNC('week', submitted_at)) AS active_weeks_early,
                STDDEV_POP(grade) FILTER (WHERE grade IS NOT NULL) AS early_grade_stddev,
                REGR_SLOPE(
                    grade,
                    EXTRACT(EPOCH FROM submitted_at)
                ) AS early_grade_trend,
                AVG(
                    GREATEST(hours_after_deadline, 0)
                ) FILTER (WHERE hours_after_deadline IS NOT NULL) AS avg_delay_hours
            FROM early_window
            GROUP BY student_id, course_id
        ),
        recent_activity AS (
            SELECT
                s.student_id,
                s.course_id,
                COUNT(*) FILTER (
                    WHERE s.submitted_at >= latest_ts.latest_submission - INTERVAL '14 days'
                ) AS submissions_last_14d,
                COUNT(*) FILTER (
                    WHERE s.submitted_at >= latest_ts.latest_submission - INTERVAL '30 days'
                ) AS submissions_last_30d
            FROM fact_submissions s, latest_ts
            GROUP BY s.student_id, s.course_id
        ),
        course_assignments AS (
            SELECT
                da.course_id,
                COUNT(*) AS total_assignments
            FROM dim_assignments da
            GROUP BY da.course_id
        ),
        student_completion AS (
            SELECT
                student_id,
                course_id,
                COUNT(DISTINCT assignment_id) AS completed_assignments
            FROM fact_submissions
            GROUP BY student_id, course_id
        ),
        student_courses AS (
            SELECT DISTINCT student_id, course_id FROM fact_submissions
        ),
        completion_ratio AS (
            SELECT
                sc.student_id,
                sc.course_id,
                COALESCE(sc_tot.completed_assignments, 0) AS completed_assignments,
                COALESCE(ca.total_assignments, 0) AS total_assignments,
                CASE
                    WHEN COALESCE(ca.total_assignments, 0) = 0 THEN 0
                    ELSE COALESCE(sc_tot.completed_assignments, 0)::numeric / ca.total_assignments
                END AS assignment_completion_ratio
            FROM student_courses sc
            LEFT JOIN student_completion sc_tot
                ON sc_tot.student_id = sc.student_id AND sc_tot.course_id = sc.course_id
            LEFT JOIN course_assignments ca ON ca.course_id = sc.course_id
        )
        SELECT
            ds.student_id,
            ds.student_name,
            ds.student_email,
            dc.course_id,
            dc.course_name,
            COALESCE(agg_total.course_load, 0) AS course_load,
            COALESCE(agg_total.course_submission_count, 0) AS course_submission_count,
            COALESCE(
                agg_total.course_late_count::numeric / NULLIF(agg_total.course_submission_count, 0),
                0
            ) AS course_late_ratio,
            COALESCE(agg_early.early_avg_grade, 0) AS early_avg_grade,
            COALESCE(agg_early.early_submission_count, 0) AS early_submission_count,
            COALESCE(
                agg_early.early_late_count::numeric / NULLIF(agg_early.early_submission_count, 0),
                0
            ) AS early_late_ratio,
            COALESCE(agg_early.active_weeks_early, 0) AS active_weeks_early,
            COALESCE(agg_early.early_grade_stddev, 0) AS early_grade_stddev,
            COALESCE(agg_early.early_grade_trend, 0) AS early_grade_trend,
            COALESCE(agg_early.avg_delay_hours, 0) AS avg_delay_hours,
            COALESCE(recent_activity.submissions_last_14d, 0) AS submissions_last_14d,
            COALESCE(recent_activity.submissions_last_30d, 0) AS submissions_last_30d,
            COALESCE(completion_ratio.assignment_completion_ratio, 0) AS assignment_completion_ratio,
            COALESCE(agg_total.course_final_avg, 0) AS course_final_avg,
            CASE
                WHEN COALESCE(agg_total.course_final_avg, 0) < 5 THEN 1
                ELSE 0
            END AS is_at_risk
        FROM fact_submissions fs
        JOIN dim_students ds ON ds.student_id = fs.student_id
        JOIN dim_courses dc ON dc.course_id = fs.course_id
        LEFT JOIN agg_total
            ON agg_total.student_id = fs.student_id AND agg_total.course_id = fs.course_id
        LEFT JOIN agg_early
            ON agg_early.student_id = fs.student_id AND agg_early.course_id = fs.course_id
        LEFT JOIN recent_activity
            ON recent_activity.student_id = fs.student_id AND recent_activity.course_id = fs.course_id
        LEFT JOIN completion_ratio
            ON completion_ratio.student_id = fs.student_id AND completion_ratio.course_id = fs.course_id
        GROUP BY
            ds.student_id,
            ds.student_name,
            ds.student_email,
            dc.course_id,
            dc.course_name,
            agg_total.course_load,
            agg_total.course_submission_count,
            agg_total.course_late_count,
            agg_early.early_avg_grade,
            agg_early.early_submission_count,
            agg_early.early_late_count,
            agg_early.active_weeks_early,
            agg_early.early_grade_stddev,
            agg_early.early_grade_trend,
            agg_early.avg_delay_hours,
            recent_activity.submissions_last_14d,
            recent_activity.submissions_last_30d,
            completion_ratio.assignment_completion_ratio,
            agg_total.course_final_avg
    """
    df = pd.read_sql(query, engine)
    numeric_cols = [
        "course_submission_count",
        "course_load",
        "course_late_ratio",
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
        "course_final_avg",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = df[col].fillna(0)
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
        "training_dataset": fetch_training_dataset(),
    }

    exported: Dict[str, Path] = {}
    for name, df in datasets.items():
        csv_path = output_dir / f"{name}.csv"
        df.to_csv(csv_path, index=False)
        exported[name] = csv_path
    return exported

