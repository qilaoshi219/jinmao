// ==================== 扩展统计数据路由模块 ====================
// 职责：提供学习周报与排行榜接口
// 端点列表：
//   GET /api/v1/stats/weekly — 最近 7 天学习周报（需 Token）
//   GET /api/v1/stats/leaderboard — 学习时长/刷题量排行榜（需 Token）

const express = require("express");
const router = express.Router();
const statsExtraRepo = require("../utils/repo/stats_extra_repo");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_stats_extra]";

/**
 * @openapi
 * /api/v1/stats/weekly:
 *   get:
 *     tags: [统计数据]
 *     summary: 获取最近 7 天学习周报
 *     description: 返回当前用户最近 7 天按日统计（学习时长/刷题量/正确率/活跃）及本周汇总。
 *     security:
 *       - bearerAuth: []
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
 *                     days:
 *                       type: array
 *                       description: 最近 7 天（今天为最后一项）
 *                       items:
 *                         type: object
 *                         properties:
 *                           date: { type: string, example: "2026-07-29" }
 *                           label: { type: string, example: "07-29" }
 *                           weekLabel: { type: string, example: "周三" }
 *                           studySeconds: { type: integer, example: 1200 }
 *                           quizCount: { type: integer, example: 10 }
 *                           correctCount: { type: integer, example: 8 }
 *                           active: { type: boolean, example: true }
 *                           isToday: { type: boolean, example: true }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         studySeconds: { type: integer, example: 3600 }
 *                         quizCount: { type: integer, example: 50 }
 *                         correctCount: { type: integer, example: 40 }
 *                         accuracy: { type: number, example: 80 }
 *                         activeDays: { type: integer, example: 5 }
 *                         completedChapters: { type: integer, example: 2 }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效或已过期。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "获取学习周报时发生异常。" }
 */
router.get("/stats/weekly", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /stats/weekly] 收到请求，userId: " + req.userId);
  try {
    const data = await statsExtraRepo.getWeeklyReport(req.userId);
    return res.json({ code: 200, message: "ok", data });
  } catch (error) {
    console.error(TAG + "[GET /stats/weekly] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取学习周报时发生异常: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/stats/leaderboard:
 *   get:
 *     tags: [统计数据]
 *     summary: 获取学习时长/刷题量排行榜
 *     description: 返回指定窗口（默认 7 天）内学习时长或刷题量的 Top 20 用户排行（昵称或脱敏邮箱）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [study, quiz], default: study }
 *         required: false
 *         description: 排行类型：study=学习时长榜 / quiz=刷题量榜
 *       - in: query
 *         name: days
 *         schema: { type: integer, minimum: 1, maximum: 30, default: 7 }
 *         required: false
 *         description: 统计窗口天数
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank: { type: integer, example: 1 }
 *                       userId: { type: string, example: "1" }
 *                       name: { type: string, example: "小明" }
 *                       value: { type: integer, example: 3600 }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *       500:
 *         description: 服务器内部错误
 */
router.get("/stats/leaderboard", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /stats/leaderboard] 收到请求，userId: " + req.userId);
  try {
    const type = req.query.type === "quiz" ? "quiz" : "study";
    const days = parseInt(req.query.days, 10) || 7;
    const data = await statsExtraRepo.getLeaderboard(type, days);
    return res.json({ code: 200, message: "ok", data });
  } catch (error) {
    console.error(TAG + "[GET /stats/leaderboard] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取排行榜时发生异常: " + error.message });
  }
});

module.exports = router;
