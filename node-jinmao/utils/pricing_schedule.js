// ==================== 定时调价调度模块 ====================
// 职责：管理待生效的定时调价（持久化到 data/pricing_schedule.json）、
//       到点自动应用（写入 billing_pricing.json / model_cost_config.json）
// 说明：售价/成本配置均被计费模块每次调用实时读取，写文件即即时生效，无需重启。
//       调度数据放在 data/ 运行时目录，服务重启后到点依然生效。

const fs = require("fs");
const path = require("path");

const TAG = "[pricing_schedule]";
const SCHEDULE_PATH = path.join(__dirname, "..", "data", "pricing_schedule.json");
const SALE_CONFIG_PATH = path.join(__dirname, "..", "config", "billing_pricing.json");
const COST_CONFIG_PATH = path.join(__dirname, "..", "config", "model_cost_config.json");

// 轮询间隔：每 15 秒检查一次到期的定时调价
const POLL_INTERVAL_MS = 15 * 1000;
// 时段时间格式：HH:MM（24 小时制，结束时间允许 24:00）
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

// ==================== 配置文件读写 ====================

/**
 * 读取 JSON 配置文件（读取或解析失败返回 null）
 * @param {string} filePath - 配置文件绝对路径
 * @returns {Object|null}
 */
function loadConfigFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(TAG + " 读取配置文件失败（" + filePath + "）：" + err.message);
    return null;
  }
}

/**
 * 写入 JSON 配置文件（原子性不做额外处理，与 middleware/admin.js 风格一致）
 * @param {string} filePath - 配置文件绝对路径
 * @param {Object} config - 配置对象
 */
function saveConfigFile(filePath, config) {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

// ==================== timeBasedPricing 校验 ====================

/**
 * 校验 timeBasedPricing 配置结构
 * 规则：enabled 为布尔；periods 非空；有且仅有一个 default 时段（00:00-24:00 兜底）；
 *       各时段起止时间为 HH:MM 且不相等；每时段必须包含 deepseek-v4-pro/flash 且三个单价均为 >=0 的有限数字
 * @param {Object} tbp - timeBasedPricing 配置对象
 * @returns {string|null} 校验失败返回错误信息，通过返回 null
 */
function validateTimeBasedPricing(tbp) {
  if (!tbp || typeof tbp !== "object") return "timeBasedPricing 必须是一个对象";
  if (typeof tbp.enabled !== "boolean") return "enabled 必须是布尔值";
  if (!Array.isArray(tbp.periods) || tbp.periods.length === 0) return "periods 不能为空";

  const defaultPeriods = tbp.periods.filter((p) => p && p.name === "default");
  if (defaultPeriods.length !== 1) return "必须且只能有一个 default 时段";
  if (defaultPeriods[0].start !== "00:00" || defaultPeriods[0].end !== "24:00") {
    return "default 时段必须为 00:00-24:00";
  }

  for (const period of tbp.periods) {
    if (!period || typeof period !== "object") return "periods 中存在无效时段";
    if (!period.name || typeof period.name !== "string" || period.name.trim() === "") {
      return "时段名称不能为空";
    }
    if (!TIME_PATTERN.test(period.start) || !TIME_PATTERN.test(period.end)) {
      return "时段 " + period.name + " 的起止时间格式无效（应为 HH:MM）";
    }
    if (period.start === period.end) {
      return "时段 " + period.name + " 的起止时间不能相同";
    }
    if (!period.providers || typeof period.providers !== "object") {
      return "时段 " + period.name + " 缺少 providers 配置";
    }
    const deepseek = period.providers.deepseek;
    if (!deepseek || typeof deepseek !== "object") {
      return "时段 " + period.name + " 缺少 deepseek 配置";
    }
    for (const modelKey of ["deepseek-v4-pro", "deepseek-v4-flash"]) {
      const price = deepseek[modelKey];
      if (!price || typeof price !== "object") {
        return "时段 " + period.name + " 缺少模型 " + modelKey + " 的价格";
      }
      for (const field of ["input_cache_miss", "input_cache_hit", "output"]) {
        const value = price[field];
        if (typeof value !== "number" || !isFinite(value) || value < 0) {
          return "时段 " + period.name + " 模型 " + modelKey + " 的 " + field + " 必须为大于等于 0 的数字";
        }
      }
    }
  }
  return null;
}

// ==================== 调度文件读写 ====================

/**
 * 读取调度文件，文件不存在或解析失败时返回空调度
 * @returns {{ nextId: number, items: Array }}
 */
function loadScheduleFile() {
  try {
    if (!fs.existsSync(SCHEDULE_PATH)) return { nextId: 1, items: [] };
    const raw = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf-8"));
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return { nextId: 1, items: [] };
    return { nextId: raw.nextId || 1, items: raw.items };
  } catch (err) {
    console.error(TAG + " 读取调度文件失败: " + err.message);
    return { nextId: 1, items: [] };
  }
}

/**
 * 写入调度文件
 * @param {{ nextId: number, items: Array }} data - 调度数据
 * @returns {boolean} 是否写入成功
 */
function saveScheduleFile(data) {
  try {
    fs.mkdirSync(path.dirname(SCHEDULE_PATH), { recursive: true });
    fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(TAG + " 写入调度文件失败: " + err.message);
    return false;
  }
}

// ==================== 对外接口：调度增删查 ====================

/**
 * 查询待生效的定时调价列表（按生效时间升序）
 * @returns {Array} 定时调价列表
 */
function listSchedules() {
  const data = loadScheduleFile();
  return [...data.items].sort((a, b) => new Date(a.effectiveAt) - new Date(b.effectiveAt));
}

/**
 * 新增定时调价
 * @param {Object} params
 * @param {string} params.effectiveAt - 生效时间（ISO 字符串或可解析的日期时间）
 * @param {string} [params.note] - 备注
 * @param {Object} [params.sale] - 出售价 timeBasedPricing 快照
 * @param {Object} [params.cost] - 成本价 timeBasedPricing 快照
 * @returns {{ success: boolean, message: string, item?: Object }}
 */
function addSchedule({ effectiveAt, note, sale, cost }) {
  const at = new Date(effectiveAt);
  if (isNaN(at.getTime())) return { success: false, message: "生效时间格式无效。" };
  if (at.getTime() <= Date.now()) return { success: false, message: "生效时间必须晚于当前时间。" };
  if (!sale && !cost) return { success: false, message: "至少需要提供出售价（sale）或成本价（cost）之一。" };

  if (sale) {
    const err = validateTimeBasedPricing(sale);
    if (err) return { success: false, message: "出售价配置无效：" + err };
  }
  if (cost) {
    const err = validateTimeBasedPricing(cost);
    if (err) return { success: false, message: "成本价配置无效：" + err };
  }

  const data = loadScheduleFile();
  const item = {
    id: data.nextId,
    effectiveAt: at.toISOString(),
    createdAt: new Date().toISOString(),
    note: note || "",
    sale: sale || null,
    cost: cost || null,
  };
  data.items.push(item);
  data.nextId += 1;
  if (!saveScheduleFile(data)) return { success: false, message: "写入调度文件失败。" };
  return { success: true, message: "定时调价已创建。", item };
}

/**
 * 取消定时调价
 * @param {number|string} id - 定时调价 ID
 * @returns {{ success: boolean, message: string, item?: Object }}
 */
function removeSchedule(id) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return { success: false, message: "定时调价 ID 无效。" };
  }
  const data = loadScheduleFile();
  const index = data.items.findIndex((item) => item.id === targetId);
  if (index === -1) return { success: false, message: "未找到该定时调价。" };
  const [removed] = data.items.splice(index, 1);
  if (!saveScheduleFile(data)) return { success: false, message: "写入调度文件失败。" };
  return { success: true, message: "定时调价已取消。", item: removed };
}

// ==================== 到点应用 ====================

/**
 * 应用单条定时调价：将快照合并写入对应侧配置文件（保留顶层其它键）
 * @param {Object} item - 定时调价条目
 * @returns {boolean} 是否应用成功
 */
function applyScheduleItem(item) {
  let ok = true;
  if (item.sale) {
    const config = loadConfigFile(SALE_CONFIG_PATH);
    if (!config) return false;
    config.timeBasedPricing = item.sale;
    saveConfigFile(SALE_CONFIG_PATH, config);
    console.log(TAG + " ✅ 定时调价已应用（出售价）— 生效时间: " + item.effectiveAt + ", 备注: " + (item.note || "-"));
  }
  if (item.cost) {
    const config = loadConfigFile(COST_CONFIG_PATH);
    if (!config) return false;
    config.timeBasedPricing = item.cost;
    saveConfigFile(COST_CONFIG_PATH, config);
    console.log(TAG + " ✅ 定时调价已应用（成本价）— 生效时间: " + item.effectiveAt + ", 备注: " + (item.note || "-"));
  }
  return ok;
}

/**
 * 应用所有已到期的定时调价
 * @returns {number} 成功应用的条数
 */
function applyDueSchedules() {
  const data = loadScheduleFile();
  if (data.items.length === 0) return 0;
  const now = Date.now();
  const dueItems = data.items.filter((item) => new Date(item.effectiveAt).getTime() <= now);
  if (dueItems.length === 0) return 0;

  let applied = 0;
  for (const item of dueItems) {
    if (applyScheduleItem(item)) applied++;
    data.items = data.items.filter((it) => it.id !== item.id);
  }
  if (applied > 0) saveScheduleFile(data);
  return applied;
}

/**
 * 启动定时调价调度：先立即应用已到期项，再每 15 秒轮询
 */
function startPricingScheduler() {
  try {
    const applied = applyDueSchedules();
    if (applied > 0) console.log(TAG + " 启动时已应用 " + applied + " 条到期的定时调价");
    setInterval(() => {
      try {
        applyDueSchedules();
      } catch (err) {
        console.error(TAG + " 定时应用异常: " + err.message);
      }
    }, POLL_INTERVAL_MS);
    console.log(TAG + " ✅ 定时调价调度已启动（每 " + (POLL_INTERVAL_MS / 1000) + " 秒检查一次）");
  } catch (err) {
    console.error(TAG + " 启动定时调价调度失败: " + err.message);
  }
}

// ==================== 模块导出 ====================
module.exports = {
  validateTimeBasedPricing,
  listSchedules,
  addSchedule,
  removeSchedule,
  applyDueSchedules,
  startPricingScheduler,
};
