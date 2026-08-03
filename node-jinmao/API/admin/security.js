// ==================== 管理员：安全防护路由 ====================
// 职责：攻击事件分页查询、未处理数量统计、标记已处理
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/security/*，本文件内使用相对路径

const express = require("express");
const router = express.Router();
const securityRepo = require("../../utils/repo/security_repo"); // 安全事件数据访问层

const TAG = "[API_admin_security]";

// ==================== CSV 导出辅助函数 ====================

/**
 * CSV 单元格转义：统一用双引号包裹，内部双引号翻倍（RFC 4180）
 * @param {*} value - 单元格值
 * @returns {string} 转义后的 CSV 单元格
 */
function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * 时间格式化（本地时区 YYYY-MM-DD HH:mm:ss）
 * @param {Date|string} date - 日期对象或 ISO 字符串
 * @returns {string}
 */
function formatDateTime(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

// 攻击类型 → 中文名（与页面展示保持一致）
const ATTACK_TYPE_LABELS = {
  sql_injection: "SQL注入",
  xss: "XSS攻击",
  path_traversal: "路径遍历",
  oversized_url: "超长URL",
  path_param_abuse: "参数滥用",
  sensitive_file: "敏感文件",
  scanner_path: "扫描路径",
  malicious_ua: "恶意UA",
};

/**
 * 攻击类型 → 中文名
 * @param {string} type - 攻击类型
 * @returns {string}
 */
function attackTypeLabel(type) {
  return ATTACK_TYPE_LABELS[type] || type || "未知";
}

/**
 * 严重程度 → 中文名
 * @param {string} sev - 严重程度
 * @returns {string}
 */
function severityLabel(sev) {
  if (sev === "high") return "高危";
  if (sev === "medium") return "中危";
  return "低危";
}

// ==================== 1. 查询安全攻击事件列表 ====================
// GET /admin/:suffix/api/security/events?page=1&pageSize=20&attackType=all&severity=all&handled=all&ip=
// 支持按攻击类型 / 严重程度 / 处理状态 / IP 筛选
// 成功返回：{ code: 0, data: { events[], pagination } }
router.get("/events", async (req, res) => {
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

// ==================== 2. 查询未处理攻击事件数量 ====================
// GET /admin/:suffix/api/security/unread-count
// 用于管理后台顶栏红色徽标提醒
// 成功返回：{ code: 0, data: { count } }
router.get("/unread-count", async (req, res) => {
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

// ==================== 3. 标记攻击事件为已处理 ====================
// PUT /admin/:suffix/api/security/events/:id/handle
// 管理员确认并处理攻击后标记，顶栏红点数量随之减少
// 成功返回：{ code: 0, message, data: null }
router.put("/events/:id/handle", async (req, res) => {
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

// ==================== 4. 导出攻击事件 CSV ====================
// GET /admin/:suffix/api/security/export?attackType=all&severity=all&handled=all&ip=
// 按当前筛选条件导出全部攻击事件为 CSV（不分页），供离线分析与安全加固
// 响应为文件下载流（Content-Disposition: attachment）
router.get("/export", async (req, res) => {
  console.log(TAG + " ======== 收到导出攻击事件请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    // 解析筛选参数（与列表查询一致）
    const attackType = req.query.attackType || "all";
    const severity = req.query.severity || "all";
    const handled = req.query.handled || "all";
    const ip = req.query.ip || "";
    console.log(TAG + " 导出筛选: attackType=" + attackType + ", severity=" + severity + ", handled=" + handled + ", ip=" + ip);

    // 查询全部符合条件的事件（不分页）
    const result = await securityRepo.listAllEvents({ attackType, severity, handled, ip });
    if (result.code !== 200) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    // CSV 表头（中文列名，方便直接阅读分析）
    const header = [
      "事件ID", "触发时间", "IP", "请求方法", "攻击类型", "严重程度",
      "触发次数", "是否阻断", "处理状态", "触发原因", "完整路径", "完整Query", "User-Agent",
    ];

    // CSV 行数据（标签映射与页面展示保持一致）
    const rows = result.events.map((e) => [
      e.id,
      formatDateTime(e.createTime),
      e.ip,
      e.method,
      attackTypeLabel(e.attackType),
      severityLabel(e.severity),
      e.count,
      e.blocked ? "已阻断" : "放行",
      e.handled ? "已处理" : "未处理",
      e.reason || "",
      e.path,
      e.query || "",
      e.userAgent || "",
    ]);

    // 组装 CSV（UTF-8 BOM 保证 Excel 中文不乱码，CRLF 换行符合 CSV 标准）
    const csvLines = [header, ...rows].map((line) => line.map(csvCell).join(","));
    const csvContent = "\uFEFF" + csvLines.join("\r\n");

    // 文件名：security_events_YYYYMMDD_HHMMSS.csv
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename = "security_events_" +
      now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
      "_" + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + ".csv";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    console.log(TAG + " ✅ 导出 " + result.total + " 条攻击事件 → " + filename);
    console.log(TAG + " ================================");

    return res.send(csvContent);
  } catch (err) {
    console.error(TAG + " ❌ 导出攻击事件异常: " + err.message);
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
