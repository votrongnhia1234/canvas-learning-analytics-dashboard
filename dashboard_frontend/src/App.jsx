import { useEffect, useMemo, useState } from "react";
import OverviewCards from "./components/OverviewCards.jsx";
import RiskBucketPie from "./components/RiskBucketPie.jsx";
import CourseAverageBar from "./components/CourseAverageBar.jsx";
import StudentsBar from "./components/StudentsBar.jsx";
import WeeklyTrendChart from "./components/WeeklyTrendChart.jsx";
import LateHeatmap from "./components/LateHeatmap.jsx";
import HistogramChart from "./components/HistogramChart.jsx";
import CourseScatter from "./components/CourseScatter.jsx";
import KpiCard from "./components/KpiCard.jsx";
import TopAtRiskList from "./components/TopAtRiskList.jsx";

const TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "student", label: "Phân tích sinh viên" },
  { id: "course", label: "Phân tích khóa học" }
];

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";

const fetchAll = async () => {
  const res = await fetch(`${API_BASE}/api/all`, {
    headers: {
      "Content-Type": "application/json",
      ...(import.meta.env.VITE_API_KEY
        ? { "X-API-Key": import.meta.env.VITE_API_KEY }
        : {})
    }
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
};

export default function App() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payload = await fetchAll();
        if (mounted) {
          setData(payload);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const chartData = useMemo(() => {
    if (!data) return null;

    const parseCourses = data.courses.map((c) => ({
      ...c,
      avg_grade: Number(c.avg_grade),
      late_ratio: Number(c.late_ratio),
      at_risk_ratio: Number(c.at_risk_ratio),
      student_count: Number(c.student_count)
    }));

    const parseStudents = data.topStudents.map((s) => ({
      ...s,
      avg_grade: Number(s.avg_grade),
      risk_probability: Number(s.risk_probability)
    }));

    return {
      overview: data.overview,
      courses: parseCourses,
      topStudents: parseStudents,
      distribution: data.distribution.map((d) => ({
        ...d,
        count: Number(d.count),
        avg_grade: Number(d.avg_grade)
      })),
      trends: data.trends.map((t) => ({
        ...t,
        week: new Date(t.week),
        avg_grade: Number(t.avg_grade),
        late_ratio: Number(t.late_ratio),
        submissions: Number(t.submissions)
      })),
      heatmap: data.heatmap.map((h) => ({
        ...h,
        late_ratio: Number(h.late_ratio)
      })),
      histogram: data.histogram.map((h) => ({
        ...h,
        bucket: Number(h.bucket),
        count: Number(h.count)
      }))
    };
  }, [data]);

  const top10Students = useMemo(() => {
    if (!chartData) return [];
    return chartData.topStudents.slice(0, 10);
  }, [chartData]);

  return (
    <div className="dashboard">
      <header>
        <h1>Learning Analytics Dashboard</h1>
        <p>
          Theo dõi hiệu suất học tập trên Canvas LMS – dữ liệu được tổng hợp
          từ pipeline ETL (Airflow) và mô hình Logistic Regression.
        </p>
      </header>

      <nav className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading && <p className="status">Đang tải dữ liệu...</p>}
      {error && (
        <p className="status error">
          Không tải được dữ liệu: <strong>{error}</strong>
        </p>
      )}

      {!loading && !error && chartData && (
        <main>
          {tab === "overview" && (
            <section className="grid-layout">
              <OverviewCards data={chartData.overview} />
              <RiskBucketPie data={chartData.distribution} />
              <CourseAverageBar data={chartData.courses} />
            </section>
          )}

          {tab === "student" && (
            <section className="grid-layout">
              <StudentsBar data={top10Students} />
              <WeeklyTrendChart data={chartData.trends} />
              <LateHeatmap data={chartData.heatmap} />
              <HistogramChart data={chartData.histogram} />
            </section>
          )}

          {tab === "course" && (
            <section className="grid-layout">
              <CourseScatter data={chartData.courses} />
              <KpiCard value={chartData.overview.at_risk_ratio} />
              <TopAtRiskList data={top10Students} />
            </section>
          )}
        </main>
      )}

      <footer>
        <span>
          Nguồn dữ liệu: PostgreSQL <code>canvas_dwh</code> (Airflow ETL +
          Logistic Regression). Dashboard dựng bằng React + D3.js.
        </span>
      </footer>
    </div>
  );
}
