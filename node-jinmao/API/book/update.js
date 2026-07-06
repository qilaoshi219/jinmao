// ==================== 教材更新路由模块 ====================
// 职责：提供教材信息更新功能（待实现）
// 端点：PUT /api/v1/books/:id
// 鉴权：需 Bearer Token（authenticateToken 中间件）

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例

// 导入 JWT 鉴权中间件（路径从 API/book/update.js 向上两级到项目根目录）
const { authenticateToken } = require("../../middleware/auth");

// 日志前缀
const TAG = "[API_book_update]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books/{id}:
 *   put:
 *     tags: [教材]
 *     summary: 更新教材信息（待实现）
 *     description: 更新指定教材的名称、描述等信息。仅允许教材所有者操作。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID（纯数字）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 description: 新教材名称
 *               description:
 *                 type: string
 *                 description: 新教材描述
 *           example:
 *             name: "高等数学（修订版）"
 *             description: "更新后的教材描述"
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "更新成功" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "1", description: "教材 ID" }
 *                     name: { type: string, example: "高等数学（修订版）", description: "更新后的教材名称" }
 *       400:
 *         description: 参数不合法
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 400 }
 *                 message: { type: string, example: "教材名称不能为空。" }
 *       401:
 *         description: 未认证 / Token 无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 401 }
 *                 message: { type: string, example: "Token 无效，请重新登录。" }
 *       403:
 *         description: 无权操作（教材不属于当前用户）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 403 }
 *                 message: { type: string, example: "无权操作该教材。" }
 *       404:
 *         description: 教材不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 404 }
 *                 message: { type: string, example: "教材不存在。" }
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 500 }
 *                 message: { type: string, example: "服务器内部错误，请稍后再试。" }
 */

/**
 * PUT /api/v1/books/:id — 更新教材信息（待实现）
 */
router.put("/books/:id", authenticateToken, async (req, res) => {
  const bookId = req.params.id;
  console.log(TAG + "[PUT /books/:id] 收到教材更新请求，bookId: " + bookId + "，userId: " + req.userId);

  // TODO: 调用 Service/Repo 层更新教材信息
  return res.status(200).json({
    code: 0,
    message: "待实现",
    data: {},
  });
});

// 导出路由实例，供 index.js 合并
module.exports = router;
