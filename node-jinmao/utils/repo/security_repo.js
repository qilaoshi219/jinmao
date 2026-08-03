// ==================== 安全事件 Repository 模块 ====================
// 职责：封装对 SecurityEvent 表（安全事件表）的数据库操作，提供统一的数据访问接口
// 安全防护中间件检测到攻击后调用 recordAttack 记录，管理员后台通过 listEvents/countUnhandled/markHandled 查询与管理
// 去重策略：同 IP + 同攻击类型 + 5 分钟窗口内的重复攻击合并为一条记录（count 累加），防止扫描器刷爆数据库

// 引入 Prisma 单例实例
const prisma = require("../prisma");

// 日志前缀
const TAG = "[security_repo]";

// 去重窗口常量：5 分钟（单位毫秒）
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

// ==================== 串行写入队列 ====================
// 去重逻辑为「先查后写」（findFirst → create/update），高并发攻击时多个 recordAttack
// 同时执行会产生竞态（都查不到已有记录 → 各自新建重复记录）。
// 使用 Promise 链将所有写操作串行化，保证同 IP 同类型记录正确合并。
let writeChain = Promise.resolve();

/**
 * 将写操作加入串行队列执行
 * @param {Function} task - 返回 Promise 的写任务
 * @returns {Promise<*>} 任务结果
 */
function enqueueWrite(task) {
  const run = writeChain.then(task);
  // 无论任务成功或失败，队列都继续执行后续任务
  writeChain = run.catch(() => {});
  return run;
}

// ==================== 导出函数 ====================

/**
 * 构建安全事件筛选条件（供 listEvents 与 listAllEvents 共用）
 * @param {Object} filters - 筛选参数
 * @param {string} filters.attackType - 攻击类型（"all" 或具体类型）
 * @param {string} filters.severity - 严重程度（"all" 或 low/medium/high）
 * @param {string} filters.handled - 处理状态（"all"/"true"/"false"）
 * @param {string} filters.ip - IP 模糊搜索
 * @returns {Object} Prisma where 条件对象
 */
function buildSecurityWhere({ attackType = "all", severity = "all", handled = "all", ip = "" } = {}) {
  const where = {};
  if (attackType && attackType !== "all") where.attackType = attackType;
  if (severity && severity !== "all") where.severity = severity;
  if (handled === "true") where.handled = true;
  if (handled === "false") where.handled = false;
  if (ip && ip.trim() !== "") {
    // IP 使用包含匹配（contains），支持模糊搜索
    where.ip = { contains: ip.trim() };
  }
  return where;
}

/**
 * 格式化单个攻击事件（BigInt id 转字符串、DateTime 转 ISO 字符串）
 * @param {Object} e - SecurityEvent 原始记录
 * @returns {Object} 格式化后的事件对象
 */
function formatEvent(e) {
  return {
    id: String(e.id),
    ip: e.ip,
    method: e.method,
    path: e.path,
    query: e.query,
    userAgent: e.userAgent,
    attackType: e.attackType,
    severity: e.severity,
    reason: e.reason,
    blocked: e.blocked,
    handled: e.handled,
    count: e.count,
    createTime: e.createTime.toISOString(),
  };
}

/**
 * 记录一条攻击事件（带去重合并逻辑）
 * 若 5 分钟窗口内已存在同 IP + 同 attackType 且未处理的记录，则 count 累加，不新增记录
 * 该函数为 fire-and-forget 设计：调用方（安全中间件）不 await，失败不阻塞请求流程
 * @param {Object} params - 攻击事件参数
 * @param {string} params.ip - 攻击者 IP
 * @param {string} params.method - 请求方法（GET/POST/...）
 * @param {string} params.path - 完整请求路径（可能超长）
 * @param {string|null} params.query - 完整 query 参数原始字符串
 * @param {string|null} params.userAgent - User-Agent 请求头
 * @param {string} params.attackType - 攻击类型（sql_injection/xss/path_traversal/...）
 * @param {string} params.severity - 严重程度（low/medium/high）
 * @param {string} params.reason - 触发原因描述（命中的检测规则）
 * @param {boolean} params.blocked - 是否被防护中间件阻断
 * @returns {Promise<{ code: number, event?: Object, message?: string }>}
 *   - code 200: 记录成功（可能是新建或 count 累加）
 *   - code 500: 数据库操作异常
 */
async function recordAttack(params) {
  // 加入串行写入队列执行实际逻辑（避免高并发攻击时去重查询竞态产生重复记录）
  return enqueueWrite(() => doRecordAttack(params));
}

/**
 * recordAttack 的实际实现（由串行队列调用）
 * @param {Object} params - 同 recordAttack 参数
 * @returns {Promise<{ code: number, event?: Object, message?: string }>}
 */
async function doRecordAttack(params) {
  const { ip, method, path, query, userAgent, attackType, severity, reason, blocked } = params;

  try {
    // 1. 查询 5 分钟窗口内是否已有同 IP + 同攻击类型且未处理的记录
    // 窗口起点 = 当前时间 - 5 分钟
    const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);
    const existing = await prisma.securityEvent.findFirst({
      where: {
        ip: ip,
        attackType: attackType,
        handled: false, // 已处理的记录不参与合并，避免管理员处理后又新增攻击时被误合并
        createTime: { gte: windowStart }, // 仅在去重窗口内合并
      },
      select: { id: true, count: true },
      orderBy: { createTime: "desc" }, // 取最近的记录
    });

    if (existing) {
      // 2a. 已存在同类记录 → count 原子累加（count + 1）
      // 使用 update 而非 updateMany，返回更新后的记录确认生效
      const updated = await prisma.securityEvent.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
        select: { id: true, count: true },
      });
      console.log(TAG + " 同类攻击合并计数: ip=" + ip + ", type=" + attackType + ", count=" + updated.count);
      return { code: 200, event: { id: updated.id, count: updated.count } };
    }

    // 2b. 无同类记录 → 新建攻击事件
    const created = await prisma.securityEvent.create({
      data: {
        ip: ip,
        method: method,
        path: path,
        query: query || null,
        userAgent: userAgent || null,
        attackType: attackType,
        severity: severity,
        reason: reason,
        blocked: blocked,
      },
    });

    console.log(TAG + " 新增攻击事件: id=" + created.id + ", ip=" + ip + ", type=" + attackType + ", severity=" + severity);
    return { code: 200, event: { id: created.id, count: 1 } };
  } catch (error) {
    // 数据库异常：仅记录日志，不抛出（安全中间件 fire-and-forget 调用）
    console.error(TAG + " ❌ 记录攻击事件异常: " + error.message);
    return { code: 500, message: "记录攻击事件异常: " + error.message };
  }
}

/**
 * 分页查询攻击事件列表（支持多条件筛选）
 * @param {Object} options - 查询参数
 * @param {number} options.page - 页码（从 1 开始）
 * @param {number} options.pageSize - 每页数量
 * @param {string} options.attackType - 攻击类型筛选（"all" 或具体类型）
 * @param {string} options.severity - 严重程度筛选（"all" 或 low/medium/high）
 * @param {string} options.handled - 处理状态筛选（"all"/"true"/"false"）
 * @param {string} options.ip - IP 模糊搜索（可选）
 * @returns {Promise<{ code: number, events?: Array, pagination?: Object, message?: string }>}
 */
async function listEvents({ page = 1, pageSize = 20, attackType = "all", severity = "all", handled = "all", ip = "" } = {}) {
  try {
    // 归一化分页参数
    let p = parseInt(page) || 1;
    let ps = parseInt(pageSize) || 20;
    if (p < 1) p = 1;
    if (ps < 1) ps = 20;
    if (ps > 100) ps = 100; // 单页最多 100 条

    // 构建查询条件（仅添加有意义的筛选）
    const where = buildSecurityWhere({ attackType, severity, handled, ip });

    console.log(TAG + " 查询攻击事件: page=" + p + ", pageSize=" + ps + ", 筛选=" + JSON.stringify(where));

    // 并行查询：列表 + 总数
    const skip = (p - 1) * ps;
    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createTime: "desc" }, // 最新的在前
        skip,
        take: ps,
      }),
      prisma.securityEvent.count({ where }),
    ]);

    // 格式化返回数据：BigInt id 转字符串、DateTime 转 ISO 字符串
    const formattedEvents = events.map(formatEvent);

    console.log(TAG + " 查询到 " + events.length + " 条事件，总计 " + total + " 条");
    return {
      code: 200,
      events: formattedEvents,
      pagination: { page: p, pageSize: ps, total },
    };
  } catch (error) {
    console.error(TAG + " ❌ 查询攻击事件异常: " + error.message);
    return { code: 500, message: "查询攻击事件异常: " + error.message };
  }
}

/**
 * 查询全部符合条件的攻击事件（不分页，供 CSV 导出分析使用）
 * @param {Object} filters - 筛选参数（同 buildSecurityWhere）
 * @returns {Promise<{ code: number, events?: Array, total?: number, message?: string }>}
 */
async function listAllEvents({ attackType = "all", severity = "all", handled = "all", ip = "" } = {}) {
  try {
    const where = buildSecurityWhere({ attackType, severity, handled, ip });

    const events = await prisma.securityEvent.findMany({
      where,
      orderBy: { createTime: "desc" }, // 最新的在前
    });

    const formattedEvents = events.map(formatEvent);

    console.log(TAG + " 导出查询攻击事件: " + formattedEvents.length + " 条");
    return { code: 200, events: formattedEvents, total: formattedEvents.length };
  } catch (error) {
    console.error(TAG + " ❌ 查询全部攻击事件异常: " + error.message);
    return { code: 500, message: "查询全部攻击事件异常: " + error.message };
  }
}

/**
 * 统计未处理（handled=false）的攻击事件数量
 * 用于管理后台顶栏红点徽标提醒
 * @returns {Promise<{ code: number, count?: number, message?: string }>}
 */
async function countUnhandled() {
  try {
    const count = await prisma.securityEvent.count({ where: { handled: false } });
    console.log(TAG + " 未处理攻击事件数: " + count);
    return { code: 200, count };
  } catch (error) {
    console.error(TAG + " ❌ 统计未处理攻击事件异常: " + error.message);
    return { code: 500, message: "统计未处理攻击事件异常: " + error.message };
  }
}

/**
 * 将攻击事件标记为已处理（handled=true）
 * 管理员在后台确认并处理攻击后调用，避免顶栏红点持续提醒
 * @param {string|number} id - 攻击事件 ID
 * @returns {Promise<{ code: number, message?: string }>}
 *   - code 200: 标记成功
 *   - code 404: 事件不存在
 *   - code 500: 数据库异常
 */
async function markHandled(id) {
  try {
    // id 转 BigInt（MySQL BIGINT 主键）
    const eventId = BigInt(id);

    // 使用 update 更新，P2025 错误码表示记录不存在
    await prisma.securityEvent.update({
      where: { id: eventId },
      data: { handled: true },
    });

    console.log(TAG + " ✅ 攻击事件已标记处理: id=" + id);
    return { code: 200, message: "已标记为已处理。" };
  } catch (error) {
    // 记录不存在
    if (error.code === "P2025") {
      console.log(TAG + " 攻击事件不存在: id=" + id);
      return { code: 404, message: "攻击事件不存在。" };
    }
    console.error(TAG + " ❌ 标记攻击事件处理状态异常: " + error.message);
    return { code: 500, message: "标记处理状态异常: " + error.message };
  }
}

// 导出模块函数
module.exports = {
  recordAttack,
  listEvents,
  listAllEvents,
  countUnhandled,
  markHandled,
};
