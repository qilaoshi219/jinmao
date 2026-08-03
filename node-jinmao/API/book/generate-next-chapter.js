// 本文件因包含两个完整 OpenAPI JSDoc 注释（每个端点约40行），
// 且生成/查询两个端点高度相关不宜拆分，特批允许超过 300 行限制

// ==================== 下一章生成路由模块 ====================
// 职责：
//   1. POST /api/v1/courses/:courseId/generate-next-chapter — 触发下一章生成
//   2. GET  /api/v1/courses/:courseId/chapters/:chapterId/generation-progress — 查询章节生成进度
//   3. GET  /api/v1/courses/:courseId/generate-next-chapter/status — 查询"生成下一章"按钮状态
// 使用 Express Router 管理路由，挂载到 /api/v1 前缀下

const express = require("express");
const router = express.Router();

// 导入业务流程模块
const { generateChapter } = require("../../service/course_pipeline");
// 导入 Repository 层
const bookRepo = require("../../utils/repo/book_repo");
const chapterRepo = require("../../utils/repo/chapter_repo");
// 导入统一判断函数：是否可以生成下一章
const { computeCanGenerateNext } = require("../../utils/can_generate_next");
// 导入 JWT 鉴权中间件
const { authenticateToken } = require("../../middleware/auth");

// 日志前缀
const TAG = "[API_generate_next_chapter]";

// ==================== 辅助函数：补零 ====================

/** 数字补零为两位字符串 */
const pad = (n) => String(n).padStart(2, "0");

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/courses/{courseId}/generate-next-chapter:
 *   post:
 *     tags: [章节]
 *     summary: 生成下一章
 *     description: |
 *       为指定课程触发下一章的生成流水线（大纲→扩写→PPT→TTS→校验）。
 *       根据课程当前已处理到的行号（endline），提取下一段文本并生成新章节。
 *       创建章节记录后立即返回，生成过程在后台异步执行。
 *       前端通过 GET /courses/{courseId}/chapters/{chapterId}/generation-progress 轮询进度。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 课程 ID（纯数字）
 *     responses:
 *       200:
 *         description: 章节创建成功，已在后台开始生成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "章节创建成功，正在后台生成" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     chapterId: { type: string, example: "3" }
 *                     sequence: { type: integer, example: 2 }
 *                     name: { type: string, example: "第二章" }
 *                     status: { type: string, example: "generating" }
 *       400:
 *         description: 没有更多章节可生成（已处理到文件末尾）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "没有更多章节可生成，当前已是最后一章" }
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
 *         description: 无权操作（教材不属于当前用户）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权操作该教材。" }
 *       404:
 *         description: 课程不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "课程不存在。" }
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
 * POST /api/v1/courses/:courseId/generate-next-chapter — 生成下一章
 *
 * 鉴权由 authenticateToken 中间件完成
 * 流程：
 *   1. 查询课程信息（含现有章节列表）
 *   2. 权限校验：确保课程属于当前用户
 *   3. 检查是否还有更多内容（endline 是否已到文件末尾）
 *   4. 创建新的 Chapter 记录（status: "generating"）
 *   5. 异步启动 generateChapter 流水线
 *   6. 立即返回新章节信息
 */
router.post("/courses/:courseId/generate-next-chapter", authenticateToken, async (req, res) => {
  const courseId = req.params.courseId;
  const userId = req.userId;
  console.log(TAG + "[POST /courses/:courseId/generate-next-chapter] 收到请求，courseId: " + courseId + "，userId: " + userId);

  try {
    // ===== 1. 参数校验 =====
    const parsedId = parseInt(courseId, 10);
    if (isNaN(parsedId) || String(parsedId) !== courseId) {
      console.log(TAG + " 无效的课程 ID: " + courseId);
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    }

    // ===== 2. 查询课程信息 =====
    const courseResult = await bookRepo.getCourseById(courseId);
    if (courseResult.code === 404) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    if (courseResult.code !== 200) {
      return res.status(500).json({ code: 500, message: courseResult.message, data: null });
    }
    const course = courseResult.course;

    // ===== 3. 权限校验 =====
    if (String(course.userId) !== String(userId)) {
      console.log(TAG + " 越权操作：课程 userId=" + course.userId + "，请求 userId=" + userId);
      return res.status(403).json({ code: 403, message: "无权操作该教材。", data: null });
    }

    // ===== 4. 统一检查：是否可以生成下一章（单一真相来源） =====
    // 替代原有的 3 个独立 if 块，前后端共用 computeCanGenerateNext 确保一致性
    const chapters = (course.chapters || []).filter(c => !c.isDeleted);
    const canResult = computeCanGenerateNext(course, chapters);
    if (!canResult.can) {
      console.log(TAG + " 拒绝生成下一章: " + canResult.reason);
      const isFinished = canResult.reason === "课程已完成" || canResult.reason === "已是最后一章";
      return res.status(400).json({
        code: 400,
        message: isFinished
          ? "该教材的所有章节已生成完毕，没有更多内容可生成。"
          : "已有章节正在生成中，请等待完成后再试。",
        data: null,
      });
    }

    // ===== 4.5 余额校验：检查用户是否被锁定 =====
    const { checkCanUseAI } = require("../../utils/balance");
    const balanceCheck = await checkCanUseAI(userId);
    if (!balanceCheck.allowed) {
      console.log(TAG + " 余额不足，拒绝生成: " + balanceCheck.reason);
      return res.status(402).json({
        code: 402,
        message: balanceCheck.reason,
        data: { balance: balanceCheck.balance, balanceLocked: balanceCheck.balanceLocked },
      });
    }

    // ===== 5. 确定下一章的序号 =====
    const lastSequence = chapters.length > 0
      ? Math.max(...chapters.map(c => c.sequence))
      : 0;
    const nextSequence = lastSequence + 1;

    // 章节名称：使用"第N章"格式
    const chapterName = "第" + nextSequence + "章";

    // 章节根目录：/usercourse/{userId}/{courseId}/chapter_{seq}/
    const chapterRoot = "/usercourse/" + course.userId + "/" + courseId + "/chapter_" + pad(nextSequence) + "/";

    console.log(TAG + " 创建章节: " + chapterName + "（sequence=" + nextSequence + "，chapterRoot=" + chapterRoot + "）");

    // ===== 6. 创建章节记录 =====
    const createResult = await chapterRepo.createChapter({
      courseId: courseId,
      sequence: nextSequence,
      name: chapterName,
      chapterRoot: chapterRoot,
      startline: 0, // 由流水线填充
      endline: 0,   // 由流水线填充
      status: "generating", // 直接进入生成状态
    });

    if (createResult.code !== 200) {
      console.error(TAG + " 章节创建失败: " + createResult.message);
      return res.status(500).json({ code: 500, message: "章节创建失败: " + createResult.message, data: null });
    }

    const newChapter = createResult.chapter;
    console.log(TAG + " 章节创建成功，ID: " + newChapter.id);

    // ===== 7. 异步启动生成流水线 =====
    // 不等待流水线完成，立即返回
    generateChapter(courseId, newChapter.id).then((genResult) => {
      console.log(TAG + " 章节 " + newChapter.id + " 生成完成，状态: " + genResult.status);
    }).catch((genErr) => {
      console.error(TAG + " 章节 " + newChapter.id + " 生成异常: " + (genErr.message || genErr));
    });

    // ===== 8. 立即返回 =====
    return res.status(200).json({
      code: 0,
      message: "章节创建成功，正在后台生成",
      data: {
        chapterId: String(newChapter.id),
        sequence: newChapter.sequence,
        name: newChapter.name,
        status: newChapter.status,
      },
    });

  } catch (error) {
    console.error(TAG + " [POST /courses/:courseId/generate-next-chapter] 处理异常: " + error.message);
    console.error(error.stack);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/generate-next-chapter/status:
 *   get:
 *     tags: [章节]
 *     summary: 查询"生成下一章"按钮状态
 *     description: |
 *       轻量级状态查询接口，供前端轮询"生成下一章"按钮状态：
 *       - canGenerateNext：当前是否还能生成下一章（复用 computeCanGenerateNext 统一计算，
 *         包含 maxline 数值校验、课程完成标记、章节生成中拦截等全部判断）
 *       - isGenerating：是否存在正在生成中的章节
 *       前端依据该结果实时切换按钮三态：生成中（禁用）/ 生成下一章（可点击）/ 已经是最后一章了（禁用）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 课程 ID（纯数字）
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
 *                     courseId: { type: string, example: "2" }
 *                     canGenerateNext: { type: boolean, example: false, description: "是否还能生成下一章" }
 *                     isGenerating: { type: boolean, example: true, description: "是否存在正在生成中的章节" }
 *                     reason: { type: string, example: "有章节正在生成中", description: "不可生成时的原因（可生成时为空字符串）" }
 *       400:
 *         description: 课程 ID 格式无效
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权访问（课程不属于当前用户）
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */

/**
 * GET /api/v1/courses/:courseId/generate-next-chapter/status — 查询"生成下一章"按钮状态
 *
 * 轮询专用轻量接口，返回 canGenerateNext + isGenerating 两个权威值：
 *   - canGenerateNext：computeCanGenerateNext 统一计算（与 POST 生成接口、详情接口完全一致）
 *   - isGenerating：课程下是否存在 status="generating" 的章节
 * 前端在页面停留期间轮询此接口，确保"生成中/生成下一章/已经是最后一章了"三态及时切换。
 */
router.get("/courses/:courseId/generate-next-chapter/status", authenticateToken, async (req, res) => {
  const courseId = req.params.courseId;
  const userId = req.userId;
  console.log(TAG + "[GET /courses/:courseId/generate-next-chapter/status] 收到查询请求，courseId: " + courseId + "，userId: " + userId);

  try {
    // ===== 1. 参数校验 =====
    const parsedId = parseInt(courseId, 10);
    if (isNaN(parsedId) || String(parsedId) !== courseId) {
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    }

    // ===== 2. 查询课程信息 =====
    const courseResult = await bookRepo.getCourseById(courseId);
    if (courseResult.code === 404) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    if (courseResult.code !== 200) {
      return res.status(500).json({ code: 500, message: courseResult.message, data: null });
    }
    const course = courseResult.course;

    // ===== 3. 权限校验 =====
    if (String(course.userId) !== String(userId)) {
      return res.status(403).json({ code: 403, message: "无权访问该教材。", data: null });
    }

    // ===== 4. 统一计算按钮状态（与 POST 生成接口共用 computeCanGenerateNext，单一真相来源） =====
    const chapters = (course.chapters || []).filter(c => !c.isDeleted);
    const canResult = computeCanGenerateNext(course, chapters);
    const isGenerating = chapters.some(c => c.status === "generating");

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        courseId: String(course.id),
        canGenerateNext: canResult.can,
        isGenerating: isGenerating,
        reason: canResult.can ? "" : canResult.reason,
      },
    });
  } catch (error) {
    console.error(TAG + "[GET /courses/:courseId/generate-next-chapter/status] 处理异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/generation-progress:
 *   get:
 *     tags: [章节]
 *     summary: 查询章节生成进度
 *     description: |
 *       查询指定章节的生成流水线实时进度，结构与课程级 /book/{id}/progress 一致。
 *       前端侧边栏轮询此接口获取正在生成章节的进度条数据。
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
 *                     chapterId: { type: string, example: "3" }
 *                     chapterStatus: { type: string, example: "generating" }
 *                     progress:
 *                       type: object
 *                       properties:
 *                         phase: { type: string, example: "ppt_generating" }
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
 *                             current: { type: integer, example: 15 }
 *                             total: { type: integer, example: 30 }
 *                             isComplete: { type: boolean, example: false }
 *                     isTerminal: { type: boolean, example: false }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 章节不存在
 *       500:
 *         description: 服务器内部错误
 */

/**
 * GET /api/v1/courses/:courseId/chapters/:chapterId/generation-progress — 查询章节生成进度
 *
 * 轮询专用接口，返回章节当前的 generationProgress JSON 数据
 * 若章节不是 generating 状态，返回 isTerminal: true
 */
router.get("/courses/:courseId/chapters/:chapterId/generation-progress", authenticateToken, async (req, res) => {
  const courseId = req.params.courseId;
  const chapterId = req.params.chapterId;
  console.log(TAG + "[GET generation-progress] chapterId: " + chapterId);

  try {
    // 查询章节信息
    const chapterResult = await chapterRepo.getChapterById(chapterId);

    if (chapterResult.code === 404) {
      return res.status(404).json({ code: 404, message: "章节不存在。", data: null });
    }
    if (chapterResult.code !== 200) {
      return res.status(500).json({ code: 500, message: chapterResult.message, data: null });
    }

    const chapter = chapterResult.chapter;

    // 权限校验：确保课程属于当前用户
    if (String(chapter.courseId) !== String(courseId)) {
      return res.status(400).json({ code: 400, message: "章节不属于该课程。", data: null });
    }

    // 判断是否为终端状态
    const terminalStatuses = ["completed", "partial_completed", "failed", "pending"];
    const isTerminal = terminalStatuses.includes(chapter.status);

    // 解析进度 JSON
    let progressData = null;
    if (chapter.generationProgress) {
      try {
        progressData = JSON.parse(chapter.generationProgress);
      } catch (_) {
        console.warn(TAG + " generationProgress JSON 解析失败");
      }
    }

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        chapterId: String(chapter.id),
        chapterStatus: chapter.status,
        progress: progressData,
        isTerminal: isTerminal,
      },
    });

  } catch (error) {
    console.error(TAG + "[GET generation-progress] 处理异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

// 导出路由实例，供 index.js 合并
module.exports = router;
