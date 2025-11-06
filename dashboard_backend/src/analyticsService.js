import { query } from "./db.js";

export const fetchOverview = async () => {
  const sql = `
    WITH student_stats AS (
      SELECT
        COUNT(*) AS total_students,
        COALESCE(SUM(CASE WHEN predicted_at_risk = 1 THEN 1 ELSE 0 END), 0) AS total_at_risk
      FROM student_features
    ),
    course_stats AS (
      SELECT COUNT(*) AS total_courses FROM dim_courses
    ),
    submission_stats AS (
      SELECT COUNT(*) AS total_submissions FROM fact_submissions
    )
    SELECT
      student_stats.total_students,
      student_stats.total_at_risk,
      course_stats.total_courses,
      submission_stats.total_submissions,
      CASE
        WHEN student_stats.total_students = 0 THEN 0
        ELSE student_stats.total_at_risk::numeric / student_stats.total_students
      END AS at_risk_ratio
    FROM student_stats, course_stats, submission_stats;
  `;

  const { rows } = await query(sql);
  return rows[0] || {
    total_students: 0,
    total_at_risk: 0,
    total_courses: 0,
    total_submissions: 0,
    at_risk_ratio: 0
  };
};

export const fetchCourseSummary = async () => {
  const sql = `
    WITH base AS (
      SELECT
        fs.course_id,
        AVG(fs.grade) FILTER (WHERE fs.grade IS NOT NULL) AS avg_grade,
        SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS late_ratio,
        COUNT(DISTINCT fs.student_id) AS student_count
      FROM fact_submissions fs
      GROUP BY fs.course_id
    )
    SELECT
      dc.course_id,
      dc.course_name,
      ROUND(base.avg_grade::numeric, 2) AS avg_grade,
      ROUND(base.late_ratio::numeric, 4) AS late_ratio,
      base.student_count,
      rbc.at_risk_students,
      rbc.total_students,
      ROUND((rbc.at_risk_ratio::numeric), 4) AS at_risk_ratio
    FROM base
    JOIN dim_courses dc ON dc.course_id = base.course_id
    LEFT JOIN risk_by_course rbc ON rbc.course_id = base.course_id
    ORDER BY dc.course_id::numeric NULLS LAST, dc.course_id;
  `;

  const { rows } = await query(sql);
  return rows;
};

export const fetchStudentSummary = async (limit = 20) => {
  const sql = `
    SELECT
      student_id,
      student_name,
      student_email,
      ROUND(avg_grade::numeric, 2) AS avg_grade,
      submission_count,
      ROUND(late_submission_ratio::numeric, 4) AS late_submission_ratio,
      risk_probability,
      risk_bucket,
      predicted_at_risk
    FROM student_features
    ORDER BY risk_probability DESC
    LIMIT $1
  `;
  const { rows } = await query(sql, [limit]);
  return rows;
};

export const fetchStudentDistribution = async () => {
  const sql = `
    SELECT
      risk_bucket,
      COUNT(*) AS count,
      ROUND(AVG(avg_grade)::numeric, 2) AS avg_grade
    FROM student_features
    GROUP BY risk_bucket
    ORDER BY risk_bucket
  `;
  const { rows } = await query(sql);
  return rows;
};

export const fetchWeeklyTrends = async () => {
  const sql = `
    SELECT
      DATE_TRUNC('week', submitted_at)::date AS week,
      ROUND(AVG(grade)::numeric, 2) AS avg_grade,
      ROUND(SUM(CASE WHEN late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0), 4) AS late_ratio,
      COUNT(*) AS submissions
    FROM fact_submissions
    GROUP BY 1
    ORDER BY 1
  `;
  const { rows } = await query(sql);
  return rows;
};

export const fetchLateHeatmap = async () => {
  const sql = `
    WITH course_late AS (
      SELECT
        fs.course_id,
        fs.student_id,
        SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS late_ratio
      FROM fact_submissions fs
      GROUP BY fs.course_id, fs.student_id
    )
    SELECT
      dc.course_name,
      sf.risk_bucket,
      ROUND(AVG(course_late.late_ratio)::numeric, 4) AS late_ratio
    FROM course_late
    JOIN student_features sf ON sf.student_id = course_late.student_id
    JOIN dim_courses dc ON dc.course_id = course_late.course_id
    GROUP BY dc.course_name, sf.risk_bucket
    ORDER BY dc.course_name, sf.risk_bucket
  `;
  const { rows } = await query(sql);
  return rows;
};

export const fetchHistogram = async () => {
  const sql = `
    SELECT
      width_bucket(avg_grade, 0, 10, 10) AS bucket,
      COUNT(*) AS count
    FROM student_features
    GROUP BY bucket
    ORDER BY bucket
  `;
  const { rows } = await query(sql);
  return rows.map((row) => ({
    bucket: Number(row.bucket),
    label: `${Number(row.bucket) - 1}-${Number(row.bucket)}`
      .replace("0-1", "0-1")
      .replace("10-11", "10"),
    count: Number(row.count)
  }));
};
