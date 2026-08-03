// ==================== 管理员：平台消费统计路由 ====================
// 职责：平台用户/营收/活跃/内容规模统计、近14天消费趋势、调用类型费用分布
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/stats/*，本文件内使用相对路径

const express = require("express");
const router = express.Router();
const prisma = require("../../utils/prisma"); // Prisma 单例客户端
const { CALL_TAG_LABELS } = require("../../utils/billing"); // 计费标签中文映射

const TAG = "[API_admin_stats]";

// 将日期对象转为 YYYY-MM-DD 字符串（本地时区，与统计口径一致）
function toDateKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// ==================== 1. 查询平台统计 ====================
// GET /admin/:suffix/api/stats
// 成功返回：{ code: 0, data: { summary, dailyTrend[], callTagDistribution[] } }
router.get("/", async (req, res) => {
  console.log(TAG + " ======== 收到查询平台统计请求 ========");

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const trendStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);

    // 并行查询：用户/活跃/内容规模/营收与成本聚合
    const [totalUsers, todayNewUsers, activeRows, courseCount, quizTextbookCount, totalRevenueResult, todayRevenueResult, monthRevenueResult, totalCostResult, todayCostResult, monthCostResult, billingCount] = await Promise.all([
      prisma.user.count({ where: { isDeleted: false } }),
      prisma.user.count({ where: { isDeleted: false, createTime: { gte: todayStart } } }),
      // 近 7 天活跃用户：按 userId 去重计数
      prisma.userDailyActivity.findMany({
        where: { activityDate: { gte: weekStart } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.course.count({ where: { isDeleted: false } }),
      prisma.quizTextbook.count({ where: { isDeleted: false } }),
      prisma.billing_record.aggregate({ _sum: { total_cost: true } }),
      prisma.billing_record.aggregate({ where: { created_at: { gte: todayStart } }, _sum: { total_cost: true } }),
      prisma.billing_record.aggregate({ where: { created_at: { gte: monthStart } }, _sum: { total_cost: true } }),
      prisma.billing_record.aggregate({ _sum: { cost_total: true } }),
      prisma.billing_record.aggregate({ where: { created_at: { gte: todayStart } }, _sum: { cost_total: true } }),
      prisma.billing_record.aggregate({ where: { created_at: { gte: monthStart } }, _sum: { cost_total: true } }),
      prisma.billing_record.count(),
    ]);

    console.log(TAG + " 基础统计完成: 总用户=" + totalUsers + ", 今日新增=" + todayNewUsers + ", 近7日活跃=" + activeRows.length + ", 营收=" + String(totalRevenueResult._sum.total_cost || 0) + ", 成本=" + String(totalCostResult._sum.cost_total || 0));

    // 近 14 天每日消费趋势：拉取窗口内全部记录，按本地日期在 JS 中分组
    // （Prisma 按 UTC 存储 DATETIME，若用 SQL DATE() 分组会与本地日期产生 8 小时错位；
    //   数据量较小，JS 聚合即可保证与"今日营收"等本地口径完全一致）
    const trendRecords = await prisma.billing_record.findMany({
      where: { created_at: { gte: trendStart } },
      select: { created_at: true, total_cost: true, cost_total: true },
    });

    // 调用类型费用分布（参数化查询，按 call_tag 分组，同时汇总售价与成本）
    const tagRows = await prisma.$queryRaw`
      SELECT call_tag AS callTag, COUNT(*) AS cnt, CAST(SUM(total_cost) AS CHAR) AS cost, CAST(SUM(cost_total) AS CHAR) AS costTotal
      FROM billing_record
      GROUP BY call_tag
      ORDER BY cnt DESC
    `;

    // 组装近 14 天趋势（缺失日期补零，保证图表连续；每日同时聚合售价与成本）
    const dailyMap = {};
    for (const rec of trendRecords) {
      const key = toDateKey(rec.created_at);
      if (!dailyMap[key]) dailyMap[key] = { revenue: 0, cost: 0, count: 0 };
      dailyMap[key].revenue += Number(rec.total_cost);
      dailyMap[key].cost += Number(rec.cost_total || 0);
      dailyMap[key].count += 1;
    }
    const dailyTrend = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i));
      const key = toDateKey(d);
      const item = dailyMap[key];
      dailyTrend.push({
        date: key,
        revenue: item ? String(item.revenue.toFixed(7)) : "0",
        cost: item ? String(item.cost.toFixed(7)) : "0",
        count: item ? item.count : 0,
      });
    }

    // 组装调用类型费用分布（补全中文标签，含售价与成本）
    const callTagDistribution = tagRows.map((row) => ({
      callTag: row.callTag,
      label: CALL_TAG_LABELS[row.callTag] || row.callTag,
      count: Number(row.cnt),
      cost: String(row.cost),
      costTotal: String(row.costTotal),
    }));

    console.log(TAG + " 趋势天数: " + dailyTrend.length + ", 调用类型数: " + callTagDistribution.length);
    console.log(TAG + " ================================");

    // 利润 = 售价合计 - 成本合计
    const totalRevenue = Number(totalRevenueResult._sum.total_cost || 0);
    const totalCost = Number(totalCostResult._sum.cost_total || 0);

    return res.json({
      code: 0,
      message: "ok",
      data: {
        summary: {
          totalUsers,
          todayNewUsers,
          activeUsers7d: activeRows.length,
          totalRevenue: String(totalRevenueResult._sum.total_cost || 0),
          todayRevenue: String(todayRevenueResult._sum.total_cost || 0),
          monthRevenue: String(monthRevenueResult._sum.total_cost || 0),
          totalCost: String(totalCostResult._sum.cost_total || 0),
          todayCost: String(todayCostResult._sum.cost_total || 0),
          monthCost: String(monthCostResult._sum.cost_total || 0),
          totalProfit: String((totalRevenue - totalCost).toFixed(7)),
          billingCount,
          courseCount,
          quizTextbookCount,
        },
        dailyTrend,
        callTagDistribution,
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 查询平台统计异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 导出路由 ====================
module.exports = router;
