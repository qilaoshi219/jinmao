// ==================== 管理员 API 路由 ====================
// 职责：提供管理员后台功能接口（生成兑换码、查询兑换码、系统设置）
// 所有端点均需通过双重鉴权（URL后缀 + JWT管理员角色）
// 端点前缀：/admin/:suffix/api/*
// 安全：不在 Swagger/Scalar 文档中暴露，不添加 @openapi 注释

const express = require("express");                        // Express 路由
const router = express.Router();
const crypto = require("crypto");                          // 安全随机数生成（兑换码生成）
const { PrismaClient } = require("@prisma/client");        // Prisma 数据库客户端
const { adminSuffixMiddleware, adminAuthMiddleware, updateSecuritySuffix, getSecuritySuffix } = require("../middleware/admin");
const securityRepo = require("../utils/repo/security_repo"); // 安全事件数据访问层（攻击记录查询与管理）

// ==================== Prisma 客户端初始化 ====================
const prisma = new PrismaClient();

// 日志前缀
const TAG = "[API_admin]";

// ==================== 所有管理员路由统一应用双重鉴权 ====================
// 第一层：URL后缀校验
router.use("/:suffix/api", adminSuffixMiddleware);
// 第二层：JWT + 管理员角色验证
router.use("/:suffix/api", adminAuthMiddleware);

// ==================== 1. 生成兑换码 ====================
// POST /admin/:suffix/api/codes/generate
// 请求体：{ count?: number }  // 生成数量，默认10，最大50
// 成功返回：{ code: 0, data: [{ id, code, amount, createdAt }] }
router.post("/:suffix/api/codes/generate", async (req, res) => {
  console.log(TAG + " ======== 收到生成兑换码请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    // 解析生成数量（默认10，最大50）
    let count = parseInt(req.body?.count) || 10;
    if (count < 1) count = 1;
    if (count > 50) count = 50;

    console.log(TAG + " 生成数量: " + count);

    // 批量生成兑换码
    const codes = [];
    const generatedCodes = []; // 用于创建数据库记录

    for (let i = 0; i < count; i++) {
      // 使用 crypto.randomBytes 生成 12 字节随机数 → 24 位大写十六进制字符串
      // 碰撞概率：16^24 ≈ 7.9×10^28，几乎不可能碰撞
      const code = crypto.randomBytes(12).toString("hex").toUpperCase();
      codes.push({ code: code });
      generatedCodes.push({
        code: code,
        amount: 10, // 固定 10 元
        createdBy: BigInt(req.userId), // 记录创建者（管理员）
      });
    }

    // 批量插入数据库
    // 使用 createMany 一次插入所有记录
    const result = await prisma.redeem_code.createMany({
      data: generatedCodes,
    });

    console.log(TAG + " ✅ 成功生成 " + result.count + " 个兑换码");

    // 重新查询刚创建的兑换码（获取完整信息包括 id）
    const codeList = generatedCodes.map(c => c.code);
    const createdCodes = await prisma.redeem_code.findMany({
      where: { code: { in: codeList } },
      select: {
        id: true,
        code: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 金额转为字符串保留精度
    const formattedCodes = createdCodes.map(c => ({
      id: String(c.id),
      code: c.code,
      amount: String(c.amount),
      createdAt: c.createdAt.toISOString(),
    }));

    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "成功生成 " + result.count + " 个兑换码。",
      data: {
        count: result.count,
        codes: formattedCodes,
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 生成兑换码异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 2. 查询兑换码列表 ====================
// GET /admin/:suffix/api/codes?page=1&pageSize=20&status=all|used|unused
// 成功返回：{ code: 0, data: { codes[], pagination } }
router.get("/:suffix/api/codes", async (req, res) => {
  console.log(TAG + " ======== 收到查询兑换码请求 ========");

  try {
    // 解析分页参数
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 20;

    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 1;
    if (pageSize > 100) pageSize = 100;

    // 解析状态过滤
    const statusFilter = req.query.status || "all";
    console.log(TAG + " 分页: page=" + page + ", pageSize=" + pageSize + ", status=" + statusFilter);

    // 构建查询条件
    const where = {};
    if (statusFilter === "used") {
      where.isUsed = true;
    } else if (statusFilter === "unused") {
      where.isUsed = false;
    }
    // "all" 不添加过滤条件

    // 并行查询：列表 + 总数
    const skip = (page - 1) * pageSize;
    const [codes, total] = await Promise.all([
      prisma.redeem_code.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          code: true,
          amount: true,
          isUsed: true,
          usedBy: true,
          usedAt: true,
          createdAt: true,
        },
      }),
      prisma.redeem_code.count({ where }),
    ]);

    console.log(TAG + " 查询到 " + codes.length + " 条记录，总计 " + total + " 条");

    // 格式化返回数据
    const formattedCodes = codes.map(c => ({
      id: String(c.id),
      code: c.code,
      amount: String(c.amount),
      isUsed: c.isUsed,
      usedBy: c.usedBy ? String(c.usedBy) : null,
      usedAt: c.usedAt ? c.usedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));

    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "ok",
      data: {
        codes: formattedCodes,
        pagination: {
          page,
          pageSize,
          total,
        },
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 查询兑换码异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 3. 获取系统配置 ====================
// GET /admin/:suffix/api/config
// 返回安全后缀（脱敏显示：仅显示前2位+后2位）
router.get("/:suffix/api/config", async (req, res) => {
  console.log(TAG + " 获取系统配置");

  const suffix = getSecuritySuffix();
  if (!suffix) {
    return res.status(500).json({ code: 500, message: "无法读取配置。", data: null });
  }

  // 后缀脱敏显示：前2位 + *** + 后2位
  let maskedSuffix = suffix;
  if (suffix.length > 4) {
    maskedSuffix = suffix.substring(0, 2) + "***" + suffix.substring(suffix.length - 2);
  } else if (suffix.length > 2) {
    maskedSuffix = suffix.substring(0, 1) + "***" + suffix.substring(suffix.length - 1);
  }

  return res.json({
    code: 0,
    message: "ok",
    data: {
      securitySuffix: maskedSuffix, // 脱敏后的后缀
      suffixLength: suffix.length,  // 后缀长度（不暴露实际值）
    },
  });
});

// ==================== 4. 更新系统配置 ====================
// PUT /admin/:suffix/api/config
// 请求体：{ newSuffix: string }
// 修改安全后缀
router.put("/:suffix/api/config", async (req, res) => {
  console.log(TAG + " ======== 收到修改安全后缀请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    const { newSuffix } = req.body;

    // 校验 newSuffix 参数
    if (!newSuffix || typeof newSuffix !== "string") {
      return res.status(400).json({
        code: 400,
        message: "请提供新的安全后缀（newSuffix）。",
        data: null,
      });
    }

    // 调用中间件中的更新函数
    const result = updateSecuritySuffix(newSuffix);

    if (!result.success) {
      console.log(TAG + " 修改失败: " + result.message);
      return res.status(400).json({
        code: 400,
        message: result.message,
        data: null,
      });
    }

    console.log(TAG + " ✅ 安全后缀已由 userId=" + req.userId + " 修改为: " + newSuffix);
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: result.message,
      data: {
        oldSuffix: req.params.suffix, // 旧后缀（从URL中获取）
        newSuffix: newSuffix,
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 修改安全后缀异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 5. 查询安全攻击事件列表 ====================
// GET /admin/:suffix/api/security/events?page=1&pageSize=20&attackType=all&severity=all&handled=all&ip=
// 支持按攻击类型 / 严重程度 / 处理状态 / IP 筛选
// 成功返回：{ code: 0, data: { events[], pagination } }
router.get("/:suffix/api/security/events", async (req, res) => {
  console.log(TAG + " ======== 收到查询安全攻击事件请求 ========");

  try {
    // 解析筛选与分页参数
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const attackType = req.query.attackType || "all";
    const severity = req.query.severity || "all";
    const handled = req.query.handled || "all";
    const ip = req.query.ip || "";
    console.log(TAG + " 筛选: attackType=" + attackType + ", severity=" + severity + ", handled=" + handled + ", ip=" + ip);

    // 调用数据访问层分页查询
    const result = await securityRepo.listEvents({ page, pageSize, attackType, severity, handled, ip });

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "ok",
      data: {
        events: result.events,
        pagination: result.pagination,
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 查询安全攻击事件异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 6. 查询未处理攻击事件数量 ====================
// GET /admin/:suffix/api/security/unread-count
// 用于管理后台顶栏红色徽标提醒
// 成功返回：{ code: 0, data: { count } }
router.get("/:suffix/api/security/unread-count", async (req, res) => {
  console.log(TAG + " ======== 收到查询未处理攻击事件数量请求 ========");

  try {
    const result = await securityRepo.countUnhandled();

    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    console.log(TAG + " 未处理攻击事件数: " + result.count);
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "ok",
      data: { count: result.count },
    });
  } catch (err) {
    console.error(TAG + " ❌ 查询未处理攻击事件数量异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 7. 标记攻击事件为已处理 ====================
// PUT /admin/:suffix/api/security/events/:id/handle
// 管理员确认并处理攻击后标记，顶栏红点数量随之减少
// 成功返回：{ code: 0, message, data: null }
router.put("/:suffix/api/security/events/:id/handle", async (req, res) => {
  console.log(TAG + " ======== 收到标记攻击事件已处理请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId + ", 事件 id: " + req.params.id);

  try {
    const eventId = req.params.id;

    // 校验 id 参数必须为数字
    if (!eventId || !/^\d+$/.test(eventId)) {
      return res.status(400).json({
        code: 400,
        message: "事件 ID 无效。",
        data: null,
      });
    }

    // 调用数据访问层标记已处理
    const result = await securityRepo.markHandled(eventId);

    if (result.code !== 200) {
      const statusCode = result.code === 404 ? 404 : 500;
      return res.status(statusCode).json({ code: result.code, message: result.message, data: null });
    }

    console.log(TAG + " ✅ 攻击事件 " + eventId + " 已标记处理");
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: result.message,
      data: null,
    });
  } catch (err) {
    console.error(TAG + " ❌ 标记攻击事件已处理异常: " + err.message);
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
