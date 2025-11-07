import express from "express";
import {
  fetchOverview,
  fetchCourseSummary,
  fetchStudentSummary,
  fetchStudentDistribution,
  fetchWeeklyTrends,
  fetchLateHeatmap,
  fetchHistogram,
  fetchAssignmentCompletion,
  fetchStudentPerformanceTrend,
  fetchCourseComparison,
  fetchTopStudents,
  fetchRealtimeActivity
} from "./analyticsService.js";

const router = express.Router();

const requireApiKey = (req, res, next) => {
  const expected = process.env.API_KEY;
  if (!expected) return next();
  const provided =
    req.headers["x-api-key"] || req.query.api_key || req.query.token;
  if (provided && provided === expected) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

router.use(requireApiKey);

router.get("/overview", async (_req, res, next) => {
  try {
    const data = await fetchOverview();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/courses", async (_req, res, next) => {
  try {
    const data = await fetchCourseSummary();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/students/top", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const data = await fetchStudentSummary(limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/students/distribution", async (_req, res, next) => {
  try {
    const data = await fetchStudentDistribution();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/trends/weekly", async (_req, res, next) => {
  try {
    const data = await fetchWeeklyTrends();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/heatmap/late", async (_req, res, next) => {
  try {
    const data = await fetchLateHeatmap();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/students/histogram", async (_req, res, next) => {
  try {
    const data = await fetchHistogram();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// New endpoints
router.get("/courses/assignments", async (_req, res, next) => {
  try {
    const data = await fetchAssignmentCompletion();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/students/:id/trend", async (req, res, next) => {
  try {
    const data = await fetchStudentPerformanceTrend(req.params.id);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/courses/comparison", async (_req, res, next) => {
  try {
    const data = await fetchCourseComparison();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/students/top-performers", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const data = await fetchTopStudents(limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/activity/realtime", async (_req, res, next) => {
  try {
    const data = await fetchRealtimeActivity();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/all", async (_req, res, next) => {
  try {
    const [
      overview,
      courses,
      students,
      distribution,
      trends,
      heatmap,
      histogram,
      assignments,
      courseComparison,
      topPerformers,
      realtimeActivity
    ] = await Promise.all([
      fetchOverview(),
      fetchCourseSummary(),
      fetchStudentSummary(1000),
      fetchStudentDistribution(),
      fetchWeeklyTrends(),
      fetchLateHeatmap(),
      fetchHistogram(),
      fetchAssignmentCompletion(),
      fetchCourseComparison(),
      fetchTopStudents(10),
      fetchRealtimeActivity()
    ]);

    res.json({
      overview,
      courses,
      students,
      topStudents: students.slice(0, 20),
      distribution,
      trends,
      heatmap,
      histogram,
      assignments,
      courseComparison,
      topPerformers,
      realtimeActivity
    });
  } catch (error) {
    next(error);
  }
});

export default router;
