import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { formatNumber, formatPercent, formatGrade } from '../utils/helpers'
import { RealtimeActivity, ProgressComparisonChart, GaugeChart } from './AdvancedCharts'
import { CourseTreemap, RadialBarChart } from './CourseCharts'

const Dashboard = ({ data }) => {
  if (!data) return null

  const {
    overview,
    courses,
    students,
    distribution,
    realtimeActivity,
    courseComparison,
    trends
  } = data

  const averageGrade =
    courses.length > 0
      ? courses.reduce((sum, course) => sum + Number(course.avg_grade || 0), 0) / courses.length
      : 0

  const avgSubmissionPerStudent =
    overview.total_students > 0
      ? (overview.total_submissions || 0) / overview.total_students
      : 0

  const highRiskStudents = students.filter(s => s.risk_probability >= 0.7)

  const insightNotes = useMemo(() => {
    const safeRatio = overview.at_risk_ratio != null ? (1 - overview.at_risk_ratio) * 100 : 0
    return [
      `${safeRatio.toFixed(1)}% sinh viên đang trong vùng an toàn`,
      `${highRiskStudents.length} sinh viên cần can thiệp khẩn cấp`,
      `Điểm trung bình toàn hệ là ${averageGrade.toFixed(1)}đ`
    ]
  }, [overview.at_risk_ratio, averageGrade, highRiskStudents.length])

  const statCards = [
    {
      label: 'Sinh viên hoạt động',
      value: formatNumber(overview.total_students),
      trend: '+12.5% so với tuần trước',
      trendUp: true
    },
    {
      label: 'Khóa học đang theo dõi',
      value: formatNumber(overview.total_courses),
      trend: '+2 lớp mở mới',
      trendUp: true
    },
    {
      label: 'Bài nộp tuần này',
      value: formatNumber(overview.submissions_last_7d || 0),
      trend: '+8.3% hoàn thành',
      trendUp: true
    },
    {
      label: 'Tỷ lệ rủi ro cao',
      value: formatPercent(overview.at_risk_ratio || 0),
      trend: '-2.1% sau 7 ngày',
      trendUp: false
    }
  ]

  const gaugeMetrics = [
    {
      title: 'Điểm trung bình',
      value: Number(averageGrade.toFixed(1))
    },
    {
      title: 'Bài nộp/SV',
      value: Number(avgSubmissionPerStudent.toFixed(1)),
      max: 30
    },
    {
      title: 'Tỷ lệ an toàn',
      value: Math.round((1 - (overview.at_risk_ratio || 0)) * 100)
    }
  ]

  const comparisonDataset =
    courseComparison && courseComparison.length
      ? courseComparison
      : courses.map(course => ({
          course_name: course.course_name,
          total_submissions: course.total_submissions || 0,
          enrolled_students: course.student_count || 1
        }))
  const defaultStudentId = students?.[0]?.student_id || ''

  return (
    <div className="la-stack">
      <section className="la-panel la-panel--hero">
        <div className="hero__summary">
          <p className="la-eyebrow">Trạng thái toàn hệ thống</p>
          <h2>Pipeline học tập hiện ổn định và an toàn</h2>
          <p>
            Dữ liệu được đồng bộ mỗi 15 phút từ Canvas Data Warehouse và tự động làm sạch để
            đảm bảo các chỉ số luôn sẵn sàng cho quyết định thời gian thực.
          </p>
          <ul className="hero__insights">
            {insightNotes.map((item, index) => (
              <li key={index}>
                <span className="dot" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="hero__activity">
          <RealtimeActivity data={realtimeActivity} />
        </div>
      </section>

      <section className="metric-grid">
        {statCards.map(card => (
          <StatTile key={card.label} {...card} />
        ))}
      </section>

      <section className="la-grid la-grid--stretch">
        <article className="la-panel la-panel--wide">
          <PanelHeader
            title="So sánh khóa học"
            subtitle="Kích thước = số bài nộp • Màu sắc = điểm trung bình"
          />
          <CourseTreemap data={courses} />
        </article>
        <article className="la-panel">
          <PanelHeader title="Phân bố rủi ro" subtitle="Theo bucket học tập" />
          <RiskPieChart data={distribution} />
        </article>
      </section>

      <section className="la-grid la-grid--stretch">
        <article className="la-panel la-panel--wide">
          <PanelHeader
            title="Tiến độ hoàn thành bài tập"
            subtitle="So sánh giữa các khóa học"
          />
          <ProgressComparisonChart data={comparisonDataset} />
        </article>
        <article className="la-panel la-panel--stacked">
          <PanelHeader title="Chỉ số chất lượng" subtitle="Chuẩn hóa 0 → 100" />
          <div className="dial-grid">
            {gaugeMetrics.map(metric => (
              <div className="dial-card" key={metric.title}>
                <GaugeChart value={metric.value} title={metric.title} max={metric.max || 100} />
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* <section className="la-panel">
        <PanelHeader
          title="Chatbot hoc tap"
          subtitle="Hoi bang ngon ngu tu nhien; tra cuu canvas_dwh + goi LLM neu can"
        />
        <ChatbotPanel defaultStudentId={defaultStudentId} />
      </section> */}
    </div>
  )
}

const PanelHeader = ({ title, subtitle }) => (
  <div className="la-panel__header">
    <div>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
    </div>
  </div>
)

const StatTile = ({ label, value, trend, trendUp }) => (
  <article className="metric-card">
    <p className="metric-card__label">{label}</p>
    <div className="metric-card__value">{value}</div>
    <span className={`metric-card__trend ${trendUp ? 'is-up' : 'is-down'}`}>{trend}</span>
  </article>
)

const RiskPieChart = ({ data }) => {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 320
    const radius = Math.min(width, height) / 2 - 12

    const palette = {
      low: '#1f9d5a',
      medium: '#f5a524',
      high: '#d12f3f'
    }

    const color = d3
      .scaleOrdinal()
      .domain(['low', 'medium', 'high'])
      .range([palette.low, palette.medium, palette.high])

    const pie = d3
      .pie()
      .value(d => d.count)
      .sort(null)

    const arc = d3
      .arc()
      .innerRadius(radius * 0.65)
      .outerRadius(radius)

    const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`)

    const arcs = g
      .selectAll('arc')
      .data(pie(data))
      .join('g')

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.risk_bucket))
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .style('opacity', 0)
      .transition()
      .duration(800)
      .style('opacity', 1)

    arcs
      .append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', '600')
      .style('fill', '#fff')
      .text(d => d.data.count)
  }, [data])

  const legendMap = {
    low: 'Rủi ro thấp',
    medium: 'Rủi ro trung bình',
    high: 'Rủi ro cao'
  }

  return (
    <div className="risk-chart">
      <svg ref={svgRef} width="100%" height="320" aria-label="Phân bố rủi ro"></svg>
      <div className="risk-chart__legend">
        {Object.entries(legendMap).map(([key, label]) => (
          <span key={key}>
            <span className="dot" style={{ background: key === 'low' ? '#1f9d5a' : key === 'medium' ? '#f5a524' : '#d12f3f' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

const TopRiskStudents = ({ data }) => (
  <div className="risk-list">
    {data.map((student, index) => (
      <div key={student.student_name} className="risk-row">
        <div className="risk-row__meta">
          <span className="risk-rank">#{index + 1}</span>
          <div>
            <p>{student.student_name}</p>
            <small>Điểm TB {formatGrade(student.avg_grade)}</small>
          </div>
        </div>
        <div className="risk-row__meter">
          <span style={{ width: `${student.risk_probability * 100}%` }} />
        </div>
        <div className="risk-row__value">{(student.risk_probability * 100).toFixed(0)}%</div>
      </div>
    ))}
  </div>
)

const TrendLineChart = ({ data }) => {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 320
    const margin = { top: 24, right: 24, bottom: 40, left: 48 }

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, d => d.week))
      .range([margin.left, width - margin.right])

    const y = d3
      .scaleLinear()
      .domain([0, 100])
      .range([height - margin.bottom, margin.top])

    const line = d3
      .line()
      .x(d => x(d.week))
      .y(d => y(d.avg_grade))
      .curve(d3.curveMonotoneX)

    const g = svg.append('g')

    const gradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'trendGradient')
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '0%')
      .attr('y2', '100%')

    gradient.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(18,123,189,0.25)')
    gradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(18,123,189,0)')

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', 'var(--cl-primary)')
      .attr('stroke-width', 3)
      .attr('d', line)

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#trendGradient)')
      .attr(
        'd',
        d3
          .area()
          .x(d => x(d.week))
          .y0(height - margin.bottom)
          .y1(d => y(d.avg_grade))
          .curve(d3.curveMonotoneX)
      )

    g.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', d => x(d.week))
      .attr('cy', d => y(d.avg_grade))
      .attr('r', 4)
      .attr('fill', '#fff')
      .attr('stroke', 'var(--cl-primary)')
      .attr('stroke-width', 2)

    g.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5))
      .style('font-size', '12px')

    g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .style('font-size', '12px')
  }, [data])

  return <svg ref={svgRef} width="100%" height="320"></svg>
}

export default Dashboard
