import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

export default function WeeklyTrendChart({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const margin = { top: 20, right: 50, bottom: 40, left: 50 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 160);
    const height = 280 - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.week))
      .range([0, width]);

    const yLeft = d3.scaleLinear().domain([0, 10]).range([height, 0]);
    const yRight = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.late_ratio) || 0.5])
      .range([height, 0]);

    const area = d3
      .area()
      .x((d) => x(d.week))
      .y0(height)
      .y1((d) => yLeft(d.avg_grade))
      .curve(d3.curveMonotoneX);

    const gradeLine = d3
      .line()
      .x((d) => x(d.week))
      .y((d) => yLeft(d.avg_grade))
      .curve(d3.curveMonotoneX);

    const lateLine = d3
      .line()
      .x((d) => x(d.week))
      .y((d) => yRight(d.late_ratio))
      .curve(d3.curveMonotoneX);

    const gradientId = "weekly-area-gradient";
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#3164ff");
    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "rgba(49, 100, 255, 0)");

    svg
      .append("path")
      .datum(data)
      .attr("fill", `url(#${gradientId})`)
      .attr("d", area);

    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#1d4ed8")
      .attr("stroke-width", 2.5)
      .attr("d", gradeLine);

    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#f97316")
      .attr("stroke-width", 2)
      .style("stroke-dasharray", "6 4")
      .attr("d", lateLine);

    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .attr("class", "tooltip");

    svg
      .selectAll("circle.grade")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "grade")
      .attr("r", 4)
      .attr("cx", (d) => x(d.week))
      .attr("cy", (d) => yLeft(d.avg_grade))
      .attr("fill", "#1d4ed8")
      .on("mouseenter", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d3.timeFormat("%d/%m/%Y")(d.week)}</strong><br/>Điểm TB: ${d.avg_grade.toFixed(
              2
            )}<br/>Tỷ lệ trễ: ${(d.late_ratio * 100).toFixed(1)}%`
          )
          .style("left", `${event.offsetX + 18}px`)
          .style("top", `${event.offsetY - 10}px`);
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(6)
          .tickFormat(d3.timeFormat("%d/%m"))
      );

    svg.append("g").call(d3.axisLeft(yLeft));
    svg
      .append("g")
      .attr("transform", `translate(${width},0)`)
      .call(
        d3
          .axisRight(yRight)
          .ticks(4)
          .tickFormat(d3.format(".0%"))
      );

    const legend = svg.append("g").attr("transform", "translate(0,-10)");

    legend
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 5)
      .attr("fill", "#1d4ed8");
    legend
      .append("text")
      .attr("x", 10)
      .attr("y", 4)
      .text("Điểm trung bình (trái)")
      .style("font-size", "12px")
      .style("fill", "#1f2b48");

    legend
      .append("rect")
      .attr("x", 160)
      .attr("y", -4)
      .attr("width", 16)
      .attr("height", 3)
      .attr("fill", "#f97316");
    legend
      .append("text")
      .attr("x", 180)
      .attr("y", 4)
      .text("Tỷ lệ nộp trễ (phải)")
      .style("font-size", "12px")
      .style("fill", "#1f2b48");
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Xu hướng điểm & tỷ lệ nộp trễ theo thời gian</h2>
      <p className="card-caption">
        Đường màu xanh hiển thị điểm trung bình, đường nét đứt màu cam là
        tỷ lệ nộp trễ (y-axis bên phải).
      </p>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

WeeklyTrendChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      week: PropTypes.instanceOf(Date).isRequired,
      avg_grade: PropTypes.number.isRequired,
      late_ratio: PropTypes.number.isRequired
    })
  ).isRequired
};
