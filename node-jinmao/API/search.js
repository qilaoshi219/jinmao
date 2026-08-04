// ==================== 教材全文检索路由模块 ====================
// 职责：搜索用户教材内容（章节原文 + 大纲页要点），返回命中课程/章节/页码/上下文片段
// 端点：
//   GET /api/v1/courses/search?keyword= — 全文检索（需 Token）
// 实现：懒加载 MinIO 章节原文并内存缓存（10 分钟 TTL），无需额外建索引表

const express = require("express");
const router = express.Router();
const Minio = require("minio");
const prisma = require("../utils/prisma");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_search]";

// ==================== MinIO 客户端与缓存 ====================
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
const BUCKET = process.env.MINIO_BUCKET || "jinmao";
const CACHE_TTL_MS = 10 * 60 * 1000;
const textCache = new Map(); // key: courseId:chapterId → { text, ts }
const outlineCache = new Map(); // key: courseId:chapterId → { outline, ts }

// 搜索上限
const MAX_COURSES = 20;
const MAX_CHAPTERS = 50;
const MAX_SNIPPETS_PER_CHAPTER = 3;
const SNIPPET_RADIUS = 40; // 命中行前后各取字符数

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

function getCached(key, cache) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  return null;
}

/** 读取章节原文（教材 MD 行区间），带缓存 */
async function loadChapterText(course, chapter) {
  const key = String(course.id) + ":" + String(chapter.id);
  const cached = getCached(key, textCache);
  if (cached !== null) return cached;
  let text = "";
  if (course.textbookPath && course.textbookPath !== "pending") {
    try {
      const stream = await minioClient.getObject(BUCKET, course.textbookPath.replace(/^\/+/, ""));
      const md = await streamToString(stream);
      const lines = md.split("\n");
      const start = Math.max(0, (chapter.startline || 1) - 1);
      const end = Math.min(lines.length, chapter.endline || lines.length);
      text = lines.slice(start, end).join("\n").slice(0, 60000);
    } catch (error) {
      console.warn(TAG + "[loadChapterText] 章节 " + chapter.sequence + " 读取失败: " + error.message);
    }
  }
  textCache.set(key, { value: text, ts: Date.now() });
  return text;
}

/** 读取大纲并提取页要点文本（用于定位页码），带缓存 */
async function loadOutlinePages(course, chapter) {
  const key = String(course.id) + ":" + String(chapter.id);
  const cached = getCached(key, outlineCache);
  if (cached !== null) return cached;
  let pages = [];
  const cleanRoot = String(chapter.chapterRoot || "").replace(/^\/+/, "");
  if (cleanRoot) {
    try {
      const dirName = cleanRoot.split("/").filter(Boolean).pop() || "chapter_01";
      const stream = await minioClient.getObject(BUCKET, cleanRoot + dirName + ".json");
      const outline = JSON.parse(await streamToString(stream));
      pages = (outline.slides || []).map((s) => ({
        page: (s.id || 0) + 1, // 大纲 slide id 为 0 基，页面展示为 1 基
        text: String(s.ppt || "") + " " + String(s.kbg || "") + " " + String(s.zjts || ""),
      }));
    } catch (error) {
      console.warn(TAG + "[loadOutlinePages] 大纲读取失败: " + error.message);
    }
  }
  outlineCache.set(key, { value: pages, ts: Date.now() });
  return pages;
}

/** 在原文中定位关键词所在行，生成上下文片段 */
function findSnippets(text, keyword) {
  const lines = String(text || "").split("\n");
  const results = [];
  for (let i = 0; i < lines.length && results.length < MAX_SNIPPETS_PER_CHAPTER; i++) {
    const line = lines[i];
    if (line.includes(keyword)) {
      const from = Math.max(0, line.indexOf(keyword) - SNIPPET_RADIUS);
      const to = Math.min(line.length, line.indexOf(keyword) + keyword.length + SNIPPET_RADIUS);
      const prefix = from > 0 ? "…" : "";
      const suffix = to < line.length ? "…" : "";
      results.push({
        lineNumber: i + 1,
        snippet: prefix + line.slice(from, to).trim() + suffix,
      });
    }
  }
  return results;
}

/** 在页要点中定位关键词所在页 */
function findPage(pages, keyword) {
  for (const p of pages) {
    if (p.text.includes(keyword)) return p.page;
  }
  return null;
}

/**
 * @openapi
 * /api/v1/courses/search:
 *   get:
 *     tags: [课程学习]
 *     summary: 教材全文检索
 *     description: 在用户已完成课程的章节原文与大纲页要点中搜索关键词，返回命中课程/章节/页码/上下文片段。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         required: true
 *         schema: { type: string }
 *         description: 搜索关键词（1-50 字）
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: "ok" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     keyword: { type: string }
 *                     total: { type: integer }
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           courseId: { type: string }
 *                           courseName: { type: string }
 *                           chapterId: { type: string }
 *                           chapterName: { type: string }
 *                           page: { type: integer }
 *                           snippets:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 lineNumber: { type: integer }
 *                                 snippet: { type: string }
 *       400:
 *         description: 关键词不合法
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/search", authenticateToken, async (req, res) => {
  const keyword = String(req.query.keyword || "").trim();
  console.log(TAG + "[GET search] 收到请求，userId: " + req.userId + "，keyword: " + keyword);

  if (!keyword) {
    return res.status(400).json({ code: 400, message: "搜索关键词不能为空。", data: null });
  }
  if (keyword.length > 50) {
    return res.status(400).json({ code: 400, message: "搜索关键词过长（最多 50 字）。", data: null });
  }

  try {
    const uid = BigInt(req.userId);
    const courses = await prisma.course.findMany({
      where: {
        userId: uid,
        isDeleted: false,
        pipelineStatus: { in: ["completed", "partial_completed"] },
        textbookPath: { not: "pending" },
      },
      orderBy: { updateTime: "desc" },
      take: MAX_COURSES,
      select: { id: true, name: true, textbookPath: true },
    });

    const results = [];
    for (const course of courses) {
      const chapters = await prisma.chapter.findMany({
        where: { courseId: course.id, isDeleted: false, status: { in: ["completed", "partial_completed"] } },
        orderBy: { sequence: "asc" },
        take: MAX_CHAPTERS,
        select: { id: true, name: true, sequence: true, chapterRoot: true, startline: true, endline: true },
      });
      for (const chapter of chapters) {
        const [text, pages] = await Promise.all([
          loadChapterText(course, chapter),
          loadOutlinePages(course, chapter),
        ]);
        const snippets = findSnippets(text, keyword);
        if (snippets.length === 0) continue;
        results.push({
          courseId: String(course.id),
          courseName: course.name,
          chapterId: String(chapter.id),
          chapterName: chapter.name,
          page: findPage(pages, keyword),
          snippets,
        });
      }
      if (results.length >= 50) break;
    }

    console.log(TAG + "[GET search] 命中 " + results.length + " 条");
    return res.json({ code: 200, message: "ok", data: { keyword, total: results.length, results } });
  } catch (error) {
    console.error(TAG + "[GET search] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "全文检索失败: " + error.message });
  }
});

module.exports = router;
