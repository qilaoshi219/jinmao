// 本文件因包含大量 OpenAPI JSDoc 注释（每个端点约40行），且上传/状态查询/进度查询
// 三个端点高度相关不宜拆分，特批允许超过 300 行限制
// ==================== 教材路由模块（上传 + 状态查询 + 进度查询） ====================
// 职责：收发 HTTP 请求/响应，调用 Service 层执行业务逻辑
// 使用 Express Router 管理路由，挂载到 /api/v1 前缀下
// 端点列表：
//   POST /api/v1/book/upload           — 上传教材文件
//   GET  /api/v1/book/:book_id/status  — 查询教材处理状态
//   GET  /api/v1/book/:book_id/progress — 查询教材生成详细进度

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const multer = require("multer"); // multipart/form-data 文件上传处理
const os = require("os"); // 操作系统工具，用于获取临时目录
const path = require("path"); // 路径工具，用于解析文件扩展名

// 导入 Service 层：教材上传核心业务逻辑
const { uploadBook } = require("../service/POSTbook");
// 导入 Repository 层：教材数据库操作
const bookRepo = require("../utils/repo/book_repo");
// 导入 JWT 鉴权中间件
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_POSTbook]";

// ==================== Multer 文件上传配置 ====================

// 允许上传的教材文件扩展名白名单
const ALLOWED_EXTENSIONS = [".pdf", ".md", ".zip", ".rar", ".7z"];

// 创建 multer 上传实例
const upload = multer({
  // 使用系统临时目录存储上传的文件（处理完成后由 Service 层清理）
  dest: os.tmpdir(),
  // 文件大小限制：最大 500MB
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  // 文件类型过滤器：仅允许白名单中的扩展名
  fileFilter: (req, file, cb) => {
    // ==================== 文件名编码修复 ====================
    // multer 底层 busboy 解析 Content-Disposition 头中的 filename 时，
    // 若浏览器未使用 RFC 5987 编码（filename*=UTF-8''...），
    // 原始 UTF-8 字节会被按 Latin-1（ISO-8859-1）逐字节错误解码，
    // 导致中文文件名变成乱码（如 "闸门运行工.pdf" → "é¸é¨è¿è¡å·¥.pdf"）
    // 此处将 Latin-1 错误解码的字符串恢复为正确的 UTF-8
    if (file.originalname) {
      const fixedName = Buffer.from(file.originalname, "latin1").toString("utf8");
      if (fixedName !== file.originalname) {
        console.log(TAG + "[fileFilter] 文件名编码修复: " + file.originalname + " → " + fixedName);
        file.originalname = fixedName;
      }
    }
    // ==================== 文件名编码修复结束 ====================

    // 获取文件扩展名（统一转小写比较）
    const ext = path.extname(file.originalname).toLowerCase();

    if (ALLOWED_EXTENSIONS.includes(ext)) {
      // 文件类型合法，接受上传
      console.log(TAG + "[fileFilter] 接受文件: " + file.originalname + "（扩展名: " + ext + "）");
      cb(null, true);
    } else {
      // 文件类型不合法，拒绝上传
      console.log(TAG + "[fileFilter] 拒绝文件: " + file.originalname + "（不支持的扩展名: " + ext + "）");
      // 创建 multer 错误对象，传入自定义错误消息
      const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file");
      error.message = "不支持的文件格式，仅支持 pdf/md/zip/rar/7z";
      cb(error, false);
    }
  },
});

// ==================== Multer 错误处理辅助函数 ====================

/**
 * 将 multer 错误转换为统一的 HTTP 错误响应
 * @param {Error} err - multer 抛出的错误对象
 * @param {import('express').Response} res - Express 响应对象
 * @returns {boolean} 如果错误已被处理返回 true，否则返回 false
 */
function handleMulterError(err, res) {
  if (err instanceof multer.MulterError) {
    // multer 标准错误（如文件过大、字段名错误）
    if (err.code === "LIMIT_FILE_SIZE") {
      console.log(TAG + "[handleMulterError] 文件大小超过限制");
      return res.status(422).json({
        code: 422,
        message: "文件大小超过限制（最大 500MB）",
        data: null,
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      // 我们的 fileFilter 中自定义的错误会走到这里
      console.log(TAG + "[handleMulterError] 文件格式不支持: " + err.message);
      return res.status(422).json({
        code: 422,
        message: err.message || "不支持的文件格式",
        data: null,
      });
    }
    // 其他 multer 错误
    console.log(TAG + "[handleMulterError] Multer 错误: " + err.code + " - " + err.message);
    return res.status(422).json({
      code: 422,
      message: "文件上传错误: " + err.message,
      data: null,
    });
  }
  // 不是 multer 错误，交给调用方处理
  return false;
}

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/book/upload:
 *   post:
 *     tags: [教材]
 *     summary: 上传教材文件
 *     description: |
 *       上传教材文件（PDF/DOCX/DOC/MD/ZIP/RAR/7Z），自动进行格式归一化处理并启动课程生成流水线。
 *       上传完成后立即返回教材 ID，后续可通过 GET /api/v1/book/{book_id}/status 查询处理进度。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 教材文件（最大 500MB，支持 pdf/docx/doc/md/zip/rar/7z）
 *               name:
 *                 type: string
 *                 description: 教材名称（可选，默认取文件名）
 *               description:
 *                 type: string
 *                 description: 教材描述（可选）
 *               elaboration:
 *                 type: string
 *                 enum: ["true", "false"]
 *                 description: 是否开启文本细化（可选，默认 true）
 *     responses:
 *       200:
 *         description: 上传成功，教材正在处理中
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "上传成功，正在处理中" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     book_id: { type: string, example: "42" }
 *                     textbook_filename: { type: string, example: "高等数学.pdf" }
 *                     status: { type: string, example: "processing" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
 *       422:
 *         description: 文件上传参数错误（缺少文件、格式不支持、文件过大）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 422 }
 *                 message: { type: string, example: "不支持的文件格式，仅支持 pdf/docx/doc/md/zip/rar/7z" }
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
 * POST /api/v1/book/upload — 上传教材文件
 *
 * 鉴权由 authenticateToken 中间件完成：
 *   1. 提取并验证 Bearer Token
 *   2. 将 userId 注入 req.userId
 *
 * 请求格式：multipart/form-data
 * 字段：
 *   - file: 教材文件（必传）
 *   - name: 教材名称（可选）
 *   - description: 教材描述（可选）
 *   - elaboration: 是否开启文本细化（可选，默认 true）
 *
 * 响应：{ code: 0, message: "上传成功，正在处理中", data: { book_id, textbook_filename, status } }
 */
router.post(
  "/book/upload",
  authenticateToken, // 第一步：JWT 鉴权
  (req, res, next) => {
    // 第二步：使用 multer 处理文件上传（单文件，字段名为 "file"）
    // 注意：这里不直接在 authenticateToken 后面链式调用 upload.single，
    // 因为我们希望自定义 multer 错误处理逻辑
    upload.single("file")(req, res, (err) => {
      if (err) {
        // multer 错误（文件过大/格式不支持等），交给专门的错误处理函数
        const handled = handleMulterError(err, res);
        if (!handled) {
          // 未知错误，传递到 Express 全局错误处理
          next(err);
        }
        return;
      }

      // 文件上传成功（或没有文件），继续到下一个处理函数
      // 注意：如果 req.file 不存在，表示用户没有上传文件
      if (!req.file) {
        console.log(TAG + "[POST /book/upload] 未提供教材文件");
        return res.status(422).json({
          code: 422,
          message: "请上传教材文件（字段名: file）",
          data: null,
        });
      }

      next();
    });
  },
  // 第三步：核心业务逻辑
  async (req, res) => {
    console.log(TAG + "[POST /book/upload] 收到教材上传请求，userId: " + req.userId);

    try {
      // 从请求体中提取可选字段
      const name = req.body.name || undefined; // 教材名称（未填则取文件名）
      const description = req.body.description || undefined; // 教材描述

      // 解析 elaboration 参数：multipart/form-data 中布尔值以字符串形式传递
      // 默认值为 true（开启文本细化）
      let elaborationEnabled = true;
      if (req.body.elaboration !== undefined) {
        // 支持 "true" / "false" / "1" / "0" 等常见表示
        const elaborationStr = String(req.body.elaboration).toLowerCase().trim();
        elaborationEnabled = elaborationStr !== "false" && elaborationStr !== "0";
      }

      console.log(TAG + "[POST /book/upload] 教材名称: " + (name || "（使用文件名）") +
        "，文本细化: " + (elaborationEnabled ? "开启" : "关闭"));

      // 调用 Service 层执行教材上传与格式归一化
      const result = await uploadBook(
        req.userId, // 用户 ID（由 authenticateToken 注入）
        req.file, // multer 文件对象 { originalname, path, mimetype, size }
        name, // 教材名称
        description, // 教材描述
        elaborationEnabled // 是否开启文本细化
      );

      // 根据业务结果返回对应的 HTTP 状态码
      // uploadBook 可能的返回码：0（成功）、422（格式不支持/文件过大）、500（服务端错误）
      const statusMap = { 0: 200, 422: 422, 500: 500 };
      const httpStatus = statusMap[result.code] || 500;

      console.log(TAG + "[POST /book/upload] 响应: code=" + result.code + ", message=" + result.message);
      return res.status(httpStatus).json(result);

    } catch (error) {
      // 捕获 Service 层未处理的异常
      console.error(TAG + "[POST /book/upload] 处理异常: " + error.message);
      console.error(error.stack);
      return res.status(500).json({
        code: 500,
        message: "服务器内部错误: " + error.message,
        data: null,
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/book/{book_id}/status:
 *   get:
 *     tags: [教材]
 *     summary: 查询教材处理状态
 *     description: 根据教材 ID 查询教材的流水线处理状态和章节信息。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: book_id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     book_id: { type: string, example: "42" }
 *                     pipeline_status: { type: string, example: "idle" }
 *                     elaboration_enabled: { type: boolean, example: true }
 *                     chapter:
 *                       nullable: true
 *                       allOf:
 *                         - type: object
 *                           properties:
 *                             chapter_id: { type: string, example: "1" }
 *                             name: { type: string, example: "第一章 - 导数与微分" }
 *                             status: { type: string, example: "completed" }
 *                             total_pages: { type: integer, nullable: true, example: 25 }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 教材不存在
 *       500:
 *         description: 服务器内部错误
 */

/**
 * GET /api/v1/book/:book_id/status — 查询教材处理状态
 *
 * 鉴权由 authenticateToken 中间件完成：
 *   1. 提取并验证 Bearer Token
 *   2. 将 userId 注入 req.userId
 *
 * 路径参数：
 *   - book_id: 教材 ID
 *
 * 响应：{ code: 0, data: { book_id, pipeline_status, elaboration_enabled, chapter } }
 *   - chapter: null（无章节时）或 { chapter_id, name, status, total_pages }
 */
router.get("/book/:book_id/status", authenticateToken, async (req, res) => {
  const bookId = req.params.book_id; // 从 URL 路径参数提取教材 ID
  console.log(TAG + "[GET /book/:book_id/status] 查询教材状态，bookId: " + bookId + "，userId: " + req.userId);

  try {
    // 调用 Repository 层查询课程信息（含章节列表）
    const courseResult = await bookRepo.getCourseById(bookId);

    // 课程不存在
    if (courseResult.code === 404) {
      console.log(TAG + "[GET /book/:book_id/status] 教材不存在，bookId: " + bookId);
      return res.status(404).json({
        code: 404,
        message: "教材不存在。",
        data: null,
      });
    }

    // 数据库查询异常
    if (courseResult.code !== 200) {
      console.log(TAG + "[GET /book/:book_id/status] 查询失败: " + courseResult.message);
      return res.status(500).json({
        code: 500,
        message: courseResult.message || "查询教材状态失败。",
        data: null,
      });
    }

    // 提取课程数据
    const course = courseResult.course;

    // 构建章节信息：取第一个章节（流水线按顺序处理，一次展示一个章节的状态）
    let chapterInfo = null;
    if (course.chapters && course.chapters.length > 0) {
      const firstChapter = course.chapters[0];
      chapterInfo = {
        chapter_id: String(firstChapter.id), // BigInt 转 String 防止精度丢失
        name: firstChapter.name,
        status: firstChapter.status,
        total_pages: firstChapter.totalPages, // 可为 null（流水线尚未生成 PPT）
      };
    }

    // 构建响应数据
    const responseData = {
      book_id: String(course.id), // BigInt 转 String
      pipeline_status: course.pipelineStatus, // 流水线状态：processing/idle/error
      elaboration_enabled: course.elaborationEnabled, // 是否开启文本细化
      chapter: chapterInfo, // 章节信息（无章节时为 null）
    };

    console.log(TAG + "[GET /book/:book_id/status] 查询成功，pipeline_status: " + course.pipelineStatus +
      "，章节数: " + (course.chapters ? course.chapters.length : 0));

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: responseData,
    });

  } catch (error) {
    // 捕获未预期的异常
    console.error(TAG + "[GET /book/:book_id/status] 处理异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

/**
 * @openapi
 * /api/v1/book/{book_id}/progress:
 *   get:
 *     tags: [教材]
 *     summary: 查询教材生成详细进度
 *     description: 返回流水线各阶段的详细进度数据，包括大纲生成百分比（15分钟看门狗）、口播稿扩写计数、PPT/TTS/SRT 文件生成计数等。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: book_id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     courseId: { type: string, example: "42" }
 *                     pipelineStatus: { type: string, example: "ppt_generating" }
 *                     elaborationEnabled: { type: boolean, example: true }
 *                     totalSlides: { type: integer, nullable: true, example: 10 }
 *                     progress:
 *                       type: object
 *                       properties:
 *                         phase: { type: string, example: "generating_files" }
 *                         outlineProgress:
 *                           type: object
 *                           properties:
 *                             percentage: { type: integer, example: 100 }
 *                             isComplete: { type: boolean, example: true }
 *                         elaborationProgress:
 *                           type: object
 *                           properties:
 *                             current: { type: integer, example: 10 }
 *                             total: { type: integer, example: 10 }
 *                             isComplete: { type: boolean, example: true }
 *                         filesProgress:
 *                           type: object
 *                           properties:
 *                             current: { type: integer, example: 12 }
 *                             total: { type: integer, example: 30 }
 *                             isComplete: { type: boolean, example: false }
 *                     isTerminal: { type: boolean, example: false }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 教材不存在
 *       500:
 *         description: 服务器内部错误
 */

/**
 * GET /api/v1/book/:book_id/progress — 查询教材生成详细进度
 *
 * 鉴权由 authenticateToken 中间件完成
 * 根据 pipelineStatus 和 pipelineProgress JSON 字段计算各阶段进度数据
 *
 * 响应：{ code: 0, data: { courseId, pipelineStatus, progress: { phase, outlineProgress, ... } } }
 */
router.get("/book/:book_id/progress", authenticateToken, async (req, res) => {
  const bookId = req.params.book_id;
  console.log(TAG + "[GET /book/:book_id/progress] 查询进度，bookId: " + bookId);

  try {
    // 查询课程信息（含章节）
    const courseResult = await bookRepo.getCourseById(bookId);

    if (courseResult.code === 404) {
      return res.status(404).json({ code: 404, message: "教材不存在。", data: null });
    }
    if (courseResult.code !== 200) {
      return res.status(500).json({ code: 500, message: courseResult.message, data: null });
    }

    const course = courseResult.course;
    const status = course.pipelineStatus || "idle";
    const elaborationEnabled = course.elaborationEnabled;

    // 解析进度 JSON
    let progressData = {};
    if (course.pipelineProgress) {
      try {
        progressData = JSON.parse(course.pipelineProgress);
      } catch (_) { /* JSON 解析失败时使用空对象 */ }
    }

    // 总页数（优先从进度数据读取，其次从第一章读取）
    const totalSlides = progressData.totalSlides ||
      (course.chapters && course.chapters.length > 0 ? course.chapters[0].totalPages : 0) || 0;

    // ========== 判断当前阶段 ==========
    const TERMINAL = ["completed", "partial_completed", "failed", "error"];
    const isTerminal = TERMINAL.includes(status);

    let phase;
    if (isTerminal) {
      phase = "completed";
    } else if (status === "data_validating") {
      phase = "validating";
    } else if (status === "ppt_generating" || status === "ppt_generated" ||
               status === "tts_generating" || status === "tts_generated") {
      phase = "generating_files";
    } else if (status === "elaborating") {
      phase = "elaborating";
    } else if (status === "course_generating" || status === "course_generated") {
      // course_generated 也显示为大纲阶段（如果还没进入 PPT/TTS）
      phase = "outline_generating";
    } else {
      phase = "preparing";
    }

    // ========== 大纲进度：15 分钟看门狗 ==========
    let outlineProgress = { percentage: 0, isComplete: phase !== "outline_generating" };
    if (phase === "outline_generating" && progressData.outlineStartTime) {
      const elapsed = Date.now() - progressData.outlineStartTime;
      const watchdogMs = 15 * 60 * 1000; // 15 分钟
      outlineProgress.percentage = Math.min(100, Math.round((elapsed / watchdogMs) * 100));
      outlineProgress.isComplete = false;
    } else if (phase !== "outline_generating" && phase !== "preparing") {
      // 已进入后续阶段，大纲必定已完成
      outlineProgress.percentage = 100;
      outlineProgress.isComplete = true;
    }

    // ========== 扩写进度 ==========
    let elaborationProgress = { current: 0, total: totalSlides, isComplete: false };
    if (!elaborationEnabled) {
      // 未开扩写，直接标记完成
      elaborationProgress.current = totalSlides;
      elaborationProgress.total = totalSlides;
      elaborationProgress.isComplete = true;
    } else if (phase === "elaborating") {
      elaborationProgress.current = progressData.elaborationCompleted || 0;
      elaborationProgress.total = totalSlides;
      elaborationProgress.isComplete = false;
    } else if (phase === "generating_files" || phase === "validating" || phase === "completed") {
      // 已进入后续阶段，扩写已完成
      elaborationProgress.current = totalSlides;
      elaborationProgress.total = totalSlides;
      elaborationProgress.isComplete = true;
    }

    // ========== 文件生成进度（PPT + TTS + SRT） ==========
    let filesProgress = { current: 0, total: totalSlides * 3, isComplete: false };
    if (phase === "generating_files" || phase === "validating") {
      filesProgress.current = progressData.filesCompleted || 0;
      filesProgress.total = totalSlides * 3;
      filesProgress.isComplete = false;
    } else if (phase === "completed") {
      filesProgress.current = totalSlides * 3;
      filesProgress.total = totalSlides * 3;
      filesProgress.isComplete = true;
    }

    // ========== 构建响应 ==========
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        courseId: String(course.id),
        pipelineStatus: status,
        elaborationEnabled: elaborationEnabled,
        totalSlides: totalSlides || null,
        progress: {
          phase: phase,
          outlineProgress: outlineProgress,
          elaborationProgress: elaborationProgress,
          filesProgress: filesProgress,
        },
        isTerminal: isTerminal,
      },
    });

  } catch (error) {
    console.error(TAG + "[GET /book/:book_id/progress] 处理异常: " + error.message);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

// 导出路由实例，供 app.js 挂载
module.exports = router;
