// ==================== 教材详情路由模块 ====================
// 职责：提供教材详情查询功能（含完整章节列表+所有者权限校验）
// 端点：GET /api/v1/books/:id
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const fs = require("fs");          // 文件系统：读取临时 MD 文件计算行数
const os = require("os");          // 操作系统：获取临时目录路径
const path = require("path");      // 路径处理：拼接临时文件路径

// 导入 JWT 鉴权中间件（路径从 API/book/detail.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");
// 导入 Repository 层：教材数据库操作
const bookRepo = require("../../utils/repo/book_repo");

// 导入统一判断函数：是否可以生成下一章
const { computeCanGenerateNext } = require("../../utils/can_generate_next");

// MinIO 客户端（延迟初始化，仅在需要补填 maxline 时创建）
const Minio = require("minio");
let _minioClient = null;
function getMinioClient() {
  if (!_minioClient) {
    _minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
      port: parseInt(process.env.MINIO_PORT) || 9000,
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }
  return _minioClient;
}
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// 日志前缀
const TAG = "[API_book_detail]";

// ==================== 辅助函数 ====================

/**
 * 懒加载补填 maxline：当课程 maxline=0 且 textbookPath 有效时，
 * 从 MinIO 下载 MD 文件计算总行数并写入数据库。
 * 采用 fire-and-forget 模式，不阻塞 API 响应。
 *
 * @param {Object} course - 课程对象（含 id、maxline、textbookPath）
 */
function lazyFillMaxline(course) {
  // 仅当 maxline 未设置且 textbookPath 有效时才执行
  if (!course || (course.maxline && course.maxline > 0)) return;
  if (!course.textbookPath || course.textbookPath === "pending") return;

  const courseId = String(course.id);
  console.log(TAG + " [lazyFillMaxline] 课程 " + courseId + " maxline=0，异步补填中...");

  // 异步执行，不阻塞主流程
  (async () => {
    try {
      const minioClient = getMinioClient();
      const tmpPath = path.join(os.tmpdir(), "jinmao-maxline-" + courseId + ".md");

      // 从 MinIO 下载 MD 文件到临时目录
      await minioClient.fGetObject(BUCKET, course.textbookPath, tmpPath);

      // 计算总行数
      const content = fs.readFileSync(tmpPath, "utf8");
      const maxline = content.split("\n").length;

      // 写入数据库
      const result = await bookRepo.updateMaxline(courseId, maxline);
      if (result.code === 200) {
        console.log(TAG + " [lazyFillMaxline] 课程 " + courseId + " maxline 补填成功: " + maxline);
        // 同步更新内存中的 course 对象，使本次响应中 canGenerateNext 计算正确
        course.maxline = maxline;
      }

      // 清理临时文件
      try { fs.unlinkSync(tmpPath); } catch (_) { /* 忽略清理错误 */ }
    } catch (err) {
      console.warn(TAG + " [lazyFillMaxline] 课程 " + courseId + " maxline 补填失败: " + err.message);
    }
  })();
}

/**
 * 安全的 JSON 解析，解析失败时返回 null
 * @param {string} str - 待解析的 JSON 字符串
 * @returns {Object|null} 解析结果或 null
 */
function safeJsonParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books/{id}:
 *   get:
 *     tags: [教材]
 *     summary: 获取教材详情
 *     description: 根据教材 ID 获取教材的完整详细信息，包含所有章节列表。仅允许教材所有者查看。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID（纯数字）
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
 *                     id: { type: string, example: "1", description: "教材 ID（BigInt 转 String）" }
 *                     userId: { type: string, example: "1", description: "用户 ID" }
 *                     name: { type: string, example: "职称考试知识点", description: "教材名称" }
 *                     subtitle: { type: string, nullable: true, example: "从零开始掌握核心知识点", description: "教材副标题（AI 生成）" }
 *                     description: { type: string, nullable: true, example: null, description: "教材描述" }
 *                     textbookFilename: { type: string, example: "2025年度职称考试部分主要知识点.md", description: "教材原文件名" }
 *                     textbookPath: { type: string, example: "/usercourse/1/2/教材.md", description: "归一化 MD 在 MinIO 路径" }
 *                     sourcePath: { type: string, example: "/usercourse/1/2/教材.pdf", description: "源文件在 MinIO 路径" }
 *                     coverPath: { type: string, nullable: true, example: null, description: "封面图 MinIO 路径" }
 *                     coverUrl: { type: string, nullable: true, example: "/api/v1/files/usercourse/1/2/cover.png", description: "封面图代理访问 URL（通过后端代理访问 MinIO，无需暴露 MinIO 服务）" }
 *                     elaborationEnabled: { type: boolean, example: true, description: "是否开启文本细化" }
 *                     endline: { type: integer, example: 0, description: "当前已处理到的行号" }
 *                     pipelineStatus: { type: string, example: "processing", description: "流水线状态" }
 *                     createTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "创建时间" }
 *                     updateTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "更新时间" }
 *                     chapters:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, example: "1", description: "章节 ID" }
 *                           courseId: { type: string, example: "1", description: "所属课程 ID" }
 *                           sequence: { type: integer, example: 1, description: "章节序号" }
 *                           name: { type: string, example: "第一章 导数与微分", description: "章节名称" }
 *                           description: { type: string, nullable: true, example: null, description: "章节描述" }
 *                           chapterRoot: { type: string, example: "/usercourse/1/2/chapter_01/", description: "MinIO 章节根目录" }
 *                           startline: { type: integer, example: 1, description: "本章起始行号" }
 *                           endline: { type: integer, example: 50, description: "本章结束行号" }
 *                           totalPages: { type: integer, example: 25, description: "PPT 总页数" }
 *                           outlinePath: { type: string, nullable: true, example: "/usercourse/.../chapter_01.json", description: "大纲 JSON 路径" }
 *                           status: { type: string, example: "completed", description: "章节状态" }
 *                           createTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "创建时间" }
 *                           updateTime: { type: string, format: date-time, example: "2026-07-05T08:50:50.764Z", description: "更新时间" }
 *       400:
 *         description: 教材 ID 格式无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "教材 ID 格式无效，必须为纯数字。" }
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
 *         description: 无权访问（教材不属于当前用户）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权访问该教材。" }
 *       404:
 *         description: 教材不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "教材不存在。" }
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
 * GET /api/v1/books/:id — 获取教材详情（含章节列表+权限校验）
 */
router.get("/books/:id", authenticateToken, async (req, res) => {
  const bookId = req.params.id; // 从 URL 路径参数提取教材 ID
  console.log(TAG + "[GET /books/:id] 收到教材详情请求，bookId: " + bookId + "，userId: " + req.userId);

  try {
    // ========== 1. 参数校验：ID 必须为有效数字字符串 ==========
    // parseInt 将字符串转为整数，再转回字符串比较，确保输入是纯数字
    const parsedId = parseInt(bookId, 10);
    if (isNaN(parsedId) || String(parsedId) !== bookId) {
      console.log(TAG + "[GET /books/:id] 无效的教材 ID 格式: " + bookId);
      return res.status(400).json({
        code: 400,
        message: "教材 ID 格式无效，必须为纯数字。",
        data: null,
      });
    }

    // ========== 2. 调用 Repository 层查询教材详情（含章节列表） ==========
    const result = await bookRepo.getCourseById(bookId);

    // 教材不存在
    if (result.code === 404) {
      console.log(TAG + "[GET /books/:id] 教材不存在，bookId: " + bookId);
      return res.status(404).json({
        code: 404,
        message: "教材不存在。",
        data: null,
      });
    }

    // 其他数据库异常
    if (result.code !== 200) {
      console.log(TAG + "[GET /books/:id] 查询失败: " + result.message);
      return res.status(500).json({
        code: 500,
        message: result.message || "查询教材详情失败。",
        data: null,
      });
    }

    const course = result.course; // 提取课程对象

    // ========== 3. 权限校验：确保教材属于当前用户 ==========
    // BigInt 需转为字符串再比较，防止类型不匹配
    if (String(course.userId) !== String(req.userId)) {
      console.log(TAG + "[GET /books/:id] 越权访问：课程 userId=" + course.userId +
        "，请求 userId=" + req.userId);
      return res.status(403).json({
        code: 403,
        message: "无权访问该教材。",
        data: null,
      });
    }

    // ========== 3.5 懒加载补填 maxline（旧课程兼容，fire-and-forget 不阻塞响应） ==========
    lazyFillMaxline(course);

    // ========== 4. 数据转换：BigInt → String ==========
    // 将课程和章节中的 BigInt 字段转为字符串
    const chapters = (course.chapters || []).map((ch) => ({
      id: String(ch.id), // BigInt → String
      courseId: String(ch.courseId), // BigInt → String
      sequence: ch.sequence,
      name: ch.name,
      description: ch.description || null,
      chapterRoot: ch.chapterRoot,
      startline: ch.startline,
      endline: ch.endline,
      totalPages: ch.totalPages,
      outlinePath: ch.outlinePath || null,
      status: ch.status,
      generationProgress: ch.generationProgress ? safeJsonParse(ch.generationProgress) : null, // 章节生成进度（仅供 generating 状态有值）
      createTime: ch.createTime,
      updateTime: ch.updateTime,
    }));

    // 构建课程级响应数据
    const courseData = {
      id: String(course.id), // BigInt → String
      userId: String(course.userId), // BigInt → String
      name: course.name,
      subtitle: course.subtitle || null, // 教材副标题（AI 生成）
      description: course.description || null,
      textbookFilename: course.textbookFilename,
      textbookPath: course.textbookPath,
      sourcePath: course.sourcePath,
      coverPath: course.coverPath || null,
      coverUrl: course.coverPath ? "/api/v1/files" + course.coverPath : null, // 【新增】封面图代理访问 URL
      elaborationEnabled: course.elaborationEnabled,
      endline: course.endline,
      maxline: course.maxline,  // 【新增】MD 文件总行数（用于权威判断教材是否已全部生成完毕）
      pipelineStatus: course.pipelineStatus,
      pipelineProgress: course.pipelineProgress ? safeJsonParse(course.pipelineProgress) : null, // 流水线进度（含 isLastChapter 标记）
      canGenerateNext: computeCanGenerateNext(course, chapters).can, // 后端统一计算：是否可以生成下一章
      createTime: course.createTime,
      updateTime: course.updateTime,
      chapters: chapters, // 完整章节列表
    };

    console.log(TAG + "[GET /books/:id] 查询成功，章节数: " + chapters.length);

    // ========== 5. 返回成功响应 ==========
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: courseData,
    });

  } catch (error) {
    // 捕获未预期的异常
    console.error(TAG + "[GET /books/:id] 处理异常: " + error.message);
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
