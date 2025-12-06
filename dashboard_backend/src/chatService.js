import { query } from "./db.js";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const baseUrl =
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 20;
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

// Store conversation history and rate limit info per session
const sessionStore = new Map();

const SOURCE_TABLES = ["student_features", "student_course_features", "fact_submissions"];

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const roundNumber = (value, digits = 2) => {
  const num = toNumber(value);
  if (num === null) return null;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
};

const formatNumber = (value, digits = 2, fallback = "N/A") => {
  const num = toNumber(value);
  if (num === null) return fallback;
  return num.toFixed(digits);
};

const formatPercent = (value, digits = 1) => {
  const num = toNumber(value);
  if (num === null) return "0%";
  return `${(num * 100).toFixed(digits)}%`;
};

const normalizeText = (text = "") =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9% ]+/g, " ")
    .trim();

const detectIntent = (text = "") => {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (
    normalized.includes("diem trung binh") ||
    normalized.includes("avg grade") ||
    normalized.includes("gpa") ||
    normalized.includes("average score")
  ) {
    return "student_average";
  }

  if (
    (normalized.includes("mon") ||
      normalized.includes("subject") ||
      normalized.includes("course")) &&
    (normalized.includes("thap") ||
      normalized.includes("lowest") ||
      normalized.includes("kem") ||
      normalized.includes("bad") ||
      normalized.includes("yeu"))
  ) {
    return "lowest_course";
  }

  if (
    normalized.includes("bi quyet") ||
    normalized.includes("cai thien") ||
    normalized.includes("tip") ||
    normalized.includes("goi y") ||
    normalized.includes("improve") ||
    normalized.includes("chien luoc")
  ) {
    return "study_tips";
  }

  return null;
};

const fetchStudentProfile = async (studentId) => {
  if (!studentId) return null;
  const { rows } = await query(
    `SELECT
        student_id,
        student_name,
        avg_grade,
        late_submission_ratio,
        submission_count,
        risk_probability,
        risk_bucket,
        predicted_at_risk
      FROM student_features
      WHERE student_id = $1
      LIMIT 1`,
    [studentId]
  );

  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    avg_grade: toNumber(row.avg_grade),
    late_submission_ratio: toNumber(row.late_submission_ratio),
    submission_count: Number(row.submission_count || 0),
    risk_probability: toNumber(row.risk_probability)
  };
};

const fetchStudentCourseMetrics = async (studentId) => {
  if (!studentId) return [];
  const { rows } = await query(
    `
    WITH class_avg AS (
      SELECT
        course_id,
        AVG(grade) AS avg_grade
      FROM fact_submissions
      WHERE grade IS NOT NULL
      GROUP BY course_id
    )
    SELECT
      scf.course_id,
      COALESCE(scf.course_name, CONCAT('Course ', scf.course_id)) AS course_name,
      ROUND(scf.course_final_avg::numeric, 2) AS student_avg,
      ROUND(class_avg.avg_grade::numeric, 2) AS class_avg,
      ROUND(scf.course_late_ratio::numeric, 4) AS student_late_ratio,
      scf.course_submission_count AS student_submissions,
      scf.risk_probability,
      scf.risk_bucket,
      scf.predicted_at_risk
    FROM student_course_features scf
    LEFT JOIN class_avg ON class_avg.course_id = scf.course_id
    WHERE scf.student_id = $1
    ORDER BY scf.course_final_avg ASC NULLS LAST
  `,
    [studentId]
  );

  return rows.map((row) => ({
    courseId: row.course_id,
    courseName: row.course_name || `Course ${row.course_id}`,
    studentAvg: toNumber(row.student_avg),
    classAvg: toNumber(row.class_avg),
    studentLateRatio: toNumber(row.student_late_ratio),
    studentSubmissions: Number(row.student_submissions || 0),
    riskProbability: toNumber(row.risk_probability),
    riskBucket: row.risk_bucket,
    predictedAtRisk: row.predicted_at_risk === 1
  }));
};

const getStudentSnapshot = async (studentId) => {
  if (!studentId) return { profile: null, courses: [] };
  const [profile, courses] = await Promise.all([
    fetchStudentProfile(studentId),
    fetchStudentCourseMetrics(studentId)
  ]);
  return { profile, courses };
};

const buildCourseChart = (courses, limit = 5, direction = "desc") => {
  const validCourses = courses.filter(
    (course) => typeof course.studentAvg === "number" && !Number.isNaN(course.studentAvg)
  );
  validCourses.sort((a, b) =>
    direction === "asc" ? a.studentAvg - b.studentAvg : b.studentAvg - a.studentAvg
  );
  return validCourses.slice(0, limit).map((course) => ({
    course: course.courseName,
    student: roundNumber(course.studentAvg),
    classAvg:
      typeof course.classAvg === "number" && !Number.isNaN(course.classAvg)
        ? roundNumber(course.classAvg)
        : null
  }));
};

const buildStudyTips = (snapshot, focusCourse) => {
  const tips = [];
  const profile = snapshot.profile;

  if (profile) {
    if (profile.late_submission_ratio && profile.late_submission_ratio > 0.2) {
      tips.push(
        "Giảm tỉ lệ nộp muộn xuống dưới 15% bằng cách khóa lịch nhắc nhở 24h trước hạn."
      );
    } else {
      tips.push("Tiếp tục giữ thói quen nộp bài sớm để duy trì nhịp học ổn định.");
    }

    if (profile.avg_grade !== null && profile.avg_grade < 6.5) {
      tips.push(
        "Chia mục tiêu tăng điểm thành các mốc nhỏ (ví dụ +0.5 điểm mỗi tuần) để dễ theo dõi."
      );
    }

    if (profile.risk_probability && profile.risk_probability > 0.6) {
      tips.push("Đặt lịch trao đổi với giảng viên/cố vấn để tháo gỡ các vướng mắc lớn.");
    }
  }

  if (focusCourse) {
    tips.push(
      `Dành riêng 2 phiên ôn tập/tuần cho ${focusCourse.courseName} và rà lại rubric của từng bài.`
    );
    if (focusCourse.studentLateRatio && focusCourse.studentLateRatio > 0.15) {
      tips.push(
        `Môn ${focusCourse.courseName} có ${formatPercent(
          focusCourse.studentLateRatio
        )} bài nộp muộn – hãy chuẩn bị bản nháp sớm hơn 1 ngày.`
      );
    }
  }

  if (!tips.length) {
    tips.push("Tiếp tục duy trì tiến độ ổn định và kiểm tra dashboard sau mỗi tuần học.");
  }

  return [...new Set(tips)].slice(0, 4);
};

const maybeHandleStructuredIntent = async (message, role, userId) => {
  const intent = detectIntent(message);
  if (!intent || !userId) return null;

  const snapshot = await getStudentSnapshot(userId);
  if (!snapshot.profile) return null;

  const courses = snapshot.courses;
  const numericCourses = courses.filter(
    (course) => typeof course.studentAvg === "number" && !Number.isNaN(course.studentAvg)
  );
  const ascendingCourses = [...numericCourses].sort((a, b) => a.studentAvg - b.studentAvg);
  const descendingCourses = [...numericCourses].sort((a, b) => b.studentAvg - a.studentAvg);
  const lowestCourse = ascendingCourses[0] || null;
  const bestCourse = descendingCourses[0] || null;

  if (intent === "student_average") {
    const replyParts = [
      `Điểm trung bình hiện tại của bạn là ${formatNumber(snapshot.profile.avg_grade)} / 10.`,
      `Đã nộp ${snapshot.profile.submission_count} bài, tỉ lệ nộp trễ ${formatPercent(
        snapshot.profile.late_submission_ratio
      )}.`,
      `Mức rủi ro dự báo: ${(snapshot.profile.risk_bucket || "chưa xác định").toLowerCase()} (${formatPercent(
        snapshot.profile.risk_probability
      )}).`
    ];

    if (bestCourse) {
      replyParts.push(
        `Môn nổi bật nhất: ${bestCourse.courseName} (${formatNumber(bestCourse.studentAvg)}).`
      );
    }
    if (lowestCourse) {
      replyParts.push(
        `Môn cần chú ý: ${lowestCourse.courseName} (${formatNumber(lowestCourse.studentAvg)}).`
      );
    }

    const charts = numericCourses.length
      ? [
          {
            type: "bar",
            title: "Điểm trung bình theo môn",
            data: buildCourseChart(numericCourses, 5, "desc")
          }
        ]
      : [];

    return {
      reply: replyParts.join(" "),
      charts,
      tips: buildStudyTips(snapshot, lowestCourse),
      sources: SOURCE_TABLES
    };
  }

  if (intent === "lowest_course") {
    if (!lowestCourse) {
      return {
        reply: "Hiện chưa có môn học nào đủ dữ liệu để xác định điểm thấp nhất.",
        charts: [],
        tips: buildStudyTips(snapshot),
        sources: SOURCE_TABLES
      };
    }

    const diff =
      typeof lowestCourse.classAvg === "number"
        ? roundNumber(lowestCourse.studentAvg - lowestCourse.classAvg)
        : null;

    const replyParts = [
      `Môn cần ưu tiên là ${lowestCourse.courseName} với điểm trung bình ${formatNumber(
        lowestCourse.studentAvg
      )} / 10.`
    ];

    if (diff !== null) {
      replyParts.push(
        `Bạn ${(diff >= 0 ? "cao hơn" : "thấp hơn")} trung bình lớp ${formatNumber(
          Math.abs(diff)
        )} điểm (lớp: ${formatNumber(lowestCourse.classAvg)}).`
      );
    }

    if (lowestCourse.studentLateRatio !== null) {
      replyParts.push(
        `Tỉ lệ nộp muộn riêng môn này là ${formatPercent(
          lowestCourse.studentLateRatio
        )} trên ${lowestCourse.studentSubmissions} bài đã nộp.`
      );
    }

    const charts = [
      {
        type: "bar",
        title: "Các môn điểm thấp",
        data: buildCourseChart(ascendingCourses, 5, "asc")
      }
    ];

    const targetedTips = [
      `Ôn lại rubric và các mục trừ điểm của ${lowestCourse.courseName} trong 2 bài gần nhất.`,
      `Đặt câu hỏi cho giảng viên/tutor ngay sau mỗi bài ${lowestCourse.courseName} để chốt lỗi sai.`
    ];

    const mergedTips = [...new Set([...targetedTips, ...buildStudyTips(snapshot, lowestCourse)])];

    return {
      reply: replyParts.join(" "),
      charts,
      tips: mergedTips.slice(0, 4),
      sources: SOURCE_TABLES
    };
  }

  if (intent === "study_tips") {
    const replyParts = [
      `Bạn đã nộp ${snapshot.profile.submission_count} bài với điểm trung bình ${formatNumber(
        snapshot.profile.avg_grade
      )} / 10.`,
      `Tỉ lệ nộp trễ: ${formatPercent(snapshot.profile.late_submission_ratio)}.`,
      `Nguy cơ dự báo: ${formatPercent(snapshot.profile.risk_probability)} (${snapshot.profile.risk_bucket ||
        "chưa xếp hạng"}).`
    ];

    const charts = numericCourses.length
      ? [
          {
            type: "bar",
            title: "Môn nên tập trung",
            data: buildCourseChart(ascendingCourses, 5, "asc")
          }
        ]
      : [];

    const tips = buildStudyTips(snapshot, lowestCourse || bestCourse);
    if (tips.length < 3) {
      tips.push("Lập bảng theo dõi (Kanban/Checklist) cho từng môn và cập nhật sau mỗi tuần.");
    }

    return {
      reply: replyParts.join(" "),
      charts,
      tips: tips.slice(0, 4),
      sources: SOURCE_TABLES
    };
  }

  return null;
};

const getSystemPrompt = async (role = "student", userId = null) => {
  try {
    const baseStats = await query(`
      SELECT
        COUNT(*) as total_students,
        SUM(CASE WHEN predicted_at_risk = 1 THEN 1 ELSE 0 END) as at_risk_count
      FROM student_features
    `);
    const courses = await query(`SELECT COUNT(*) as total_courses FROM dim_courses`);
    const submissions = await query(`SELECT COUNT(*) as total_submissions FROM fact_submissions`);

    const stats = {
      total_students: baseStats.rows[0]?.total_students || 0,
      at_risk_students: baseStats.rows[0]?.at_risk_count || 0,
      total_courses: courses.rows[0]?.total_courses || 0,
      total_submissions: submissions.rows[0]?.total_submissions || 0
    };

    // ✳️ Lấy ngữ cảnh riêng theo vai trò
    let userContext = "";
    if (role === "student" && userId) {
      const student = await query(
        `SELECT student_name, avg_grade, late_submission_ratio, risk_probability
         FROM student_features WHERE student_id = $1 LIMIT 1`,
        [userId]
      );
      const s = student.rows[0];
      if (s) {
        userContext = `
        Thông tin sinh viên:
        - Tên: ${s.student_name}
        - Điểm trung bình: ${s.avg_grade}
        - Tỉ lệ nộp trễ: ${s.late_submission_ratio}
        - Xác suất nguy cơ học yếu: ${s.risk_probability}
        `;
      }
    } else if (role === "teacher" && userId) {
      const teacherCourses = await query(
        `SELECT c.course_name,
                COUNT(scf.student_id) AS total_students,
                SUM(CASE WHEN scf.predicted_at_risk = 1 THEN 1 ELSE 0 END) AS at_risk_students
         FROM dim_courses c
         JOIN student_course_features scf ON scf.course_id = c.course_id
         WHERE c.teacher_id = $1
         GROUP BY c.course_name`,
        [userId]
      );
      userContext =
        "Thống kê lớp của giảng viên:\n" +
        teacherCourses.rows
          .map(
            (r) =>
              `- ${r.course_name}: ${r.at_risk_students}/${r.total_students} sinh viên nguy cơ`
          )
          .join("\n");
    }

    return `
Bạn là trợ lý học tập thông minh của hệ thống Canvas LMS.

Hướng dẫn:
- Không lời chào, không gọi tên người dùng
- Không khen ngợi, không động viên, không nhận xét tích cực hoặc tiêu cực
- Không sử dụng ký tự *, emoji hoặc các ký tự trang trí
- Chỉ trả lời câu hỏi về dữ liệu học tập, tiến độ, điểm số, nguy cơ của sinh viên hoặc lớp học.
- Nếu người hỏi là sinh viên, chỉ hiển thị thông tin của chính họ.
- Nếu là giảng viên, hiển thị thống kê lớp họ phụ trách.
- Nếu là admin, hiển thị số liệu toàn hệ thống.

Ngôn phong tùy vai trò:
- student: thân thiện, khích lệ
- teacher: chuyên nghiệp, hỗ trợ phân tích
- admin: trung lập, tổng hợp

Tổng quan hệ thống:
- Tổng sinh viên: ${stats.total_students}
- Nguy cơ học yếu: ${stats.at_risk_students}
- Tổng khóa học: ${stats.total_courses}
- Tổng bài nộp: ${stats.total_submissions}

${userContext}
`.trim();
  } catch (err) {
    console.error("[chat] Error fetching prompt:", err);
    return "Bạn là trợ lý Canvas, chỉ hỗ trợ câu hỏi về học tập và dữ liệu LMS.";
  }
};


const checkRateLimit = (sessionId) => {
  const now = Date.now();
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      history: [],
      rateLimitWindow: now,
      requestCount: 0
    });
    return true;
  }

  const session = sessionStore.get(sessionId);
  if (now - session.rateLimitWindow > RATE_LIMIT_WINDOW) {
    session.rateLimitWindow = now;
    session.requestCount = 0;
  }

  if (session.requestCount >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  session.requestCount++;
  return true;
};

const getConversationHistory = (sessionId) => {
  if (!sessionStore.has(sessionId)) {
    return [];
  }
  return sessionStore.get(sessionId).history || [];
};

const addToHistory = (sessionId, role, content) => {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      history: [],
      rateLimitWindow: Date.now(),
      requestCount: 0
    });
  }

  const session = sessionStore.get(sessionId);
  session.history.push({ role, parts: [{ text: content }] });

  if (session.history.length > MAX_HISTORY_MESSAGES) {
    session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
  }
};

/**
 * Send a chat message to Gemini with conversation context and history.
 * Supports multi-turn conversations per session.
 */
export const sendChatMessage = async (message, sessionId = "default", role, userId) => {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!message || typeof message !== "string") {
    throw new Error("message must be a non-empty string");
  }

  const trimmed = message.trim();
  if (!trimmed.length) {
    throw new Error("message must not be empty");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  if (!checkRateLimit(sessionId)) {
    throw new Error("Rate limit exceeded. Please wait before sending another message.");
  }

  const structured = await maybeHandleStructuredIntent(trimmed, role, userId);
  if (structured) {
    addToHistory(sessionId, "user", trimmed);
    addToHistory(sessionId, "model", structured.reply);
    return structured;
  }

  const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const systemPrompt = await getSystemPrompt(role, userId);
  const history = getConversationHistory(sessionId);

  const contents = [
    ...history,
    {
      role: "user",
      parts: [{ text: trimmed }]
    }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[chat] Gemini API error", response.status, errorText);
    if (response.status === 404) {
      throw new Error(
        "Gemini model không khả dụng. Thử đặt GEMINI_MODEL=gemini-2.5-flash hoặc kiểm tra quyền truy cập API."
      );
    }
    throw new Error("Failed to generate reply");
  }

  const data = await response.json();
  const reply =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "Xin lỗi, mình chưa có câu trả lời cho câu hỏi đó.";

  addToHistory(sessionId, "user", trimmed);
  addToHistory(sessionId, "model", reply);

  return { reply };
};

/**
 * Get conversation history for a session
 */
export const getChatHistory = (sessionId = "default") => {
  if (!sessionStore.has(sessionId)) {
    return [];
  }
  return sessionStore.get(sessionId).history || [];
};

/**
 * Clear conversation history for a session
 */
export const clearChatHistory = (sessionId = "default") => {
  if (sessionStore.has(sessionId)) {
    const session = sessionStore.get(sessionId);
    session.history = [];
  }
};
