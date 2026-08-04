// ==================== 公开课广场路由模块 ====================
// 职责：课程公开/借用（类比题库市场），提供广场列表与我的公开课/借阅
// 端点列表：
//   GET    /api/v1/courses/market — 广场课程列表（分页/关键词，排除自己的课程）
//   GET    /api/v1/courses/market/mine — 我的公开课 + 借阅的课程
//   GET    /api/v1/courses/:courseId/market-status — 课程的公开/借阅状态
//   POST   /api/v1/courses/:courseId/publish — 发布/取消发布公开课（仅所有者）
//   POST   /api/v1/courses/:courseId/borrow — 借阅公开课
//   DELETE /api/v1/courses/:courseId/borrow — 取消借阅

const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");
const bookRepo = require("../utils/repo/book_repo");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_course_market]";

/** 校验课程归属（复用 bookRepo + 手动比对 userId） */
async function assertCourseOwner(courseId, userId) {
  const result = await bookRepo.getCourseById(courseId);
  if (result.code !== 200) return { code: result.code === 404 ? 404 : 500, message: result.message || "课程查询失败。" };
  if (String(result.course.userId) !== String(userId)) return { code: 403, message: "无权操作该课程。" };
  return { code: 200, course: result.course };
}

/** 获取我借阅的课程 ID 集合 */
async function getMyBorrowedIds(userId) {
  const rows = await prisma.courseBorrow.findMany({
    where: { userId: BigInt(userId) },
    select: { courseId: true },
  });
  return new Set(rows.map((r) => String(r.courseId)));
}

/** 课程对象 → 广场卡片数据 */
function toMarketItem(course, owner, borrowedByMe, borrowCount, mine) {
  return {
    id: String(course.id),
    name: course.name,
    subtitle: course.subtitle,
    coverPath: course.coverPath,
    pipelineStatus: course.pipelineStatus,
    chapterCount: course._count?.chapters || 0,
    isPublic: course.isPublic,
    ownerId: String(course.userId),
    ownerName: owner?.nickname || (owner?.email ? owner.email.split("@")[0] : "匿名"),
    borrowedByMe,
    borrowCount,
    mine,
  };
}

/**
 * @openapi
 * /api/v1/courses/market:
 *   get:
 *     tags: [公开课广场]
 *     summary: 公开课广场列表
 *     description: 分页返回已发布的公开课（排除自己发布的），支持关键词过滤，标记是否已借阅。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 查询成功
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/market", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET market] 收到请求，userId: " + req.userId);
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 50);
    const keyword = String(req.query.keyword || "").trim();
    const where = {
      isDeleted: false,
      isPublic: true,
      userId: { not: BigInt(req.userId) },
      ...(keyword ? { name: { contains: keyword } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { updateTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { chapters: true, courseBorrows: true } },
          user: { select: { nickname: true, email: true } },
        },
      }),
    ]);
    const borrowedIds = await getMyBorrowedIds(req.userId);
    const list = rows.map((c) =>
      toMarketItem(c, c.user, borrowedIds.has(String(c.id)), c._count.courseBorrows, false)
    );
    return res.json({ code: 200, message: "ok", data: { list, total, page, pageSize } });
  } catch (error) {
    console.error(TAG + "[GET market] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取公开课广场失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/market/mine:
 *   get:
 *     tags: [公开课广场]
 *     summary: 我的公开课与借阅
 *     description: 返回我发布的公开课和借阅的公开课。
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 查询成功
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/market/mine", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET market/mine] 收到请求，userId: " + req.userId);
  try {
    const [published, borrowed] = await Promise.all([
      prisma.course.findMany({
        where: { userId: BigInt(req.userId), isDeleted: false, isPublic: true },
        orderBy: { updateTime: "desc" },
        include: {
          _count: { select: { chapters: true, courseBorrows: true } },
          user: { select: { nickname: true, email: true } },
        },
      }),
      prisma.course.findMany({
        where: {
          isDeleted: false,
          isPublic: true,
          courseBorrows: { some: { userId: BigInt(req.userId) } },
        },
        orderBy: { updateTime: "desc" },
        include: {
          _count: { select: { chapters: true, courseBorrows: true } },
          user: { select: { nickname: true, email: true } },
        },
      }),
    ]);
    const borrowedIds = new Set(borrowed.map((c) => String(c.id)));
    return res.json({
      code: 200,
      message: "ok",
      data: {
        published: published.map((c) => toMarketItem(c, c.user, false, c._count.courseBorrows, true)),
        borrowed: borrowed.map((c) => toMarketItem(c, c.user, true, c._count.courseBorrows, false)),
      },
    });
  } catch (error) {
    console.error(TAG + "[GET market/mine] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取我的公开课失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/market-status:
 *   get:
 *     tags: [公开课广场]
 *     summary: 课程公开/借阅状态
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
 *       401:
 *         description: 未认证
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/:courseId/market-status", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET market-status] courseId: " + req.params.courseId);
  try {
    const courseResult = await bookRepo.getCourseById(req.params.courseId);
    if (courseResult.code !== 200) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    const course = courseResult.course;
    const [borrowCount, myBorrow] = await Promise.all([
      prisma.courseBorrow.count({ where: { courseId: course.id } }),
      prisma.courseBorrow.count({
        where: { courseId: course.id, userId: BigInt(req.userId) },
      }),
    ]);
    return res.json({
      code: 200,
      message: "ok",
      data: {
        isPublic: course.isPublic,
        owner: String(course.userId) === String(req.userId),
        borrowedByMe: myBorrow > 0,
        borrowCount,
      },
    });
  } catch (error) {
    console.error(TAG + "[GET market-status] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取公开课状态失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/publish:
 *   post:
 *     tags: [公开课广场]
 *     summary: 发布/取消发布公开课
 *     description: 仅课程所有者可操作。
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
 *             required: [publish]
 *             properties:
 *               publish: { type: boolean }
 *     responses:
 *       200:
 *         description: 操作成功
 *       400:
 *         description: 课程未完成，不能发布
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权操作
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/publish", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST publish] courseId: " + req.params.courseId + "，publish: " + req.body?.publish);
  try {
    const check = await assertCourseOwner(req.params.courseId, req.userId);
    if (check.code !== 200) return res.status(check.code).json(check);
    const publish = !!req.body?.publish;
    if (publish) {
      const completed = ["completed", "partial_completed"];
      if (!completed.includes(check.course.pipelineStatus)) {
        return res.status(400).json({ code: 400, message: "课程尚未生成完成，不能发布为公开课。", data: null });
      }
    }
    await prisma.course.update({ where: { id: check.course.id }, data: { isPublic: publish } });
    return res.json({ code: 200, message: publish ? "已发布为公开课" : "已取消发布", data: { isPublic: publish } });
  } catch (error) {
    console.error(TAG + "[POST publish] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "发布操作失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/borrow:
 *   post:
 *     tags: [公开课广场]
 *     summary: 借阅公开课
 *     description: 不能借阅自己的课程；课程必须已发布。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 借阅成功
 *       400:
 *         description: 课程未发布或不能借阅自己的课程
 *       401:
 *         description: 未认证
 *       404:
 *         description: 课程不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/borrow", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST borrow] courseId: " + req.params.courseId);
  try {
    const courseResult = await bookRepo.getCourseById(req.params.courseId);
    if (courseResult.code !== 200) {
      return res.status(404).json({ code: 404, message: "课程不存在。", data: null });
    }
    const course = courseResult.course;
    if (!course.isPublic) return res.status(400).json({ code: 400, message: "该课程未发布为公开课。", data: null });
    if (String(course.userId) === String(req.userId)) {
      return res.status(400).json({ code: 400, message: "不能借阅自己的课程。", data: null });
    }
    await prisma.courseBorrow.createMany({
      data: [{ userId: BigInt(req.userId), courseId: course.id }],
      skipDuplicates: true,
    });
    return res.json({ code: 200, message: "借阅成功，可在「我的借阅」中学习", data: { borrowed: true } });
  } catch (error) {
    console.error(TAG + "[POST borrow] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "借阅失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/borrow:
 *   delete:
 *     tags: [公开课广场]
 *     summary: 取消借阅公开课
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 取消借阅成功
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/courses/:courseId/borrow", authenticateToken, async (req, res) => {
  console.log(TAG + "[DELETE borrow] courseId: " + req.params.courseId);
  try {
    await prisma.courseBorrow.deleteMany({
      where: { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) },
    });
    return res.json({ code: 200, message: "已取消借阅", data: { borrowed: false } });
  } catch (error) {
    console.error(TAG + "[DELETE borrow] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "取消借阅失败: " + error.message });
  }
});

module.exports = router;
