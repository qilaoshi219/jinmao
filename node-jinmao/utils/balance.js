// ==================== 余额管理模块 ====================
// 职责：统一管理用户余额的检查、扣减、锁定/解锁逻辑
// 设计原则：
//   - 单一扣费点：所有扣费由 billing.js 触发，此处提供原子扣减接口
//   - 前置校验 + 后置锁定：操作前检查锁定状态，操作后检查余额是否变负并锁定
//   - 锁定即阻断：balanceLocked=true 时拒绝所有 AI 消费操作
//   - 充值即解锁：充值后余额>0 时自动清除锁定
//
// 导出的函数：
//   checkCanUseAI(userId)        — 前置校验：用户是否可以发起 AI 消费
//   lockUserIfNegative(userId)   — 后置检查：若余额 < 0，自动锁定用户
//   deductBalance(userId, amount) — 原子扣减余额（被 billing.js 调用）
//   unlockUserOnRecharge(userId, newBalance) — 充值后根据余额解锁

const prisma = require("./prisma"); // Prisma 单例客户端

// 日志前缀
const TAG = "[balance]";

// ==================== 前置校验：检查用户是否可以使用 AI ====================

/**
 * 检查用户是否可以发起 AI 消费操作
 * 仅检查 balanceLocked 状态，不限制余额为 0 的用户（允许"用完最后一分钱"）
 *
 * @param {string} userId - 用户 ID（字符串）
 * @returns {Promise<{ allowed: boolean, reason: string, balance: string, balanceLocked: boolean }>}
 */
async function checkCanUseAI(userId) {
    console.log(TAG + "[checkCanUseAI] 检查用户 " + userId + " 的 AI 使用权限");

    try {
        const user = await prisma.user.findUnique({
            where: { id: BigInt(userId) },
            select: { balance: true, balanceLocked: true },
        });

        if (!user) {
            console.log(TAG + "[checkCanUseAI] 用户不存在: " + userId);
            return { allowed: false, reason: "用户不存在。", balance: "0", balanceLocked: false };
        }

        const balance = String(user.balance);
        const locked = user.balanceLocked;

        console.log(TAG + "[checkCanUseAI] 用户 " + userId + " 余额: ¥" + balance +
            ", 锁定状态: " + locked);

        if (locked) {
            // 二次校验：如果余额实际上已经 >0，但锁定状态未清除（极端情况），自动修复
            const numericBalance = parseFloat(balance);
            if (numericBalance > 0) {
                console.log(TAG + "[checkCanUseAI] 余额已为正(¥" + balance + ")但锁定状态为 true，自动修复锁定");
                await prisma.user.update({
                    where: { id: BigInt(userId) },
                    data: { balanceLocked: false },
                });
                return { allowed: true, reason: "", balance: balance, balanceLocked: false };
            }

            return {
                allowed: false,
                reason: "余额不足，请充值后再试。",
                balance: balance,
                balanceLocked: true,
            };
        }

        return { allowed: true, reason: "", balance: balance, balanceLocked: false };
    } catch (err) {
        console.error(TAG + "[checkCanUseAI] 检查异常: " + err.message);
        // 异常情况下保守处理：拒绝使用（安全优先）
        return { allowed: false, reason: "余额校验服务异常，请稍后再试。", balance: "0", balanceLocked: true };
    }
}

// ==================== 后置检查：操作完成后锁定 ====================

/**
 * 操作完成后检查余额，若余额 < 0 则锁定用户
 * 由章节生成流水线 / 题库导入任务在完成后调用
 *
 * @param {string} userId - 用户 ID（字符串）
 * @returns {Promise<boolean>} 是否已锁定
 */
async function lockUserIfNegative(userId) {
    console.log(TAG + "[lockUserIfNegative] 检查用户 " + userId + " 是否需要锁定");

    try {
        const user = await prisma.user.findUnique({
            where: { id: BigInt(userId) },
            select: { balance: true, balanceLocked: true },
        });

        if (!user) {
            console.error(TAG + "[lockUserIfNegative] 用户不存在: " + userId);
            return false;
        }

        const balance = parseFloat(String(user.balance));
        console.log(TAG + "[lockUserIfNegative] 用户 " + userId + " 当前余额: ¥" + balance.toFixed(6));

        if (balance < 0) {
            // 余额为负数 → 锁定用户
            await prisma.user.update({
                where: { id: BigInt(userId) },
                data: { balanceLocked: true },
            });
            console.log(TAG + "[lockUserIfNegative] ⚠️ 用户 " + userId + " 余额为负(¥" + balance.toFixed(6) + ")，已锁定！请尽快充值。");
            return true;
        }

        // 余额 >= 0，不锁定
        console.log(TAG + "[lockUserIfNegative] 用户 " + userId + " 余额充足(¥" + balance.toFixed(6) + ")，无需锁定");
        return false;
    } catch (err) {
        console.error(TAG + "[lockUserIfNegative] 检查异常: " + err.message);
        return false;
    }
}

// ==================== 原子扣减余额 ====================

/**
 * 原子扣减用户余额（使用 Prisma decrement 避免并发竞态）
 * 由 billing.js 在写入账单记录后自动调用
 *
 * @param {string} userId - 用户 ID（字符串）
 * @param {number} amount - 扣减金额（正数，单位：元）
 * @returns {Promise<{ success: boolean, newBalance: string }>}
 */
async function deductBalance(userId, amount) {
    console.log(TAG + "[deductBalance] 用户 " + userId + " 扣费 ¥" + amount.toFixed(6));

    if (!amount || amount <= 0) {
        console.log(TAG + "[deductBalance] 扣费金额为 0 或无效，跳过扣费");
        return { success: true, newBalance: "0" };
    }

    try {
        // 使用 Prisma decrement 原子操作扣减余额
        const updatedUser = await prisma.user.update({
            where: { id: BigInt(userId) },
            data: {
                balance: {
                    decrement: amount,
                },
            },
            select: { balance: true },
        });

        const newBalance = String(updatedUser.balance);
        const numericNewBalance = parseFloat(newBalance);
        console.log(TAG + "[deductBalance] 扣费成功，用户 " + userId + " 新余额: ¥" +
            numericNewBalance.toFixed(6));

        // 扣费后自动检查：若余额变负，立即锁定用户
        // 此处与扣费在同一 async 函数中顺序执行，确保锁定不早于扣费完成
        if (numericNewBalance < 0) {
            await prisma.user.update({
                where: { id: BigInt(userId) },
                data: { balanceLocked: true },
            });
            console.log(TAG + "[deductBalance] ⚠️ 扣费后余额为负(¥" + numericNewBalance.toFixed(6) + ")，已自动锁定！请尽快充值。");
        }

        return { success: true, newBalance: newBalance };
    } catch (err) {
        console.error(TAG + "[deductBalance] 扣费失败: " + err.message);
        return { success: false, newBalance: "0" };
    }
}

// ==================== 充值后解锁 ====================

/**
 * 用户充值后，若余额 > 0 则清除锁定状态
 * 由充值 API 调用
 *
 * @param {string} userId - 用户 ID（字符串）
 * @param {number} newBalance - 充值后的余额（数字）
 * @returns {Promise<boolean>} 是否已解锁
 */
async function unlockUserOnRecharge(userId, newBalance) {
    console.log(TAG + "[unlockUserOnRecharge] 用户 " + userId + " 充值后余额: ¥" +
        (typeof newBalance === "number" ? newBalance.toFixed(6) : newBalance));

    try {
        if (parseFloat(newBalance) > 0) {
            // 余额为正数 → 解锁
            await prisma.user.update({
                where: { id: BigInt(userId) },
                data: { balanceLocked: false },
            });
            console.log(TAG + "[unlockUserOnRecharge] ✅ 用户 " + userId + " 余额为正，已解锁！");
            return true;
        }

        console.log(TAG + "[unlockUserOnRecharge] 用户 " + userId + " 充值后余额仍 ≤0，不解锁");
        return false;
    } catch (err) {
        console.error(TAG + "[unlockUserOnRecharge] 解锁异常: " + err.message);
        return false;
    }
}

// ==================== 模块导出 ====================
module.exports = {
    checkCanUseAI,
    lockUserIfNegative,
    deductBalance,
    unlockUserOnRecharge,
};
