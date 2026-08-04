// ==================== 思维导图生成服务模块 ====================
// 职责：
//   - 读取章节大纲 JSON（MinIO）
//   - 调用 DeepSeek（flash，callTag=mindmap，自动计费）归纳为 Markdown 层级大纲
//   - 组装自包含 markmap HTML 并上传 MinIO（{chapterRoot}MindMap/mindmap.md|mindmap.html）
//   - 维护内存任务表（generating 状态）+ 以 MinIO 文件存在性作为"是否已生成"的持久真相
//
// 状态说明：
//   none       — 未生成（MinIO 无 mindmap.html）
//   generating — 后台生成中（内存任务表）
//   done       — 生成完成（文件已上传，返回 mindmapUrl）
//   failed     — 生成失败（内存任务表记录错误信息，可重试）
//   服务重启后内存任务表清空，未完成的任务回到 none 状态（可接受：用户重新点击生成）

const path = require("path");
const os = require("os");
const fs = require("fs");
const { Client } = require("minio");
const bookRepo = require("../utils/repo/book_repo");
const chapterRepo = require("../utils/repo/chapter_repo");
const llmClient = require("../utils/llm_client");
const uploadMinio = require("../utils/upload_minio");
const prompt = require("../config/prompt.json");
const { assertCourseOwnership, assertChapterBelongsToCourse } = require("./course_ai");

// 日志前缀
const TAG = "[mindmap_service]";

// ==================== MinIO 客户端 ====================
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "..", ".env"),
    override: true,
  });
} catch (e) {
  // dotenv 加载失败不阻塞（config/index.js 已加载）
}

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// ==================== 内存任务表 ====================
// key = "courseId:chapterId" → { status, progressText, error }
const taskMap = new Map();

// ==================== 工具函数 ====================

/** 任务表 key */
function taskKey(courseId, chapterId) {
  return String(courseId) + ":" + String(chapterId);
}

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

/** HTML 转义（标题用） */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 业务错误（携带 HTTP 状态码） */
class MindmapError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ==================== 大纲读取 ====================

/**
 * 从 MinIO 读取章节大纲 JSON
 * 优先使用 chapter.outlinePath，缺失时按 chapterRoot + 目录名兜底（与 slides.js 一致）
 * @param {Object} chapter - 章节对象（含 chapterRoot / outlinePath）
 * @returns {Promise<Object|null>} 解析后的 outline，失败返回 null
 */
async function loadOutlineJson(chapter) {
  const cleanRoot = String(chapter.chapterRoot || "").replace(/^\/+/, "");
  if (!cleanRoot) return null;

  let outlinePath = null;
  if (chapter.outlinePath) {
    outlinePath = String(chapter.outlinePath).replace(/^\/+/, "");
  } else {
    const chapterDirName = cleanRoot.split("/").filter(Boolean).pop() || "chapter_01";
    outlinePath = cleanRoot + chapterDirName + ".json";
  }

  try {
    console.log(TAG + "[loadOutlineJson] 读取大纲: " + outlinePath);
    const stream = await minioClient.getObject(BUCKET, outlinePath);
    const jsonText = await streamToString(stream);
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn(TAG + "[loadOutlineJson] 大纲读取失败（不影响返回 null）: " + error.message);
    return null;
  }
}

// ==================== Prompt 构建与 LLM 调用 ====================

/**
 * 构建思维导图生成 Prompt
 * 每页取 ppt + kbg（截断 200 字）+ zjts（截断 80 字），保证输入可控
 */
function buildMindmapPrompt(course, chapter, outline) {
  const promptText = fs.readFileSync(path.resolve(__dirname, "..", "config", prompt.mindmap_prompt), "utf8");
  const slidesText = (outline.slides || [])
    .map((slide, index) => {
      const ppt = truncate(slide.ppt, 150);
      const kbg = truncate(slide.kbg || slide.script || "", 200);
      const zjts = truncate(slide.zjts, 80);
      return "【第 " + (index + 1) + " 页】\n"
        + "页面内容：" + ppt + "\n"
        + "讲解要点：" + kbg
        + (zjts ? "\n助教提示：" + zjts : "");
    })
    .join("\n\n");

  return promptText
    .replace("{{courseName}}", course.name || "未知课程")
    .replace("{{chapterName}}", chapter.name || "未知章节")
    .replace("{{slidesText}}", slidesText);
}

/**
 * 调用 DeepSeek 生成 Markdown 大纲（flash 模型，callTag=mindmap）
 * 校验输出包含 # 标题，不合规时纠错重试一次
 * @returns {Promise<string>} markdown 大纲文本；失败抛出 MindmapError
 */
async function generateMarkdownOutline(userId, course, chapter, outline) {
  const systemPrompt = buildMindmapPrompt(course, chapter, outline);

  const callOnce = async (extraUserMessage) => {
    const messages = [{ role: "system", content: systemPrompt }];
    if (extraUserMessage) {
      messages.push({ role: "user", content: extraUserMessage });
    }
    return llmClient.chat(userId, "mindmap", {
      modelSize: "small", // flash，控制成本
      messages: messages,
      stream: false,
    });
  };

  const parseMarkdown = (raw) => {
    let md = String(raw || "").trim();
    // 去掉可能的代码块包裹
    md = md.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
    return md;
  };

  const firstResult = await callOnce(null);
  if (firstResult.code !== 200) {
    throw new MindmapError(500, firstResult.message || "DeepSeek 调用失败。");
  }
  let markdown = parseMarkdown(firstResult.message.content);

  // 不合规（无 # 根节点）→ 纠错重试一次
  if (!markdown.includes("#")) {
    console.warn(TAG + " 首次输出缺少 # 根节点，纠错重试一次");
    const retryResult = await callOnce("你上次的输出不是有效的 Markdown 大纲（缺少 # 标题根节点）。请重新输出：以 # 开头作为章节根节点，用 ## / ### / - 组织层级，只输出 Markdown 大纲文本，不要任何解释。");
    if (retryResult.code === 200) {
      markdown = parseMarkdown(retryResult.message.content);
    }
  }

  if (!markdown.includes("#")) {
    throw new MindmapError(502, "AI 返回的内容不是有效的 Markdown 大纲，生成失败。");
  }
  return markdown;
}

// ==================== HTML 组装与上传 ====================

/**
 * 组装自包含 markmap HTML
 * markdown 以 <script type="text/template"> 内嵌，避免 # 标题被当作 HTML 解析
 * 主题处理：内嵌脚本读取 URL 的 ?theme=dark/light（缺省跟随系统偏好），
 * 给 body 添加/移除 markmap-dark class（markmap 官方暗黑变量，节点文字 #eee），
 * 同时覆盖 body 背景色，确保深色模式下节点文本可读
 */
function buildMindmapHtml(markdown, title) {
  const escapedTitle = escapeHtml(title || "思维导图");
  const escapedMarkdown = String(markdown || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const themeScript = [
    "(function () {",
    "  var theme = new URLSearchParams(location.search).get('theme');",
    "  if (theme !== 'dark' && theme !== 'light') {",
    "    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';",
    "  }",
    "  var dark = theme === 'dark';",
    "  document.body.classList.toggle('markmap-dark', dark);",
    "  document.body.style.background = dark ? '#141414' : '#ffffff';",
    "})();",
  ].join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>" + escapedTitle + "</title>",
    "<style>",
    "  html, body { height: 100%; margin: 0; overflow: hidden; background: #ffffff; }",
    "  .markmap { width: 100%; height: 100%; }",
    "</style>",
    "</head>",
    "<body>",
    "<script>" + themeScript + "</script>",
    '<div class="markmap"><script type="text/template">',
    escapedMarkdown,
    "</script></div>",
    '<script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18"></script>',
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * 上传 mindmap.md 与 mindmap.html 到 MinIO（临时文件方式，与 course_pipeline 一致）
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
async function uploadMindmapFiles(chapterRoot, markdown, html) {
  const cleanRoot = String(chapterRoot || "").replace(/^\/+/, "");
  if (!cleanRoot) {
    return { ok: false, message: "章节目录无效。" };
  }

  const base = cleanRoot + "MindMap/";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mindmap-"));
  const mdFile = path.join(tmpDir, "mindmap.md");
  const htmlFile = path.join(tmpDir, "mindmap.html");

  try {
    fs.writeFileSync(mdFile, markdown, "utf8");
    fs.writeFileSync(htmlFile, html, "utf8");

    const mdResult = await uploadMinio.upload(mdFile, base + "mindmap.md");
    if (mdResult.code !== 200) {
      return { ok: false, message: mdResult.message || "思维导图数据上传失败。" };
    }
    const htmlResult = await uploadMinio.upload(htmlFile, base + "mindmap.html");
    if (htmlResult.code !== 200) {
      return { ok: false, message: htmlResult.message || "思维导图文件上传失败。" };
    }
    console.log(TAG + "[uploadMindmapFiles] 上传成功: " + base + "mindmap.md / mindmap.html");
    return { ok: true };
  } catch (error) {
    console.error(TAG + "[uploadMindmapFiles] 上传异常: " + error.message);
    return { ok: false, message: "思维导图文件上传失败：" + error.message };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ==================== 任务编排 ====================

/**
 * 是否正在生成中（供路由防重复触发）
 */
function isGenerating(courseId, chapterId) {
  const task = taskMap.get(taskKey(courseId, chapterId));
  return !!(task && task.status === "generating");
}

/**
 * 异步生成思维导图（不抛出异常，始终返回 { code, message }）
 * 流程：权限校验 → 读大纲 → DeepSeek 归纳 Markdown → 组装 HTML → 上传 MinIO → 更新任务状态
 */
async function generateMindmap(userId, courseId, chapterId) {
  const key = taskKey(courseId, chapterId);
  const setTask = (status, progressText, error) => {
    taskMap.set(key, { status, progressText, error: error || "" });
  };

  setTask("generating", "正在检查章节大纲...");
  console.log(TAG + "[generateMindmap] 开始生成，courseId: " + courseId + "，chapterId: " + chapterId);

  try {
    // ========== 1. 权限校验 ==========
    const courseCheck = await assertCourseOwnership(courseId, userId);
    if (courseCheck.code !== 200) throw new MindmapError(courseCheck.code, courseCheck.message);
    const chapterCheck = await assertChapterBelongsToCourse(courseId, chapterId);
    if (chapterCheck.code !== 200) throw new MindmapError(chapterCheck.code, chapterCheck.message);
    const course = courseCheck.course;
    const chapter = chapterCheck.chapter;

    // ========== 2. 读取章节大纲 ==========
    setTask("generating", "正在读取章节大纲...");
    const outline = await loadOutlineJson(chapter);
    if (!outline || !Array.isArray(outline.slides) || outline.slides.length === 0) {
      throw new MindmapError(400, "章节大纲不存在或为空，无法生成思维导图。");
    }

    // ========== 3. DeepSeek 归纳 Markdown 大纲 ==========
    setTask("generating", "AI 正在归纳章节知识结构...");
    const markdown = await generateMarkdownOutline(userId, course, chapter, outline);

    // ========== 4. 组装 HTML 并上传 MinIO ==========
    setTask("generating", "正在生成思维导图文件...");
    const html = buildMindmapHtml(markdown, chapter.name);
    const uploadResult = await uploadMindmapFiles(chapter.chapterRoot, markdown, html);
    if (!uploadResult.ok) {
      throw new MindmapError(500, uploadResult.message || "思维导图文件上传失败。");
    }

    setTask("done", "生成完成");
    console.log(TAG + "[generateMindmap] 生成完成，courseId: " + courseId + "，chapterId: " + chapterId);
    return { code: 200, message: "生成完成" };
  } catch (error) {
    const status = error instanceof MindmapError ? error.status : 500;
    const message = error.message || "思维导图生成失败。";
    console.error(TAG + "[generateMindmap] 生成失败（code=" + status + "）: " + message);
    setTask("failed", "生成失败", message);
    return { code: status, message: message };
  }
}

/**
 * 查询思维导图状态
 * 内存任务表优先；done/none 均以 MinIO 文件存在性为准（服务重启后任务表丢失也能正确判断）
 * @returns {Promise<{ status: string, progressText?: string, error?: string, mindmapUrl?: string }>}
 */
async function getMindmapStatus(courseId, chapterId) {
  const key = taskKey(courseId, chapterId);
  const task = taskMap.get(key);

  // 生成中：直接返回任务进度
  if (task && task.status === "generating") {
    return { status: "generating", progressText: task.progressText || "正在生成..." };
  }

  // 失败：返回错误信息（可重试）
  if (task && task.status === "failed") {
    return { status: "failed", error: task.error || "思维导图生成失败。" };
  }

  // done 或 无任务：以 MinIO 文件存在性为准
  const chapterResult = await chapterRepo.getChapterById(chapterId);
  if (chapterResult.code !== 200) {
    return { status: "failed", error: "章节不存在。" };
  }
  const cleanRoot = String(chapterResult.chapter.chapterRoot || "").replace(/^\/+/, "");
  const htmlPath = cleanRoot ? cleanRoot + "MindMap/mindmap.html" : "";

  if (!htmlPath) {
    return { status: "none" };
  }

  try {
    await minioClient.statObject(BUCKET, htmlPath);
    // 任务表存在 done 记录时同步清空（文件已确认为真相）
    if (task && task.status === "done") {
      taskMap.delete(key);
    }
    return {
      status: "done",
      mindmapUrl: "/api/v1/files/" + htmlPath,
    };
  } catch (error) {
    // 文件不存在 → 未生成；若任务表残留 done 记录（文件被删除）则清除
    if (task) taskMap.delete(key);
    return { status: "none" };
  }
}

// ==================== 模块导出 ====================
module.exports = {
  MindmapError,
  generateMindmap,
  getMindmapStatus,
  isGenerating,
  buildMindmapHtml,
};
