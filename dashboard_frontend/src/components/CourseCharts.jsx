import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

// Treemap chart for course comparison
export const CourseTreemap = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 500

    // Prepare data
    const root = {
      name: 'Courses',
      children: data.map(course => ({
        name: course.course_name,
        value: course.total_submissions || 1,
        avg_grade: course.avg_grade || 0,
        student_count: course.student_count || 0
      }))
    }

    const treemapRoot = d3.hierarchy(root)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value)

    d3.treemap()
      .size([width, height])
      .padding(2)
      .round(true)(treemapRoot)

    const color = d3.scaleLinear()
      .domain([0, 5, 10])
      .range(['#f1f5f9', '#93c5fd', '#2563eb'])

    const g = svg.append('g')

    const cells = g.selectAll('g')
      .data(treemapRoot.leaves())
      .join('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)

    // Rectangles
    cells.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .attr('fill', d => color(d.data.avg_grade))
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('rx', 8)
      .style('opacity', 0)
      .transition()
      .duration(800)
      .style('opacity', 1)

    // Course name
    cells.append('text')
      .attr('x', 10)
      .attr('y', 25)
      .style('font-size', '14px')
      .style('font-weight', '700')
      .style('fill', d => d.data.avg_grade >= 5 ? '#1e293b' : 'white')
      .text(d => d.data.name)
      .each(function(d) {
        const text = d3.select(this)
        const width = d.x1 - d.x0 - 20
        let textContent = d.data.name
        
        while (this.getComputedTextLength() > width && textContent.length > 0) {
          textContent = textContent.slice(0, -1)
          text.text(textContent + '...')
        }
      })

    // Stats
    cells.append('text')
      .attr('x', 10)
      .attr('y', 45)
      .style('font-size', '13px')
      .style('fill', d => d.data.avg_grade >= 5 ? '#475569' : 'rgba(255,255,255,0.9)')
      .text(d => `${d.data.student_count} SV`)

    cells.append('text')
      .attr('x', 10)
      .attr('y', 65)
      .style('font-size', '20px')
      .style('font-weight', '700')
      .style('fill', d => d.data.avg_grade >= 5 ? '#0f172a' : 'white')
      .text(d => `${d.data.avg_grade.toFixed(1)}đ`)

    cells.append('text')
      .attr('x', 10)
      .attr('y', 85)
      .style('font-size', '12px')
      .style('fill', d => d.data.avg_grade >= 5 ? '#64748b' : 'rgba(255,255,255,0.8)')
      .text(d => `${d.value} bài nộp`)

  }, [data])

  return <svg ref={svgRef} width="100%" height="500"></svg>
}

// Stacked area chart for course trends
export const StackedAreaChart = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 350
    const margin = { top: 20, right: 120, bottom: 40, left: 50 }

    // Prepare data - group by course
    const courseNames = [...new Set(data.map(d => d.course_name))]
    const weeks = [...new Set(data.map(d => d.week))].sort()

    const stackedData = weeks.map(week => {
      const obj = { week: new Date(week) }
      courseNames.forEach(course => {
        const found = data.find(d => d.week === week && d.course_name === course)
        obj[course] = found ? found.avg_grade || 0 : 0
      })
      return obj
    })

    const stack = d3.stack()
      .keys(courseNames)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone)

    const series = stack(stackedData)

    const x = d3.scaleTime()
      .domain(d3.extent(stackedData, d => d.week))
      .range([margin.left, width - margin.right])

    const y = d3.scaleLinear()
      .domain([0, d3.max(series, d => d3.max(d, d => d[1]))])
      .range([height - margin.bottom, margin.top])

    const color = d3.scaleOrdinal()
      .domain(courseNames)
      .range(d3.schemeCategory10)

    const area = d3.area()
      .x(d => x(d.data.week))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX)

    const g = svg.append('g')

    // Areas
    g.selectAll('path')
      .data(series)
      .join('path')
      .attr('fill', (d, i) => color(d.key))
      .attr('d', area)
      .style('opacity', 0.7)
      .on('mouseover', function() {
        d3.select(this).style('opacity', 1)
      })
      .on('mouseout', function() {
        d3.select(this).style('opacity', 0.7)
      })

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6))
      .style('font-size', '12px')

    g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .style('font-size', '12px')

    // Legend
    const legend = g.append('g')
      .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`)

    courseNames.forEach((course, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`)

      legendRow.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', color(course))
        .attr('rx', 3)

      legendRow.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .style('font-size', '11px')
        .style('font-weight', '500')
        .text(course.length > 15 ? course.substring(0, 15) + '...' : course)
    })

  }, [data])

  return <svg ref={svgRef} width="100%" height="350"></svg>
}

// Radial bar chart for course comparison
export const RadialBarChart = ({ data }) => {
  const svgRef = useRef()

  useEffect(() => {
    if (!data || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 500
    const height = 500
    const innerRadius = 80
    const outerRadius = Math.min(width, height) / 2 - 40

    const x = d3.scaleBand()
      .domain(data.map(d => d.course_name))
      .range([0, 2 * Math.PI])
      .padding(0.1)

    const y = d3.scaleLinear()
      .domain([0, 10])
      .range([innerRadius, outerRadius])

    const color = d3.scaleSequential()
      .domain([0, 10])
      .interpolator(d3.interpolateRdYlGn)

    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(d => y(d.avg_grade))
      .startAngle(d => x(d.course_name))
      .endAngle(d => x(d.course_name) + x.bandwidth())
      .padAngle(0.01)
      .padRadius(innerRadius)

    const g = svg.append('g')
      .attr('transform', `translate(${width/2},${height/2})`)

    // Bars
    g.selectAll('path')
      .data(data)
      .join('path')
      .attr('fill', d => color(d.avg_grade))
      .attr('d', d => arc({...d, avg_grade: 0}))
      .transition()
      .duration(1000)
      .attrTween('d', function(d) {
        const interpolate = d3.interpolate(0, d.avg_grade)
        return function(t) {
          return arc({...d, avg_grade: interpolate(t)})
        }
      })

    // Labels
    g.selectAll('text')
      .data(data)
      .join('text')
      .attr('text-anchor', d => {
        const angle = (x(d.course_name) + x.bandwidth() / 2)
        return angle > Math.PI ? 'end' : 'start'
      })
      .attr('transform', d => {
        const angle = (x(d.course_name) + x.bandwidth() / 2) * 180 / Math.PI - 90
        const radius = outerRadius + 15
        return `rotate(${angle}) translate(${radius},0) rotate(${angle > 90 ? 180 : 0})`
      })
      .style('font-size', '11px')
      .style('font-weight', '600')
      .text(d => d.course_name.substring(0, 20))

    // Center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -10)
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#64748b')
      .text('Điểm TB')

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 15)
      .style('font-size', '28px')
      .style('font-weight', '700')
      .text((data.reduce((sum, d) => sum + d.avg_grade, 0) / data.length).toFixed(1))

  }, [data])

  return (
    <div style={{display: 'flex', justifyContent: 'center'}}>
      <svg ref={svgRef} width="500" height="500"></svg>
    </div>
  )
}
