import PropTypes from "prop-types";

export default function KpiCard({ value }) {
  const percent = Number(value) * 100;
  return (
    <div className="card kpi-card">
      <h2>% sinh viên At-Risk (dự đoán)</h2>
      <div className="kpi-value">{percent.toFixed(1)}%</div>
      <p>
        Giá trị được tính dựa trên mô hình Logistic Regression (bảng
        <code>student_features</code>).
      </p>
    </div>
  );
}

KpiCard.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired
};
