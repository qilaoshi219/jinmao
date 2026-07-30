// ==================== 题库市场路由模块 ====================
// 职责：提供题库市场的浏览、借用、取消借用功能
// 端点：GET/DELETE /api/v1/quiz/market

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/auth");
const quizRepo = require("../../repo/quiz_repo");

// 日志前缀
const TAG = "[API_quiz_market]";

/**
 * @openapi
 * /api/v1/quiz/market:
 *   get:
 *     tags: [题库市场]
 *     summary: 获取题库市场列表
 *     description: 分页查询所有共享的题库，排除自己创建的题库。返回题库基本信息及是否已借用状态。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: 页码（1-based）
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 10, maximum: 50 }
 *         description: 每页条数
 *       - name: keyword
 *         in: query
 *         schema: { type: string }
 *         description: 搜索关键词（模糊匹配题库名称）
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
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, description: "题库ID" }
 *                           name: { type: string, description: "题库名称" }
 *                           description: { type: string, description: "题库描述" }
 *                           totalQuestions: { type: integer, description: "题目总数" }
 *                           totalExams: { type: integer, description: "试卷总数" }
 *                           creatorNickname: { type: string, description: "创建者昵称" }
 *                           isBorrowed: { type: boolean, description: "当前用户是否已借用" }
 *                           createTime: { type: string, description: "创建时间" }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *       401:
 *         description: 未认证
 *       500:
 *         description: 服务器错误
 */
router.get("/market", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /market] 收到市场列表请求，userId: " + req.userId);

  try {
    // 解析查询参数
    let page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) page = 1;

    let pageSize = parseInt(req.query.pageSize, 10);
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;
    if (pageSize > 50) pageSize = 50;

    const keyword = req.query.keyword || undefined;

    // 调用 repo 层
    const result = await quizRepo.listMarketTextbooks(req.userId, page, pageSize, keyword);

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    // BigInt → String 转换
    const items = result.data.items.map((tb) => ({
      id: String(tb.id),
      name: tb.name,
      description: tb.description,
      totalQuestions: tb.totalQuestions,
      totalExams: tb.totalExams,
      createTime: tb.createTime,
      updateTime: tb.updateTime,
      isShared: tb.isShared,
      creatorNickname: tb.creatorNickname,
      isBorrowed: tb.isBorrowed,
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
    console.error(TAG + " [GET /market] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/market/{id}:
 *   get:
 *     tags: [题库市场]
 *     summary: 获取市场题库详情
 *     description: 查看共享题库的详细信息，含试卷列表。任何已认证用户均可查看。
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
 *                     id: { type: string }
 *                     name: { type: string }
 *                     description: { type: string }
 *                     totalQuestions: { type: integer }
 *                     totalExams: { type: integer }
 *                     creatorNickname: { type: string }
 *                     isBorrowed: { type: boolean }
 *                     exams: { type: array, items: { type: object } }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 题库不存在
 *       500:
 *         description: 服务器错误
 */
router.get("/market/:id", authenticateToken, async (req, res) => {
  console.log(TAG + " [GET /market/:id] 收到市场详情请求，id: " + req.params.id);

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
        isShared: tb.isShared || false,
        ownType: tb.ownType || "market",
        creatorNickname: tb.creatorNickname || null,
        exams: (tb.exams || []).map((e) => ({
          id: String(e.id),
          name: e.name,
          questionCount: e.questionCount,
          createTime: e.createTime,
        })),
      },
    });
  } catch (error) {
    console.error(TAG + " [GET /market/:id] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/market/{id}/borrow:
 *   post:
 *     tags: [题库市场]
 *     summary: 借用题库
 *     description: 将共享题库添加到自己的题库列表中。不能借用自己创建的题库，不能重复借用。
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
 *         description: 借用成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "题库借用成功" }
 *                 data: { type: object, nullable: true }
 *       400:
 *         description: 不能借用自己创建的题库 / 已借用
 *       401:
 *         description: 未认证
 *       404:
 *         description: 题库不存在或未共享
 *       500:
 *         description: 服务器错误
 */
router.post("/market/:id/borrow", authenticateToken, async (req, res) => {
  console.log(TAG + " [POST /market/:id/borrow] 收到借用请求，id: " + req.params.id + ", userId: " + req.userId);

  try {
    const result = await quizRepo.borrowTextbook(req.userId, req.params.id);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    if (result.code === 400) {
      return res.status(400).json({ code: 400, message: result.message, data: null });
    }

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    return res.status(200).json({ code: 0, message: result.message, data: null });
  } catch (error) {
    console.error(TAG + " [POST /market/:id/borrow] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

/**
 * @openapi
 * /api/v1/quiz/market/{id}/borrow:
 *   delete:
 *     tags: [题库市场]
 *     summary: 取消借用题库
 *     description: 取消借用共享题库，题库将从用户列表中移除。保留用户已有的历史刷题记录和错题数据。
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
 *         description: 取消借用成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "已取消借用" }
 *                 data: { type: object, nullable: true }
 *       401:
 *         description: 未认证
 *       404:
 *         description: 未借用该题库
 *       500:
 *         description: 服务器错误
 */
router.delete("/market/:id/borrow", authenticateToken, async (req, res) => {
  console.log(TAG + " [DELETE /market/:id/borrow] 收到取消借用请求，id: " + req.params.id + ", userId: " + req.userId);

  try {
    const result = await quizRepo.unborrowTextbook(req.userId, req.params.id);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    return res.status(200).json({ code: 0, message: result.message, data: null });
  } catch (error) {
    console.error(TAG + " [DELETE /market/:id/borrow] 异常: " + error.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误: " + error.message, data: null });
  }
});

module.exports = router;
