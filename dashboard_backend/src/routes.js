import express from "express";
import {
  fetchOverview,
  fetchCourseSummary,
  fetchStudentSummary,
  fetchCourseStudents,
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
import { sendChatMessage, getChatHistory, clearChatHistory } from "./chatService.js";

const router = express.Router();

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

router.get("/courses/:courseId/students", async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const limit = Number(req.query.limit) || 1000;
    const data = await fetchCourseStudents(courseId, limit);
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

router.post("/chat", async (req, res, next) => {
  try {
    const { message, sessionId, role, userId } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const sid = sessionId || `session-${req.ip || "unknown"}`;
    const payload = await sendChatMessage(message, sid, role, userId);
    res.json({ sessionId: sid, ...payload });
  } catch (error) {
    next(error);
  }
});

router.get("/chat/history", async (req, res, next) => {
  try {
    const { sessionId } = req.query;
    const sid = sessionId || `session-${req.ip || "unknown"}`;
    const history = getChatHistory(sid);
    res.json({ history, sessionId: sid });
  } catch (error) {
    next(error);
  }
});

router.post("/chat/clear", async (req, res, next) => {
  try {
    const { sessionId } = req.body || {};
    const sid = sessionId || `session-${req.ip || "unknown"}`;
    clearChatHistory(sid);
    res.json({ message: "Chat history cleared", sessionId: sid });
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
      courseStudents,
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
      fetchCourseStudents(null, 2000),
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
      courseStudents,
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
