import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

export default function CourseAverageBar({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const sorted = [...data].sort((a, b) => b.avg_grade - a.avg_grade);
    const margin = { top: 20, right: 40, bottom: 20, left: 160 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 160);
    const height =
      Math.max(sorted.length * 44, 240) - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, 10]).range([0, width]);

    const y = d3
      .scaleBand()
      .domain(sorted.map((d) => d.course_name))
      .range([0, height])
      .padding(0.2);

    const gradientId = "course-bar-gradient";
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#3164ff");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#1b3dff");

    svg
      .selectAll(".course-bar")
      .data(sorted)
      .enter()
      .append("rect")
      .attr("class", "course-bar")
      .attr("x", 0)
      .attr("y", (d) => y(d.course_name))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.avg_grade))
      .attr("rx", 10)
      .attr("fill", `url(#${gradientId})`)
      .style("filter", "drop-shadow(0 6px 15px rgba(49, 100, 255, 0.25))");

    svg
      .selectAll(".value-label")
      .data(sorted)
      .enter()
      .append("text")
      .attr("class", "value-label")
      .attr("x", (d) => x(d.avg_grade) + 8)
      .attr("y", (d) => y(d.course_name) + y.bandwidth() / 2 + 4)
      .text((d) => d.avg_grade.toFixed(2))
      .style("fill", "#1d253a")
      .style("font-weight", 600)
      .style("font-size", "12px");

    svg
      .append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", 600)
      .style("fill", "#1f2b48");

    svg.selectAll("path, line").remove();

    const xAxis = d3
      .axisBottom(x)
      .ticks(5)
      .tickFormat((d) => `${d.toFixed(0)}/10`);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", "12px");
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Điểm trung bình theo khóa học</h2>
      <p className="card-caption">
        Các khóa học được sắp xếp theo điểm trung bình từ cao xuống thấp.
      </p>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

CourseAverageBar.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      course_name: PropTypes.string.isRequired,
      avg_grade: PropTypes.number.isRequired
    })
  ).isRequired
};
