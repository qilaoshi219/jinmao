// ==================== 管理员：API 密钥（.env）路由 ====================
// 职责：读取 .env 中 5 个 AI 服务密钥的配置状态（脱敏显示）、在线修改并写回 .env
// 说明：写回文件后不修改 process.env，运行中进程仍使用旧值，重启后端后生效
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/env/*，本文件内使用相对路径

const fs = require("fs");
const path = require("path");
const express = require("express");
const router = express.Router();
const { validateApiKey } = require("../../config");

const TAG = "[API_admin_env]";
const ENV_PATH = path.join(__dirname, "..", "..", ".env");
const MAX_KEY_LENGTH = 200;

// ==================== 白名单：仅允许修改以下 AI 服务密钥 ====================
// 禁止开放其它环境变量（DATABASE_URL / JWT_SECRET / SMTP / MinIO 等），防止越权注入
const ALLOWED_KEYS = [
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek 大模型/小模型" },
  { key: "DOC2X_API_KEY", label: "Doc2x PDF 解析" },
  { key: "VOLCENGINE_TTS_APP_ID", label: "火山引擎 TTS App ID" },
  { key: "VOLCENGINE_TTS_ACCESS_KEY", label: "火山引擎 TTS Access Key" },
  { key: "GRSAI_API_KEY", label: "Grsai 文生图" },
];
const ALLOWED_KEY_SET = new Set(ALLOWED_KEYS.map((item) => item.key));

/**
 * 脱敏显示密钥值：长度 ≤8 显示 ***，否则前 4 位 + *** + 后 4 位
 * @param {string} value - 密钥明文
 * @returns {string|null}
 */
function maskValue(value) {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return value.substring(0, 4) + "***" + value.substring(value.length - 4);
}

/**
 * 从 .env 文件内容中读取指定 key 的值（取最后一次出现的赋值，兼容可选引号）
 * @param {string} content - .env 文件内容
 * @param {string} key - 白名单 key
 * @returns {string|null}
 */
function readEnvValue(content, key) {
  const lines = content.split(/\r?\n/);
  const prefixRe = new RegExp("^\\s*" + key + "\\s*=");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!prefixRe.test(lines[i])) continue;
    let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    // 去掉成对包裹的引号
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    return value;
  }
  return null;
}

/**
 * 校验单个待写入的密钥值
 * @param {string} key - 白名单 key
 * @param {any} value - 待写入值
 * @returns {{ valid: boolean, error?: string }}
 */
function validateNewValue(key, value) {
  if (typeof value !== "string") {
    return { valid: false, error: key + " 的值必须是字符串。" };
  }
  if (value.trim() === "") {
    return { valid: false, error: key + " 不能为空。" };
  }
  if (value !== value.trim()) {
    return { valid: false, error: key + " 不能包含首尾空格。" };
  }
  if (value.length > MAX_KEY_LENGTH) {
    return { valid: false, error: key + " 长度不能超过 " + MAX_KEY_LENGTH + " 字符。" };
  }
  // 非 ASCII 字符（如中文占位文本）会破坏 HTTP 头，直接拒绝
  const asciiCheck = validateApiKey(value, key);
  if (!asciiCheck.valid) {
    return { valid: false, error: asciiCheck.error };
  }
  // 引号与反斜杠会破坏 .env 的双引号包裹写法；换行会导致配置串行
  if (/["\\\r\n]/.test(value)) {
    return { valid: false, error: key + " 不能包含引号（\"）、反斜杠或换行符。" };
  }
  return { valid: true };
}

/**
 * 将白名单 key 的新值写回 .env 文件（保留注释与其它配置，缺失 key 追加到末尾）
 * @param {Object} updates - { key: newValue }
 * @returns {{ success: boolean, message?: string, updatedKeys?: string[] }}
 */
function writeEnvValues(updates) {
  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf-8");
  } catch (err) {
    return { success: false, message: "读取 .env 文件失败：" + err.message };
  }

  // 保留原文件换行风格（LF 或 CRLF），避免整文件行尾被改写
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const found = new Set();
  const output = lines.map((line) => {
    for (const key of Object.keys(updates)) {
      if (new RegExp("^\\s*" + key + "\\s*=").test(line)) {
        found.add(key);
        return key + '="' + updates[key] + '"';
      }
    }
    return line;
  });

  // 文件中不存在的 key 追加到末尾
  const appendLines = [];
  for (const key of Object.keys(updates)) {
    if (!found.has(key)) {
      appendLines.push(key + '="' + updates[key] + '"');
    }
  }

  let newContent = output.join(eol);
  if (appendLines.length > 0) {
    newContent += (newContent ? eol : "") + appendLines.join(eol);
  }

  // 先写临时文件再原子重命名，避免写坏 .env
  const tmpPath = ENV_PATH + ".tmp";
  try {
    fs.writeFileSync(tmpPath, newContent, "utf-8");
    fs.renameSync(tmpPath, ENV_PATH);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (cleanupErr) {
      // 清理失败仅记录，不影响主错误返回
      console.error(TAG + " 清理临时文件失败: " + cleanupErr.message);
    }
    return { success: false, message: "写入 .env 文件失败：" + err.message };
  }

  return { success: true, updatedKeys: Object.keys(updates) };
}

// ==================== 1. 获取 API 密钥配置状态 ====================
// GET /admin/:suffix/api/env
// 从 .env 文件读取（磁盘真实值），仅返回脱敏结果，不回传明文
router.get("/", (req, res) => {
  console.log(TAG + " ======== 收到获取 API 密钥状态请求 ========");

  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf-8");
  } catch (err) {
    console.error(TAG + " ❌ 读取 .env 失败: " + err.message);
    return res.status(500).json({ code: 500, message: "读取 .env 文件失败。", data: null });
  }

  const items = ALLOWED_KEYS.map(({ key, label }) => {
    const value = readEnvValue(content, key);
    return {
      key,
      label,
      configured: !!value,
      masked: maskValue(value),
    };
  });

  return res.json({ code: 0, message: "ok", data: { items } });
});

// ==================== 2. 更新 API 密钥（写回 .env） ====================
// PUT /admin/:suffix/api/env
// 请求体：{ values: { DEEPSEEK_API_KEY: "sk-..." } }，支持部分更新
router.put("/", (req, res) => {
  console.log(TAG + " ======== 收到更新 API 密钥请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    const { values } = req.body || {};
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return res.status(400).json({
        code: 400,
        message: "请提供 values 对象（如 { DEEPSEEK_API_KEY: \"sk-...\" }）。",
        data: null,
      });
    }
    if (Object.keys(values).length === 0) {
      return res.status(400).json({
        code: 400,
        message: "values 不能为空，请至少提供一个要修改的密钥。",
        data: null,
      });
    }

    // 逐项校验：白名单 + 值格式
    const updates = {};
    for (const key of Object.keys(values)) {
      if (!ALLOWED_KEY_SET.has(key)) {
        return res.status(400).json({
          code: 400,
          message: "未知配置项: " + key + "。仅允许修改: " + ALLOWED_KEYS.map((item) => item.key).join("、"),
          data: null,
        });
      }
      const check = validateNewValue(key, values[key]);
      if (!check.valid) {
        return res.status(400).json({ code: 400, message: check.error, data: null });
      }
      updates[key] = values[key];
    }

    const result = writeEnvValues(updates);
    if (!result.success) {
      return res.status(500).json({ code: 500, message: result.message, data: null });
    }

    // 仅记录 key 名称，绝不记录密钥值
    console.log(TAG + " ✅ 操作者 userId=" + req.userId + " 已更新配置项: " + result.updatedKeys.join(", "));
    console.log(TAG + "    注意：运行中进程仍使用旧值，重启后端后生效");
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: "已写入 .env，重启后端后生效。",
      data: { updatedKeys: result.updatedKeys },
    });
  } catch (err) {
    console.error(TAG + " ❌ 更新 API 密钥异常: " + err.message);
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
