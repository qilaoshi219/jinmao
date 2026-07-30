// ==================== 题库管理路由模块 ====================
// 职责：提供题库的列表、详情、删除功能
// 端点：GET/DELETE /api/v1/quiz/textbooks

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const quizRepo = require("../../repo/quiz_repo");

// 日志前缀
const TAG = "[API_quiz_textbooks]";

/**
 * @openapi
 * /api/v1/quiz/textbooks:
 *   get:
 *     tags: [题库]
 *     summary: 获取用户题库列表
 *     description: 分页查询当前用户导入的所有题库，支持关键词搜索
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 10, maximum: 50 }
 *       - name: keyword
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items: { type: array, items: { type: object } }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器错误
 */
router.get("/textbooks", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /textbooks] 收到题库列表请求，userId: " + req.userId);

  try {
    // 解析查询参数
    let page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) page = 1;

    let pageSize = parseInt(req.query.pageSize, 10);
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;
    if (pageSize > 50) pageSize = 50;

    const keyword = req.query.keyword || undefined;

    // 调用 repo 层
    const result = await quizRepo.listTextbooks(req.userId, page, pageSize, keyword);

    if (result.code !== 200) {
      return res.status(500).json({
        code: 500,
        message: result.message,
        data: null,
      });
    }

    // BigInt → String 转换
    const items = result.data.items.map((tb) => ({
      id: String(tb.id),
      userId: String(tb.userId),
      name: tb.name,
      description: tb.description,
      totalQuestions: tb.totalQuestions,
      totalExams: tb.totalExams,
      createTime: tb.createTime,
      updateTime: tb.updateTime,
      ownType: tb.ownType || "own",         // 新增：own / borrowed
      creatorNickname: tb.creatorNickname || null, // 新增：创建者昵称（借用时显示）
      isShared: tb.isShared || false,       // 新增：是否已共享
    }));

    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        items,
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.pageSize,
      },
    });
  } catch (error) {
    console.error(TAG + " [GET /textbooks] 异常: " + error.message);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误: " + error.message,
      data: null,
    });
  }
});

/**
 * @openapi
 * /api/v1/quiz/textbooks/{id}:
 *   get:
 *     tags: [题库]
 *     summary: 获取题库详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 查询成功
 *       404:
 *         description: 题库不存在
 */
router.get("/textbooks/:id", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /textbooks/:id] 收到详情请求，id: " + req.params.id);

  try {
    const result = await quizRepo.getTextbookDetail(req.params.id, req.userId);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    const tb = result.data;
    return res.status(200).json({
      code: 0,
      message: "查询成功",
      data: {
        id: String(tb.id),
        userId: String(tb.userId),
        name: tb.name,
        description: tb.description,
        totalQuestions: tb.totalQuestions,
        totalExams: tb.totalExams,
        createTime: tb.createTime,
        updateTime: tb.updateTime,
        isShared: tb.isShared || false,       // 新增：是否已共享
        ownType: tb.ownType || "own",         // 新增：own / borrowed / market
        creatorNickname: tb.creatorNickname || null, // 新增：创建者昵称
        exams: (tb.exams || []).map((e) => ({
          id: String(e.id),
          name: e.name,
          questionCount: e.questionCount,
          createTime: e.createTime,
        })),
      },
    });
  } catch (error) {
    console.error(TAG + " [GET /textbooks/:id] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/textbooks/{id}:
 *   delete:
 *     tags: [题库]
 *     summary: 删除题库（含关联数据）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 题库不存在
 */
router.delete("/textbooks/:id", authenticateToken, async (req, res) => {
  console.log(TAG + " [DELETE /textbooks/:id] 收到删除请求，id: " + req.params.id);

  try {
    const result = await quizRepo.deleteTextbook(req.params.id, req.userId);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    return res.status(200).json({ code: 0, message: result.message, data: null });
  } catch (error) {
    console.error(TAG + " [DELETE /textbooks/:id] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

// ==================== 共享/取消共享端点 ====================

/**
 * @openapi
 * /api/v1/quiz/textbooks/{id}/share:
 *   put:
 *     tags: [题库]
 *     summary: 切换题库共享状态
 *     description: 将题库标记为共享（发布到题库市场）或取消共享。仅题库所有者可操作。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: 题库ID
 *     responses:
 *       200:
 *         description: 切换成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     isShared: { type: boolean, description: "新的共享状态" }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 题库不存在或无权操作
 *       500:
 *         description: 服务器错误
 */
router.put("/textbooks/:id/share", authenticateToken, async (req, res) => {
  console.log(TAG + " [PUT /textbooks/:id/share] 收到共享切换请求，id: " + req.params.id + ", userId: " + req.userId);

  try {
    const result = await quizRepo.toggleShareStatus(req.params.id, req.userId);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    return res.status(200).json({
      code: 0,
      message: result.message,
      data: { isShared: result.data.isShared },
    });
  } catch (error) {
    console.error(TAG + " [PUT /textbooks/:id/share] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
