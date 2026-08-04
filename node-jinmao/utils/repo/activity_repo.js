// ==================== 用户每日活动记录 Repository 模块 ====================
// 职责：封装对 UserDailyActivity 表的数据库操作
// 使用 upsert 模式，利用联合唯一约束确保同一天不重复插入

// 引入 Prisma 单例实例
const prisma = require("../../utils/prisma");

// 日志前缀
const TAG = "[activity_repo]";

// ==================== 模块加载时模型完整性校验 ====================
// 验证 Prisma Client 是否包含 UserDailyActivity 模型
if (!prisma.userDailyActivity) {
  console.error(TAG + " ❌ Prisma Client 缺少 UserDailyActivity 模型！");
  console.error(TAG + "    请运行 npx prisma generate 重新生成 Prisma Client。");
}

// ==================== 导出函数 ====================

/**
 * 记录用户当天的活动（upsert 模式，同一天只保留一条记录）
 * 用于计算连续学习天数
 * @param {string} userId - 用户 ID（字符串类型，从 JWT payload 获取）
 * @returns {Promise<{ code: number, message?: string }>}
 *   - code 200: 记录成功（创建或已存在）
 *   - code 500: 数据库异常
 */
async function recordDailyActivity(userId) {
  console.log(TAG + "[recordDailyActivity] 记录用户 " + userId + " 的每日活动");

  try {
    const uid = BigInt(userId);

    // 获取今天的日期（UTC 0点）
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // 使用 upsert 利用联合唯一约束，存在则不做任何更新，不存在则创建
    // 只需记录日期存在即可，不需要额外数据
    await prisma.userDailyActivity.upsert({
      where: {
        userId_activityDate: {
          userId: uid,
          activityDate: today,
        },
      },
      create: {
        userId: uid,
        activityDate: today,
      },
      update: {}, // 已存在则不做任何更新（空 update）
    });

    console.log(TAG + "[recordDailyActivity] 用户 " + userId + " 今日活动记录已更新");
    return { code: 200 };
  } catch (error) {
    console.error(TAG + "[recordDailyActivity] 数据库异常: " + error.message);
    return {
      code: 500,
      message: "记录每日活动时发生数据库异常: " + error.message,
    };
  }
}

// 导出模块函数
module.exports = {
  recordDailyActivity,
};
