// ==================== 教材 CRUD 路由模块（待实现） ====================
// 职责：提供教材资源的完整 CRUD 操作（列表、详情、更新、删除）
// 使用 Express Router 管理路由，挂载到 /api/v1 前缀下
// 端点列表：
//   GET    /api/v1/books          — 获取用户教材列表
//   GET    /api/v1/books/:id       — 获取教材详情
//   PUT    /api/v1/books/:id       — 更新教材信息
//   DELETE /api/v1/books/:id       — 删除教材

const express = require("express"); // Express 框架
const router = express.Router(); // 创建路由实例

// 导入 JWT 鉴权中间件
const { authenticateToken } = require("../middleware/auth");

// 日志前缀
const TAG = "[API_book]";

// ==================== 路由定义 ====================

/**
 * @openapi
 * /api/v1/books:
 *   get:
 *     tags: [教材]
 *     summary: 获取用户教材列表（待实现）
 *     description: 分页查询当前用户的所有教材，支持关键词搜索。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码（从 1 开始）
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 每页条数（最大 50）
 *       - name: keyword
 *         in: query
 *         schema:
 *           type: string
 *         description: 搜索关键词（模糊匹配教材名称）
 *     responses:
 *       200:
 *         description: 查询成功
 *       401:
 *         description: 未认证
 */

/**
 * GET /api/v1/books — 获取用户教材列表（待实现）
 *
 * 查询参数：
 *   - page: 页码（默认 1）
 *   - pageSize: 每页条数（默认 10，最大 50）
 *   - keyword: 搜索关键词（可选）
 */
router.get("/books", authenticateToken, async (req, res) => {
  console.log(TAG + "[GET /books] 收到教材列表请求，userId: " + req.userId);

  // TODO: 调用 Service/Repo 层实现分页查询
  return res.status(200).json({
    code: 0,
    message: "待实现",
    data: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    },
  });
});

/**
 * @openapi
 * /api/v1/books/{id}:
 *   get:
 *     tags: [教材]
 *     summary: 获取教材详情（待实现）
 *     description: 根据教材 ID 获取教材的完整详细信息。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID
 *     responses:
 *       200:
 *         description: 查询成功
 *       401:
 *         description: 未认证
 *       404:
 *         description: 教材不存在
 */

/**
 * GET /api/v1/books/:id — 获取教材详情（待实现）
 */
router.get("/books/:id", authenticateToken, async (req, res) => {
  const bookId = req.params.id;
  console.log(TAG + "[GET /books/:id] 收到教材详情请求，bookId: " + bookId + "，userId: " + req.userId);

  // TODO: 调用 Service/Repo 层查询教材详情
  return res.status(200).json({
    code: 0,
    message: "待实现",
    data: {},
  });
});

/**
 * @openapi
 * /api/v1/books/{id}:
 *   put:
 *     tags: [教材]
 *     summary: 更新教材信息（待实现）
 *     description: 更新指定教材的名称、描述等信息。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 新教材名称
 *               description:
 *                 type: string
 *                 description: 新教材描述
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       404:
 *         description: 教材不存在
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

/**
 * @openapi
 * /api/v1/books/{id}:
 *   delete:
 *     tags: [教材]
 *     summary: 删除教材（待实现）
 *     description: 软删除指定教材（标记 isDeleted=true，不删除 MinIO 文件）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 教材 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 未认证
 *       404:
 *         description: 教材不存在
 */

/**
 * DELETE /api/v1/books/:id — 删除教材（待实现）
 */
router.delete("/books/:id", authenticateToken, async (req, res) => {
  const bookId = req.params.id;
  console.log(TAG + "[DELETE /books/:id] 收到教材删除请求，bookId: " + bookId + "，userId: " + req.userId);

  // TODO: 调用 Service/Repo 层软删除教材
  return res.status(200).json({
    code: 0,
    message: "待实现",
    data: {},
  });
});

// 导出路由实例，供 app.js 挂载
module.exports = router;
