import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

export default function CourseScatter({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const margin = { top: 10, right: 20, bottom: 50, left: 50 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 160);
    const height = 260 - margin.top - margin.bottom;

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
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.late_ratio) || 0.4])
      .nice()
      .range([height, 0]);

    const size = d3
      .scaleSqrt()
      .domain([0, d3.max(data, (d) => d.student_count) || 100])
      .range([6, 18]);

    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .attr("class", "tooltip");

    svg
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", (d) => x(d.avg_grade))
      .attr("cy", (d) => y(d.late_ratio))
      .attr("r", (d) => size(d.student_count))
      .attr("fill", "rgba(49, 100, 255, 0.35)")
      .attr("stroke", "#3164ff")
      .attr("stroke-width", 1.5)
      .on("mouseenter", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.course_name}</strong><br/>Điểm TB: ${d.avg_grade.toFixed(
              2
            )}<br/>Tỷ lệ trễ: ${(d.late_ratio * 100).toFixed(
              1
            )}%<br/>SV: ${d.student_count}`
          )
          .style("left", `${event.offsetX + 18}px`)
          .style("top", `${event.offsetY - 10}px`);
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .append("text")
      .attr("x", width / 2)
      .attr("y", 36)
      .attr("fill", "#1f2937")
      .style("text-anchor", "middle")
      .text("Điểm trung bình");

    svg
      .append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat(d3.format(".0%"))
      )
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -36)
      .attr("fill", "#1f2937")
      .style("text-anchor", "middle")
      .text("Tỷ lệ nộp trễ");
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Liên hệ giữa điểm trung bình & tỷ lệ nộp trễ</h2>
      <p className="card-caption">
        Kích thước biểu tượng thể hiện số sinh viên. Các khóa có điểm thấp
        nhưng tỷ lệ trễ cao cần ưu tiên can thiệp.
      </p>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

CourseScatter.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      course_name: PropTypes.string.isRequired,
      avg_grade: PropTypes.number.isRequired,
      late_ratio: PropTypes.number.isRequired,
      student_count: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    })
  ).isRequired
};
