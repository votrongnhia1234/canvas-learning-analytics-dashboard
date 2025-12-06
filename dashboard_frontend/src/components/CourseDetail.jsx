import { useMemo, useState, useEffect } from 'react'
import { formatGrade, formatNumber, formatPercent } from '../utils/helpers'
import { buildApiUrl } from '../utils/api'

const riskDisplay = {
  high: { label: 'Cao', color: '#dc2626', bg: '#fef2f2' },
  medium: { label: 'Trung bình', color: '#f97316', bg: '#fff7ed' },
  low: { label: 'Thấp', color: '#10b981', bg: '#f0fdf4' }
}

const classifyRisk = student => {
  const grade = Number(student.course_final_avg || student.avg_grade || 0)
  const lateRatio = Number(student.course_late_ratio || student.late_submission_ratio || 0)
  if (grade < 5) return 'high'
  if ((grade >= 5 && grade <= 7) || lateRatio > 0.2) return 'medium'
  return 'low'
}

const CourseDetail = ({ course, onBack, allCourseStudents = [] }) => {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRisk, setFilterRisk] = useState('all')
  const [focusedStudent, setFocusedStudent] = useState(null)

  const preloadedStudents = useMemo(() => {
    if (!course?.course_id) return []
    return allCourseStudents.filter(
      s => String(s.course_id) === String(course.course_id)
    )
  }, [course?.course_id, allCourseStudents])

  useEffect(() => {
    if (!course?.course_id) return

    let isMounted = true

    const fetchCourseStudents = async () => {
      setStudents(preloadedStudents)
      setLoading(preloadedStudents.length === 0)

      try {
        const response = await fetch(buildApiUrl(`courses/${course.course_id}/students`))
        if (!isMounted) return

        if (response.ok) {
          const data = await response.json()
          setStudents(data)
        } else {
          console.warn(`Failed to fetch course students (HTTP ${response.status})`)
          if (!preloadedStudents.length) {
            setStudents([])
          }
        }
      } catch (error) {
        console.error('Error fetching course students:', error)
        if (!isMounted) return
        if (!preloadedStudents.length) {
          setStudents([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchCourseStudents()

    return () => {
      isMounted = false
    }
  }, [course?.course_id, preloadedStudents])

  const riskBuckets = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 }
    students.forEach(student => {
      const key = classifyRisk(student)
      counts[key] += 1
    })
    return counts
  }, [students])

  const featureSummary = useMemo(() => {
    if (!students.length) {
      return {
        earlyAvgGrade: 0,
        earlySubmissionCount: 0,
        earlyLateRatio: 0,
        avgDelayHours: 0,
        assignmentCompletion: 0,
        submissions14d: 0,
        submissions30d: 0,
        courseLoad: 0
      }
    }

    const averageOf = field => students.reduce((sum, s) => sum + Number(s[field] || 0), 0) / students.length

    return {
      earlyAvgGrade: averageOf('early_avg_grade'),
      earlySubmissionCount: averageOf('early_submission_count'),
      earlyLateRatio: averageOf('early_late_ratio'),
      avgDelayHours: averageOf('avg_delay_hours'),
      assignmentCompletion: averageOf('assignment_completion_ratio'),
      submissions14d: averageOf('submissions_last_14d'),
      submissions30d: averageOf('submissions_last_30d'),
      courseLoad: averageOf('course_load')
    }
  }, [students])

  const filteredStudents = students.filter(student => {
    const name = student.student_name || ''
    const matchSearch = name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchRisk = filterRisk === 'all' || classifyRisk(student) === filterRisk
    return matchSearch && matchRisk
  })

  const avgGrade = students.length > 0
    ? students.reduce((sum, s) => sum + Number(s.course_final_avg || 0), 0) / students.length
    : 0

  const atRiskCount = students.filter(s => Number(s.predicted_at_risk) === 1).length
  const atRiskRatio = students.length > 0 ? atRiskCount / students.length : 0

  if (!course) return null

  return (
    <div className='la-stack'>
      <nav className='breadcrumb' aria-label='Breadcrumb'>
        <button onClick={onBack} className='breadcrumb__link'>
          ← Tất cả khóa học
        </button>
        <span className='breadcrumb__separator'>/</span>
        <span className='breadcrumb__current'>{course.course_name}</span>
      </nav>

      <section className='la-panel la-panel--hero'>
        <div className='course-detail-header'>
          <div>
            <p className='la-eyebrow'>Chi tiết khóa học</p>
            <h2>{course.course_name}</h2>
            <p className='course-detail-header__code'>{course.course_code || `ID: ${course.course_id}`}</p>
          </div>
          <div className='course-detail-stats'>
            <div className='stat-pill'>
              <span className='stat-pill__label'>Sinh viên</span>
              <strong className='stat-pill__value'>{formatNumber(students.length)}</strong>
            </div>
            <div className='stat-pill'>
              <span className='stat-pill__label'>Điểm TB</span>
              <strong className='stat-pill__value'>{formatGrade(avgGrade)}</strong>
            </div>
            <div className='stat-pill stat-pill--danger'>
              <span className='stat-pill__label'>Rủi ro</span>
              <strong className='stat-pill__value'>{formatPercent(atRiskRatio)}</strong>
            </div>
            <div className='stat-pill stat-pill--warning'>
              <span className='stat-pill__label'>Nộp muộn</span>
              <strong className='stat-pill__value'>{formatPercent(course.late_ratio || 0)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className='summary-grid'>
        <article className='summary-card'>
          <p>Tổng số sinh viên</p>
          <strong>{formatNumber(students.length)}</strong>
        </article>
        <article className='summary-card is-danger'>
          <p>Rủi ro cao</p>
          <strong>{riskBuckets.high}</strong>
        </article>
        <article className='summary-card is-warning'>
          <p>Rủi ro trung bình</p>
          <strong>{riskBuckets.medium}</strong>
        </article>
        <article className='summary-card is-safe'>
          <p>Rủi ro thấp</p>
          <strong>{riskBuckets.low}</strong>
        </article>
      </section>

      <section className='la-panel'>
        <div className='la-panel__header'>
          <div>
            <h3>Đặc trưng hành vi chính</h3>
            <p>Giá trị trung bình của toàn bộ sinh viên trong khóa</p>
          </div>
        </div>
        <div className='summary-grid'>
          <article className='summary-card'>
            <p>Hoạt động sớm</p>
            <strong>{formatGrade(featureSummary.earlyAvgGrade)}</strong>
            <small>{featureSummary.earlySubmissionCount.toFixed(1)} bài trong giai đoạn đầu</small>
          </article>
          <article className='summary-card'>
            <p>Quản lý deadline</p>
            <strong>{formatPercent(featureSummary.earlyLateRatio)}</strong>
            <small>Trễ trung bình {featureSummary.avgDelayHours.toFixed(1)} giờ</small>
          </article>
          <article className='summary-card'>
            <p>Tương tác gần đây</p>
            <strong>{featureSummary.submissions14d.toFixed(1)} bài / 14 ngày</strong>
            <small>{featureSummary.submissions30d.toFixed(1)} lần / 30 ngày</small>
          </article>
          <article className='summary-card'>
            <p>Hoàn thành bài tập</p>
            <strong>{formatPercent(featureSummary.assignmentCompletion)}</strong>
            <small>Trung bình {featureSummary.courseLoad.toFixed(1)} khóa / sinh viên</small>
          </article>
        </div>
      </section>

      <section className='la-panel'>
        <div className='la-panel__header'>
          <div>
            <h3>Danh sách sinh viên</h3>
            <p>Hiệu suất và rủi ro tại khóa học này</p>
          </div>
        </div>

        <div className='filters-bar'>
          <label className='field-text'>
            <span className='field-text__icon' aria-hidden='true'>🔍</span>
            <input
              type='search'
              placeholder='Tìm kiếm sinh viên...'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </label>
          <select
            value={filterRisk}
            onChange={e => setFilterRisk(e.target.value)}
            className='field-select'
          >
            <option value='all'>Tất cả mức rủi ro</option>
            <option value='high'>Rủi ro cao</option>
            <option value='medium'>Rủi ro trung bình</option>
            <option value='low'>Rủi ro thấp</option>
          </select>
        </div>

        {loading ? (
          <div className='la-state la-state--loading'>
            <span className='la-spinner' aria-hidden='true' />
            <p>Đang tải danh sách sinh viên...</p>
          </div>
        ) : (
          <div className='table-wrapper'>
            <table className='la-table'>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sinh viên</th>
                  <th>Điểm TB (khóa)</th>
                  <th>Số bài nộp</th>
                  <th>Nộp muộn</th>
                  <th>Xác suất rủi ro</th>
                  <th>Mức độ</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => {
                  const bucket = classifyRisk(student)
                  const risk = riskDisplay[bucket]
                  const name = student.student_name || 'N/A'
                  const probability = Number(student.risk_probability || 0)
                  return (
                    <tr key={`${student.student_id}-${student.course_id}`}>
                      <td>{index + 1}</td>
                      <td>
                        <div className='student-meta'>
                          <span className='avatar'>{name.charAt(0).toUpperCase()}</span>
                          <div>
                            <p>{name}</p>
                            <small>{student.student_email || 'N/A'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`pill pill--${bucket}`}>
                          {formatGrade(student.course_final_avg)}
                        </span>
                      </td>
                      <td>{student.course_submission_count || 0}</td>
                      <td>
                        <span className='text-warning'>
                          {formatPercent(student.course_late_ratio || 0)}
                        </span>
                      </td>
                      <td>
                        <div className='progress-line'>
                          <span style={{ width: `${probability * 100}%`, background: risk.color }} />
                        </div>
                        <small>{(probability * 100).toFixed(1)}%</small>
                      </td>
                      <td>
                        <span className='risk-label' style={{ color: risk.color }}>{risk.label}</span>
                      </td>
                      <td>
                        <button
                          type='button'
                          className='detail-link'
                          onClick={() => setFocusedStudent(student)}
                        >
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredStudents.length === 0 && (
              <div className='la-state'>
                <p>Không tìm thấy sinh viên phù hợp</p>
              </div>
            )}
          </div>
        )}
      </section>

      {focusedStudent && (
        <StudentRiskDetail
          student={focusedStudent}
          onClose={() => setFocusedStudent(null)}
        />
      )}
    </div>
  )
}

const StudentRiskDetail = ({ student, onClose }) => {
  const probability = Number(student.risk_probability || 0)
  const reasons = buildRiskReasons(student)

  const metrics = [
    { label: 'Điểm trung bình khóa', value: formatGrade(student.course_final_avg) },
    { label: 'Điểm giai đoạn sớm', value: formatGrade(student.early_avg_grade) },
    { label: 'Hoàn thành bài tập', value: formatPercent(student.assignment_completion_ratio || 0) },
    { label: 'Tỷ lệ nộp muộn', value: formatPercent(student.course_late_ratio || 0) },
    { label: 'Bài đã nộp', value: formatNumber(student.course_submission_count || 0) },
    { label: 'Nộp 14 ngày', value: `${student.submissions_last_14d || 0} bài` },
    { label: 'Nộp 30 ngày', value: `${student.submissions_last_30d || 0} lần` },
    { label: 'Tải khóa', value: `${formatNumber(student.course_load || 0)} khóa` },
  ]

  return (
    <div className='detail-drawer' role='dialog' aria-modal='true'>
      <div className='detail-drawer__backdrop' onClick={onClose} />
      <div className='detail-drawer__panel'>
        <header className='detail-drawer__header'>
          <div>
            <p className='la-eyebrow'>Phân tích rủi ro</p>
            <h3>{student.student_name}</h3>
            <small>{student.student_email || 'N/A'}</small>
          </div>
          <button className='detail-drawer__close' onClick={onClose}>✕</button>
        </header>
        <section className='detail-highlight'>
          <div>
            <p>Xác suất rủi ro</p>
            <strong>{(probability * 100).toFixed(1)}%</strong>
          </div>
          <p>Mô hình dự báo dựa trên hành vi học tập gần nhất của sinh viên trong khóa này.</p>
        </section>

        <section>
          <h4>Chỉ số chính</h4>
          <div className='detail-stat-grid'>
            {metrics.map(metric => (
              <article key={metric.label} className='detail-stat'>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h4>Giải thích xác suất</h4>
          <ul className='reason-list'>
            {reasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

const buildRiskReasons = (student) => {
  const reasons = []
  const completion = Number(student.assignment_completion_ratio || 0)
  const lateRatio = Number(student.course_late_ratio || 0)
  const earlyTrend = Number(student.early_grade_trend || 0)
  const submissions14d = Number(student.submissions_last_14d || 0)

  if (completion < 0.8) {
    reasons.push(`Tỷ lệ hoàn thành bài tập chỉ ${formatPercent(completion)}.`)
  } else {
    reasons.push('Sinh viên duy trì tỷ lệ hoàn thành bài tập tốt.')
  }

  if (lateRatio > 0.3) {
    reasons.push(`Tỷ lệ nộp muộn ${formatPercent(lateRatio)} vượt ngưỡng an toàn.`)
  } else {
    reasons.push('Sinh viên ít nộp muộn, kỷ luật tốt.')
  }

  if (earlyTrend < 0) {
    reasons.push('Điểm giai đoạn đầu có xu hướng giảm, cần hỗ trợ sớm.')
  } else {
    reasons.push('Điểm giai đoạn đầu ổn định hoặc cải thiện.')
  }

  if (submissions14d === 0) {
    reasons.push('Không có hoạt động trong 14 ngày gần nhất.')
  } else {
    reasons.push(`Có ${submissions14d} bài nộp trong 14 ngày qua, vẫn còn tương tác.`)
  }

  return reasons
}

export default CourseDetail
