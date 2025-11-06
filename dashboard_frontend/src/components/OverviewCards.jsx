import PropTypes from "prop-types";

const formatNumber = (value) =>
  Number(value || 0).toLocaleString("vi-VN");

export default function OverviewCards({ data }) {
  const totalStudents = Number(data.total_students || 0);
  const totalAtRisk = Number(data.total_at_risk || 0);
  const totalCourses = Number(data.total_courses || 0);
  const totalSubmissions = Number(data.total_submissions || 0);
  const atRiskRatio = Number(data.at_risk_ratio || 0);

  const studentsPerCourse = totalCourses
    ? totalStudents / totalCourses
    : 0;
  const submissionsPerCourse = totalCourses
    ? totalSubmissions / totalCourses
    : 0;

  const cards = [
    {
      label: "Tổng số sinh viên",
      value: formatNumber(totalStudents),
      trend: `${formatNumber(totalAtRisk)} At-Risk`,
      accent: "var(--cl-primary)",
      progress: Math.min(atRiskRatio, 1)
    },
    {
      label: "Số khóa học",
      value: formatNumber(totalCourses),
      trend: `${studentsPerCourse.toFixed(1)} SV/khóa`,
      accent: "var(--cl-success)",
      progress: Math.min(studentsPerCourse / 40, 1)
    },
    {
      label: "Tổng lượt nộp bài",
      value: formatNumber(totalSubmissions),
      trend: `${submissionsPerCourse.toFixed(1)} lượt/khóa`,
      accent: "var(--cl-info)",
      progress: Math.min(submissionsPerCourse / 120, 1)
    }
  ];

  return (
    <div className="card overview-card-wrapper">
      <header className="card-header">
        <div>
          <h2>Tổng quan hệ thống</h2>
          <p>
            Tình hình học tập tổng hợp từ kho dữ liệu <code>canvas_dwh</code>
            .
          </p>
        </div>
        <div className="at-risk-chip">
          <span>At-Risk</span>
          <strong>{(atRiskRatio * 100).toFixed(1)}%</strong>
        </div>
      </header>

      <div className="overview-grid">
        {cards.map((card) => (
          <div key={card.label} className="overview-item">
            <span className="label">{card.label}</span>
            <strong>{card.value}</strong>
            <span className="trend" style={{ color: card.accent }}>
              {card.trend}
            </span>
            <div className="progress">
              <div
                className="progress-bar"
                style={{
                  width: `${Math.max(card.progress * 100, 4)}%`,
                  background: card.accent
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

OverviewCards.propTypes = {
  data: PropTypes.shape({
    total_students: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    total_at_risk: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    total_courses: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    total_submissions: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string
    ]),
    at_risk_ratio: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
  }).isRequired
};
