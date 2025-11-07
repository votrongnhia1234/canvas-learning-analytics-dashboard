import { useMemo, useState } from 'react'
import { formatGrade, formatNumber } from '../utils/helpers'

const riskDisplay = {
  high: { label: 'Cao', color: '#dc2626', bg: '#fef2f2' },
  medium: { label: 'Trung bình', color: '#f97316', bg: '#fff7ed' },
  low: { label: 'Thấp', color: '#10b981', bg: '#f0fdf4' }
}

const coerceLateRatio = student => {
  const late =
    student?.late_ratio ??
    student?.late_percent ??
    student?.late_assignments_ratio ??
    student?.late ?? 0
  return Number(late) || 0
}

const classifyRisk = student => {
  const grade = Number(student.avg_grade || 0)
  const lateRatio = coerceLateRatio(student)
  if (grade < 5) return 'high'
  if ((grade >= 5 && grade <= 7) || lateRatio > 0.2) return 'medium'
  return 'low'
}

const Students = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRisk, setFilterRisk] = useState('all')

  if (!data) return null
  const { students, overview, distribution } = data

  const riskBuckets = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 }
    if (distribution && distribution.length) {
      distribution.forEach(item => {
        const key = (item.risk_bucket || '').toLowerCase()
        if (counts[key] !== undefined) {
          counts[key] += Number(item.count || 0)
        }
      })
      return counts
    }
    students.forEach(student => {
      const key = classifyRisk(student)
      counts[key] += 1
    })
    return counts
  }, [distribution, students])

  const filteredStudents = students.filter(student => {
    const matchSearch = student.student_name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchRisk =
      filterRisk === 'all' || classifyRisk(student) === filterRisk
    return matchSearch && matchRisk
  })

  const summary = [
    { label: 'Tổng số sinh viên', value: formatNumber(overview?.total_students || students.length) },
    { label: 'Rủi ro cao', value: riskBuckets.high, tone: 'danger' },
    { label: 'Rủi ro trung bình', value: riskBuckets.medium, tone: 'warning' },
    { label: 'Rủi ro thấp', value: riskBuckets.low, tone: 'safe' }
  ]

  return (
    <div className="la-stack">
      <section className="la-panel">
        <div className="la-panel__header">
          <div>
            <h3>Hồ sơ sinh viên</h3>
            <p>Theo dõi chi tiết hiệu suất và rủi ro ở từng người học</p>
          </div>
        </div>

        <div className="summary-grid">
          {summary.map(item => (
            <article key={item.label} className={`summary-card ${item.tone ? `is-${item.tone}` : ''}`}>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>

        <div className="filters-bar">
          <label className="field-text">
            <span className="field-text__icon" aria-hidden="true">🔎</span>
            <input
              type="search"
              placeholder="Tìm kiếm sinh viên..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </label>
          <select
            value={filterRisk}
            onChange={e => setFilterRisk(e.target.value)}
            className="field-select"
          >
            <option value="all">Tất cả mức rủi ro</option>
            <option value="high">Rủi ro cao</option>
            <option value="medium">Rủi ro trung bình</option>
            <option value="low">Rủi ro thấp</option>
          </select>
        </div>

        <div className="table-wrapper">
          <table className="la-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sinh viên</th>
                <th>Điểm trung bình</th>
                <th>Xác suất rủi ro</th>
                <th>Mức độ</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, index) => {
                const bucket = classifyRisk(student)
                const risk = riskDisplay[bucket]
                return (
                  <tr key={student.student_name}>
                    <td>{index + 1}</td>
                    <td>
                      <div className="student-meta">
                        <span className="avatar">{student.student_name.charAt(0).toUpperCase()}</span>
                        <div>
                          <p>{student.student_name}</p>
                          <small>Top {Math.round((student.risk_probability) * 100)}% rủi ro</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill pill--${bucket}`}>
                        {formatGrade(student.avg_grade)}
                      </span>
                    </td>
                    <td>
                      <div className="progress-line">
                        <span style={{ width: `${student.risk_probability * 100}%`, background: risk.color }} />
                      </div>
                      <small>{(student.risk_probability * 100).toFixed(1)}%</small>
                    </td>
                    <td>
                      <span className="risk-label" style={{ color: risk.color }}>{risk.label}</span>
                    </td>
                    <td>
                      <button className="la-button la-button--ghost" type="button">
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default Students
