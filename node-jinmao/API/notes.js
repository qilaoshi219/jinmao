// ==================== 课程笔记路由模块 ====================
// 职责：课程笔记的增删改查（按课程/章节/页码维度）
// 端点列表：
//   GET    /api/v1/notes — 我的全部笔记（跨课程，含课程/章节名）
//   GET    /api/v1/courses/:courseId/notes — 某课程笔记（可过滤章节/页码）
//   POST   /api/v1/courses/:courseId/chapters/:chapterId/notes — 新建笔记
//   PUT    /api/v1/notes/:noteId — 更新笔记
//   DELETE /api/v1/notes/:noteId — 删除笔记

const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_notes]";

/** 校验笔记归属（返回 200 + note 或错误码） */
async function assertNoteOwnership(userId, noteId) {
  if (!/^\d+$/.test(String(noteId))) return { code: 400, message: "笔记 ID 格式无效。" };
  const note = await prisma.courseNote.findUnique({ where: { id: BigInt(noteId) } });
  if (!note) return { code: 404, message: "笔记不存在。" };
  if (String(note.userId) !== String(userId)) return { code: 403, message: "无权操作该笔记。" };
  return { code: 200, note };
}

/** 校验章节属于课程 */
async function assertChapterOfCourse(courseId, chapterId) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: BigInt(chapterId) },
    select: { id: true, courseId: true, name: true },
  });
  if (!chapter) return { code: 404, message: "章节不存在。" };
  if (String(chapter.courseId) !== String(courseId)) return { code: 400, message: "该章节不属于指定课程。" };
  return { code: 200, chapter };
}

/**
 * @openapi
 * /api/v1/notes:
 *   get:
 *     tags: [课程笔记]
 *     summary: 获取我的全部笔记
 *     description: 返回当前用户所有课程的笔记（含课程名/章节名），按更新时间倒序。
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       courseId: { type: string }
 *                       courseName: { type: string }
 *                       chapterId: { type: string }
 *                       chapterName: { type: string }
 *                       pageNumber: { type: integer }
 *                       color: { type: string }
 *                       content: { type: string }
 *                       updateTime: { type: string }
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/notes", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /notes] 收到请求，userId: " + req.userId);
  try {
    const rows = await prisma.courseNote.findMany({
      where: { userId: BigInt(req.userId) },
      orderBy: { updateTime: "desc" },
      include: {
        course: { select: { id: true, name: true } },
        chapter: { select: { id: true, name: true } },
      },
    });
    const list = rows.map((n) => ({
      id: String(n.id),
      courseId: String(n.courseId),
      courseName: n.course.name,
      chapterId: String(n.chapterId),
      chapterName: n.chapter.name,
      pageNumber: n.pageNumber,
      color: n.color,
      content: n.content,
      updateTime: n.updateTime,
    }));
    return res.json({ code: 200, message: "ok", data: list });
  } catch (error) {
    console.error(TAG + "[GET /notes] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取笔记失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/notes:
 *   get:
 *     tags: [课程笔记]
 *     summary: 获取某课程的笔记
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: chapterId
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 查询成功
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get("/courses/:courseId/notes", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET course notes] courseId: " + req.params.courseId);
  try {
    const where = { userId: BigInt(req.userId), courseId: BigInt(req.params.courseId) };
    if (req.query.chapterId) where.chapterId = BigInt(req.query.chapterId);
    if (req.query.page) where.pageNumber = parseInt(req.query.page, 10);
    const rows = await prisma.courseNote.findMany({
      where,
      orderBy: [{ chapterId: "asc" }, { pageNumber: "asc" }],
      include: { chapter: { select: { name: true } } },
    });
    const list = rows.map((n) => ({
      id: String(n.id),
      courseId: String(n.courseId),
      chapterId: String(n.chapterId),
      chapterName: n.chapter.name,
      pageNumber: n.pageNumber,
      color: n.color,
      content: n.content,
      updateTime: n.updateTime,
    }));
    return res.json({ code: 200, message: "ok", data: list });
  } catch (error) {
    console.error(TAG + "[GET course notes] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "获取笔记失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/courses/{courseId}/chapters/{chapterId}/notes:
 *   post:
 *     tags: [课程笔记]
 *     summary: 新建课程笔记
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               page: { type: integer, default: 1 }
 *               color: { type: string, default: "yellow" }
 *               content: { type: string }
 *     responses:
 *       200:
 *         description: 创建成功
 *       400:
 *         description: 参数不合法或章节不属于课程
 *       401:
 *         description: 未认证
 *       404:
 *         description: 章节不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post("/courses/:courseId/chapters/:chapterId/notes", authenticateToken, async (req, res) => {
  console.log(TAG + "[POST note] courseId: " + req.params.courseId + "，chapterId: " + req.params.chapterId);
  try {
    const check = await assertChapterOfCourse(req.params.courseId, req.params.chapterId);
    if (check.code !== 200) return res.status(check.code).json(check);
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ code: 400, message: "笔记内容不能为空。", data: null });
    if (content.length > 5000) return res.status(400).json({ code: 400, message: "笔记内容过长（最多 5000 字）。", data: null });
    const colors = ["yellow", "green", "blue", "pink"];
    const color = colors.includes(req.body?.color) ? req.body.color : "yellow";
    const page = Math.max(parseInt(req.body?.page, 10) || 1, 1);

    const note = await prisma.courseNote.create({
      data: {
        userId: BigInt(req.userId),
        courseId: BigInt(req.params.courseId),
        chapterId: BigInt(req.params.chapterId),
        pageNumber: page,
        color,
        content,
      },
    });
    return res.json({ code: 200, message: "笔记已保存", data: { id: String(note.id) } });
  } catch (error) {
    console.error(TAG + "[POST note] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "保存笔记失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/notes/{noteId}:
 *   put:
 *     tags: [课程笔记]
 *     summary: 更新笔记
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string }
 *               color: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权操作
 *       404:
 *         description: 笔记不存在
 *       500:
 *         description: 服务器内部错误
 */
router.put("/notes/:noteId", authenticateToken, async (req, res) => {
  console.log(TAG + "[PUT note] noteId: " + req.params.noteId);
  try {
    const check = await assertNoteOwnership(req.userId, req.params.noteId);
    if (check.code !== 200) return res.status(check.code).json(check);
    const data = {};
    if (req.body?.content !== undefined) {
      const content = String(req.body.content || "").trim();
      if (!content) return res.status(400).json({ code: 400, message: "笔记内容不能为空。", data: null });
      data.content = content;
    }
    if (req.body?.color !== undefined) {
      const colors = ["yellow", "green", "blue", "pink"];
      if (!colors.includes(req.body.color)) return res.status(400).json({ code: 400, message: "标记色不合法。", data: null });
      data.color = req.body.color;
    }
    await prisma.courseNote.update({ where: { id: check.note.id }, data });
    return res.json({ code: 200, message: "笔记已更新" });
  } catch (error) {
    console.error(TAG + "[PUT note] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "更新笔记失败: " + error.message });
  }
});

/**
 * @openapi
 * /api/v1/notes/{noteId}:
 *   delete:
 *     tags: [课程笔记]
 *     summary: 删除笔记
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权操作
 *       404:
 *         description: 笔记不存在
 *       500:
 *         description: 服务器内部错误
 */
router.delete("/notes/:noteId", authenticateToken, async (req, res) => {
  console.log(TAG + "[DELETE note] noteId: " + req.params.noteId);
  try {
    const check = await assertNoteOwnership(req.userId, req.params.noteId);
    if (check.code !== 200) return res.status(check.code).json(check);
    await prisma.courseNote.delete({ where: { id: check.note.id } });
    return res.json({ code: 200, message: "笔记已删除" });
  } catch (error) {
    console.error(TAG + "[DELETE note] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "删除笔记失败: " + error.message });
  }
});

module.exports = router;
