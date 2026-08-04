// ==================== 结业证书路由模块 ====================
// 职责：查询课程结业状态（是否满足发证条件）
// 端点：
//   GET /api/v1/courses/:courseId/certificate-status — 结业状态（需 Token）

const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");
const bookRepo = require("../utils/repo/book_repo");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_certificate]";

/**
 * @openapi
 * /api/v1/courses/{courseId}/certificate-status:
 *   get:
 *     tags: [课程学习]
 *     summary: 查询课程结业状态
 *     description: 判断用户是否学完课程全部章节（progress >= 章节总页数），返回发证所需信息。
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
 *                     canIssue: { type: boolean }
 *                     courseId: { type: string }
 *                     courseName: { type: string }
 *                     totalChapters: { type: integer }
 *                     finishedChapters: { type: integer }
 *                     userName: { type: string }
 *                     completedAt: { type: string }
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权访问该课程
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/:courseId/certificate-status", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET certificate-status] 收到请求，userId: " + req.userId + "，courseId: " + req.params.courseId);
  try {
    const courseId = String(req.params.courseId);
    if (!/^\d+$/.test(courseId)) {
      return res.status(400).json({ code: 400, message: "课程 ID 格式无效。", data: null });
    }

    const courseResult = await bookRepo.getCourseById(courseId);
    if (courseResult.code === 404) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    if (courseResult.code !== 200) {
      return res.status(500).json({ code: 500, message: courseResult.message || "课程查询失败。", data: null });
    }
    if (String(courseResult.course.userId) !== String(req.userId)) {
      return res.status(403).json({ code: 403, message: "无权访问该课程。", data: null });
    }

    const course = courseResult.course;
    const chapters = await prisma.chapter.findMany({
      where: { courseId: course.id, isDeleted: false, status: { in: ["completed", "partial_completed"] } },
      select: { id: true, totalPages: true },
    });
    const totalChapters = chapters.length;

    // 用户每章学习进度（无记录按 0 处理）
    const records = await prisma.userStudyRecord.findMany({
      where: { userId: BigInt(req.userId), chapterId: { in: chapters.map((c) => c.id) }, isDeleted: false },
      select: { chapterId: true, progress: true, updateTime: true },
    });
    const recordByChapter = new Map(records.map((r) => [String(r.chapterId), r]));
    const finishedChapters = chapters.filter((c) => {
      const rec = recordByChapter.get(String(c.id));
      return rec && c.totalPages > 0 && rec.progress >= c.totalPages;
    }).length;

    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.userId) },
      select: { nickname: true, email: true },
    });
    const userName = user?.nickname || (user?.email ? user.email.split("@")[0] : "学员");

    // 结业日期：最后一章完成时间（无则用当前时间）
    let completedAt = null;
    const finishedRecord = records
      .filter((r) => r.progress >= 0)
      .sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime))[0];
    if (finishedRecord && finishedChapters === totalChapters) {
      completedAt = finishedRecord.updateTime.toISOString();
    }

    return res.json({
      code: 200,
      message: "ok",
      data: {
        canIssue: totalChapters > 0 && finishedChapters >= totalChapters,
        courseId: String(course.id),
        courseName: course.name,
        totalChapters,
        finishedChapters,
        userName,
        completedAt,
      },
    });
  } catch (error) {
    console.error(TAG + "[GET certificate-status] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "查询结业状态时发生异常: " + error.message });
  }
});

module.exports = router;
