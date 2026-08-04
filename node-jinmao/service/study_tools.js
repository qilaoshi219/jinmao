// ==================== 学习工具服务模块 ====================
// 职责：课程学习页的辅助工具
//   - generateReviewOutline — 按章节内容生成复习提纲（LLM）
//   - generateChapterQuiz   — 按章节内容生成 5 道测验题（LLM）
//   - getCourseMindMap      — 从章节大纲 JSON 提取思维导图数据（无 AI，免费）
// 权限模型与 course_ai 一致：课程归属校验 + 余额预检（LLM 类接口）

const Minio = require("minio");
const prisma = require("../utils/prisma");
const llmClient = require("../utils/llm_client");
const { checkCanUseAI } = require("../utils/balance");
const {
  assertCourseOwnership,
  assertChapterBelongsToCourse,
} = require("./course_ai");

// 日志前缀
const TAG = "[study_tools]";

// ==================== MinIO 客户端 ====================
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// 素材缓存：key = courseId，value = { chapters, course, ts }
const materialCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

// ==================== 工具函数 ====================

/** 将 MinIO 流转换为字符串 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

/** 截断字符串到指定字符数 */
function truncate(text, maxChars) {
  if (!text) return "";
  const str = String(text).trim();
  return str.length > maxChars ? str.slice(0, maxChars) : str;
}

/** 读取教材 MD 中某章节的行区间原文 */
async function loadChapterText(course, chapter) {
  if (!course.textbookPath || course.textbookPath === "pending") return "";
  const stream = await minioClient.getObject(BUCKET, course.textbookPath.replace(/^\/+/, ""));
  const mdText = await streamToString(stream);
  const lines = mdText.split("\n");
  const start = Math.max(0, (chapter.startline || 1) - 1);
  const end = Math.min(lines.length, chapter.endline || lines.length);
  return lines.slice(start, end).join("\n");
}

/** 读取章节大纲 JSON（失败返回 null，不阻塞） */
async function loadOutline(course, chapter) {
  const cleanRoot = String(chapter.chapterRoot || "").replace(/^\/+/, "");
  if (!cleanRoot) return null;
  const dirName = cleanRoot.split("/").filter(Boolean).pop() || "chapter_01";
  try {
    const stream = await minioClient.getObject(BUCKET, cleanRoot + dirName + ".json");
    return JSON.parse(await streamToString(stream));
  } catch (error) {
    console.warn(TAG + "[loadOutline] 大纲读取失败（不阻塞）: " + error.message);
    return null;
  }
}

/** 提取 PPT 文案首行为标题（去掉"标题：/页面标题：/封面页："等前缀） */
function extractSlideTitle(ppt) {
  const raw = truncate(ppt, 60);
  return raw
    .replace(/^(封面页|页面标题|标题|目录页)[：:]\s*/, "")
    .replace(/^[「『"']/, "")
    .replace(/[」』"']$/, "");
}

/**
 * 加载课程 + 已完成章节（带缓存）
 * @returns {Promise<{ code: number, message?: string, course?: Object, chapters?: Array }>}
 */
async function loadCourseMaterial(courseId, userId) {
  const cacheKey = String(courseId);
  const cached = materialCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { code: 200, course: cached.course, chapters: cached.chapters };
  }

  const courseCheck = await assertCourseOwnership(courseId, userId);
  if (courseCheck.code !== 200) return courseCheck;
  const course = courseCheck.course;

  const chapters = await prisma.chapter.findMany({
    where: {
      courseId: course.id,
      isDeleted: false,
      status: { in: ["completed", "partial_completed"] },
    },
    orderBy: { sequence: "asc" },
  });
  if (chapters.length === 0) {
    return { code: 400, message: "该课程还没有可用的章节内容。" };
  }

  materialCache.set(cacheKey, { course, chapters, ts: Date.now() });
  return { code: 200, course, chapters };
}

// ==================== 复习提纲 ====================

/** 组装复习提纲提示词：按章节提供浓缩原文 */
function buildReviewOutlinePrompt(course, chapters, texts) {
  const lines = [
    "你是「金毛教你学」的复习提纲生成助手。请根据下方教材章节内容，生成一份结构化复习提纲（Markdown 格式），帮助学员考前快速回顾。",
    "",
    "要求：",
    "1. 按章节组织，每章提炼 3-6 个核心知识点；",
    "2. 每个知识点用一句话概括，重要公式/结论/术语加粗；",
    "3. 相邻章节若有联系，用一句话点出；",
    "4. 提纲末尾给出「易错点提醒」3-5 条；",
    "5. 只依据提供的原文内容，不要编造；总长度控制在 800 字以内。",
    "",
    "课程名称：" + (course.name || "未知课程"),
    "",
  ];
  chapters.forEach((ch, i) => {
    lines.push("【第" + ch.sequence + "章】" + ch.name);
    lines.push(texts[i] || "（本章内容不可用）");
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * 生成课程复习提纲
 * @param {string} userId - 用户 ID
 * @param {string} courseId - 课程 ID
 * @returns {Promise<{ code: number, message?: string, data?: Object }>}
 */
async function generateReviewOutline(userId, courseId) {
  const loaded = await loadCourseMaterial(courseId, userId);
  if (loaded.code !== 200) return loaded;
  const { course, chapters } = loaded;

  // 逐章读取原文（每章截断到 2500 字，总上限 12000 字）
  const texts = [];
  let total = 0;
  for (const ch of chapters) {
    let text = "";
    try {
      text = truncate(await loadChapterText(course, ch), 2500);
    } catch (error) {
      console.warn(TAG + "[generateReviewOutline] 章节 " + ch.sequence + " 原文读取失败: " + error.message);
    }
    const remaining = 12000 - total;
    if (remaining <= 0) break;
    text = truncate(text, remaining);
    total += text.length;
    texts.push(text);
  }

  const balanceCheck = await checkCanUseAI(userId);
  if (!balanceCheck.allowed) {
    return { code: 402, message: balanceCheck.reason || "余额不足，请充值后再试。" };
  }

  const result = await llmClient.chat(userId, "review_outline", {
    modelSize: "small",
    messages: [
      { role: "system", content: "你是严谨的课程复习提纲生成助手，输出为 Markdown。" },
      { role: "user", content: buildReviewOutlinePrompt(course, chapters, texts) },
    ],
  });
  if (result.code !== 200) {
    return { code: 500, message: "复习提纲生成失败：" + (result.message || "请稍后再试。") };
  }
  const outline = String(result.message.content || "").trim();
  if (!outline) return { code: 500, message: "复习提纲内容为空，请稍后再试。" };
  return { code: 200, data: { courseId: String(course.id), outline } };
}

// ==================== 章节测验 ====================

/** 组装章节测验提示词（要求返回 JSON） */
function buildChapterQuizPrompt(course, chapter, chapterText, slideTitles) {
  return [
    "根据下面的章节内容，生成 5 道测验题。",
    "",
    "要求：",
    "1. 题型分布：单选 3 道、多选 1 道、判断 1 道；",
    "2. 只返回 JSON，不要输出任何其它文字：",
    '{"questions":[{"type":"SINGLE","content":"题干","options":[{"key":"A","value":"选项"}],"answer":"A","analysis":"解析"}]}',
    "3. type 取值：SINGLE（单选）/ MULTIPLE（多选）/ JUDGE（判断）；",
    "4. SINGLE/MULTIPLE 必须给 4 个选项（A-D）；JUDGE 不给 options，answer 为「正确」或「错误」；",
    "5. 多选 answer 用逗号分隔，如 A,C；每道题必须带 analysis 解析；",
    "6. 题目与答案必须基于原文，不要编造。",
    "",
    "课程：" + course.name,
    "章节：" + chapter.name,
    "本页要点：" + (slideTitles.length > 0 ? slideTitles.join("；") : "（无）"),
    "",
    "【章节原文】",
    chapterText || "（本章内容不可用）",
  ].join("\n");
}

/** 稳健解析 AI 返回的 JSON（兼容 markdown 代码块包裹） */
function parseQuizJson(text) {
  let jsonStr = String(text || "").trim();
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(jsonStr);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const valid = questions.filter((q) => q && q.content && q.answer);
  if (valid.length < 3) throw new Error("题目数量不足或格式不完整");
  return valid.slice(0, 5);
}

/**
 * 生成章节测验题
 * @param {string} userId - 用户 ID
 * @param {string} courseId - 课程 ID
 * @param {string} chapterId - 章节 ID
 * @returns {Promise<{ code: number, message?: string, data?: Object }>}
 */
async function generateChapterQuiz(userId, courseId, chapterId) {
  const courseCheck = await assertCourseOwnership(courseId, userId);
  if (courseCheck.code !== 200) return courseCheck;
  const chapterCheck = await assertChapterBelongsToCourse(courseId, chapterId);
  if (chapterCheck.code !== 200) return chapterCheck;

  let chapterText = "";
  let slideTitles = [];
  try {
    chapterText = truncate(await loadChapterText(courseCheck.course, chapterCheck.chapter), 6000);
  } catch (error) {
    console.warn(TAG + "[generateChapterQuiz] 章节原文读取失败: " + error.message);
  }
  const outline = await loadOutline(courseCheck.course, chapterCheck.chapter);
  slideTitles = (outline?.slides || []).map((s) => extractSlideTitle(s.ppt)).filter(Boolean);

  const balanceCheck = await checkCanUseAI(userId);
  if (!balanceCheck.allowed) {
    return { code: 402, message: balanceCheck.reason || "余额不足，请充值后再试。" };
  }

  const result = await llmClient.chat(userId, "chapter_quiz", {
    modelSize: "small",
    messages: [
      { role: "system", content: "你是课程测验出题助手，只输出 JSON。" },
      { role: "user", content: buildChapterQuizPrompt(courseCheck.course, chapterCheck.chapter, chapterText, slideTitles) },
    ],
    response_format: { type: "json_object" },
  });
  if (result.code !== 200) {
    return { code: 500, message: "章节测验生成失败：" + (result.message || "请稍后再试。") };
  }

  let questions;
  try {
    questions = parseQuizJson(result.message.content);
  } catch (error) {
    console.error(TAG + "[generateChapterQuiz] JSON 解析失败: " + error.message);
    return { code: 500, message: "章节测验生成异常（格式解析失败），请重试。" };
  }

  return {
    code: 200,
    data: {
      courseId: String(courseCheck.course.id),
      chapterId: String(chapterCheck.chapter.id),
      chapterName: chapterCheck.chapter.name,
      questions: questions,
    },
  };
}

// ==================== 思维导图 ====================

/**
 * 获取课程思维导图数据（课程 → 章节 → 每页要点标题）
 * 纯读取，不消耗 AI/余额
 * @param {string} userId - 用户 ID
 * @param {string} courseId - 课程 ID
 * @returns {Promise<{ code: number, message?: string, data?: Object }>}
 */
async function getCourseMindMap(userId, courseId) {
  const loaded = await loadCourseMaterial(courseId, userId);
  if (loaded.code !== 200) return loaded;
  const { course, chapters } = loaded;

  const chapterNodes = [];
  for (const ch of chapters) {
    const outline = await loadOutline(course, ch);
    const slides = (outline?.slides || []).map((s) => ({
      page: s.id,
      title: extractSlideTitle(s.ppt),
    })).filter((s) => s.title);
    chapterNodes.push({
      chapterId: String(ch.id),
      sequence: ch.sequence,
      name: ch.name,
      totalPages: ch.totalPages,
      slides: slides,
    });
  }

  return {
    code: 200,
    data: {
      courseId: String(course.id),
      courseName: course.name,
      chapters: chapterNodes,
    },
  };
}

module.exports = {
  generateReviewOutline,
  generateChapterQuiz,
  getCourseMindMap,
};
