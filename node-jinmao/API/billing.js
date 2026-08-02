// ==================== 账单查询 API 路由 ====================
// 职责：提供当前用户的账务摘要和扣费记录分页查询
// 端点：GET /api/v1/billing?page=1&pageSize=20
// 鉴权：需 JWT Bearer Token（authenticateToken 中间件）
// 所有金额字段以字符串形式返回，精确到小数点后 7 位

const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authenticateToken } = require("../middleware/auth");   // JWT 鉴权中间件
const userRepo = require("../utils/repo/user_repo");           // 用户数据仓库
const { CALL_TAG_LABELS } = require("../utils/billing");      // 计费标签中文映射

// ==================== Prisma 客户端初始化 ====================
const prisma = new PrismaClient();

// 日志前缀
const TAG = "[billing_api]";

/**
 * @openapi
 * /api/v1/billing:
 *   get:
 *     summary: 获取当前用户的账单信息
 *     description: 返回用户 VIP 等级、开通计划、余额、已使用金额和扣费记录分页列表
 *     security:
 *       - bearerAuth: []
 *     tags:
 *       - 账单
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码（从 1 开始）
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: 每页记录数（最大 100）
 *     responses:
 *       200:
 *         description: 成功返回账单信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: "ok"
 *                 data:
 *                   type: object
 *                   properties:
 *                     vipLevel:
 *                       type: string
 *                       example: "free"
 *                     plan:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     balance:
 *                       type: string
 *                       example: "0.0000000"
 *                     totalUsed:
 *                       type: string
 *                       example: "12.5000000"
 *                     records:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           provider:
 *                             type: string
 *                           model:
 *                             type: string
 *                           callTag:
 *                             type: string
 *                           callTagLabel:
 *                             type: string
 *                           totalCost:
 *                             type: string
 *                           status:
 *                             type: string
 *                           errorMessage:
 *                             type: string
 *                             nullable: true
 *                             description: 失败原因（仅失败时有值）
 *                           retryCount:
 *                             type: integer
 *                             description: 重试次数（0 表示首次调用）
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         total:
 *                           type: integer
 *       401:
 *         description: 未登录或 Token 无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 500
 *                 message:
 *                   type: string
 */
router.get("/billing", authenticateToken, async (req, res) => {
  console.log(TAG + " ======== 收到账单查询请求 ========");
  console.log(TAG + " userId: " + req.userId);

  try {
    // ========== 1. 解析分页参数 ==========
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 20;

    // 参数校验：页码最小为 1
    if (page < 1) page = 1;
    // 每页记录数限制在 1-100 之间
    if (pageSize < 1) pageSize = 1;
    if (pageSize > 100) pageSize = 100;

    console.log(TAG + " 分页参数: page=" + page + ", pageSize=" + pageSize);

    // ========== 2. 查询用户基础信息 ==========
    const userResult = await userRepo.findById(req.userId);
    if (userResult.code !== 200) {
      console.log(TAG + " 查询用户失败: code=" + userResult.code);
      return res.status(userResult.code === 404 ? 404 : 500).json({
        code: userResult.code,
        message: userResult.message || "查询用户信息失败",
      });
    }

    const user = userResult.user;
    console.log(TAG + " 用户信息: vipLevel=" + user.vipLevel + ", plan=" + (user.plan || "null") + ", balance=" + String(user.balance));

    // ========== 3. 查询扣费记录（分页） ==========
    const skip = (page - 1) * pageSize;

    // 并行查询：记录列表 + 总记录数 + 总费用聚合
    const [records, totalCount, totalUsedResult] = await Promise.all([
      // 扣费记录列表（按创建时间倒序）
      prisma.billing_record.findMany({
        where: { user_id: String(req.userId) },
        orderBy: { created_at: "desc" },
        skip: skip,
        take: pageSize,
        select: {
          id: true,
          provider: true,
          model: true,
          call_tag: true,
          total_cost: true,
          status: true,
          error_message: true,   // 失败原因
          retry_count: true,     // 重试次数
          created_at: true,
        },
      }),
      // 总记录数
      prisma.billing_record.count({
        where: { user_id: String(req.userId) },
      }),
      // 已使用金额汇总（SUM of total_cost）
      prisma.billing_record.aggregate({
        where: { user_id: String(req.userId) },
        _sum: { total_cost: true },
      }),
    ]);

    console.log(TAG + " 扣费记录: 当前页 " + records.length + " 条，总计 " + totalCount + " 条");

    // ========== 4. 格式化返回数据 ==========
    // 金额字段转为字符串（Decimal → String），避免 JSON 浮点数精度丢失
    const totalUsed = totalUsedResult._sum.total_cost || 0;

    // 格式化扣费记录列表
    const formattedRecords = records.map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      callTag: r.call_tag,
      callTagLabel: CALL_TAG_LABELS[r.call_tag] || r.call_tag, // 中文标签映射
      totalCost: String(r.total_cost),             // Decimal → 字符串
      status: r.status,
      errorMessage: r.error_message || null,       // 失败原因（仅失败时有值）
      retryCount: r.retry_count || 0,              // 重试次数
      createdAt: r.created_at.toISOString(),        // DateTime → ISO 字符串
    }));

    // 响应数据
    const responseData = {
      vipLevel: user.vipLevel,
      plan: user.plan,
      balance: String(user.balance),               // Decimal → 字符串
      balanceLocked: user.balanceLocked,            // 余额锁定状态
      totalUsed: String(totalUsed),                 // Decimal → 字符串
      records: formattedRecords,
      pagination: {
        page: page,
        pageSize: pageSize,
        total: totalCount,
      },
    };

    console.log(TAG + " 账单查询成功: totalUsed=" + String(totalUsed) + ", records=" + formattedRecords.length);
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "ok",
      data: responseData,
    });
  } catch (err) {
    console.error(TAG + " 账单查询异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);
    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
    });
  }
});

// ==================== 导出路由 ====================
module.exports = router;
