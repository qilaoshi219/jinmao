// ==================== 统计查询 Repository 模块 ====================
// 职责：封装首页 4 项统计数据的聚合查询逻辑
// 提供统一的统计数据访问接口，供 API/stats.js 路由层调用
// 统计项：
//   1. 累计学习时长 — SUM(UserStudyRecord.studyDuration)
//   2. 已完成章节 — COUNT(UserStudyRecord WHERE progress >= Chapter.totalPages)
//   3. 习题正确率 — 从 QuizUserAnswer 表计算
//   4. 连续学习天数 — 从 UserDailyActivity 表计算

// 引入 Prisma 单例实例
const prisma = require("../../utils/prisma");

// 日志前缀
const TAG = "[stats_repo]";

// ==================== 导出函数 ====================

/**
 * 获取用户的累计学习时长（所有章节的 studyDuration 求和）
 * @param {string} userId - 用户 ID
 * @returns {Promise<number>} 累计学习秒数
 */
async function getTotalStudyDuration(userId) {
  console.log(TAG + "[getTotalStudyDuration] 查询用户 " + userId + " 的累计学习时长");

  try {
    const uid = BigInt(userId);

    // 使用 Prisma aggregate 对 studyDuration 字段求和
    const result = await prisma.userStudyRecord.aggregate({
      where: {
        userId: uid,
        isDeleted: false,
      },
      _sum: {
        studyDuration: true,
      },
    });

    const total = Number(result._sum.studyDuration) || 0;
    console.log(TAG + "[getTotalStudyDuration] 累计学习时长: " + total + " 秒");
    return total;
  } catch (error) {
    console.error(TAG + "[getTotalStudyDuration] 数据库异常: " + error.message);
    return 0;
  }
}

/**
 * 获取用户已完成的章节数
 * 完成定义：UserStudyRecord.progress >= Chapter.totalPages
 * 利用联合唯一约束，同一章节只计数一次
 * @param {string} userId - 用户 ID
 * @returns {Promise<number>} 已完成章节数
 */
async function getCompletedChapters(userId) {
  console.log(TAG + "[getCompletedChapters] 查询用户 " + userId + " 的已完成章节数");

  try {
    const uid = BigInt(userId);

    // 查询所有学习记录，include 关联的 chapter.totalPages
    const records = await prisma.userStudyRecord.findMany({
      where: {
        userId: uid,
        isDeleted: false,
      },
      include: {
        chapter: {
          select: {
            totalPages: true, // 章节总页数
          },
        },
      },
    });

    // 统计 progress >= totalPages 的章节数（利用联合唯一约束，同一章节只有一条记录）
    const completedCount = records.filter(
      (r) => r.progress >= (r.chapter.totalPages || 0) && r.chapter.totalPages > 0
    ).length;

    console.log(TAG + "[getCompletedChapters] 已完成章节数: " + completedCount + "（共 " + records.length + " 条记录）");
    return completedCount;
  } catch (error) {
    console.error(TAG + "[getCompletedChapters] 数据库异常: " + error.message);
    return 0;
  }
}

/**
 * 获取用户的习题正确率统计
 * 统计所有 QuizUserAnswer 记录中的答对数 / 总答题数
 * @param {string} userId - 用户 ID
 * @returns {Promise<{ totalCount: number, correctCount: number, accuracy: number }>}
 *   - totalCount: 总答题数
 *   - correctCount: 答对数
 *   - accuracy: 正确率百分比（保留1位小数），无作答时返回 0
 */
async function getQuizAccuracy(userId) {
  console.log(TAG + "[getQuizAccuracy] 查询用户 " + userId + " 的习题正确率");

  try {
    const uid = BigInt(userId);

    // 使用 Prisma aggregate 分别统计总数和答对数
    const [totalResult, correctResult] = await Promise.all([
      prisma.quizUserAnswer.count({
        where: { userId: uid },
      }),
      prisma.quizUserAnswer.count({
        where: {
          userId: uid,
          isCorrect: true,
        },
      }),
    ]);

    const totalCount = totalResult;
    const correctCount = correctResult;
    // 计算正确率百分比，保留 1 位小数
    const accuracy = totalCount > 0
      ? Math.round((correctCount / totalCount) * 1000) / 10
      : 0;

    console.log(TAG + "[getQuizAccuracy] 总答题: " + totalCount + "，答对: " + correctCount + "，正确率: " + accuracy + "%");
    return { totalCount, correctCount, accuracy };
  } catch (error) {
    console.error(TAG + "[getQuizAccuracy] 数据库异常: " + error.message);
    return { totalCount: 0, correctCount: 0, accuracy: 0 };
  }
}

/**
 * 获取用户的连续学习天数
 * 从 UserDailyActivity 表查询所有活动日期，按降序排列
 * 从今天开始往前数，统计连续有记录的天数
 * @param {string} userId - 用户 ID
 * @returns {Promise<number>} 连续学习天数
 */
async function getConsecutiveDays(userId) {
  console.log(TAG + "[getConsecutiveDays] 查询用户 " + userId + " 的连续学习天数");

  try {
    const uid = BigInt(userId);

    // 查询该用户所有活动日期，按日期降序排列（最新的排在最前）
    const activities = await prisma.userDailyActivity.findMany({
      where: { userId: uid },
      orderBy: { activityDate: "desc" },
      select: { activityDate: true },
    });

    // 没有活动记录 → 连续天数为 0
    if (activities.length === 0) {
      console.log(TAG + "[getConsecutiveDays] 无活动记录，连续天数: 0");
      return 0;
    }

    // 获取今天的日期（UTC 0点）
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // 检查最近的记录是否是今天或昨天
    const latestActivityTime = new Date(activities[0].activityDate).getTime();

    // 如果最近的活动日期既不是今天也不是昨天，则连续天数中断
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (todayTime - latestActivityTime > oneDayMs) {
      console.log(TAG + "[getConsecutiveDays] 最近活动日期距今超过1天，连续天数: 0");
      return 0;
    }

    // 从今天（或最近活动日）开始往前数连续天数
    let consecutiveDays = 0;
    // 当前检查的日期，从今天开始
    const currentDate = new Date(today);

    for (const activity of activities) {
      const activityTime = new Date(activity.activityDate).getTime();

      // 计算当前检查日期与活动日期的时间差（天数）
      const diffDays = Math.round((currentDate.getTime() - activityTime) / oneDayMs);

      if (diffDays === 0) {
        // 当天有活动，计数+1，检查日期往前推一天
        consecutiveDays++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (diffDays === 1) {
        // 差一天，说明昨天有活动，计数+1，继续往前推
        consecutiveDays++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        // 中断了，停止计数
        break;
      }
    }

    console.log(TAG + "[getConsecutiveDays] 连续学习天数: " + consecutiveDays);
    return consecutiveDays;
  } catch (error) {
    console.error(TAG + "[getConsecutiveDays] 数据库异常: " + error.message);
    return 0;
  }
}

// 导出模块函数
module.exports = {
  getTotalStudyDuration,
  getCompletedChapters,
  getQuizAccuracy,
  getConsecutiveDays,
};
