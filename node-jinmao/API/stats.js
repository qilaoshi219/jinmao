// ==================== 统计数据路由模块 ====================
// 职责：收发 HTTP 请求/响应，调用 stats_repo 层聚合并返回首页统计数据
// 使用 Express Router 管理路由，挂载到 /api/v1 前缀下
// 端点列表：
//   GET /api/v1/stats — 获取首页 4 项统计数据（需 Token）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例
const statsRepo = require("../utils/repo/stats_repo"); // 统计数据访问层
const { authenticateToken } = require("../middleware/auth"); // JWT 鉴权中间件

// 日志前缀
const TAG = "[API_stats]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/stats:
 *   get:
 *     tags: [统计数据]
 *     summary: 获取首页统计数据
 *     description: 返回当前用户的 4 项首页统计指标：累计学习时长、已完成章节数、习题正确率、连续学习天数。
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
 *                     totalStudyDuration: { type: integer, example: 3600, description: "累计学习时长（秒）" }
 *                     completedChapters: { type: integer, example: 5, description: "已完成章节数" }
 *                     quizAccuracy: { type: number, example: 78.5, description: "习题正确率（百分比）" }
 *                     totalQuizCount: { type: integer, example: 120, description: "总答题数" }
 *                     correctQuizCount: { type: integer, example: 94, description: "答对题数" }
 *                     consecutiveDays: { type: integer, example: 7, description: "连续学习天数" }
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
 *                 message: { type: string, example: "获取统计数据时发生异常。" }
 */

/**
 * GET /api/v1/stats — 获取首页统计数据
 * 需要在请求头携带 Bearer Token
 * 响应：{ code: 200, data: { totalStudyDuration, completedChapters, quizAccuracy, totalQuizCount, correctQuizCount, consecutiveDays } }
 *
 * 鉴权由 authenticateToken 中间件完成
 */
router.get("/stats", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /stats] 收到获取统计数据请求，userId: " + req.userId);

  try {
    // 并行查询 4 项统计数据（互不依赖，利用 Promise.all 提升性能）
    const [totalStudyDuration, completedChapters, quizStats, consecutiveDays] = await Promise.all([
      statsRepo.getTotalStudyDuration(req.userId),
      statsRepo.getCompletedChapters(req.userId),
      statsRepo.getQuizAccuracy(req.userId),
      statsRepo.getConsecutiveDays(req.userId),
    ]);

    // 组装返回数据
    const data = {
      totalStudyDuration,                        // 累计学习时长（秒）
      completedChapters,                         // 已完成章节数
      quizAccuracy: quizStats.accuracy,          // 习题正确率（百分比）
      totalQuizCount: quizStats.totalCount,      // 总答题数
      correctQuizCount: quizStats.correctCount,  // 答对题数
      consecutiveDays,                           // 连续学习天数
    };

    console.log(TAG + "[GET /stats] 统计数据查询完成: " + JSON.stringify(data));
    return res.json({ code: 200, message: "ok", data });
  } catch (error) {
    console.error(TAG + "[GET /stats] 查询异常: " + error.message);
    return res.status(500).json({
      code: 500,
      message: "获取统计数据时发生异常: " + error.message,
    });
  }
});

// 导出路由实例，供 app.js 挂载
module.exports = router;
