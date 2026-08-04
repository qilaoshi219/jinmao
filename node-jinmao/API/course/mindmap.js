// ==================== 思维导图路由模块 ====================
// 职责：课程学习页一键思维导图的 HTTP 接口
// 端点：
//   POST /api/v1/courses/:courseId/chapters/:chapterId/mindmap — 触发异步生成思维导图
//   GET  /api/v1/courses/:courseId/chapters/:chapterId/mindmap — 查询思维导图状态/URL
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../../middleware/auth");
const { checkCanUseAI } = require("../../utils/balance");
const courseAi = require("../../service/course_ai");
const mindmapService = require("../../service/mindmap_service");

// 日志前缀
const TAG = "[API_course_mindmap]";

/** 校验纯数字 ID */
function isValidId(id) {
  return typeof id === "string" && /^\d+$/.test(id);
}

/**
 * 公共校验：课程归属 + 章节从属（失败直接返回响应）
 * @returns {Promise<boolean>} true=校验通过；false=已发送错误响应
 */
async function validateCourseChapter(req, res) {
  const { courseId, chapterId } = req.params;
  if (!isValidId(courseId)) {
    res.status(400).json({ code: 400, message: "课程 ID 格式无效，必须为纯数字。", data: null });
    return false;
  }
  if (!isValidId(chapterId)) {
    res.status(400).json({ code: 400, message: "章节 ID 格式无效，必须为纯数字。", data: null });
    return false;
  }

  const courseCheck = await courseAi.assertCourseOwnership(courseId, req.userId);
  if (courseCheck.code !== 200) {
    res.status(courseCheck.code).json({ code: courseCheck.code, message: courseCheck.message, data: null });
    return false;
  }

  const chapterCheck = await courseAi.assertChapterBelongsToCourse(courseId, chapterId);
  if (chapterCheck.code !== 200) {
    res.status(chapterCheck.code).json({ code: chapterCheck.code, message: chapterCheck.message, data: null });
    return false;
  }
  return true;
}

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/mindmap:
 *   post:
 *     tags: [课程学习]
 *     summary: 触发生成章节思维导图
 *     description: |
 *       读取该章节的大纲 JSON（outline JSON 的 ppt/kbg/zjts），后台异步调用 DeepSeek 归纳为 Markdown 层级结构，
 *       组装自包含 markmap HTML 后上传 MinIO。接口立即返回，前端通过同路径 GET 接口轮询生成状态。
 *       同一章节生成中时重复触发返回 400。
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
 *         description: 已创建生成任务，后台开始生成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "已开始生成思维导图" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: "generating", description: "生成状态：generating" }
 *       400:
 *         description: 参数无效、章节大纲缺失或思维导图正在生成中
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "思维导图正在生成中，请稍候。" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
 *       402:
 *         description: 余额不足或已锁定
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 402 }
 *                 message: { type: string, example: "余额不足，请充值后再试。" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance: { type: string, example: "0.0000000" }
 *                     balanceLocked: { type: boolean, example: true }
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
 * POST /api/v1/courses/:courseId/chapters/:chapterId/mindmap — 触发生成思维导图
 */
router.post("/courses/:courseId/chapters/:chapterId/mindmap", authenticateToken, async (req, res) => {
  const { courseId, chapterId } = req.params;
  console.log(TAG + " [POST] 收到生成思维导图请求，courseId: " + courseId + "，chapterId: " + chapterId + "，userId: " + req.userId);

  try {
    // ===== 1. 参数与权限校验 =====
    if (!(await validateCourseChapter(req, res))) return;

    // ===== 2. 防重复触发 =====
    if (mindmapService.isGenerating(courseId, chapterId)) {
      console.log(TAG + " [POST] 思维导图正在生成中，拒绝重复触发");
      return res.status(400).json({ code: 400, message: "思维导图正在生成中，请稍候。", data: null });
    }

    // ===== 3. 余额校验 =====
    const balanceCheck = await checkCanUseAI(req.userId);
    if (!balanceCheck.allowed) {
      console.log(TAG + " [POST] 余额不足，拒绝生成: " + balanceCheck.reason);
      return res.status(402).json({
        code: 402,
        message: balanceCheck.reason,
        data: { balance: balanceCheck.balance, balanceLocked: balanceCheck.balanceLocked },
      });
    }

    // ===== 4. 异步启动生成，立即返回 =====
    mindmapService.generateMindmap(req.userId, courseId, chapterId).catch((error) => {
      // generateMindmap 内部已兜底，此处仅记录意外异常
      console.error(TAG + " [POST] 后台生成任务异常: " + (error?.message || error));
    });

    console.log(TAG + " [POST] 生成任务已启动，courseId: " + courseId + "，chapterId: " + chapterId);
    return res.status(200).json({
      code: 0,
      message: "已开始生成思维导图",
      data: { status: "generating" },
    });
  } catch (error) {
    console.error(TAG + " [POST] 处理异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误：" + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/mindmap:
 *   get:
 *     tags: [课程学习]
 *     summary: 查询章节思维导图状态
 *     description: |
 *       返回思维导图生成状态：none（未生成）/ generating（生成中）/ done（已生成，含 mindmapUrl）/ failed（生成失败，含 error）。
 *       done 时 mindmapUrl 可直接用于 iframe 内嵌展示（/api/v1/files/ 代理）。
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
 *                     status: { type: string, example: "done", description: "none / generating / done / failed" }
 *                     progressText: { type: string, example: "AI 正在归纳章节知识结构...", description: "generating 时的进度文案" }
 *                     error: { type: string, example: "章节大纲不存在或为空，无法生成思维导图。", description: "failed 时的错误信息" }
 *                     mindmapUrl: { type: string, example: "/api/v1/files/usercourse/1/2/chapter_01/MindMap/mindmap.html", description: "done 时思维导图 HTML 代理访问 URL" }
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
 * GET /api/v1/courses/:courseId/chapters/:chapterId/mindmap — 查询思维导图状态
 */
router.get("/courses/:courseId/chapters/:chapterId/mindmap", authenticateToken, async (req, res) => {
  const { courseId, chapterId } = req.params;
  console.log(TAG + " [GET] 收到思维导图状态请求，courseId: " + courseId + "，chapterId: " + chapterId + "，userId: " + req.userId);

  try {
    // ===== 1. 参数与权限校验 =====
    if (!(await validateCourseChapter(req, res))) return;

    // ===== 2. 查询状态 =====
    const status = await mindmapService.getMindmapStatus(courseId, chapterId);
    console.log(TAG + " [GET] 状态: " + status.status + (status.mindmapUrl ? "，url: " + status.mindmapUrl : ""));
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: status,
    });
  } catch (error) {
    console.error(TAG + " [GET] 处理异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误：" + error.message, data: null });
  }
});

// ==================== 模块导出 ====================
module.exports = router;
