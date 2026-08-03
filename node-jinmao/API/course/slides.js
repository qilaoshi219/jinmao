// ==================== 章节幻灯片路由模块 ====================
// 职责：根据课程 ID 和章节 ID，返回章节下所有幻灯片的代理访问 URL + 口播稿 + 助教提示
// 端点：GET /api/v1/courses/:courseId/chapters/:chapterId/slides
// 鉴权：需 Bearer Token（authenticateToken 中间件）
//
// 返回数据结构：
//   slides[]: { pageNumber, pptUrl, audioUrl, srtUrl, script, zjts }
//     - pptUrl:  PPT HTML 文件的代理访问 URL（/api/v1/files/...）
//     - audioUrl: MP3 音频文件的代理访问 URL（/api/v1/files/...）
//     - srtUrl:   SRT 字幕文件的代理访问 URL（/api/v1/files/...）
//     - script:   口播稿文本（从大纲 JSON 提取）
//     - zjts:     助教提示文本（从大纲 JSON 提取）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const path = require("path"); // 路径处理

// 导入 JWT 鉴权中间件（路径从 API/course/slides.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");
// 导入 Repository 层：章节数据库操作
const chapterRepo = require("../../utils/repo/chapter_repo");
// 导入 Repository 层：课程数据库操作（用于权限校验）
const bookRepo = require("../../utils/repo/book_repo");

// 日志前缀
const TAG = "[API_course_slides]";

// ==================== 文件补全导入（用于已有章节的完整性自动检测） ====================
const { fixMissingFilesForChapter } = require("../../service/course_pipeline");

// ==================== 已检查章节集合（防止重复检测，服务重启后重置） ====================
// key = chapterId（字符串），value = true
// 每个章节在服务生命周期内只触发一次完整性检测
const checkedChapters = new Set();

// ==================== MinIO 客户端初始化 ====================
// 从环境变量读取 MinIO 连接配置，用于读取大纲 JSON 文件
const { Client } = require("minio");

// 加载 dotenv，确保能读取 .env 中的 MinIO 配置
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "..", "..", ".env"),
    override: true,
  });
} catch (e) {
  // dotenv 加载失败不阻塞
}

// MinIO 客户端实例
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// MinIO Bucket 名称
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// ==================== 辅助函数 ====================

/**
 * 数字补零为两位数
 * 如 pad(3) → "03"，用于构造文件名中的页码
 * @param {number} n - 待格式化的数字
 * @returns {string} 补零后的两位字符串
 */
function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * 将 MinIO 流转换为字符串
 * @param {ReadableStream} stream - MinIO getObject 返回的可读流
 * @returns {Promise<string>} 流的完整内容
 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

/**
 * 从 MinIO 读取大纲 JSON 文件并解析
 * @param {string} outlinePath - 大纲 JSON 在 MinIO 中的路径（如 "usercourse/1/2/chapter_01/chapter_01.json"）
 * @returns {Promise<Object|null>} 解析后的 JSON 对象，失败返回 null
 */
async function loadOutlineJson(outlinePath) {
  try {
    console.log(TAG + "[loadOutlineJson] 读取大纲: " + outlinePath);
    const stream = await minioClient.getObject(BUCKET, outlinePath);
    const jsonText = await streamToString(stream);
    const outline = JSON.parse(jsonText);
    console.log(TAG + "[loadOutlineJson] 大纲解析成功，slides 数量: " + (outline?.slides?.length || 0));
    return outline;
  } catch (error) {
    // 文件不存在或解析失败，返回 null（不阻塞主流程）
    console.warn(TAG + "[loadOutlineJson] 大纲读取失败: " + error.message);
    return null;
  }
}

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/slides:
 *   get:
 *     tags: [课程学习]
 *     summary: 获取章节幻灯片数据
 *     description: 根据课程 ID 和章节 ID，返回该章节下所有幻灯片的 PPT/音频/字幕代理访问 URL，以及口播稿和助教提示。仅允许课程所有者查看。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 课程 ID（纯数字）
 *       - name: chapterId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 章节 ID（纯数字）
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "查询成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     chapter:
 *                       type: object
 *                       properties:
 *                         id: { type: string, example: "1" }
 *                         courseId: { type: string, example: "1" }
 *                         sequence: { type: integer, example: 1 }
 *                         name: { type: string, example: "第一章 导数与微分" }
 *                         chapterRoot: { type: string, example: "/usercourse/1/2/chapter_01/" }
 *                         totalPages: { type: integer, example: 25 }
 *                         status: { type: string, example: "completed" }
 *                     slides:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           pageNumber: { type: integer, example: 1, description: "幻灯片页码（1-based）" }
 *                           pptUrl: { type: string, example: "/api/v1/files/usercourse/1/2/chapter_01/PPT/slide_01.html", description: "PPT HTML 代理访问 URL" }
 *                           audioUrl: { type: string, example: "/api/v1/files/usercourse/1/2/chapter_01/Audio/slide_01.mp3", description: "音频代理访问 URL" }
 *                           srtUrl: { type: string, example: "/api/v1/files/usercourse/1/2/chapter_01/SRT/slide_01.srt", description: "字幕代理访问 URL" }
 *                           script: { type: string, example: "各位学员大家好，欢迎来到...", description: "口播稿文本" }
 *                           zjts: { type: string, example: "同学们好呀📢！这一页提纲挈领...", description: "助教提示文本" }
 *       400:
 *         description: 课程 ID 或章节 ID 格式无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "课程 ID 格式无效，必须为纯数字。" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
 *       403:
 *         description: 无权访问（课程不属于当前用户）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权访问该课程。" }
 *       404:
 *         description: 课程或章节不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "章节不存在。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误，请稍后再试。" }
 */

/**
 * GET /api/v1/courses/:courseId/chapters/:chapterId/slides — 获取章节幻灯片数据
 */
router.get("/courses/:courseId/chapters/:chapterId/slides", authenticateToken, async (req, res) => {
  const { courseId, chapterId } = req.params; // 从 URL 路径参数提取课程 ID 和章节 ID
  console.log(TAG + "[GET] 收到章节幻灯片请求，courseId: " + courseId + "，chapterId: " + chapterId + "，userId: " + req.userId);

  try {
    // ========== 1. 参数校验：ID 必须为有效数字字符串 ==========
    const parsedCourseId = parseInt(courseId, 10);
    if (isNaN(parsedCourseId) || String(parsedCourseId) !== courseId) {
      console.log(TAG + "[GET] 无效的课程 ID 格式: " + courseId);
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    }

    const parsedChapterId = parseInt(chapterId, 10);
    if (isNaN(parsedChapterId) || String(parsedChapterId) !== chapterId) {
      console.log(TAG + "[GET] 无效的章节 ID 格式: " + chapterId);
      return res.status(400).json({ code: 400, message: "章节 ID 格式无效，必须为纯数字。", data: null });
    }

    // ========== 2. 权限校验：查询课程，确认属于当前用户 ==========
    const courseResult = await bookRepo.getCourseById(courseId);
    if (courseResult.code === 404) {
      console.log(TAG + "[GET] 课程不存在，courseId: " + courseId);
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    if (courseResult.code !== 200) {
      console.log(TAG + "[GET] 课程查询失败: " + courseResult.message);
      return res.status(500).json({ code: 500, message: courseResult.message || "课程查询失败。", data: null });
    }

    // 校验所有权（BigInt 需转为字符串再比较）
    if (String(courseResult.course.userId) !== String(req.userId)) {
      console.log(TAG + "[GET] 越权访问：课程 userId=" + courseResult.course.userId + "，请求 userId=" + req.userId);
      return res.status(403).json({ code: 403, message: "无权访问该课程。", data: null });
    }

    // ========== 3. 查询章节信息 ==========
    const chapterResult = await chapterRepo.getChapterById(chapterId);
    if (chapterResult.code === 404) {
      console.log(TAG + "[GET] 章节不存在，chapterId: " + chapterId);
      return res.status(404).json({ code: 404, message: "章节不存在。", data: null });
    }
    if (chapterResult.code !== 200) {
      console.log(TAG + "[GET] 章节查询失败: " + chapterResult.message);
      return res.status(500).json({ code: 500, message: chapterResult.message || "章节查询失败。", data: null });
    }

    // 验证章节属于该课程
    const chapter = chapterResult.chapter;
    if (String(chapter.courseId) !== String(courseId)) {
      console.log(TAG + "[GET] 章节不属于该课程，chapter.courseId=" + chapter.courseId + "，请求 courseId=" + courseId);
      return res.status(400).json({ code: 400, message: "该章节不属于指定课程。", data: null });
    }

    // ========== 4. 构造幻灯片数据列表 ==========
    const chapterRoot = chapter.chapterRoot; // MinIO 章节根目录，如 /usercourse/1/2/chapter_01/
    const totalPages = chapter.totalPages || 0; // 幻灯片总页数

    console.log(TAG + "[GET] 章节: " + chapter.name + "，chapterRoot: " + chapterRoot + "，totalPages: " + totalPages);

    // 去掉 chapterRoot 开头的 /
    const cleanRoot = chapterRoot.replace(/^\/+/, ""); // "usercourse/1/2/chapter_01/"

    // ========== 4.1 从 MinIO 读取大纲 JSON，提取 script 和 zjts ==========
    // 大纲 JSON 路径：{chapterRoot}{目录名}.json（如 chapter_02/chapter_02.json）
    // 目录名格式：chapter_01、chapter_02 等
    // 注意：chapterRoot 末尾带斜杠，split("/").pop() 会得到空字符串，需过滤空段
    const chapterDirName = cleanRoot.split("/").filter(Boolean).pop() || "chapter_01"; // "chapter_02"
    const outlinePath = cleanRoot + chapterDirName + ".json"; // "usercourse/1/2/chapter_02/chapter_02.json"
    const outlineData = await loadOutlineJson(outlinePath);

    // ========== 4.2 遍历每一页，构造幻灯片数据 ==========
    const slides = [];

    for (let page = 1; page <= totalPages; page++) {
      const pageStr = pad(page); // 补零：1 → "01"

      // 从大纲 JSON 中提取该页的 script 和 zjts（大纲中 id 从 0 开始）
      const slideOutline = outlineData?.slides?.[page - 1] || {};
      const script = slideOutline.script || slideOutline.kbg || ""; // 口播稿（优先 script，兼容 kbg）
      const zjts = slideOutline.zjts || ""; // 助教提示

      slides.push({
        pageNumber: page,
        pptUrl: "/api/v1/files/" + cleanRoot + "PPT/slide_" + pageStr + ".html",
        audioUrl: "/api/v1/files/" + cleanRoot + "Audio/slide_" + pageStr + ".mp3",
        srtUrl: "/api/v1/files/" + cleanRoot + "SRT/slide_" + pageStr + ".srt",
        script: script, // 口播稿
        zjts: zjts,     // 助教提示
      });
    }

    console.log(TAG + "[GET] 生成 " + slides.length + " 个幻灯片数据（含口播稿和助教提示）");

    // ========== 4.3 已有章节的完整性自动检测（异步，不阻塞响应） ==========
    // 仅对 partial_completed 状态的章节，首次访问时自动检测文件完整性
    // completed 章节表示文件已完整，无需检测
    // 如有缺失文件，后台触发补全，无需用户手动调用 fix-missing API
    let effectiveStatus = chapter.status; // 实际返回给前端的章节状态
    let isFixingMissing = false;          // 是否正在触发补全（前端据此显示横幅+轮询）
    if (chapter.status === "partial_completed"
        && !checkedChapters.has(String(chapterId))) {
      checkedChapters.add(String(chapterId)); // 标记已检查（防止重复触发）
      console.log(TAG + "[GET] 章节状态为 partial_completed，首次访问触发完整性检测（异步）");
      isFixingMissing = true;
      // 不 await，异步后台执行（文件检测+补全在后台进行）
      fixMissingFilesForChapter(courseId, chapterId).catch(err => {
        console.error(TAG + "[GET] 完整性检测/补全启动失败: " + err.message);
      });
    }

    // ========== 5. 返回成功响应 ==========
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        chapter: {
          id: String(chapter.id),
          courseId: String(chapter.courseId),
          sequence: chapter.sequence,
          name: chapter.name,
          chapterRoot: chapter.chapterRoot,
          totalPages: chapter.totalPages,
          status: effectiveStatus,          // 补全中时为 partial_completed
          isFixingMissing: isFixingMissing, // 前端据此显示横幅+启动轮询
        },
        slides: slides,
      },
    });

  } catch (error) {
    // 捕获未预期的异常
    console.error(TAG + "[GET] 处理异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

// 导出路由实例，供 index.js 合并
module.exports = router;
