import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const Analytics = ({ data }) => {
  if (!data) return null

  const { heatmap, histogram, trends } = data

  return (
    <div className="la-stack">
      <section className="la-panel">
        <div className="la-panel__header">
          <div>
            <h3>Phân tích nâng cao</h3>
            <p>Khám phá pattern ẩn trong dữ liệu học tập</p>
          </div>
        </div>
        <div className="la-grid la-grid--stretch">
          <article className="la-panel">
            <header className="la-panel__subheader">
              <div>
                <h4>Heatmap nộp bài muộn</h4>
                <p>Theo ngày trong tuần và khung giờ</p>
              </div>
            </header>
            <LateHeatmap data={heatmap} />
          </article>
          <article className="la-panel">
            <header className="la-panel__subheader">
              <div>
                <h4>Phân bố điểm số</h4>
                <p>Histogram theo khoảng điểm</p>
              </div>
            </header>
            <HistogramChart data={histogram} />
          </article>
        </div>
        <article className="la-panel la-panel--wide">
          <header className="la-panel__subheader">
            <div>
              <h4>Xu hướng theo thời gian</h4>
              <p>Điểm trung bình và tỷ lệ nộp muộn</p>
            </div>
          </header>
          <MultiLineChart data={trends} />
        </article>
      </section>
    </div>
  )
}

const LateHeatmap = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const days = [...new Set(data.map(d => d.day_of_week))].sort()
    const hours = [...new Set(data.map(d => d.hour))].sort((a, b) => a - b)

    const width = svgRef.current.clientWidth
    const height = 300
    const margin = { top: 20, right: 40, bottom: 40, left: 60 }

    const cellWidth = (width - margin.left - margin.right) / hours.length
    const cellHeight = (height - margin.top - margin.bottom) / days.length

    const colorScale = d3.scaleSequential(d3.interpolateReds)
      .domain([0, d3.max(data, d => d.late_ratio)])

    const g = svg.append('g')

    // Cells
    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => margin.left + hours.indexOf(d.hour) * cellWidth)
      .attr('y', d => margin.top + days.indexOf(d.day_of_week) * cellHeight)
      .attr('width', cellWidth - 2)
      .attr('height', cellHeight - 2)
      .attr('fill', d => colorScale(d.late_ratio))
      .attr('rx', 4)
      .style('opacity', 0)
      .transition()
      .delay((d, i) => i * 10)
      .duration(500)
      .style('opacity', 1)

    // X axis (hours)
    g.append('g')
      .attr('transform', `translate(${margin.left + cellWidth/2},${height - margin.bottom})`)
      .selectAll('text')
      .data(hours)
      .join('text')
      .attr('x', (d, i) => i * cellWidth)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .text(d => `${d}h`)

    // Y axis (days)
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    g.append('g')
      .attr('transform', `translate(${margin.left - 10},${margin.top + cellHeight/2})`)
      .selectAll('text')
      .data(days)
      .join('text')
      .attr('x', 0)
      .attr('y', (d, i) => i * cellHeight)
      .attr('text-anchor', 'end')
      .style('font-size', '11px')
      .text(d => dayNames[d])

  }, [data])

  return <svg ref={svgRef} width="100%" height="300"></svg>
}

const HistogramChart = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 300
    const margin = { top: 20, right: 20, bottom: 40, left: 50 }

    const x = d3.scaleBand()
      .domain(data.map(d => `${d.bucket}-${d.bucket + 10}`))
      .range([margin.left, width - margin.right])
      .padding(0.2)

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count)])
      .range([height - margin.bottom, margin.top])

    const g = svg.append('g')

    // Bars
    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d, i) => x(`${d.bucket}-${d.bucket + 10}`))
      .attr('y', height - margin.bottom)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('fill', (d, i) => d3.interpolateBlues((i + 1) / data.length))
      .attr('rx', 4)
      .transition()
      .duration(800)
      .delay((d, i) => i * 50)
      .attr('y', d => y(d.count))
      .attr('height', d => height - margin.bottom - y(d.count))

    // Values on top
    g.selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d, i) => x(`${d.bucket}-${d.bucket + 10}`) + x.bandwidth() / 2)
      .attr('y', d => y(d.count) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('opacity', 0)
      .text(d => d.count)
      .transition()
      .delay((d, i) => 800 + i * 50)
      .duration(300)
      .style('opacity', 1)

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('font-size', '10px')

    g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .style('font-size', '11px')

  }, [data])

  return <svg ref={svgRef} width="100%" height="300"></svg>
}

const MultiLineChart = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 350
    const margin = { top: 20, right: 80, bottom: 40, left: 50 }

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.week))
      .range([margin.left, width - margin.right])

    const y1 = d3.scaleLinear()
      .domain([0, 100])
      .range([height - margin.bottom, margin.top])

    const y2 = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.late_ratio)])
      .range([height - margin.bottom, margin.top])

    const line1 = d3.line()
      .x(d => x(d.week))
      .y(d => y1(d.avg_grade))
      .curve(d3.curveMonotoneX)

    const line2 = d3.line()
      .x(d => x(d.week))
      .y(d => y2(d.late_ratio))
      .curve(d3.curveMonotoneX)

    const g = svg.append('g')

    // Grade line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('d', line1)

    // Late ratio line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', '5,5')
      .attr('d', line2)

    // Points for grade
    g.selectAll('circle.grade')
      .data(data)
      .join('circle')
      .attr('class', 'grade')
      .attr('cx', d => x(d.week))
      .attr('cy', d => y1(d.avg_grade))
      .attr('r', 4)
      .attr('fill', '#3b82f6')

    // Points for late ratio
    g.selectAll('circle.late')
      .data(data)
      .join('circle')
      .attr('class', 'late')
      .attr('cx', d => x(d.week))
      .attr('cy', d => y2(d.late_ratio))
      .attr('r', 4)
      .attr('fill', '#ef4444')

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .style('font-size', '11px')

    g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y1))
      .style('font-size', '11px')
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -height / 2)
      .attr('fill', '#3b82f6')
      .style('font-size', '12px')
      .text('Điểm TB')

    g.append('g')
      .attr('transform', `translate(${width - margin.right},0)`)
      .call(d3.axisRight(y2).tickFormat(d => `${(d * 100).toFixed(0)}%`))
      .style('font-size', '11px')
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 40)
      .attr('x', -height / 2)
      .attr('fill', '#ef4444')
      .style('font-size', '12px')
      .text('Tỷ lệ nộp muộn')

    // Legend
    const legend = g.append('g')
      .attr('transform', `translate(${width - margin.right - 120}, ${margin.top})`)

    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 30)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)

    legend.append('text')
      .attr('x', 35)
      .attr('y', 5)
      .style('font-size', '12px')
      .text('Điểm TB')

    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 30)
      .attr('y1', 20)
      .attr('y2', 20)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', '5,5')

    legend.append('text')
      .attr('x', 35)
      .attr('y', 25)
      .style('font-size', '12px')
      .text('Nộp muộn')

  }, [data])

  return <svg ref={svgRef} width="100%" height="350"></svg>
}

export default Analytics
