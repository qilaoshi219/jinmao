// ==================== 管理员：价格调整路由 ====================
// 职责：读取/保存出售价与成本价配置（写文件即时生效）、管理定时调价
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/pricing/*，本文件内使用相对路径

const fs = require("fs");
const path = require("path");
const express = require("express");
const router = express.Router();
const {
  validateTimeBasedPricing,
  listSchedules,
  addSchedule,
  removeSchedule,
} = require("../../utils/pricing_schedule");

const TAG = "[API_admin_pricing]";
const SALE_CONFIG_PATH = path.join(__dirname, "..", "..", "config", "billing_pricing.json");
const COST_CONFIG_PATH = path.join(__dirname, "..", "..", "config", "model_cost_config.json");

/**
 * 读取 JSON 配置文件（失败返回 null）
 * @param {string} filePath - 配置文件绝对路径
 * @returns {Object|null}
 */
function readConfig(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(TAG + " 读取配置文件失败（" + filePath + "）：" + err.message);
    return null;
  }
}

/**
 * 写入 JSON 配置文件
 * @param {string} filePath - 配置文件绝对路径
 * @param {Object} config - 配置对象
 */
function writeConfig(filePath, config) {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * 校验并将 timeBasedPricing 合并写入指定配置文件（保留顶层其它键）
 * @param {string} filePath - 配置文件绝对路径
 * @param {Object} tbp - 新的 timeBasedPricing 配置
 * @param {string} label - 配置名称（出售价/成本价，用于日志）
 * @param {string} userId - 操作者 userId（用于日志）
 * @returns {{ success: boolean, message?: string }}
 */
function saveTimeBasedPricing(filePath, tbp, label, userId) {
  const err = validateTimeBasedPricing(tbp);
  if (err) return { success: false, message: label + "配置无效：" + err };

  const config = readConfig(filePath);
  if (!config) return { success: false, message: "读取" + label + "配置文件失败。" };

  config.timeBasedPricing = tbp;
  writeConfig(filePath, config);
  console.log(TAG + " ✅ " + label + "已保存并即时生效（操作者 userId=" + userId + "）");
  return { success: true };
}

// ==================== 1. 获取价格配置 ====================
// GET /admin/:suffix/api/pricing
// 成功返回：{ code: 0, data: { sale, cost, serverTime } }
router.get("/", (req, res) => {
  console.log(TAG + " ======== 收到获取价格配置请求 ========");

  const sale = readConfig(SALE_CONFIG_PATH);
  const cost = readConfig(COST_CONFIG_PATH);
  if (!sale || !cost) {
    return res.status(500).json({ code: 500, message: "读取价格配置文件失败。", data: null });
  }

  return res.json({
    code: 0,
    message: "ok",
    data: {
      sale,
      cost,
      serverTime: new Date().toISOString(),
    },
  });
});

// ==================== 2. 保存价格配置 ====================
// PUT /admin/:suffix/api/pricing
// 请求体：{ sale?: timeBasedPricing, cost?: timeBasedPricing }
// 仅保存提供的侧别，未提供的一侧原样保留；写文件后即时生效
router.put("/", (req, res) => {
  console.log(TAG + " ======== 收到保存价格请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    const { sale, cost } = req.body || {};
    if (!sale && !cost) {
      return res.status(400).json({
        code: 400,
        message: "至少需要提供出售价（sale）或成本价（cost）之一。",
        data: null,
      });
    }

    let saleSaved = false;
    let costSaved = false;

    if (sale) {
      const result = saveTimeBasedPricing(SALE_CONFIG_PATH, sale, "出售价", req.userId);
      if (!result.success) {
        return res.status(400).json({ code: 400, message: result.message, data: null });
      }
      saleSaved = true;
    }
    if (cost) {
      const result = saveTimeBasedPricing(COST_CONFIG_PATH, cost, "成本价", req.userId);
      if (!result.success) {
        return res.status(400).json({ code: 400, message: result.message, data: null });
      }
      costSaved = true;
    }

    console.log(TAG + " ✅ 价格已保存（sale=" + saleSaved + ", cost=" + costSaved + "），无需重启即时生效");
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "价格已保存并即时生效。",
      data: { saleSaved, costSaved },
    });
  } catch (err) {
    console.error(TAG + " ❌ 保存价格异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);
    return res.status(500).json({ code: 500, message: "服务器内部错误，请稍后再试。", data: null });
  }
});

// ==================== 3. 查询定时调价列表 ====================
// GET /admin/:suffix/api/pricing/schedule
// 成功返回：{ code: 0, data: { items } }
router.get("/schedule", (req, res) => {
  console.log(TAG + " ======== 收到查询定时调价请求 ========");

  try {
    const items = listSchedules();
    console.log(TAG + " 待生效定时调价: " + items.length + " 条");
    return res.json({ code: 0, message: "ok", data: { items } });
  } catch (err) {
    console.error(TAG + " ❌ 查询定时调价异常: " + err.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误，请稍后再试。", data: null });
  }
});

// ==================== 4. 新增定时调价 ====================
// POST /admin/:suffix/api/pricing/schedule
// 请求体：{ effectiveAt, note?, sale?, cost? }（至少一侧；生效时间必须晚于当前）
router.post("/schedule", (req, res) => {
  console.log(TAG + " ======== 收到新增定时调价请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    const { effectiveAt, note, sale, cost } = req.body || {};
    const result = addSchedule({ effectiveAt, note, sale, cost });
    if (!result.success) {
      return res.status(400).json({ code: 400, message: result.message, data: null });
    }

    console.log(TAG + " ✅ 定时调价已创建: id=" + result.item.id + ", effectiveAt=" + result.item.effectiveAt);
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "定时调价已创建，到点后自动生效。",
      data: { item: result.item },
    });
  } catch (err) {
    console.error(TAG + " ❌ 新增定时调价异常: " + err.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误，请稍后再试。", data: null });
  }
});

// ==================== 5. 取消定时调价 ====================
// DELETE /admin/:suffix/api/pricing/schedule/:id
router.delete("/schedule/:id", (req, res) => {
  console.log(TAG + " ======== 收到取消定时调价请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId + ", id: " + req.params.id);

  try {
    const result = removeSchedule(req.params.id);
    if (!result.success) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    console.log(TAG + " ✅ 定时调价已取消: id=" + result.item.id);
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "定时调价已取消。",
      data: { item: result.item },
    });
  } catch (err) {
    console.error(TAG + " ❌ 取消定时调价异常: " + err.message);
    return res.status(500).json({ code: 500, message: "服务器内部错误，请稍后再试。", data: null });
  }
});

// ==================== 导出路由 ====================
module.exports = router;
