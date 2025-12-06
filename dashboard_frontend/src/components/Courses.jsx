import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { formatNumber, formatPercent, formatGrade } from '../utils/helpers'

const Courses = ({ data, onCourseSelect }) => {
  if (!data) return null
  const { courses } = data

  const [searchTerm, setSearchTerm] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [sortKey, setSortKey] = useState('name')

  const highlight = useMemo(
    () =>
      [...courses]
        .sort((a, b) => b.avg_grade - a.avg_grade)
        .slice(0, 3)
        .map(course => course.course_name),
    [courses]
  )

  const filteredCourses = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const riskRanges = {
      low: { min: 0, max: 0.15 },
      medium: { min: 0.15, max: 0.3 },
      high: { min: 0.3, max: 1 }
    }

    const filtered = courses.filter(course => {
      const matchesSearch = !query || course.course_name.toLowerCase().includes(query)
      const risk = course.at_risk_ratio || 0
      const matchesRisk =
        riskFilter === 'all' ||
        (risk >= riskRanges[riskFilter].min && risk < riskRanges[riskFilter].max)
      return matchesSearch && matchesRisk
    })

    const sorters = {
      name: (a, b) => a.course_name.localeCompare(b.course_name),
      avg_grade: (a, b) => (b.avg_grade || 0) - (a.avg_grade || 0),
      student_count: (a, b) => (b.student_count || 0) - (a.student_count || 0),
      risk: (a, b) => (b.at_risk_ratio || 0) - (a.at_risk_ratio || 0)
    }

    return filtered.sort(sorters[sortKey])
  }, [courses, riskFilter, searchTerm, sortKey])

  const chartData = filteredCourses.length ? filteredCourses : courses

  return (
    <div className="la-stack">
      <section className="la-panel">
        <div className="la-panel__header">
          <div>
            <h3>Hiệu suất các khóa học</h3>
            <p>Click vào khóa học để xem danh sách sinh viên</p>
          </div>
        </div>

        <div className="filters-bar course-filters">
          <label className="field-text">
            <span className="field-text__icon" aria-hidden="true">?</span>
            <input
              type="search"
              placeholder="Tìm tên khóa học..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </label>
          <select
            className="field-select"
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
          >
            <option value="all">Tất cả mức rủi ro</option>
            <option value="low">Rủi ro thấp</option>
            <option value="medium">Rủi ro trung bình</option>
            <option value="high">Rủi ro cao</option>
          </select>
          <select
            className="field-select"
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
          >
            <option value="name">Sắp xếp A-Z</option>
            <option value="avg_grade">Điểm trung bình cao</option>
            <option value="student_count">Nhiều sinh viên</option>
            <option value="risk">Rủi ro cao</option>
          </select>
          <span className="course-filters__meta">
            Đang hiển thị {filteredCourses.length}/{courses.length} khóa
          </span>
        </div>

        <div className="courses-grid">
          {filteredCourses.map(course => (
            <CourseCard 
              key={course.course_name} 
              course={course} 
              highlight={highlight.includes(course.course_name)}
              onClick={() => onCourseSelect(course)}
            />
          ))}
          {filteredCourses.length === 0 && (
            <div className="la-state">
              <p>Không tìm thấy khóa học phù hợp bộ lọc</p>
            </div>
          )}
        </div>
      </section>

      <section className="la-panel">
        <div className="la-panel__header">
          <div>
            <h3>So sánh chi tiết</h3>
            <p>Số sinh viên (trục X) so với điểm trung bình (trục Y)</p>
          </div>
        </div>
        <CourseComparisonChart data={chartData} />
      </section>
    </div>
  )
}

const courseRiskMeta = {
  low: { label: 'Rủi ro thấp', className: 'pill--low', description: '< 15% sinh viên cảnh báo' },
  medium: { label: 'Rủi ro trung bình', className: 'pill--medium', description: '15-30% sinh viên' },
  high: { label: 'Rủi ro cao', className: 'pill--high', description: '> 30% sinh viên' }
}

const getCourseRisk = (ratio = 0) => {
  if (ratio >= 0.3) return 'high'
  if (ratio >= 0.15) return 'medium'
  return 'low'
}

const CourseCard = ({ course, highlight, onClick }) => {
  const riskLevel = getCourseRisk(course.at_risk_ratio)
  const risk = courseRiskMeta[riskLevel]

  return (
  <article 
    className={`course-card ${highlight ? 'is-highlighted' : ''}`}
    onClick={onClick}
    style={{ cursor: 'pointer' }}
    role="button"
    tabIndex={0}
    onKeyPress={(e) => e.key === 'Enter' && onClick()}
  >
    <header>
      <p className="course-card__eyebrow">{highlight ? 'Top performer' : 'Khóa học'}</p>
      <h4>{course.course_name}</h4>
    </header>
    <div className="course-card__stats">
      <div>
        <span>Sinh viên</span>
        <strong>{formatNumber(course.student_count)}</strong>
      </div>
      <div>
        <span>Điểm TB</span>
        <strong>{formatGrade(course.avg_grade)}</strong>
      </div>
      <div>
        <span>Rủi ro</span>
        <strong className="text-danger">{formatPercent(course.at_risk_ratio)}</strong>
      </div>
      <div>
        <span>Nộp muộn</span>
        <strong className="text-warning">{formatPercent(course.late_ratio)}</strong>
      </div>
    </div>
    <div className="progress-line progress-line--accent">
      <span
        style={{
          width: `${Math.min(course.avg_grade * 10, 100)}%`,
          background: highlight ? 'var(--cl-primary)' : '#0ea5e9'
        }}
      />
    </div>
    <div className="course-card__risk">
      <span className={`pill ${risk.className}`}>{risk.label}</span>
      <small>{risk.description}</small>
    </div>
  </article>
)}

const CourseComparisonChart = ({ data }) => {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 420
    const margin = { top: 32, right: 24, bottom: 48, left: 64 }

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, d => d.student_count) || 1])
      .nice()
      .range([margin.left, width - margin.right])

    const y = d3
      .scaleLinear()
      .domain([0, 10])
      .range([height - margin.bottom, margin.top])

    const color = d3.scaleSequential().domain([0, data.length]).interpolator(d3.interpolateCool)

    const g = svg.append('g')

    const gridY = d3.axisLeft(y).tickSize(-width + margin.left + margin.right).tickFormat('')
    g.append('g')
      .attr('class', 'grid-line')
      .attr('transform', `translate(${margin.left},0)`)
      .call(gridY)

    const gridX = d3.axisBottom(x).tickSize(-height + margin.top + margin.bottom).tickFormat('')
    g.append('g')
      .attr('class', 'grid-line')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(gridX)

    g.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', d => x(d.student_count))
      .attr('cy', d => y(d.avg_grade))
      .attr('r', d => Math.max(6, Math.sqrt(d.student_count) * 0.6))
      .attr('fill', (d, i) => color(i))
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    g.selectAll('text.label')
      .data(data)
      .join('text')
      .attr('class', 'label')
      .attr('x', d => x(d.student_count))
      .attr('y', d => y(d.avg_grade) - 12)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(d => d.course_name)

    g.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5))
      .style('font-size', '12px')
      .append('text')
      .attr('x', width / 2)
      .attr('y', 40)
      .attr('fill', '#475569')
      .attr('text-anchor', 'middle')
      .text('Số lượng sinh viên')

    g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .style('font-size', '12px')
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -44)
      .attr('fill', '#475569')
      .attr('text-anchor', 'middle')
      .text('Điểm trung bình')
  }, [data])

  return <svg ref={svgRef} width="100%" height="420"></svg>
}

export default Courses
