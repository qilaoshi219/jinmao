// ==================== MD→JSON 任务 API 路由 ====================
// 职责：提供创建/查询/订阅 MD→JSON 生成任务的 HTTP 端点
// 端点前缀：/api/v1/quiz/md2json

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const {
  createMd2QuizTask,
  getMd2QuizTask,
  listMd2QuizTasks,
  getMd2QuizTaskProgress,
} = require("../../service/md2quiz/task-service");

const TAG = "[API_md2json]";

// ==================== 辅助函数 ====================

/**
 * 解析请求中的整数参数
 * @param {unknown} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseIntParam(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : defaultValue;
}

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/quiz/md2json/tasks:
 *   post:
 *     tags: [题库]
 *     summary: 创建 MD→JSON 生成任务
 *     description: 提交 Markdown 文本和题型配额，系统在后台异步生成题目并自动入库
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileName, markdownContent, textbookName, examName, generationConfig]
 *             properties:
 *               fileName: { type: string, example: "闸门运行工.md" }
 *               markdownContent: { type: string, description: "Markdown 文本内容" }
 *               textbookName: { type: string, example: "闸门运行工题库" }
 *               examName: { type: string, example: "第一章" }
 *               description: { type: string, description: "题库描述（可选）" }
 *               generationConfig:
 *                 type: object
 *                 properties:
 *                   single: { type: integer, default: 10 }
 *                   multiple: { type: integer, default: 10 }
 *                   judge: { type: integer, default: 5 }
 *                   fill: { type: integer, default: 5 }
 *                   shortAnswer: { type: integer, default: 2 }
 *     responses:
 *       202:
 *         description: 任务创建成功，后台异步执行
 *       400:
 *         description: 请求参数校验失败
 *       401:
 *         description: 未登录
 */
router.post("/tasks", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /tasks] 收到创建任务请求，userId: " + req.userId);

  try {
    const body = req.body;

    // ===== 参数校验 =====
    if (!body.fileName || typeof body.fileName !== "string" || !body.fileName.trim()) {
      return res.status(400).json({ code: 400, message: "fileName 不能为空。", data: null });
    }

    if (!body.markdownContent || typeof body.markdownContent !== "string" || !body.markdownContent.trim()) {
      return res.status(400).json({ code: 400, message: "markdownContent 不能为空。", data: null });
    }

    // 限制 Markdown 内容长度（500KB）
    if (body.markdownContent.length > 500 * 1024) {
      return res.status(400).json({
        code: 400,
        message: "Markdown 内容过大，最大支持 500KB。",
        data: null,
      });
    }

    if (!body.textbookName || typeof body.textbookName !== "string" || !body.textbookName.trim()) {
      return res.status(400).json({ code: 400, message: "textbookName 不能为空。", data: null });
    }

    if (!body.examName || typeof body.examName !== "string" || !body.examName.trim()) {
      return res.status(400).json({ code: 400, message: "examName 不能为空。", data: null });
    }

    if (!body.generationConfig || typeof body.generationConfig !== "object") {
      return res.status(400).json({
        code: 400,
        message: "generationConfig 必须是一个有效的题型配额对象。",
        data: null,
      });
    }

    const config = body.generationConfig;
    const keys = ["single", "multiple", "judge", "fill", "shortAnswer"];

    for (const key of keys) {
      if (!Number.isInteger(config[key]) || config[key] < 0) {
        return res.status(400).json({
          code: 400,
          message: `generationConfig.${key} 必须是非负整数。`,
          data: null,
        });
      }
    }

    const totalCount = config.single + config.multiple + config.judge + config.fill + config.shortAnswer;
    if (totalCount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "请至少为一种题型设置大于 0 的数量。",
        data: null,
      });
    }

    // ===== 创建任务前：余额校验 =====
    const { checkCanUseAI } = require("../../utils/balance");
    const balanceCheck = await checkCanUseAI(req.userId);
    if (!balanceCheck.allowed) {
      console.log(TAG + " [POST /tasks] 余额不足，拒绝创建任务: " + balanceCheck.reason);
      return res.status(402).json({
        code: 402,
        message: balanceCheck.reason,
        data: { balance: balanceCheck.balance, balanceLocked: balanceCheck.balanceLocked },
      });
    }

    // ===== 创建任务 =====
    const task = await createMd2QuizTask(
      {
        fileName: body.fileName.trim(),
        markdownContent: body.markdownContent,
        textbookName: body.textbookName.trim(),
        examName: body.examName.trim(),
        description: body.description?.trim() || "",
        generationConfig: config,
      },
      req.userId
    );

    console.log(TAG + " [POST /tasks] 任务创建成功，taskId: " + task.taskId);

    return res.status(202).json({
      code: 0,
      message: "任务已创建，后台正在生成题目...",
      data: {
        taskId: task.taskId,
        textbookId: task.textbookId,
        status: task.status,
        textbookName: task.textbookName,
        examName: task.examName,
        totalLength: task.totalLength,
        totalLineCount: task.totalLineCount,
        chunkCount: task.chunkCount,
        generationConfig: task.generationConfig,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建任务失败。";
    console.error(TAG + " [POST /tasks] 异常: " + message);
    console.error(error.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + message,
      data: null,
    });
  }
});

/**
 * @openapi
 * /api/v1/quiz/md2json/tasks:
 *   get:
 *     tags: [题库]
 *     summary: 查询用户的任务列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *         description: 返回条数上限（1-100）
 *     responses:
 *       200:
 *         description: 任务列表查询成功
 *       401:
 *         description: 未登录
 */
router.get("/tasks", authenticateToken, (req, res) => {
  try {
    const limit = parseIntParam(req.query.limit, 50);
    const tasks = listMd2QuizTasks(req.userId, limit);

    return res.status(200).json({
      code: 0,
      message: "任务列表查询成功。",
      data: {
        items: tasks,
        total: tasks.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询任务列表失败。";
    return res.status(500).json({
      code: 500,
      message: message,
      data: null,
    });
  }
});

/**
 * @openapi
 * /api/v1/quiz/md2json/tasks/{taskId}:
 *   get:
 *     tags: [题库]
 *     summary: 查询任务详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *         description: 任务 ID
 *     responses:
 *       200:
 *         description: 任务详情查询成功
 *       401:
 *         description: 未登录
 *       404:
 *         description: 任务不存在或无权访问
 */
router.get("/tasks/:taskId", authenticateToken, (req, res) => {
  try {
    const task = getMd2QuizTask(req.params.taskId, req.userId);

    return res.status(200).json({
      code: 0,
      message: "任务详情查询成功。",
      data: task,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询任务详情失败。";
    const status = message.includes("不存在") ? 404 : 500;

    return res.status(status).json({
      code: status,
      message: message,
      data: null,
    });
  }
});

/**
 * @openapi
 * /api/v1/quiz/md2json/tasks/{taskId}/progress:
 *   get:
 *     tags: [题库]
 *     summary: 查询任务进度（前端轮询用，对齐 GET /book/:id/progress 风格）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *         description: 任务 ID
 *     responses:
 *       200:
 *         description: 任务进度查询成功
 *       401:
 *         description: 未登录
 *       404:
 *         description: 任务不存在或无权访问
 */
router.get("/tasks/:taskId/progress", authenticateToken, (req, res) => {
  try {
    const progress = getMd2QuizTaskProgress(req.params.taskId, req.userId);

    return res.status(200).json({
      code: 0,
      message: "进度查询成功。",
      data: progress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询任务进度失败。";
    const status = message.includes("不存在") ? 404 : 500;

    return res.status(status).json({
      code: status,
      message: message,
      data: null,
    });
  }
});

module.exports = router;
