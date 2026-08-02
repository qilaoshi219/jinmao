// ==================== 兑换码兑换 API 路由 ====================
// 职责：用户输入兑换码，验证后增加余额（一次性使用，不记名）
// 端点：POST /api/v1/redeem
// 鉴权：需 JWT Bearer Token（无需管理员角色）
// 防滥用：每用户每小时最多兑换3次

const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authenticateToken } = require("../middleware/auth");     // JWT 鉴权中间件
const { unlockUserOnRecharge } = require("../utils/balance");    // 充值后自动解锁

// ==================== Prisma 客户端初始化 ====================
const prisma = new PrismaClient();

// 日志前缀
const TAG = "[API_redeem]";

// ==================== 频率限制（内存） ====================
// 记录每个用户最近兑换的时间戳，限制每小时最多3次
// Key: userId (string), Value: [timestamp1, timestamp2, ...]
const redeemRateLimit = new Map();

/**
 * 检查用户是否超过兑换频率限制
 * @param {string} userId - 用户ID
 * @returns {boolean} true=允许兑换, false=超过限制
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000; // 1小时的毫秒数

  // 获取该用户的兑换时间戳列表
  let timestamps = redeemRateLimit.get(userId);
  if (!timestamps) {
    timestamps = [];
    redeemRateLimit.set(userId, timestamps);
  }

  // 清理1小时前的记录
  const recentTimestamps = timestamps.filter(ts => now - ts < oneHour);

  // 更新记录（保留最近1小时内的）
  redeemRateLimit.set(userId, recentTimestamps);

  // 检查最近1小时内兑换次数
  if (recentTimestamps.length >= 3) {
    console.log(TAG + " 用户 " + userId + " 兑换频率超限（每小时最多3次），当前已兑换 " + recentTimestamps.length + " 次");
    return false;
  }

  return true;
}

/**
 * 记录一次兑换
 * @param {string} userId - 用户ID
 */
function recordRedeem(userId) {
  let timestamps = redeemRateLimit.get(userId);
  if (!timestamps) {
    timestamps = [];
    redeemRateLimit.set(userId, timestamps);
  }
  timestamps.push(Date.now());
}

// ==================== 定期清理过期频率记录 ====================
// 每10分钟清理一次过期记录，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  let cleanedCount = 0;

  for (const [userId, timestamps] of redeemRateLimit.entries()) {
    const recent = timestamps.filter(ts => now - ts < oneHour);
    if (recent.length === 0) {
      redeemRateLimit.delete(userId);
      cleanedCount++;
    } else {
      redeemRateLimit.set(userId, recent);
    }
  }

  if (cleanedCount > 0) {
    console.log(TAG + " 频率限制清理: 移除 " + cleanedCount + " 条过期记录");
  }
}, 10 * 60 * 1000); // 每10分钟

/**
 * @openapi
 * /api/v1/redeem:
 *   post:
 *     tags: [账单]
 *     summary: 兑换码兑换余额
 *     description: 用户输入兑换码，验证后增加10元余额。兑换码一次性使用，不记名。需登录，每用户每小时最多兑换3次。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 description: 兑换码（不区分大小写，自动转为大写）
 *                 example: "A1B2C3D4E5F6G7H8I9J0K1L2"
 *           example:
 *             code: "A1B2C3D4E5F6G7H8I9J0K1L2"
 *     responses:
 *       200:
 *         description: 兑换成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "兑换成功！10元余额已到账。" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     amount: { type: string, example: "10.0000000", description: "本次兑换金额" }
 *                     balance: { type: string, example: "10.0000000", description: "兑换后的余额" }
 *                     balanceLocked: { type: boolean, example: false, description: "是否已解锁" }
 *       400:
 *         description: 参数错误或兑换码无效
 *       401:
 *         description: 未登录或 Token 无效
 *       429:
 *         description: 兑换频率超限（每小时最多3次）
 *       404:
 *         description: 兑换码不存在或已使用
 */
router.post("/redeem", authenticateToken, async (req, res) => {
  console.log(TAG + " ======== 收到兑换码兑换请求 ========");
  console.log(TAG + " userId: " + req.userId);

  try {
    const { code } = req.body;
    const userId = req.userId;

    // ========== 1. 参数校验 ==========
    if (!code || typeof code !== "string" || code.trim() === "") {
      console.log(TAG + " 兑换码参数为空");
      return res.status(400).json({
        code: 400,
        message: "请输入兑换码。",
        data: null,
      });
    }

    // 兑换码转为大写（不区分大小写）
    const normalizedCode = code.trim().toUpperCase();

    // 格式校验：24位大写十六进制字符串
    if (!/^[A-F0-9]{24}$/.test(normalizedCode)) {
      console.log(TAG + " 兑换码格式无效: " + normalizedCode.substring(0, 8) + "...");
      return res.status(400).json({
        code: 400,
        message: "兑换码格式不正确，请检查后重新输入。",
        data: null,
      });
    }

    console.log(TAG + " 兑换码: " + normalizedCode.substring(0, 8) + "***");

    // ========== 2. 频率限制检查 ==========
    if (!checkRateLimit(userId)) {
      return res.status(429).json({
        code: 429,
        message: "兑换频率过高，每小时最多兑换3次，请稍后再试。",
        data: null,
      });
    }

    // ========== 3. 数据库事务：查询 + 标记 + 增加余额 ==========
    // 使用 Prisma 事务保证原子性，防止并发重复兑换
    const result = await prisma.$transaction(async (tx) => {
      // 3.1 查询兑换码
      const redeemCode = await tx.redeem_code.findUnique({
        where: { code: normalizedCode },
      });

      if (!redeemCode) {
        console.log(TAG + " 兑换码不存在: " + normalizedCode.substring(0, 8) + "...");
        throw { status: 404, message: "兑换码不存在，请检查后重新输入。" };
      }

      // 3.2 检查是否已使用
      if (redeemCode.isUsed) {
        console.log(TAG + " 兑换码已使用: " + normalizedCode.substring(0, 8) + "...");
        throw { status: 400, message: "该兑换码已被使用。" };
      }

      const amount = parseFloat(redeemCode.amount);
      console.log(TAG + " 兑换码有效，金额: ¥" + amount.toFixed(2));

      // 3.3 标记兑换码为已使用
      await tx.redeem_code.update({
        where: { id: redeemCode.id },
        data: {
          isUsed: true,
          usedBy: BigInt(userId),
          usedAt: new Date(),
        },
      });

      // 3.4 增加用户余额（原子操作）
      const updatedUser = await tx.user.update({
        where: { id: BigInt(userId), isDeleted: false },
        data: {
          balance: {
            increment: amount,
          },
        },
        select: { balance: true, balanceLocked: true },
      });

      return {
        amount: amount,
        newBalance: parseFloat(String(updatedUser.balance)),
        balanceLocked: updatedUser.balanceLocked,
      };
    });

    // ========== 4. 记录兑换频率 ==========
    recordRedeem(userId);

    // ========== 5. 充值后自动解锁 ==========
    const unlocked = await unlockUserOnRecharge(userId, result.newBalance);
    if (unlocked) {
      console.log(TAG + " 用户 " + userId + " 已自动解锁！");
    }

    const finalBalanceLocked = unlocked ? false : result.balanceLocked;

    console.log(TAG + " ✅ 兑换成功！金额: ¥" + result.amount.toFixed(2) + "，新余额: ¥" + result.newBalance.toFixed(6));
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "兑换成功！¥" + result.amount.toFixed(2) + " 余额已到账。" + (unlocked ? " 账户已解锁，可继续使用 AI 功能。" : ""),
      data: {
        amount: String(result.amount),
        balance: String(result.newBalance),
        balanceLocked: finalBalanceLocked,
      },
    });
  } catch (err) {
    // 判断是否为业务层抛出的错误（非系统异常）
    if (err.status) {
      console.log(TAG + " 兑换失败（业务错误）: " + err.message);
      return res.status(err.status).json({
        code: err.status,
        message: err.message,
        data: null,
      });
    }

    // 系统异常
    console.error(TAG + " ❌ 兑换异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    // Prisma 唯一约束冲突（极低概率的兑换码碰撞）
    if (err.code === "P2002") {
      return res.status(500).json({
        code: 500,
        message: "系统繁忙，请稍后重试。",
        data: null,
      });
    }

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 导出路由 ====================
module.exports = router;
