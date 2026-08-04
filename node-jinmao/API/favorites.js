// ==================== 课程收藏路由模块 ====================
// 职责：课程收藏的增删查
// 端点列表：
//   GET    /api/v1/favorites — 收藏列表（分页）
//   GET    /api/v1/courses/:courseId/favorite-status — 查询是否已收藏
//   POST   /api/v1/courses/:courseId/favorite — 添加收藏（幂等）
//   DELETE /api/v1/courses/:courseId/favorite — 取消收藏

const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");
const bookRepo = require("../utils/repo/book_repo");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_favorites]";

/**
 * @openapi
 * /api/v1/favorites:
 *   get:
 *     tags: [课程学习]
 *     summary: 获取收藏课程列表
 *     description: 分页返回当前用户收藏的课程（按收藏时间倒序）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         required: false
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *         required: false
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
 *                     list:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           name: { type: string }
 *                           subtitle: { type: string }
 *                           coverPath: { type: string }
 *                           pipelineStatus: { type: string }
 *                           chapterCount: { type: integer }
 *                           createTime: { type: string }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/favorites", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /favorites] 收到请求，userId: " + req.userId);
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 50);
    const uid = BigInt(req.userId);

    const [total, rows] = await Promise.all([
      prisma.courseFavorite.count({ where: { userId: uid } }),
      prisma.courseFavorite.findMany({
        where: { userId: uid },
        orderBy: { createTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          course: {
            select: {
              id: true,
              name: true,
              subtitle: true,
              coverPath: true,
              pipelineStatus: true,
              createTime: true,
              updateTime: true,
              _count: { select: { chapters: true } },
            },
          },
        },
      }),
    ]);

    const list = rows.map((r) => ({
      id: String(r.course.id),
      name: r.course.name,
      subtitle: r.course.subtitle,
      coverPath: r.course.coverPath,
      pipelineStatus: r.course.pipelineStatus,
      chapterCount: r.course._count.chapters,
      createTime: r.course.createTime,
      favorite: true,
    }));

    return res.json({ code: 200, message: "ok", data: { list, total, page, pageSize } });
  } catch (error) {
    console.error(TAG + "[GET /favorites] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取收藏列表时发生异常: " + error.message });
  }
});

/** 校验课程存在（复用 bookRepo） */
async function assertCourseExists(courseId) {
  const result = await bookRepo.getCourseById(courseId);
  return result.code === 200;
}

/**
 * @openapi
 * /api/v1/courses/{courseId}/favorite-status:
 *   get:
 *     tags: [课程学习]
 *     summary: 查询课程是否已收藏
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     favorite: { type: boolean }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/:courseId/favorite-status", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET favorite-status] courseId: " + req.params.courseId);
  try {
    if (!(await assertCourseExists(req.params.courseId))) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    const count = await prisma.courseFavorite.count({
      where: { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) },
    });
    return res.json({ code: 200, message: "ok", data: { favorite: count > 0 } });
  } catch (error) {
    console.error(TAG + "[GET favorite-status] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "查询收藏状态时发生异常: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/favorite:
 *   post:
 *     tags: [课程学习]
 *     summary: 收藏课程（幂等）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 收藏成功
 *       401:
 *         description: 未认证
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/favorite", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST favorite] courseId: " + req.params.courseId);
  try {
    if (!(await assertCourseExists(req.params.courseId))) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    await prisma.courseFavorite.createMany({
      data: [{ userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) }],
      skipDuplicates: true,
    });
    return res.json({ code: 200, message: "已收藏", data: { favorite: true } });
  } catch (error) {
    console.error(TAG + "[POST favorite] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "收藏失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/favorite:
 *   delete:
 *     tags: [课程学习]
 *     summary: 取消收藏
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 取消收藏成功
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/courses/:courseId/favorite", authenticateToken, async (req, res) => {
  console.log(TAG + "[DELETE favorite] courseId: " + req.params.courseId);
  try {
    await prisma.courseFavorite.deleteMany({
      where: { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) },
    });
    return res.json({ code: 200, message: "已取消收藏", data: { favorite: false } });
  } catch (error) {
    console.error(TAG + "[DELETE favorite] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "取消收藏失败: " + error.message });
  }
});

module.exports = router;
