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
    ),
    latest_ts AS (
      SELECT COALESCE(MAX(submitted_at), NOW()) AS latest_submission
      FROM fact_submissions
    ),
    recent_submission_stats AS (
      SELECT
        COUNT(*) AS submissions_last_7d
      FROM fact_submissions, latest_ts
      WHERE submitted_at >= latest_ts.latest_submission - INTERVAL '7 days'
    )
    SELECT
      student_stats.total_students,
      student_stats.total_at_risk,
      course_stats.total_courses,
      submission_stats.total_submissions,
      recent_submission_stats.submissions_last_7d,
      CASE
        WHEN student_stats.total_students = 0 THEN 0
        ELSE student_stats.total_at_risk::numeric / student_stats.total_students
      END AS at_risk_ratio
    FROM student_stats, course_stats, submission_stats, recent_submission_stats;
  `;

  const { rows } = await query(sql);
  return rows[0] || {
    total_students: 0,
    total_at_risk: 0,
    total_courses: 0,
    total_submissions: 0,
    submissions_last_7d: 0,
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
        COUNT(DISTINCT fs.student_id) AS student_count,
        COUNT(*) AS total_submissions
      FROM fact_submissions fs
      GROUP BY fs.course_id
    )
    SELECT
      dc.course_id,
      dc.course_name,
      COALESCE(ROUND(base.avg_grade::numeric, 2), 0) AS avg_grade,
      COALESCE(ROUND(base.late_ratio::numeric, 4), 0) AS late_ratio,
      COALESCE(base.student_count, 0) AS student_count,
      COALESCE(base.total_submissions, 0) AS total_submissions,
      COALESCE(rbc.at_risk_students, 0) AS at_risk_students,
      COALESCE(rbc.total_students, 0) AS total_students,
      COALESCE(ROUND((rbc.at_risk_ratio::numeric), 4), 0) AS at_risk_ratio
    FROM dim_courses dc
    LEFT JOIN base ON base.course_id = dc.course_id
    LEFT JOIN risk_by_course rbc ON rbc.course_id = dc.course_id
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
    WITH classified AS (
      SELECT
        CASE
          WHEN avg_grade < 5 THEN 'high'
          WHEN (avg_grade BETWEEN 5 AND 7) OR late_submission_ratio > 0.2 THEN 'medium'
          ELSE 'low'
        END AS risk_bucket,
        avg_grade
      FROM student_features
    )
    SELECT
      risk_bucket,
      COUNT(*) AS count,
      ROUND(AVG(avg_grade)::numeric, 2) AS avg_grade
    FROM classified
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
    SELECT
      EXTRACT(DOW FROM submitted_at)::int AS day_of_week,
      EXTRACT(HOUR FROM submitted_at)::int AS hour,
      ROUND(SUM(CASE WHEN late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0), 4) AS late_ratio
    FROM fact_submissions
    WHERE submitted_at IS NOT NULL
    GROUP BY day_of_week, hour
    HAVING COUNT(*) > 0
    ORDER BY day_of_week, hour
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

// New: Assignment completion rate by course
export const fetchAssignmentCompletion = async () => {
  const sql = `
    WITH assignment_stats AS (
      SELECT
        fs.course_id,
        COUNT(DISTINCT fs.assignment_id) AS total_assignments,
        COUNT(*) AS total_submissions,
        COUNT(DISTINCT fs.student_id) AS total_students,
        AVG(CASE WHEN fs.grade IS NOT NULL THEN 1 ELSE 0 END) AS completion_rate
      FROM fact_submissions fs
      GROUP BY fs.course_id
    )
    SELECT
      dc.course_name,
      dc.course_id,
      COALESCE(ass.total_assignments, 0) AS total_assignments,
      COALESCE(ass.total_submissions, 0) AS total_submissions,
      COALESCE(ass.total_students, 0) AS total_students,
      COALESCE(ROUND(ass.completion_rate::numeric, 4), 0) AS completion_rate
    FROM dim_courses dc
    LEFT JOIN assignment_stats ass ON ass.course_id = dc.course_id
    ORDER BY dc.course_id
  `;
  const { rows } = await query(sql);
  return rows;
};

// New: Student performance over time
export const fetchStudentPerformanceTrend = async (studentId) => {
  const sql = `
    SELECT
      DATE_TRUNC('week', submitted_at)::date AS week,
      ROUND(AVG(grade)::numeric, 2) AS avg_grade,
      COUNT(*) AS submissions,
      SUM(CASE WHEN late THEN 1 ELSE 0 END) AS late_count
    FROM fact_submissions
    WHERE student_id = $1 AND grade IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `;
  const { rows } = await query(sql, [studentId]);
  return rows;
};

// New: Course comparison metrics
export const fetchCourseComparison = async () => {
  const sql = `
    WITH course_metrics AS (
      SELECT
        fs.course_id,
        AVG(fs.grade) AS avg_grade,
        STDDEV(fs.grade) AS grade_stddev,
        COUNT(*) AS total_submissions,
        COUNT(DISTINCT fs.student_id) AS enrolled_students,
        SUM(CASE WHEN fs.late THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS late_ratio,
        MAX(fs.submitted_at) AS last_activity
      FROM fact_submissions fs
      WHERE fs.grade IS NOT NULL
      GROUP BY fs.course_id
    )
    SELECT
      dc.course_id,
      dc.course_name,
      COALESCE(ROUND(cm.avg_grade::numeric, 2), 0) AS avg_grade,
      COALESCE(ROUND(cm.grade_stddev::numeric, 2), 0) AS grade_stddev,
      COALESCE(cm.total_submissions, 0) AS total_submissions,
      COALESCE(cm.enrolled_students, 0) AS enrolled_students,
      COALESCE(ROUND(cm.late_ratio::numeric, 4), 0) AS late_ratio,
      cm.last_activity
    FROM dim_courses dc
    LEFT JOIN course_metrics cm ON cm.course_id = dc.course_id
    ORDER BY dc.course_id
  `;
  const { rows } = await query(sql);
  return rows;
};

// New: Top performing students
export const fetchTopStudents = async (limit = 10) => {
  const sql = `
    SELECT
      student_id,
      student_name,
      student_email,
      ROUND(avg_grade::numeric, 2) AS avg_grade,
      submission_count,
      ROUND(late_submission_ratio::numeric, 4) AS late_submission_ratio,
      risk_probability,
      predicted_at_risk
    FROM student_features
    WHERE avg_grade IS NOT NULL
    ORDER BY avg_grade DESC, submission_count DESC
    LIMIT $1
  `;
  const { rows } = await query(sql, [limit]);
  return rows;
};

// New: Real-time activity summary
export const fetchRealtimeActivity = async () => {
  const sql = `
    WITH latest_ts AS (
      SELECT COALESCE(MAX(submitted_at), NOW()) AS latest_submission
      FROM fact_submissions
    ),
    recent_activity AS (
      SELECT
        COUNT(*) FILTER (
          WHERE submitted_at >= latest_ts.latest_submission - INTERVAL '24 hours'
        ) AS submissions_24h,
        COUNT(*) FILTER (
          WHERE submitted_at >= latest_ts.latest_submission - INTERVAL '7 days'
        ) AS submissions_7d,
        COUNT(DISTINCT student_id) FILTER (
          WHERE submitted_at >= latest_ts.latest_submission - INTERVAL '24 hours'
        ) AS active_students_24h,
        COUNT(DISTINCT student_id) FILTER (
          WHERE submitted_at >= latest_ts.latest_submission - INTERVAL '7 days'
        ) AS active_students_7d
      FROM fact_submissions, latest_ts
    )
    SELECT * FROM recent_activity
  `;
  const { rows } = await query(sql);
  return rows[0] || {
    submissions_24h: 0,
    submissions_7d: 0,
    active_students_24h: 0,
    active_students_7d: 0
  };
};
