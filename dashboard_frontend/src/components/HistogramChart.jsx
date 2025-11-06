import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

export default function HistogramChart({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const margin = { top: 10, right: 20, bottom: 40, left: 40 };
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

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.label))
      .range([0, width])
      .padding(0.15);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.count) || 10])
      .range([height, 0])
      .nice();

    const bars = svg.selectAll("rect").data(data).enter().append("g");

    bars
      .append("rect")
      .attr("x", (d) => x(d.label))
      .attr("y", (d) => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", (d) => height - y(d.count))
      .attr("rx", 10)
      .attr("fill", "rgba(49, 100, 255, 0.25)")
      .attr("stroke", "#3164ff")
      .attr("stroke-width", 1);

    bars
      .append("text")
      .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
      .attr("y", (d) => y(d.count) - 6)
      .text((d) => d.count)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("fill", "#1f2b48");

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .style("font-size", "12px");

    svg.append("g").call(d3.axisLeft(y).ticks(5));
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Phân bố điểm trung bình (Histogram)</h2>
      <p className="card-caption">
        Mỗi cột biểu diễn số sinh viên nằm trong khoảng điểm tương ứng.
      </p>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

HistogramChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired
    })
  ).isRequired
};
