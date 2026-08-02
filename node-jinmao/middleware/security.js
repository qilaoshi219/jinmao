// ==================== 安全防护中间件 ====================
// 职责：在路由处理之前拦截并检测可疑攻击请求，阻断后记录到数据库供分析研究
// 检测维度：超长 URL、SQL 注入、XSS、路径遍历、敏感文件探测、已知扫描器路径、恶意 User-Agent、超长重复字符载荷
// 阻断策略：高危攻击（SQLi/XSS/路径遍历）→ 403；超长 URL → 414；其余探测类 → 404 伪装（与正常 404 响应一致，不暴露服务器指纹）
// 记录策略：fire-and-forget 写入 SecurityEvent 表（不阻塞请求流程），同 IP 同类型 5 分钟窗口内去重合并（count 累加）
// 防刷屏：同一 IP 同一攻击类型 10 秒内控制台只输出一次日志，避免扫描流量淹没日志

const securityRepo = require("../utils/repo/security_repo"); // 安全事件数据访问层

// 日志前缀
const TAG = "[security]";

// ==================== 常量 ====================
// URL 最大长度限制：超过视为超长载荷攻击（正常 URL 很少超过 2048 字符）
const MAX_URL_LENGTH = 2048;
// 控制台日志去重窗口：同一 IP 同一类型 10 秒内只打印一次
const LOG_DEDUP_MS = 10 * 1000;
// 连续重复字符阈值：超过 500 个相同字符视为协议注入/DoS 探测（如本次 unix:AAAA... 攻击）
const REPEAT_CHAR_THRESHOLD = 500;

// 最近日志输出记录（防刷屏用）：key = "ip|attackType"，value = 上次输出时间戳
const recentLogs = new Map();

// ==================== 攻击检测规则 ====================
// 每条规则包含：攻击类型、严重程度、阻断状态码、特征正则列表（正则用于匹配 decode 后的小写 URL）
const ATTACK_RULES = [
  {
    type: "sql_injection",
    severity: "high",
    statusCode: 403,
    patterns: [
      { re: /union\s+(all\s+)?select/i, reason: "检测到 UNION SELECT 联合查询注入" },
      { re: /\bor\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i, reason: "检测到 OR 恒真条件注入（如 or 1=1）" },
      { re: /(?:['"\d])\s*--(\s|$)/i, reason: "检测到 SQL 注释符 -- 注入" },
      { re: /\/\*|\*\//, reason: "检测到 SQL 块注释注入" },
      { re: /information_schema/i, reason: "检测到 information_schema 系统库探测" },
      { re: /sleep\s*\(/i, reason: "检测到 sleep 延时注入" },
      { re: /benchmark\s*\(/i, reason: "检测到 benchmark 延时注入" },
      { re: /updatexml|extractvalue|load_file|into\s+outfile/i, reason: "检测到报错/文件读写注入函数" },
      { re: /0x[0-9a-f]{16,}/i, reason: "检测到十六进制注入载荷" },
    ],
  },
  {
    type: "xss",
    severity: "high",
    statusCode: 403,
    patterns: [
      { re: /<script/i, reason: "检测到 script 标签注入" },
      { re: /javascript:/i, reason: "检测到 javascript: 协议注入" },
      { re: /onerror\s*=|onload\s*=|onclick\s*=|onfocus\s*=|onmouseover\s*=/i, reason: "检测到事件处理器 XSS 载荷" },
      { re: /<iframe|<svg|<img\s+src\s*=/i, reason: "检测到 iframe/svg/img XSS 载荷" },
      { re: /alert\s*\(/i, reason: "检测到 alert 弹窗 XSS 载荷" },
      { re: /document\.(cookie|location)|\.innerhtml/i, reason: "检测到 DOM 操作 XSS 载荷" },
    ],
  },
  {
    type: "path_traversal",
    severity: "high",
    statusCode: 403,
    patterns: [
      { re: /\.\.\/|\.\.\\|\.\.%2f|%2e%2e/i, reason: "检测到路径遍历符号（../）" },
      { re: /\/etc\/passwd|\/etc\/shadow|\/etc\/hosts/i, reason: "检测到 Linux 敏感文件读取" },
      { re: /\/windows\/win\.ini|\/windows\/system32|c:\\|c:\//i, reason: "检测到 Windows 敏感文件读取" },
    ],
  },
  {
    type: "sensitive_file",
    severity: "medium",
    statusCode: 404,
    patterns: [
      { re: /\/\.env(?:\/|$)/i, reason: "探测 .env 环境变量文件" },
      { re: /\/\.git(?:\/|$)|\/\.git\/config/i, reason: "探测 .git 源码目录" },
      { re: /\/config\.json|\/package\.json|\/composer\.json|\/yarn\.lock/i, reason: "探测项目配置文件" },
      { re: /\/docker-compose\.ya?ml|\/dockerfile/i, reason: "探测 Docker 部署配置" },
      { re: /\/web\.config|\/nginx\.conf|\/php\.ini|\/wp-config\.php/i, reason: "探测服务器配置文件" },
      { re: /\/server-status(?:\/|$)|\/server-info(?:\/|$)/i, reason: "探测 Apache 状态页" },
      { re: /\/actuator(?:\/|$)/i, reason: "探测 Spring Boot Actuator 端点" },
      { re: /\/backup|\/dump\.sql|\/database\.sql|\/db\.sql|\/data\.sql/i, reason: "探测数据库备份文件" },
    ],
  },
  {
    type: "scanner_path",
    severity: "low",
    statusCode: 404,
    patterns: [
      { re: /^\/testSchema(?:\/|$)/i, reason: "探测未知路径 /testSchema" },
      { re: /^\/wp-admin(?:\/|$)|^\/wp-login\.php|^\/xmlrpc\.php|^\/wp-json(?:\/|$)/i, reason: "探测 WordPress 管理路径" },
      { re: /^\/phpmyadmin(?:\/|$)|^\/pma(?:\/|$)/i, reason: "探测 phpMyAdmin 管理路径" },
      { re: /^\/administrator(?:\/|$)|^\/admin\/?$/i, reason: "探测通用后台入口" },
      { re: /^\/manager\/?(html|status)?$/i, reason: "探测 Tomcat 管理路径" },
      { re: /^\/jenkins(?:\/|$)|^\/solr(?:\/|$)/i, reason: "探测 Jenkins/Solr 服务路径" },
      { re: /^\/cgi-bin(?:\/|$)/i, reason: "探测 CGI 目录" },
      { re: /^\/shell\.php|^\/cmd\.php|^\/c99\.php|^\/r57\.php|^\/b374k\.php/i, reason: "探测 webshell 后门路径" },
      { re: /\.(php|jsp|asp|aspx|cgi|pl|py|sh)$/i, reason: "探测动态脚本文件（本系统为 Node.js 无此类文件）" },
      { re: /^\/api-docs(?:\/|$)|^\/swagger-ui(?:\/|$)|^\/swagger\.json|^\/swagger\/index\.html/i, reason: "探测接口文档泄露路径" },
      { re: /^\/console(?:\/|$)|^\/debug(?:\/|$)|^\/graphql(?:\/|$)/i, reason: "探测调试/控制台端点" },
      { re: /^\/ecp(?:\/|$)|^\/owa(?:\/|$)|^\/HNAP1\//i, reason: "探测 Exchange/HNAP 服务路径" },
    ],
  },
];

// 恶意扫描器 User-Agent 正则（扫描器常携带特征明显的 UA）
const MALICIOUS_UA_RE = /sqlmap|nmap|nikto|nessus|masscan|zgrab|acunetix|awvs|netsparker|appscan|w3af|xsser|hydra|medusa|metasploit|burpsuite|fimap/i;

// ==================== 工具函数 ====================

/**
 * 获取客户端真实 IP
 * 优先取 X-Forwarded-For 首段（部署在 Nginx 反代后面时携带真实客户端 IP），
 * 否则回退到 req.ip / socket 地址
 * @param {Object} req - Express 请求对象
 * @returns {string} 客户端 IP
 */
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff && typeof xff === "string" && xff.trim() !== "") {
    // XFF 格式可能为 "ip1, ip2"，取第一个（真实客户端）
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * 记录攻击日志（带防刷屏去重）
 * 同一 IP 同一攻击类型在 LOG_DEDUP_MS 窗口内只输出一次控制台日志
 * @param {string} key - 去重键（ip|attackType）
 * @param {Object} req - Express 请求对象
 * @param {Object} detection - 检测结果 { type, severity, reason, statusCode }
 */
function logAttackOnce(key, req, detection) {
  const now = Date.now();
  const lastLog = recentLogs.get(key);

  // 若在去重窗口内已输出过，直接跳过（防刷屏）
  if (lastLog && now - lastLog < LOG_DEDUP_MS) {
    return;
  }
  recentLogs.set(key, now);

  // 防内存泄漏：当 Map 过大时清理超过窗口期的过期条目
  if (recentLogs.size > 1000) {
    for (const [k, t] of recentLogs) {
      if (now - t > LOG_DEDUP_MS) {
        recentLogs.delete(k);
      }
    }
  }

  // 截断打印 URL，避免超长攻击载荷刷屏
  const shortUrl = req.originalUrl.length > 200 ? req.originalUrl.substring(0, 200) + "...(截断)" : req.originalUrl;
  console.log(TAG + " 🛡️ 检测到可疑攻击: " + detection.type + "[" + detection.severity + "] IP=" + getClientIp(req) +
    " " + req.method + " " + shortUrl + " | 原因: " + detection.reason);
}

/**
 * 阻断请求并记录攻击事件
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Object} detection - 检测结果 { type, severity, reason, statusCode }
 */
function block(req, res, detection) {
  const originalUrl = req.originalUrl || "";
  const ip = getClientIp(req);

  // 1. 防刷屏日志（同一 IP 同一类型 10 秒内只打一次）
  const dedupKey = ip + "|" + detection.type;
  logAttackOnce(dedupKey, req, detection);

  // 2. 拆分 path 与 query，完整记录（fire-and-forget 写库，不阻塞请求）
  const qIndex = originalUrl.indexOf("?");
  const path = qIndex >= 0 ? originalUrl.substring(0, qIndex) : originalUrl;
  const query = qIndex >= 0 ? originalUrl.substring(qIndex + 1) : null;

  securityRepo.recordAttack({
    ip: ip,
    method: req.method,
    path: path,
    query: query,
    userAgent: req.headers["user-agent"] || null,
    attackType: detection.type,
    severity: detection.severity,
    reason: detection.reason,
    blocked: true,
  }).catch((err) => {
    // 写库失败不影响阻断，仅打印错误日志
    console.error(TAG + " ❌ 攻击事件入库失败: " + err.message);
  });

  // 3. 返回阻断响应
  // 404 状态必须与 app.js 正常 404 中间件的响应体完全一致（伪装路径不存在，不暴露被拦截痕迹）
  let message;
  if (detection.statusCode === 404) {
    message = "Not Found：接口 " + req.method + " " + originalUrl + " 不存在。";
  } else if (detection.statusCode === 414) {
    message = "URI Too Long";
  } else {
    message = "Forbidden";
  }
  res.status(detection.statusCode).json({
    code: detection.statusCode,
    message: message,
  });
}

// ==================== 中间件主函数 ====================

/**
 * 安全防护中间件
 * 挂载在 cors 之后、所有路由之前，对每个请求执行攻击检测
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - 下一个中间件
 */
function securityMiddleware(req, res, next) {
  const originalUrl = req.originalUrl || "";

  // ===== 1. 超长 URL 检测 =====
  // 正常业务 URL 极少超过 2048 字符，超长多为扫描器超大载荷/DoS 探测（如本次 unix:AAAA... 攻击）
  if (originalUrl.length > MAX_URL_LENGTH) {
    return block(req, res, { type: "oversized_url", severity: "medium", reason: "URL 长度超过 " + MAX_URL_LENGTH + " 字符（疑似超长载荷攻击）", statusCode: 414 });
  }

  // ===== 2. 攻击内容检测 =====
  // 先安全 decode 再小写，能同时命中编码后的载荷（如 %3cscript、%2e%2e 等）
  let decoded = originalUrl;
  try {
    decoded = decodeURIComponent(originalUrl);
  } catch (e) {
    // URL 包含非法编码序列（本身可疑），保留原始值继续检测
    decoded = originalUrl;
  }
  const lower = decoded.toLowerCase();

  // 逐规则匹配攻击特征
  for (const rule of ATTACK_RULES) {
    for (const p of rule.patterns) {
      if (p.re.test(lower)) {
        return block(req, res, { type: rule.type, severity: rule.severity, reason: p.reason, statusCode: rule.statusCode });
      }
    }
  }

  // ===== 3. 恶意 User-Agent 检测 =====
  // 扫描器常携带特征明显的 UA（sqlmap/nmap/nikto 等）
  const ua = req.headers["user-agent"] || "";
  if (MALICIOUS_UA_RE.test(ua)) {
    return block(req, res, { type: "malicious_ua", severity: "low", reason: "检测到恶意扫描器 User-Agent: " + ua.substring(0, 80), statusCode: 404 });
  }

  // ===== 4. 超长重复字符载荷检测 =====
  // 检测连续重复字符（如 unix:AAA...A 几千个），判定为协议注入/DoS 探测
  // 注意：此处检测的 URL 不超过 2048 字符（超长已在上方被拦截）
  if (new RegExp("(.)\\1{" + (REPEAT_CHAR_THRESHOLD - 1) + ",}").test(lower)) {
    return block(req, res, { type: "path_param_abuse", severity: "medium", reason: "检测到超长重复字符载荷（协议注入/DoS 探测）", statusCode: 404 });
  }

  // ===== 5. 未命中任何攻击规则 → 放行 =====
  next();
}

// 导出中间件
module.exports = securityMiddleware;
