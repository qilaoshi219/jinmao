// ==================== 扩展统计查询 Repository 模块 ====================
// 职责：封装学习周报、排行榜的聚合查询逻辑
//   - getWeeklyReport(userId)  — 最近 7 天按日统计（学习时长/刷题数/正确率/活跃）
//   - getLeaderboard(type, days) — 学习时长榜 / 刷题量榜（Top 20）
// 时间约定：与 activity_repo/stats_repo 保持一致，按 UTC 日边界统计

const prisma = require("../prisma");

// 日志前缀
const TAG = "[stats_extra_repo]";

// 常量
const DAY_MS = 24 * 60 * 60 * 1000; // 一天的毫秒数
const WEEK_DAYS = 7; // 周报天数
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// ==================== 工具函数 ====================

/** 数字补零：1 → "01" */
function pad(n) {
  return String(n).padStart(2, "0");
}

/** 将日期转换为 YYYY-MM-DD（按 UTC） */
function dateKey(d) {
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

/** 获取本周开始（今天 UTC 0 点往前推 6 天） */
function getWeekStart(today) {
  return new Date(today.getTime() - (WEEK_DAYS - 1) * DAY_MS);
}

/** 用户显示名：优先昵称，其次脱敏邮箱 */
function displayName(user) {
  if (!user) return "匿名用户";
  if (user.nickname) return user.nickname;
  const email = String(user.email || "");
  if (email.includes("@")) {
    const [local, domain] = email.split("@");
    const masked = local.length > 2 ? local.slice(0, 2) + "***" : local.slice(0, 1) + "***";
    return masked + "@" + domain;
  }
  return "用户" + String(user.id).slice(-4);
}

// ==================== 学习周报 ====================

/**
 * 获取用户最近 7 天的学习周报
 * - 学习时长：按 UserDailyActivity.study_duration 精确按日统计
 * - 刷题量/正确率：按 QuizUserAnswer.create_time 精确按日统计
 * - 活跃天数：当天有学习或刷题记录即算活跃
 * - 完成章节：UserStudyRecord 在窗口内更新且 progress >= totalPages
 * @param {string} userId - 用户 ID
 * @returns {Promise<{ days: Array, summary: Object }>}
 */
async function getWeeklyReport(userId) {
  console.log(TAG + "[getWeeklyReport] 查询用户 " + userId + " 的学习周报");

  try {
    const uid = BigInt(userId);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = getWeekStart(today);
    const end = new Date(today.getTime() + DAY_MS);

    // 1. 每日学习时长（UserDailyActivity 按日一条）
    const activities = await prisma.userDailyActivity.findMany({
      where: { userId: uid, activityDate: { gte: start, lt: end } },
      select: { activityDate: true, studyDuration: true },
    });
    const studyByDate = new Map();
    for (const a of activities) {
      studyByDate.set(dateKey(a.activityDate), Number(a.studyDuration) || 0);
    }

    // 2. 每日刷题统计（QuizUserAnswer 精确按日）
    const answers = await prisma.quizUserAnswer.findMany({
      where: { userId: uid, createTime: { gte: start, lt: end } },
      select: { createTime: true, isCorrect: true },
    });
    const quizByDate = new Map();
    for (const a of answers) {
      const k = dateKey(a.createTime);
      const cur = quizByDate.get(k) || { count: 0, correct: 0 };
      cur.count += 1;
      if (a.isCorrect) cur.correct += 1;
      quizByDate.set(k, cur);
    }

    // 3. 窗口内完成的章节数
    const records = await prisma.userStudyRecord.findMany({
      where: { userId: uid, isDeleted: false, updateTime: { gte: start, lt: end } },
      include: { chapter: { select: { totalPages: true } } },
    });
    const completedChapters = records.filter(
      (r) => r.progress >= (r.chapter.totalPages || 0) && r.chapter.totalPages > 0
    ).length;

    // 4. 组装 7 天数据（今天在最后一天）
    const days = [];
    for (let i = 0; i < WEEK_DAYS; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const k = dateKey(d);
      const quiz = quizByDate.get(k) || { count: 0, correct: 0 };
      days.push({
        date: k,
        label: k.slice(5), // MM-DD
        weekLabel: WEEKDAYS[d.getUTCDay()],
        studySeconds: studyByDate.get(k) || 0,
        quizCount: quiz.count,
        correctCount: quiz.correct,
        active: studyByDate.has(k) || quiz.count > 0,
        isToday: i === WEEK_DAYS - 1,
      });
    }

    const totalQuiz = days.reduce((sum, d) => sum + d.quizCount, 0);
    const totalCorrect = days.reduce((sum, d) => sum + d.correctCount, 0);
    const summary = {
      studySeconds: days.reduce((sum, d) => sum + d.studySeconds, 0),
      quizCount: totalQuiz,
      correctCount: totalCorrect,
      accuracy: totalQuiz > 0 ? Math.round((totalCorrect / totalQuiz) * 1000) / 10 : 0,
      activeDays: days.filter((d) => d.active).length,
      completedChapters: completedChapters,
    };

    console.log(TAG + "[getWeeklyReport] 周报完成: 学习 " + summary.studySeconds + "s，刷题 " + summary.quizCount + " 题，活跃 " + summary.activeDays + " 天");
    return { days, summary };
  } catch (error) {
    console.error(TAG + "[getWeeklyReport] 数据库异常: " + error.message);
    throw error;
  }
}

// ==================== 排行榜 ====================

/**
 * 获取学习/刷题排行榜（Top 20）
 * @param {string} type - 排行类型：study（学习时长）/ quiz（刷题量）
 * @param {number} days - 统计窗口天数（1-30，默认 7）
 * @returns {Promise<Array<{ rank, userId, name, value }>>}
 */
async function getLeaderboard(type, days) {
  const windowDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 30);
  console.log(TAG + "[getLeaderboard] 查询排行榜，type=" + type + "，days=" + windowDays);

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - (windowDays - 1) * DAY_MS);

    // 1. 聚合原始排行数据
    let rows = [];
    if (type === "quiz") {
      // 刷题量：按 QuizUserAnswer.userId 分组计数（公开考试游客 userId 为 null，跳过）
      const groups = await prisma.quizUserAnswer.groupBy({
        by: ["userId"],
        where: { userId: { not: null }, createTime: { gte: start } },
        _count: { _all: true },
      });
      rows = groups
        .filter((g) => g.userId !== null)
        .map((g) => ({ userId: String(g.userId), value: g._count._all }));
    } else {
      // 学习时长：按 UserDailyActivity.userId 分组求和
      const groups = await prisma.userDailyActivity.groupBy({
        by: ["userId"],
        where: { activityDate: { gte: start } },
        _sum: { studyDuration: true },
      });
      rows = groups.map((g) => ({ userId: String(g.userId), value: Number(g._sum.studyDuration) || 0 }));
    }

    // 2. 降序排序并截取 Top 20
    rows.sort((a, b) => b.value - a.value);
    rows = rows.slice(0, 20);
    if (rows.length === 0) return [];

    // 3. 批量查询用户显示名
    const userIds = rows.map((r) => BigInt(r.userId));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, email: true },
    });
    const userMap = new Map(users.map((u) => [String(u.id), u]));

    // 4. 组装返回
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: displayName(userMap.get(r.userId)),
      value: r.value,
    }));
  } catch (error) {
    console.error(TAG + "[getLeaderboard] 数据库异常: " + error.message);
    throw error;
  }
}

// 导出模块函数
module.exports = {
  getWeeklyReport,
  getLeaderboard,
};
