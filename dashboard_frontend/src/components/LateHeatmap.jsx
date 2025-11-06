import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

export default function LateHeatmap({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const courses = Array.from(
      new Set(data.map((d) => d.course_name))
    );
    const buckets = Array.from(
      new Set(data.map((d) => d.risk_bucket))
    );

    const margin = { top: 20, right: 60, bottom: 70, left: 140 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 180);
    const height = 300 - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand()
      .domain(courses)
      .range([0, width])
      .padding(0.08);

    const y = d3
      .scaleBand()
      .domain(buckets)
      .range([0, height])
      .padding(0.08);

    const color = d3
      .scaleSequential(d3.interpolateYlOrRd)
      .domain([0, 0.7]);

    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .attr("class", "tooltip");

    svg
      .selectAll("rect.cell")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "cell")
      .attr("x", (d) => x(d.course_name))
      .attr("y", (d) => y(d.risk_bucket))
      .attr("rx", 8)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .style("fill", (d) => color(d.late_ratio))
      .on("mouseenter", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.course_name}</strong><br/>${d.risk_bucket}<br/>Tỷ lệ trễ: ${(d.late_ratio * 100).toFixed(
              1
            )}%`
          )
          .style("left", `${event.offsetX + 16}px`)
          .style("top", `${event.offsetY - 10}px`);
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .style("font-size", "12px")
      .attr("transform", "rotate(-25)")
      .style("text-anchor", "end");

    svg
      .append("g")
      .call(d3.axisLeft(y))
      .selectAll("text")
      .style("font-size", "12px");

    const legendHeight = height;
    const legendWidth = 14;

    const legend = svg
      .append("g")
      .attr("transform", `translate(${width + 24}, 0)`);

    const legendScale = d3
      .scaleLinear()
      .domain(color.domain())
      .range([legendHeight, 0]);

    const legendAxis = d3
      .axisRight(legendScale)
      .ticks(5)
      .tickFormat(d3.format(".0%"));

    const legendGradientId = "late-heatmap-legend";
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", legendGradientId)
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "0%");

    gradient
      .selectAll("stop")
      .data(
        color.ticks(10).map((t, i, n) => ({
          offset: `${(100 * i) / (n.length - 1)}%`,
          color: color(t)
        }))
      )
      .enter()
      .append("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    legend
      .append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", `url(#${legendGradientId})`);

    legend
      .append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(legendAxis)
      .selectAll("text")
      .style("font-size", "12px");
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Heatmap tỷ lệ nộp trễ (khóa học × nhóm rủi ro)</h2>
      <p className="card-caption">
        Ô màu càng đậm → tỷ lệ nộp trễ càng cao. Giúp phát hiện khóa học cần
        ưu tiên hỗ trợ.
      </p>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

LateHeatmap.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      course_name: PropTypes.string.isRequired,
      risk_bucket: PropTypes.string.isRequired,
      late_ratio: PropTypes.number.isRequired
    })
  ).isRequired
};
