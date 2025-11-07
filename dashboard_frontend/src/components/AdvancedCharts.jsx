import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { formatNumber } from '../utils/helpers'

const RealtimeActivity = ({ data }) => {
  if (!data) return null

  const averageDailySubmission = data.submissions_7d ? data.submissions_7d / 7 : null
  const trendValue =
    averageDailySubmission && averageDailySubmission > 0
      ? ((data.submissions_24h - averageDailySubmission) / averageDailySubmission) * 100
      : null

  const metrics = [
    {
      label: 'Bài nộp (24h)',
      value: formatNumber(data.submissions_24h || 0),
      meta: 'So với trung bình 7 ngày',
      trend: trendValue != null ? `${trendValue >= 0 ? '+' : ''}${trendValue.toFixed(1)}%` : '—',
      trendUp: trendValue == null ? true : trendValue >= 0
    },
    {
      label: 'Bài nộp (7 ngày)',
      value: formatNumber(data.submissions_7d || 0),
      meta: 'Hoạt động trong tuần gần nhất'
    },
    {
      label: 'SV hoạt động (24h)',
      value: formatNumber(data.active_students_24h || 0),
      meta: 'Đăng nhập hoặc tương tác'
    },
    {
      label: 'SV hoạt động (7 ngày)',
      value: formatNumber(data.active_students_7d || 0),
      meta: 'Tần suất ổn định trong tuần'
    }
  ]

  return (
    <div className="activity-cards">
      {metrics.map(metric => (
        <article className="activity-card" key={metric.label}>
          <p className="activity-card__label">{metric.label}</p>
          <div className="activity-card__value">
            {metric.value}
            {metric.trend && (
              <span className={`trend ${metric.trendUp ? 'is-up' : 'is-down'}`}>{metric.trend}</span>
            )}
          </div>
          <p className="activity-card__meta">{metric.meta}</p>
        </article>
      ))}
    </div>
  )
}

const RadarChart = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 400
    const height = 400
    const radius = Math.min(width, height) / 2 - 40

    const categories = ['Điểm TB', 'Hoàn thành', 'Nộp đúng hạn', 'Tham gia', 'Tiến độ']
    const angleSlice = (Math.PI * 2) / categories.length

    const rScale = d3.scaleLinear()
      .domain([0, 100])
      .range([0, radius])

    const g = svg.append('g')
      .attr('transform', `translate(${width/2},${height/2})`)

    // Grid circles
    const levels = 5
    for (let i = 1; i <= levels; i++) {
      g.append('circle')
        .attr('r', radius / levels * i)
        .attr('fill', 'none')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 1)
    }

    // Axes
    categories.forEach((cat, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius

      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 1)

      g.append('text')
        .attr('x', Math.cos(angle) * (radius + 20))
        .attr('y', Math.sin(angle) * (radius + 20))
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .text(cat)
    })

    // Sample data for demo
    const radarData = [85, 78, 92, 88, 75]
    const radarLine = d3.lineRadial()
      .angle((d, i) => angleSlice * i - Math.PI / 2)
      .radius(d => rScale(d))
      .curve(d3.curveLinearClosed)

    g.append('path')
      .datum(radarData)
      .attr('d', radarLine)
      .attr('fill', 'rgba(59, 130, 246, 0.3)')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)

  }, [data])

  return <svg ref={svgRef} width="400" height="400"></svg>
}

const ProgressComparisonChart = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 300
    const margin = { top: 20, right: 100, bottom: 40, left: 150 }

    const x = d3.scaleLinear()
      .domain([0, 100])
      .range([margin.left, width - margin.right])

    const y = d3.scaleBand()
      .domain(data.map(d => d.course_name))
      .range([margin.top, height - margin.bottom])
      .padding(0.2)

    const g = svg.append('g')

    // Background bars
    g.selectAll('rect.bg')
      .data(data)
      .join('rect')
      .attr('class', 'bg')
      .attr('x', margin.left)
      .attr('y', d => y(d.course_name))
      .attr('width', width - margin.left - margin.right)
      .attr('height', y.bandwidth())
      .attr('fill', '#f1f5f9')
      .attr('rx', 4)

    // Progress bars
    g.selectAll('rect.progress')
      .data(data)
      .join('rect')
      .attr('class', 'progress')
      .attr('x', margin.left)
      .attr('y', d => y(d.course_name))
      .attr('width', 0)
      .attr('height', y.bandwidth())
      .attr('fill', d => {
        const rate = (d.total_submissions / (d.enrolled_students * 5)) * 100
        if (rate >= 80) return '#10b981'
        if (rate >= 60) return '#3b82f6'
        if (rate >= 40) return '#f59e0b'
        return '#ef4444'
      })
      .attr('rx', 4)
      .transition()
      .duration(1000)
      .attr('width', d => {
        const rate = Math.min((d.total_submissions / (d.enrolled_students * 5)) * 100, 100)
        return x(rate) - margin.left
      })

    // Labels
    g.selectAll('text.label')
      .data(data)
      .join('text')
      .attr('class', 'label')
      .attr('x', margin.left - 10)
      .attr('y', d => y(d.course_name) + y.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .style('font-size', '13px')
      .style('font-weight', '500')
      .text(d => d.course_name)

    // Values
    g.selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', d => {
        const rate = Math.min((d.total_submissions / (d.enrolled_students * 5)) * 100, 100)
        return x(rate) + 10
      })
      .attr('y', d => y(d.course_name) + y.bandwidth() / 2)
      .attr('dominant-baseline', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('opacity', 0)
      .text(d => {
        const rate = Math.min((d.total_submissions / (d.enrolled_students * 5)) * 100, 100)
        return `${rate.toFixed(0)}%`
      })
      .transition()
      .delay(1000)
      .duration(300)
      .style('opacity', 1)

  }, [data])

  return <svg ref={svgRef} width="100%" height="300"></svg>
}

const GaugeChart = ({ value, title, max = 100 }) => {
  const svgRef = useRef()

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 200
    const height = 150
    const radius = 70

    const arc = d3.arc()
      .innerRadius(radius - 15)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)

    const g = svg.append('g')
      .attr('transform', `translate(${width/2},${height - 20})`)

    // Background arc
    g.append('path')
      .attr('d', arc.endAngle(Math.PI / 2))
      .attr('fill', '#e2e8f0')

    // Value arc
    const valueAngle = -Math.PI / 2 + (value / max) * Math.PI
    g.append('path')
      .attr('d', arc.endAngle(-Math.PI / 2))
      .attr('fill', value >= 80 ? '#10b981' : value >= 60 ? '#3b82f6' : value >= 40 ? '#f59e0b' : '#ef4444')
      .transition()
      .duration(1500)
      .attrTween('d', function() {
        const interpolate = d3.interpolate(-Math.PI / 2, valueAngle)
        return function(t) {
          return arc.endAngle(interpolate(t))()
        }
      })

    // Value text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -10)
      .style('font-size', '32px')
      .style('font-weight', '700')
      .text(Math.round(value))

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 10)
      .style('font-size', '12px')
      .style('fill', '#64748b')
      .text(title)

  }, [value, title, max])

  return <svg ref={svgRef} width="200" height="150"></svg>
}

export { RealtimeActivity, RadarChart, ProgressComparisonChart, GaugeChart }
