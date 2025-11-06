import { useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import useResizeObserver from "../hooks/useResizeObserver.js";

export default function StudentsBar({ data }) {
  const [containerRef, dimensions] = useResizeObserver();

  useEffect(() => {
    if (!dimensions || !data?.length) return;

    const margin = { top: 10, right: 40, bottom: 30, left: 180 };
    const width = Math.max(dimensions.width - margin.left - margin.right, 160);
    const height =
      Math.max(data.length * 42, 260) - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.risk_probability) || 1])
      .range([0, width]);

    const y = d3
      .scaleBand()
      .domain(data.map((d) => d.student_name))
      .range([0, height])
      .padding(0.3);

    const gradientId = "students-bar-gradient";
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f97316");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#fb923c");

    svg
      .selectAll(".student-bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "student-bar")
      .attr("x", 0)
      .attr("y", (d) => y(d.student_name))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.risk_probability))
      .attr("rx", 10)
      .attr("fill", `url(#${gradientId})`)
      .style("filter", "drop-shadow(0 4px 10px rgba(241, 158, 66, 0.25))");

    svg
      .selectAll(".prob-label")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "prob-label")
      .attr("x", (d) => x(d.risk_probability) + 10)
      .attr("y", (d) => y(d.student_name) + y.bandwidth() / 2 + 4)
      .text((d) => `${(d.risk_probability * 100).toFixed(1)}%`)
      .style("fill", "#1f2937")
      .style("font-size", "12px")
      .style("font-weight", 600);

    svg
      .append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll("text")
      .style("font-weight", 600)
      .style("fill", "#1e243b")
      .call((selection) =>
        selection.each(function (d) {
          const self = d3.select(this);
          const name = String(d);
          const short = name.length > 24 ? `${name.slice(0, 24)}…` : name;
          self.text(short);
          self.append("title").text(name);
        })
      );

    svg.selectAll("path, line").remove();

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .tickFormat(d3.format(".0%"))
          .ticks(4)
      )
      .selectAll("text")
      .style("font-size", "12px");
  }, [data, dimensions, containerRef]);

  return (
    <div className="card">
      <h2>Top sinh viên nguy cơ cao (logistic regression)</h2>
      <p className="card-caption">
        Dựa trên xác suất dự đoán &gt; 95%, sắp xếp giảm dần – biểu đồ đứng
        càng dài nghĩa là nguy cơ càng cao.
      </p>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

StudentsBar.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      student_name: PropTypes.string.isRequired,
      risk_probability: PropTypes.number.isRequired
    })
  ).isRequired
};
