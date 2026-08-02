// ==================== 充值 API 路由 ====================
// 职责：提供用户余额充值功能，充值后自动解锁
// 端点：POST /api/v1/recharge
// 鉴权：需 JWT Bearer Token（authenticateToken 中间件）
// 注意：当前为 MVP 版本，提供基础充值能力，后续可接入支付网关

const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authenticateToken } = require("../middleware/auth");   // JWT 鉴权中间件
const { unlockUserOnRecharge } = require("../utils/balance"); // 充值后自动解锁

// ==================== Prisma 客户端初始化 ====================
const prisma = new PrismaClient();

// 日志前缀
const TAG = "[API_recharge]";

/**
 * @openapi
 * /api/v1/recharge:
 *   post:
 *     tags: [账单]
 *     summary: 用户余额充值
 *     description: 为当前登录用户的余额充值指定金额，充值后若余额 > 0 则自动解锁
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: 充值金额（元），必须为正数
 *                 example: 10
 *           example:
 *             amount: 10
 *     responses:
 *       200:
 *         description: 充值成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: "充值成功，余额已更新。" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance: { type: string, example: "10.0000000", description: "充值后的余额" }
 *                     balanceLocked: { type: boolean, example: false, description: "是否已解锁" }
 *       400:
 *         description: 参数错误（金额无效）
 *       401:
 *         description: 未登录或 Token 无效
 */
router.post("/recharge", authenticateToken, async (req, res) => {
    // ========== 充值功能暂未开放，返回 403 防止资金流失 ==========
    // TODO: 充值活动上线后移除此拦截，恢复下方充值逻辑
    return res.status(403).json({
        code: 403,
        message: "充值功能暂未开放，敬请期待充值活动上线。",
        data: null,
    });

    // ===== 以下为充值逻辑（暂不执行）=====
    /* eslint-disable no-unreachable */
    console.log(TAG + " ======== 收到充值请求 ========");
    console.log(TAG + " userId: " + req.userId);

    try {
        const { amount } = req.body;

        // ========== 参数校验 ==========
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            console.log(TAG + " 充值金额无效: " + amount);
            return res.status(400).json({
                code: 400,
                message: "充值金额必须为正数。",
                data: null,
            });
        }

        // 单次充值上限：10000 元
        if (numericAmount > 10000) {
            console.log(TAG + " 充值金额超出上限: " + numericAmount);
            return res.status(400).json({
                code: 400,
                message: "单次充值金额不能超过 ¥10,000。",
                data: null,
            });
        }

        console.log(TAG + " 充值金额: ¥" + numericAmount.toFixed(2));

        // ========== 更新用户余额（原子操作） ==========
        const userId = req.userId;
        const updatedUser = await prisma.user.update({
            where: { id: BigInt(userId), isDeleted: false },
            data: {
                balance: {
                    increment: numericAmount,
                },
            },
            select: { balance: true, balanceLocked: true },
        });

        const newBalance = String(updatedUser.balance);
        console.log(TAG + " 余额更新成功，新余额: ¥" + parseFloat(newBalance).toFixed(6));

        // ========== 充值后自动解锁 ==========
        const unlocked = await unlockUserOnRecharge(userId, parseFloat(newBalance));
        if (unlocked) {
            console.log(TAG + " 用户 " + userId + " 已自动解锁！");
        }

        console.log(TAG + " ================================");

        return res.json({
            code: 0,
            message: "充值成功，余额已更新。" + (unlocked ? " 账户已解锁，可继续使用 AI 功能。" : ""),
            data: {
                balance: newBalance,
                balanceLocked: unlocked ? false : updatedUser.balanceLocked,
            },
        });
    } catch (err) {
        console.error(TAG + " 充值异常: " + err.message);
        console.error(TAG + " 错误堆栈: " + err.stack);

        if (err.code === "P2025") {
            return res.status(404).json({
                code: 404,
                message: "用户不存在。",
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

module.exports = router;
