import PropTypes from "prop-types";

export default function TopAtRiskList({ data }) {
  return (
    <div className="card">
      <h2>Top sinh viên At-Risk</h2>
      <table className="top-at-risk-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Sinh viên</th>
            <th>Điểm TB</th>
            <th>Xác suất</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={row.student_id}>
              <td>{index + 1}</td>
              <td>
                <strong>{row.student_name}</strong>
                <br />
                <small>{row.student_email}</small>
              </td>
              <td>{row.avg_grade.toFixed(2)}</td>
              <td className="risk-cell">
                <span>{(row.risk_probability * 100).toFixed(1)}%</span>
                <div className="mini-bar">
                  <div
                    className="mini-bar-fill"
                    style={{
                      width: `${Math.min(row.risk_probability * 100, 100)}%`
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

TopAtRiskList.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      student_id: PropTypes.string.isRequired,
      student_name: PropTypes.string.isRequired,
      student_email: PropTypes.string.isRequired,
      avg_grade: PropTypes.number.isRequired,
      risk_probability: PropTypes.number.isRequired
    })
  ).isRequired
};
