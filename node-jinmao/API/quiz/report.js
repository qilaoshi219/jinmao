// ==================== 刷题报告路由模块 ====================
// 职责：报告列表、详情、SSE 实时判题进度推送
// 端点：/api/v1/quiz/reports*

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const reportService = require("../../service/quiz_report_service");
const { addSubscriber, removeSubscriber } = require("../../service/quiz_sse_broker");

// 日志前缀
const TAG = "[API_quiz_report]";

/**
 * @openapi
 * /api/v1/quiz/reports:
 *   get:
 *     tags: [报告]
 *     summary: 报告列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 10 }
 *       - name: offset
 *         in: query
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: 查询成功
 */
router.get("/reports", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /reports] 收到请求");

  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    const result = await reportService.listQuizReports(req.userId, limit, offset);

    return res.status(200).json({ code: 0, message: "查询成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /reports] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/reports/recent:
 *   get:
 *     tags: [报告]
 *     summary: 最近报告列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 5 }
 *     responses:
 *       200:
 *         description: 查询成功
 */
router.get("/reports/recent", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /reports/recent] 收到请求");

  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));

    const result = await reportService.listRecentQuizReports(req.userId, limit);

    return res.status(200).json({ code: 0, message: "查询成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /reports/recent] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/reports/{reportId}:
 *   get:
 *     tags: [报告]
 *     summary: 报告详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: reportId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 查询成功
 */
router.get("/reports/:reportId", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /reports/:reportId] 收到请求，reportId: " + req.params.reportId);

  try {
    const result = await reportService.getQuizReportDetail(req.userId, req.params.reportId);

    return res.status(200).json({ code: 0, message: "查询成功", data: result });
  } catch (error) {
    console.error(TAG + " [GET /reports/:reportId] 异常: " + error.message);

    if (error.message === "REPORT_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "报告不存在。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/reports/{reportId}/stream:
 *   get:
 *     tags: [报告]
 *     summary: SSE 实时判题进度推送
 *     description: 建立 SSE 连接，实时接收报告的判题进度更新
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: reportId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: SSE 流
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get("/reports/:reportId/stream", authenticateToken, async (req, res) => {
  const reportId = req.params.reportId;
  console.log(TAG + " [GET /reports/:reportId/stream] SSE 连接建立，reportId: " + reportId);

  try {
    // 先验证报告存在
    const report = await reportService.getQuizReportDetail(req.userId, reportId);

    // 设置 SSE 响应头
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲
    });

    // 发送初始数据
    res.write("data: " + JSON.stringify(report) + "\n\n");

    // 添加 SSE 订阅者
    const callbacks = {
      send: (data) => {
        res.write("data: " + data + "\n\n");
      },
      close: () => {
        // 由 req.on("close") 统一处理
      },
    };

    addSubscriber(reportId, callbacks);

    // 客户端断开连接时清理
    req.on("close", () => {
      console.log(TAG + " [SSE] 客户端断开 — reportId: " + reportId);
      removeSubscriber(reportId, callbacks);
    });

    // 每 15 秒发送心跳，保持连接
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch (_) {
        clearInterval(heartbeatInterval);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeatInterval);
    });
  } catch (error) {
    console.error(TAG + " [SSE] 错误: " + error.message);

    if (error.message === "REPORT_NOT_FOUND") {
      return res.status(404).json({ code: 404, message: "报告不存在。", data: null });
    }

    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
