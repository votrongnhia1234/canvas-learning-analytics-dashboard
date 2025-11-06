import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

const COLORS = ["#3164ff", "#22c55e", "#f97316", "#10b981", "#eab308"];

export default function RiskBucketPie({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const sortedData = [...data].sort((a, b) => b.count - a.count);
    if (!sortedData.length) return;

    const width = Math.max(dimensions.width, 360);
    const height = 320;
    const radius = Math.min(width, height) * 0.33;

    const pieCenterX = Math.min(width * 0.4, radius + 40);
    const pieCenterY = height / 2;

    const svg = d3
      .select(containerRef.current)
      .html("")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const pieGroup = svg
      .append("g")
      .attr("transform", `translate(${pieCenterX},${pieCenterY})`);

    const total = d3.sum(sortedData, (d) => d.count);

    const pie = d3
      .pie()
      .sort(null)
      .value((d) => d.count);

    const arc = d3
      .arc()
      .innerRadius(radius * 0.45)
      .outerRadius(radius);

    const arcs = pieGroup.selectAll("path").data(pie(sortedData)).enter();

    arcs
      .append("path")
      .attr("d", arc)
      .attr("fill", (_, i) => COLORS[i % COLORS.length])
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .style("filter", "drop-shadow(0 4px 8px rgba(18, 38, 95, 0.15))");

    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${pieCenterX + radius + 32}, ${pieCenterY -
          (sortedData.length * 24) / 2})`
      );

    const legendItem = legend
      .selectAll("g")
      .data(sortedData)
      .enter()
      .append("g")
      .attr("transform", (_, i) => `translate(0, ${i * 24})`);

    legendItem
      .append("rect")
      .attr("width", 14)
      .attr("height", 14)
      .attr("rx", 3)
      .attr("fill", (_, i) => COLORS[i % COLORS.length]);

    legendItem
      .append("text")
      .attr("x", 20)
      .attr("y", 11)
      .text(
        (d) =>
          `${d.risk_bucket} · ${(d.count / total * 100).toFixed(1)}% (${d.count})`
      )
      .attr("fill", "#374060")
      .style("font-size", "13px");

    pieGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .style("font-size", "28px")
      .style("font-weight", "700")
      .style("fill", "#16213a")
      .text(`${Math.round((sortedData[0].count / total) * 100)}%`);

    pieGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.3em")
      .style("font-size", "12px")
      .style("text-transform", "uppercase")
      .style("opacity", 0.7)
      .text(sortedData[0].risk_bucket);
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Tỷ lệ sinh viên theo nhóm rủi ro</h2>
      <p className="card-caption">
        Nhóm nào chiếm tỷ trọng lớn sẽ xuất hiện nổi bật. Dễ theo dõi phân bổ
        sinh viên giữa các nhóm.
      </p>
      <div ref={containerRef} className="chart-container pie-container" />
    </div>
  );
}

RiskBucketPie.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      risk_bucket: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired
    })
  ).isRequired
};
