// ==================== 课程评价路由模块 ====================
// 职责：课程评分与评价的增删查（同一用户同一课程仅一条，upsert）
// 端点列表：
//   GET    /api/v1/courses/:courseId/reviews — 评价列表 + 平均分/总数
//   POST   /api/v1/courses/:courseId/reviews — 提交/更新评价（需 Token）
//   DELETE /api/v1/courses/:courseId/reviews — 删除我的评价（需 Token）

const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");
const bookRepo = require("../utils/repo/book_repo");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_reviews]";

/** 校验课程存在 */
async function assertCourseExists(courseId) {
  const result = await bookRepo.getCourseById(courseId);
  return result.code === 200;
}

/**
 * @openapi
 * /api/v1/courses/{courseId}/reviews:
 *   get:
 *     tags: [课程评价]
 *     summary: 获取课程评价列表
 *     description: 返回课程全部评价（含用户昵称/评分/内容）及平均分统计；当前登录用户可传 own=true 识别自己的评价。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
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
 *                     summary:
 *                       type: object
 *                       properties:
 *                         avgRating: { type: number }
 *                         count: { type: integer }
 *                     reviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           userId: { type: string }
 *                           userName: { type: string }
 *                           rating: { type: integer }
 *                           content: { type: string }
 *                           createTime: { type: string }
 *                           mine: { type: boolean }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/:courseId/reviews", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET reviews] courseId: " + req.params.courseId);
  try {
    if (!(await assertCourseExists(req.params.courseId))) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    const rows = await prisma.courseReview.findMany({
      where: { courseId: BigInt(req.params.courseId) },
      orderBy: { updateTime: "desc" },
      include: { user: { select: { nickname: true, email: true } } },
    });
    const count = rows.length;
    const avg = count > 0 ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
    const reviews = rows.map((r) => ({
      id: String(r.id),
      userId: String(r.userId),
      userName: r.user.nickname || (r.user.email ? r.user.email.split("@")[0] : "匿名学员"),
      rating: r.rating,
      content: r.content,
      createTime: r.createTime,
      mine: String(r.userId) === String(req.userId),
    }));
    return res.json({ code: 200, message: "ok", data: { summary: { avgRating: avg, count }, reviews } });
  } catch (error) {
    console.error(TAG + "[GET reviews] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取评价失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/reviews:
 *   post:
 *     tags: [课程评价]
 *     summary: 提交/更新课程评价
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               content: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: 提交成功
 *       400:
 *         description: 参数不合法
 *       401:
 *         description: 未认证
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/reviews", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST review] courseId: " + req.params.courseId);
  try {
    if (!(await assertCourseExists(req.params.courseId))) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    const rating = parseInt(req.body?.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ code: 400, message: "评分必须为 1-5 的整数。", data: null });
    }
    const content = String(req.body?.content || "").trim().slice(0, 1000);

    await prisma.courseReview.upsert({
      where: { userId_courseId: { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) } },
      create: { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId), rating, content },
      update: { rating, content },
    });
    return res.json({ code: 200, message: "评价已提交" });
  } catch (error) {
    console.error(TAG + "[POST review] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "提交评价失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/reviews:
 *   delete:
 *     tags: [课程评价]
 *     summary: 删除我的课程评价
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/courses/:courseId/reviews", authenticateToken, async (req, res) => {
  console.log(TAG + "[DELETE review] courseId: " + req.params.courseId);
  try {
    await prisma.courseReview.deleteMany({
      where: { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) },
    });
    return res.json({ code: 200, message: "评价已删除" });
  } catch (error) {
    console.error(TAG + "[DELETE review] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "删除评价失败: " + error.message });
  }
});

module.exports = router;
