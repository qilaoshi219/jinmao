// ==================== 管理员：用户管理路由 ====================
// 职责：用户列表分页查询（搜索/筛选/统计摘要）、禁用用户、解禁用户
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/users/*，本文件内使用相对路径

const express = require("express");
const router = express.Router();
const prisma = require("../../utils/prisma"); // Prisma 单例客户端

const TAG = "[API_admin_users]";

// ==================== 1. 查询用户列表 ====================
// GET /admin/:suffix/api/users?page=1&pageSize=20&keyword=&role=all&banned=all
// 成功返回：{ code: 0, data: { users[], pagination, summary } }
router.get("/", async (req, res) => {
  console.log(TAG + " ======== 收到查询用户列表请求 ========");

  try {
    // 解析分页参数
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 20;
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 1;
    if (pageSize > 100) pageSize = 100;

    // 解析搜索与筛选参数
    const keyword = (req.query.keyword || "").trim();
    const roleFilter = req.query.role || "all";
    const bannedFilter = req.query.banned || "all";
    console.log(TAG + " 分页: page=" + page + ", pageSize=" + pageSize + ", keyword=" + keyword + ", role=" + roleFilter + ", banned=" + bannedFilter);

    // 构建查询条件（默认排除软删除用户）
    const where = { isDeleted: false };
    if (keyword) {
      where.OR = [
        { email: { contains: keyword } },
        { nickname: { contains: keyword } },
        { username: { contains: keyword } },
      ];
    }
    if (roleFilter === "user" || roleFilter === "admin") {
      where.role = roleFilter;
    }
    if (bannedFilter === "true") {
      where.isBanned = true;
    } else if (bannedFilter === "false") {
      where.isBanned = false;
    }

    // 今日零点（用于统计今日新增用户数）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 并行查询：列表 + 总数 + 统计摘要
    const skip = (page - 1) * pageSize;
    const [users, total, summaryArr] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createTime: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          nickname: true,
          email: true,
          role: true,
          vipLevel: true,
          balance: true,
          plan: true,
          isBanned: true,
          banReason: true,
          createTime: true,
        },
      }),
      prisma.user.count({ where }),
      Promise.all([
        prisma.user.count({ where: { isDeleted: false } }),
        prisma.user.count({ where: { isDeleted: false, isBanned: true } }),
        prisma.user.count({ where: { isDeleted: false, role: "admin" } }),
        prisma.user.count({ where: { isDeleted: false, createTime: { gte: todayStart } } }),
      ]),
    ]);

    console.log(TAG + " 查询到 " + users.length + " 条用户，总计 " + total + " 条");

    // 格式化返回数据（BigInt/Decimal 转字符串）
    const formattedUsers = users.map((u) => ({
      id: String(u.id),
      username: u.username || "",
      nickname: u.nickname || "",
      email: u.email,
      role: u.role,
      vipLevel: u.vipLevel,
      balance: String(u.balance),
      plan: u.plan || null,
      isBanned: u.isBanned,
      banReason: u.banReason || "",
      createTime: u.createTime.toISOString(),
    }));

    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "ok",
      data: {
        users: formattedUsers,
        pagination: { page, pageSize, total },
        summary: {
          total: summaryArr[0],
          banned: summaryArr[1],
          admins: summaryArr[2],
          todayNew: summaryArr[3],
        },
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 查询用户列表异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 2. 禁用用户 ====================
// PUT /admin/:suffix/api/users/:id/ban
// 请求体：{ reason?: string }  // 禁用原因
// 守卫：不能操作自己，不能操作其他管理员账号
// 成功返回：{ code: 0, message, data: { id, isBanned, banReason } }
router.put("/:id/ban", async (req, res) => {
  console.log(TAG + " ======== 收到禁用用户请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId + ", 目标用户 id: " + req.params.id);

  try {
    const userId = req.params.id;

    // 校验 id 参数必须为数字
    if (!userId || !/^\d+$/.test(userId)) {
      return res.status(400).json({ code: 400, message: "用户 ID 无效。", data: null });
    }
    // 不能禁用当前登录的管理员
    if (String(userId) === String(req.userId)) {
      return res.status(400).json({ code: 400, message: "不能禁用当前登录的管理员账号。", data: null });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    // 查询目标用户（守卫检查需要完整记录）
    const target = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!target || target.isDeleted) {
      return res.status(404).json({ code: 404, message: "用户不存在。", data: null });
    }
    // 不能禁用其他管理员账号（防止误锁管理员）
    if (target.role === "admin") {
      return res.status(400).json({ code: 400, message: "不能禁用管理员账号。", data: null });
    }

    // 置为禁用并记录原因
    await prisma.user.update({
      where: { id: target.id },
      data: { isBanned: true, banReason: reason || null },
    });

    console.log(TAG + " ✅ 用户 " + userId + " 已禁用，原因: " + (reason || "未填写"));
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "用户已禁用。",
      data: { id: String(target.id), isBanned: true, banReason: reason || null },
    });
  } catch (err) {
    console.error(TAG + " ❌ 禁用用户异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 3. 解禁用户 ====================
// PUT /admin/:suffix/api/users/:id/unban
// 成功返回：{ code: 0, message, data: { id, isBanned } }
router.put("/:id/unban", async (req, res) => {
  console.log(TAG + " ======== 收到解禁用户请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId + ", 目标用户 id: " + req.params.id);

  try {
    const userId = req.params.id;

    // 校验 id 参数必须为数字
    if (!userId || !/^\d+$/.test(userId)) {
      return res.status(400).json({ code: 400, message: "用户 ID 无效。", data: null });
    }

    // 查询目标用户
    const target = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!target || target.isDeleted) {
      return res.status(404).json({ code: 404, message: "用户不存在。", data: null });
    }

    // 清除禁用标记与原因
    await prisma.user.update({
      where: { id: target.id },
      data: { isBanned: false, banReason: null },
    });

    console.log(TAG + " ✅ 用户 " + userId + " 已解禁");
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "用户已解禁。",
      data: { id: String(target.id), isBanned: false },
    });
  } catch (err) {
    console.error(TAG + " ❌ 解禁用户异常: " + err.message);
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
