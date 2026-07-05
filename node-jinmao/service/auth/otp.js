// ==================== OTP 验证码核心模块 ====================
// 职责：OTP 生命周期管理（生成、存储、验证、发送、清理）
// 包含：验证码生成与发送（sendCode）、验证码校验（verifyAndConsumeOtp）
// 使用 nodemailer 发送 SMTP 邮件，内存 Map 存储验证码
// 输入校验复用 input_validator.js

const crypto = require("crypto"); // Node.js 内置加密模块，用于安全随机数生成
const nodemailer = require("nodemailer"); // 邮件发送库
const { validateString } = require("../../utils/input_validator"); // 统一输入校验

// ==================== 模块级常量 ====================

// 验证码有效期（毫秒）：10 分钟
const OTP_EXPIRE_MS = 10 * 60 * 1000;

// 频率限制时间窗口（毫秒）：5 分钟
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

// 频率限制最大次数：同一邮箱在时间窗口内最多发送 3 次
const RATE_LIMIT_MAX_COUNT = 3;

// 日志前缀，统一模块输出风格
const TAG = "[auth_otp]";

// ==================== 内存验证码存储 ====================
// 使用 Map 存储：email → { code, expiresAt, sendTimestamps[] }
// sendTimestamps 数组记录最近发送的时间戳，用于频率控制
const otpStore = new Map();

// ==================== 内部辅助函数 ====================

/**
 * 定期清理过期验证码，防止内存泄漏
 * 每 5 分钟执行一次清理
 */
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  // 遍历 Map，删除已过期的验证码条目
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(email);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(TAG + "[cleanup] 已清理 " + cleanedCount + " 条过期验证码，当前剩余: " + otpStore.size);
  }
}, 5 * 60 * 1000); // 每 5 分钟清理一次

/**
 * 创建并配置 nodemailer SMTP 传输器
 * SMTP 配置从 process.env 环境变量读取
 * @returns {Object} nodemailer transporter 实例
 */
function createTransporter() {
  // 从环境变量读取 SMTP 配置
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT, 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  console.log(TAG + "[createTransporter] SMTP 配置: host=" + smtpHost + ", port=" + smtpPort + ", user=" + smtpUser);

  // 创建 nodemailer 传输器
  const transporter = nodemailer.createTransport({
    host: smtpHost, // SMTP 服务器地址，如 smtp.qq.com
    port: smtpPort, // SMTP 端口，如 465（SSL）
    secure: smtpPort === 465, // 465 端口使用 SSL
    auth: {
      user: smtpUser, // SMTP 登录用户名
      pass: smtpPass, // SMTP 授权码（非邮箱密码）
    },
  });

  return transporter;
}

// ==================== 核心导出函数 ====================

/**
 * 发送邮箱验证码
 * 后台自动判断用户是否已存在，但统一发送验证码
 * @param {string} email - 用户邮箱地址
 * @returns {Promise<{ code: number, message?: string }>}
 *   - code 200: 验证码发送成功
 *   - code 400: 邮箱格式不合法
 *   - code 429: 发送频率超限（5分钟内超过3次）
 *   - code 500: SMTP 发送失败或服务器内部错误
 */
async function sendCode(email) {
  console.log(TAG + "[sendCode] 收到发送验证码请求，邮箱: " + email);

  // ========== 1. 邮箱格式校验 ==========
  // 使用项目统一的 input_validator 进行校验
  const validation = validateString(email, "email", {
    maxLength: 100, // 邮箱最大 100 字符
    required: true, // 必填
    checkInjection: true, // 检查注入攻击
    checkDangerousChars: true, // 检查危险控制字符
    moduleTag: TAG, // 日志前缀
  });

  if (!validation.valid) {
    console.log(TAG + "[sendCode] 邮箱校验失败: " + validation.error);
    return { code: 400, message: validation.error };
  }

  // ========== 1.5. 邮箱格式正则校验 ==========
  // 简单的邮箱格式校验：必须包含 @ 和域名
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log(TAG + "[sendCode] 邮箱格式不合法: " + email);
    return { code: 400, message: "邮箱格式不正确，请提供有效的邮箱地址。" };
  }

  // ========== 2. 频率限制检查 ==========
  // 获取当前邮箱的验证码数据
  const existingData = otpStore.get(email);
  const now = Date.now();

  if (existingData) {
    // 清理超出时间窗口的旧时间戳
    const recentTimestamps = existingData.sendTimestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );

    // 检查最近 5 分钟内的发送次数是否超过限制
    if (recentTimestamps.length >= RATE_LIMIT_MAX_COUNT) {
      console.log(TAG + "[sendCode] 频率限制触发，邮箱: " + email + "，5分钟内已发送: " + recentTimestamps.length + " 次");
      return {
        code: 429,
        message: "验证码发送频率过高，请在 " + Math.ceil(RATE_LIMIT_WINDOW_MS / 60000) + " 分钟后再试。",
      };
    }

    // 更新发送时间戳列表
    existingData.sendTimestamps = recentTimestamps;
  }

  // ========== 3. 生成 6 位安全随机验证码 ==========
  // 使用 crypto.randomInt 生成密码学安全的随机数（100000~999999）
  const code = crypto.randomInt(100000, 999999).toString();
  // 仅开发环境打印验证码明文；生产环境脱敏输出，防止日志泄露导致验证码被窃取
  if (process.env.NODE_ENV === "development") {
    console.log(TAG + "[sendCode] 生成验证码: " + code);
  } else {
    console.log(TAG + "[sendCode] 验证码已生成（邮箱: " + email.slice(0, 3) + "***)");
  }

  // ========== 4. 验证码存入内存 Map ==========
  // 存储结构：email → { code, expiresAt, sendTimestamps[] }
  const sendTimestamps = existingData
    ? [...existingData.sendTimestamps, now] // 追加当前时间戳
    : [now]; // 新记录，首次发送时间戳

  otpStore.set(email, {
    code: code, // 验证码（明文存储在内存中）
    expiresAt: now + OTP_EXPIRE_MS, // 过期时间：10 分钟后
    sendTimestamps: sendTimestamps, // 发送时间戳列表，用于频率控制
  });

  console.log(TAG + "[sendCode] 验证码已存入内存，有效期至: " + new Date(now + OTP_EXPIRE_MS).toISOString());

  // ========== 5. 通过 nodemailer 发送邮件 ==========
  try {
    // 检查 SMTP 配置是否完整
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error(TAG + "[sendCode] SMTP 配置不完整，请检查 .env 文件中的 SMTP_HOST、SMTP_USER、SMTP_PASS。");
      return {
        code: 500,
        message: "邮件服务配置不完整，请联系管理员。",
      };
    }

    // 创建 SMTP 传输器
    const transporter = createTransporter();

    // 构造邮件内容
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER, // 发件人
      to: email, // 收件人
      subject: "登录验证码 - JinMao", // 邮件主题
      text: "您的登录验证码是：" + code + "，有效期为 " + (OTP_EXPIRE_MS / 60000) + " 分钟，请勿泄露给他人。", // 纯文本正文
      html: '<div style="font-family: Arial, sans-serif; padding: 20px;">'
        + '<h2 style="color: #333;">JinMao 登录验证码</h2>'
        + '<p style="font-size: 16px;">您的验证码是：</p>'
        + '<p style="font-size: 32px; font-weight: bold; color: #0066cc; letter-spacing: 5px;">' + code + "</p>"
        + '<p style="color: #666;">有效期为 ' + (OTP_EXPIRE_MS / 60000) + " 分钟，请勿泄露给他人。</p>"
        + "<hr>"
        + '<p style="color: #999; font-size: 12px;">如果您没有发起此请求，请忽略此邮件。</p>'
        + "</div>", // HTML 正文
    };

    // 发送邮件
    console.log(TAG + "[sendCode] 正在发送邮件到: " + email);
    const info = await transporter.sendMail(mailOptions);
    console.log(TAG + "[sendCode] 邮件发送成功，Message-ID: " + info.messageId);

    return { code: 200, message: "验证码已发送，请查收邮件。" };
  } catch (error) {
    // SMTP 发送失败，记录错误并返回 500
    console.error(TAG + "[sendCode] 邮件发送失败: " + error.message);
    return {
      code: 500,
      message: "验证码发送失败：" + error.message,
    };
  }
}

/**
 * 验证并消费验证码（一次性使用）
 * 从内存 otpStore 查找验证码，校验正确性和有效期，验证通过后立即删除
 * 供 login 和 updateProfile 两个调用方共用，消除代码重复
 * @param {string} email - 用户邮箱地址
 * @param {string} code - 待验证的 6 位验证码
 * @returns {{ valid: boolean, code?: number, message?: string }}
 *   - valid=true: 验证通过，验证码已从内存中删除
 *   - valid=false: 附带 code=401 和具体失败原因 message
 */
function verifyAndConsumeOtp(email, code) {
  // ========== 1. 从内存 Map 查找验证码 ==========
  const storedData = otpStore.get(email);

  // 验证码不存在（未发送或已过期被清理）
  if (!storedData) {
    console.log(TAG + "[verifyOtp] 验证码不存在或已过期，邮箱: " + email);
    return { valid: false, code: 401, message: "验证码无效或已过期，请重新获取验证码。" };
  }

  // ========== 2. 检查验证码是否过期 ==========
  if (Date.now() > storedData.expiresAt) {
    console.log(TAG + "[verifyOtp] 验证码已过期，邮箱: " + email + "，过期时间: " + new Date(storedData.expiresAt).toISOString());
    // 清理过期验证码
    otpStore.delete(email);
    return { valid: false, code: 401, message: "验证码已过期，请重新获取验证码。" };
  }

  // ========== 3. 验证码匹配 ==========
  if (storedData.code !== code) {
    console.log(TAG + "[verifyOtp] 验证码不匹配，邮箱: " + email);
    return { valid: false, code: 401, message: "验证码错误，请重新输入。" };
  }

  // ========== 4. 验证码使用后立即删除（一次性使用，防止重放攻击） ==========
  otpStore.delete(email);
  console.log(TAG + "[verifyOtp] 验证码验证通过，已从内存中删除。");

  return { valid: true };
}

// ==================== 导出模块 ====================
module.exports = {
  sendCode,
  verifyAndConsumeOtp,
};
