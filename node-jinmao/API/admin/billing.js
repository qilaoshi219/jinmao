// ==================== 管理员：全局账单路由 ====================
// 职责：分页查询全平台扣费记录（支持状态/调用类型/用户ID/日期范围筛选）
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/billing/*，本文件内使用相对路径

const express = require("express");
const router = express.Router();
const prisma = require("../../utils/prisma"); // Prisma 单例客户端
const { CALL_TAG_LABELS } = require("../../utils/billing"); // 计费标签中文映射

const TAG = "[API_admin_billing]";

// ==================== 1. 查询全局账单列表 ====================
// GET /admin/:suffix/api/billing?page=1&pageSize=20&status=all&callTag=all&userId=&startDate=&endDate=
// 成功返回：{ code: 0, data: { records[], pagination, summary } }
router.get("/", async (req, res) => {
  console.log(TAG + " ======== 收到查询全局账单请求 ========");

  try {
    // 解析分页参数
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 20;
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 1;
    if (pageSize > 100) pageSize = 100;

    // 解析筛选参数
    const statusFilter = req.query.status || "all";
    const callTagFilter = req.query.callTag || "all";
    const userIdFilter = (req.query.userId || "").trim();
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    // 日期参数格式校验（YYYY-MM-DD）
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !datePattern.test(startDate)) {
      return res.status(400).json({ code: 400, message: "开始日期格式无效（应为 YYYY-MM-DD）。", data: null });
    }
    if (endDate && !datePattern.test(endDate)) {
      return res.status(400).json({ code: 400, message: "结束日期格式无效（应为 YYYY-MM-DD）。", data: null });
    }

    // 构建查询条件
    const where = {};
    if (statusFilter === "success" || statusFilter === "failed") {
      where.status = statusFilter;
    }
    if (callTagFilter !== "all") {
      where.call_tag = callTagFilter;
    }
    if (userIdFilter && /^\d+$/.test(userIdFilter)) {
      // billing_record.user_id 存储 JWT userId 字符串
      where.user_id = userIdFilter;
    }
    if (startDate) {
      where.created_at = { gte: new Date(startDate + "T00:00:00") };
    }
    if (endDate) {
      where.created_at = { ...(where.created_at || {}), lte: new Date(endDate + "T23:59:59.999") };
    }
    console.log(TAG + " 筛选: status=" + statusFilter + ", callTag=" + callTagFilter + ", userId=" + userIdFilter + ", startDate=" + startDate + ", endDate=" + endDate);

    // 并行查询：记录列表 + 总数 + 金额聚合 + 成功/失败笔数
    const skip = (page - 1) * pageSize;
    const [records, totalCount, totalUsedResult, totalCostUsedResult, successCount, failedCount] = await Promise.all([
      prisma.billing_record.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          user_id: true,
          provider: true,
          model: true,
          call_tag: true,
          total_cost: true,
          cost_total: true,
          status: true,
          error_message: true,
          retry_count: true,
          created_at: true,
        },
      }),
      prisma.billing_record.count({ where }),
      prisma.billing_record.aggregate({ where, _sum: { total_cost: true } }),
      prisma.billing_record.aggregate({ where, _sum: { cost_total: true } }),
      prisma.billing_record.count({ where: { ...where, status: "success" } }),
      prisma.billing_record.count({ where: { ...where, status: "failed" } }),
    ]);

    console.log(TAG + " 扣费记录: 当前页 " + records.length + " 条，总计 " + totalCount + " 条");

    // 关联用户邮箱：billing_record.user_id(String) 与 User.id(BigInt) 字符串形式一致
    const userIds = [...new Set(records.map((r) => r.user_id))].filter((id) => /^\d+$/.test(id));
    const emailMap = {};
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds.map((id) => BigInt(id)) } },
        select: { id: true, email: true },
      });
      for (const u of users) emailMap[String(u.id)] = u.email;
    }

    // 格式化返回数据（Decimal 转字符串保留精度）
    const totalUsed = totalUsedResult._sum.total_cost || 0;
    const totalCostUsed = totalCostUsedResult._sum.cost_total || 0;
    const formattedRecords = records.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: emailMap[r.user_id] || "",
      provider: r.provider,
      model: r.model,
      callTag: r.call_tag,
      callTagLabel: CALL_TAG_LABELS[r.call_tag] || r.call_tag,
      totalCost: String(r.total_cost),
      costTotal: String(r.cost_total || 0),
      profit: String((Number(r.total_cost) - Number(r.cost_total || 0)).toFixed(7)),
      status: r.status,
      errorMessage: r.error_message || null,
      retryCount: r.retry_count || 0,
      createdAt: r.created_at.toISOString(),
    }));

    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "ok",
      data: {
        records: formattedRecords,
        pagination: { page, pageSize, total: totalCount },
        summary: {
          totalCount,
          totalRevenue: String(totalUsed),
          totalCost: String(totalCostUsed),
          totalProfit: String((Number(totalUsed) - Number(totalCostUsed)).toFixed(7)),
          successCount,
          failedCount,
        },
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 查询全局账单异常: " + err.message);
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
