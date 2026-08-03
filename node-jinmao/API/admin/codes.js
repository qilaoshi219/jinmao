// ==================== 管理员：兑换码路由 ====================
// 职责：生成兑换码、分页查询兑换码列表
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/codes/*，本文件内使用相对路径

const express = require("express");
const router = express.Router();
const crypto = require("crypto"); // 安全随机数生成（兑换码生成）
const prisma = require("../../utils/prisma"); // Prisma 单例客户端

const TAG = "[API_admin_codes]";

// ==================== 1. 生成兑换码 ====================
// POST /admin/:suffix/api/codes/generate
// 请求体：{ count?: number }  // 生成数量，默认10，最大50
// 成功返回：{ code: 0, data: { count, codes: [{ id, code, amount, createdAt }] } }
router.post("/generate", async (req, res) => {
  console.log(TAG + " ======== 收到生成兑换码请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    // 解析生成数量（默认10，最大50）
    let count = parseInt(req.body?.count) || 10;
    if (count < 1) count = 1;
    if (count > 50) count = 50;

    console.log(TAG + " 生成数量: " + count);

    // 批量生成兑换码
    const generatedCodes = [];
    for (let i = 0; i < count; i++) {
      // 使用 crypto.randomBytes 生成 12 字节随机数 → 24 位大写十六进制字符串
      // 碰撞概率：16^24 ≈ 7.9×10^28，几乎不可能碰撞
      const code = crypto.randomBytes(12).toString("hex").toUpperCase();
      generatedCodes.push({
        code: code,
        amount: 10, // 固定 10 元
        createdBy: BigInt(req.userId), // 记录创建者（管理员）
      });
    }

    // 批量插入数据库（一次插入所有记录）
    const result = await prisma.redeem_code.createMany({
      data: generatedCodes,
    });

    console.log(TAG + " ✅ 成功生成 " + result.count + " 个兑换码");

    // 重新查询刚创建的兑换码（获取完整信息包括 id）
    const codeList = generatedCodes.map((c) => c.code);
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
    const formattedCodes = createdCodes.map((c) => ({
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
router.get("/", async (req, res) => {
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
          usedByUser: {
            select: { id: true, username: true, nickname: true, email: true },
          },
          usedAt: true,
          distributedAt: true,
          createdAt: true,
        },
      }),
      prisma.redeem_code.count({ where }),
    ]);

    console.log(TAG + " 查询到 " + codes.length + " 条记录，总计 " + total + " 条");

    // 格式化返回数据
    const formattedCodes = codes.map((c) => ({
      id: String(c.id),
      code: c.code,
      amount: String(c.amount),
      isUsed: c.isUsed,
      usedBy: c.usedBy ? String(c.usedBy) : null,
      usedByUser: c.usedByUser
        ? {
            id: String(c.usedByUser.id),
            username: c.usedByUser.username || "",
            nickname: c.usedByUser.nickname || "",
            email: c.usedByUser.email,
          }
        : null,
      usedAt: c.usedAt ? c.usedAt.toISOString() : null,
      distributedAt: c.distributedAt ? c.distributedAt.toISOString() : null,
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

// ==================== 3. 标记兑换码为已分发 ====================
// POST /admin/:suffix/api/codes/:id/mark-distributed
// 说明：管理员点击复制兑换码后调用，记录分发时间，防止重复分发
// 成功返回：{ code: 0, data: { id, distributedAt } }
router.post("/:id/mark-distributed", async (req, res) => {
  console.log(TAG + " ======== 收到标记兑换码已分发请求 ========");

  try {
    // 校验兑换码 ID 格式
    if (!/^\d+$/.test(req.params.id || "")) {
      return res.status(400).json({
        code: 400,
        message: "兑换码 ID 格式不正确。",
        data: null,
      });
    }

    const id = BigInt(req.params.id);
    const distributedAt = new Date();

    // 更新分发时间（不存在时 Prisma 抛出 P2025）
    const updated = await prisma.redeem_code.update({
      where: { id },
      data: { distributedAt },
      select: { id: true, distributedAt: true },
    });

    console.log(TAG + " ✅ 兑换码 " + id + " 已标记为已分发");
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "已标记为已分发。",
      data: {
        id: String(updated.id),
        distributedAt: updated.distributedAt.toISOString(),
      },
    });
  } catch (err) {
    // 兑换码不存在
    if (err.code === "P2025") {
      console.log(TAG + " 兑换码不存在: " + req.params.id);
      return res.status(404).json({
        code: 404,
        message: "兑换码不存在。",
        data: null,
      });
    }

    console.error(TAG + " ❌ 标记兑换码已分发异常: " + err.message);
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
