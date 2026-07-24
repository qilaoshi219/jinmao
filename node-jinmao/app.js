// ==================== 环境变量加载（必须在所有模块 require 之前） ====================
// dotenv 将 .env 文件中的配置注入到 process.env，使后续模块能读取敏感凭据
require("dotenv").config();

// ==================== 启动前自检 ====================
// 在加载任何业务模块之前，检查 .env、Prisma Client、MySQL 等关键依赖是否就绪
// 如果关键依赖缺失，给出友好的中文错误提示并退出进程，避免报出难以理解的堆栈错误
(function runStartupChecks() {
  // 自检代码需要 fs 和 path，在此处局部 require（Node.js 缓存机制保证不重复加载）
  var fs = require("fs");
  var path = require("path");

  console.log("[app] ========== 启动前自检 ==========");

  // --- 1. 检查 .env 文件是否存在 ---
  // .env 文件包含了数据库连接、JWT密钥、API Key 等所有敏感配置，缺失则无法正常运行
  var envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("[app] ❌ 错误：未找到 .env 文件！");
    console.error("[app]    请从 .env.example 复制并填写配置：");
    console.error("[app]      cp .env.example .env");
    console.error("[app]      vim .env  （编辑填写真实凭据）");
    console.error("[app]    或运行 bash setup.sh 自动初始化。");
    console.error("[app]    必填字段：DATABASE_URL、JWT_SECRET、DEEPSEEK_API_KEY、DOC2X_API_KEY");
    process.exit(1);
  }
  console.log("[app] ✅ .env 文件已找到");

  // --- 2. 检查关键环境变量 ---
  // DATABASE_URL 是连接 MySQL 的唯一凭证，缺失则整个系统无法工作
  if (!process.env.DATABASE_URL) {
    console.error("[app] ❌ 错误：DATABASE_URL 未设置！");
    console.error("[app]    请在 .env 中配置 DATABASE_URL（MySQL 连接字符串）");
    console.error("[app]    格式: DATABASE_URL=\"mysql://用户名:密码@127.0.0.1:3306/jinmao?charset=utf8mb4\"");
    process.exit(1);
  }
  console.log("[app] ✅ DATABASE_URL 已配置");

  // AI 服务 Key 缺失仅警告（不影响服务器启动，但对应 AI 功能将不可用）
  var aiKeys = ["DEEPSEEK_API_KEY", "DOC2X_API_KEY", "VOLCENGINE_TTS_APP_ID", "VOLCENGINE_TTS_ACCESS_KEY"];
  var missingKeys = aiKeys.filter(function(k) { return !process.env[k]; });
  if (missingKeys.length > 0) {
    console.warn("[app] ⚠ 以下 AI 服务环境变量未设置：" + missingKeys.join("、"));
    console.warn("[app]    相关 AI 功能将不可用，但不影响服务器启动");
    console.warn("[app]    如需使用请在 .env 中补充对应配置");
  }

  // --- 3. 检查并自动生成 Prisma Client ---
  // Prisma Client 需要通过 npx prisma generate 编译生成，打包时未包含
  // 如果缺失则自动生成，无需手动操作
  try {
    require.resolve("@prisma/client");
    console.log("[app] ✅ Prisma Client 已就绪");
  } catch (e) {
    console.log("[app] ⏳ Prisma Client 未生成，正在自动执行 prisma generate...");
    try {
      var generateOutput = require("child_process").execSync("npx prisma generate", {
        cwd: __dirname,
        encoding: "utf-8",
        timeout: 60000 // 60 秒超时（首次生成可能需要下载引擎）
      });
      console.log("[app] ✅ Prisma Client 自动生成成功");
    } catch (genErr) {
      console.error("[app] ❌ 错误：Prisma Client 自动生成失败！");
      console.error("[app]    错误信息：" + (genErr.stderr || genErr.message || genErr));
      console.error("[app]    请手动运行 npx prisma generate 或 bash setup.sh");
      process.exit(1);
    }
  }

  // --- 3.5 基于版本号的数据库迁移检查 ---
  // 读取 package.json 版本号，与 .migration_version 文件对比
  // 仅在版本变更时执行 prisma migrate deploy，避免每次启动都运行
  // 迁移失败时阻止启动（process.exit(1)），防止 schema 不同步导致 API 500 错误
  var currentVersion = "0.0.0"; // 当前 package.json 版本号（默认值）
  try {
    var pkgContent = fs.readFileSync(path.join(__dirname, "package.json"), "utf-8");
    var pkg = JSON.parse(pkgContent);
    currentVersion = pkg.version || "0.0.0";
    console.log("[app] 📦 当前项目版本: v" + currentVersion);
  } catch (pkgErr) {
    console.warn("[app] ⚠ 无法读取 package.json 版本号: " + pkgErr.message);
    // 版本号读取失败也继续执行迁移（兜底策略），但记录警告
  }

  // 读取上次成功迁移的版本号记录
  var lastMigrationVersion = null; // 上次迁移版本号（null 表示首次启动）
  var migrationVersionFile = path.join(__dirname, ".migration_version"); // 版本记录文件路径
  try {
    if (fs.existsSync(migrationVersionFile)) {
      var versionContent = fs.readFileSync(migrationVersionFile, "utf-8");
      var versionData = JSON.parse(versionContent);
      lastMigrationVersion = versionData.version || null;
      console.log("[app] 📋 上次迁移版本: v" + lastMigrationVersion);
    } else {
      console.log("[app] 📋 .migration_version 不存在，视为首次启动");
    }
  } catch (readErr) {
    console.warn("[app] ⚠ 读取 .migration_version 失败: " + readErr.message);
    // 文件损坏则视为首次启动，触发迁移
  }

  // 判断是否需要执行迁移
  if (lastMigrationVersion === currentVersion) {
    // 版本号未变更，跳过迁移
    console.log("[app] ✅ 版本未变（v" + currentVersion + "），数据库 schema 已是最新，跳过迁移");
  } else {
    // 版本号变更（或首次启动），执行 Prisma 迁移
    var reason = lastMigrationVersion === null
      ? "首次启动"
      : "版本变更（v" + lastMigrationVersion + " → v" + currentVersion + "）";
    console.log("[app] ⏳ " + reason + "，正在同步数据库 schema（prisma migrate deploy）...");
    try {
      var migrateOutput = require("child_process").execSync("npx prisma migrate deploy", {
        cwd: __dirname,
        encoding: "utf-8",
        timeout: 60000 // 60 秒超时（生产环境首次部署可能需要更长时间）
      });
      // 提取已应用的迁移数量，避免打印完整输出刷屏
      var appliedMatch = migrateOutput.match(/(\d+)\s*migration/);
      if (appliedMatch) {
        console.log("[app] ✅ 数据库 schema 已同步（" + appliedMatch[1] + " 个迁移已应用）");
      } else {
        console.log("[app] ✅ 数据库 schema 已同步，无待处理迁移");
      }

      // 迁移成功后更新版本记录文件
      try {
        var now = new Date();
        var record = {
          version: currentVersion,
          appliedAt: now.toISOString()
        };
        fs.writeFileSync(migrationVersionFile, JSON.stringify(record, null, 2), "utf-8");
        console.log("[app] 📝 .migration_version 已更新 → v" + currentVersion);
      } catch (writeErr) {
        console.warn("[app] ⚠ 无法写入 .migration_version: " + writeErr.message);
        // 写入失败不阻止启动（迁移本身已成功），但记录警告便于排查
      }
    } catch (migrateErr) {
      // 迁移失败 → 阻止启动！
      // 数据库 schema 不同步会导致所有数据库 API 返回 500 错误
      // 与其让服务器带病运行，不如在启动阶段明确拒绝并给出修复指引
      console.error("========================================");
      console.error("[app] ❌ 数据库迁移失败，服务器拒绝启动！");
      console.error("[app]    错误信息：" + (migrateErr.stderr || migrateErr.message || migrateErr));
      console.error("[app]");
      console.error("[app]    可能原因：");
      console.error("[app]    1. MySQL 服务未运行 → 请启动 MySQL 后重试");
      console.error("[app]    2. DATABASE_URL 配置错误 → 检查 .env 中的连接字符串");
      console.error("[app]    3. 数据库 jinmao 未创建 → 在宝塔/MySQL 中创建该数据库");
      console.error("[app]");
      console.error("[app]    手动修复：");
      console.error("[app]      npx prisma migrate deploy");
      console.error("========================================");
      process.exit(1); // 拒绝启动，防止 schema 不同步导致运行时错误
    }
  }

  // --- 4. 非阻塞检查 MySQL 连接 ---
  // 此检查为异步非阻塞，连接失败只打印警告不阻止启动
  // 因为用户可能先启动项目再配置数据库，路由层会在请求时返回友好错误
  console.log("[app] ⏳ 正在检查 MySQL 连接...");
  try {
    var PrismaClient = require("@prisma/client").PrismaClient;
    var testPrisma = new PrismaClient();
    testPrisma.$connect()
      .then(function() {
        console.log("[app] ✅ MySQL 连接成功");
        return testPrisma.$disconnect();
      })
      .catch(function(err) {
        console.warn("[app] ⚠ MySQL 连接失败：" + (err.message || err));
        console.warn("[app]    请检查：");
        console.warn("[app]    1. MySQL 服务是否已启动（宝塔 → 首页 → MySQL）");
        console.warn("[app]    2. .env 中 DATABASE_URL 是否正确");
        console.warn("[app]    3. 数据库 jinmao 是否已在宝塔中创建（宝塔 → 数据库）");
        console.warn("[app]    服务器将继续启动，但数据库相关 API 将返回错误");
        // 清理测试连接实例
        testPrisma.$disconnect().catch(function() {});
      });
  } catch (initErr) {
    // PrismaClient 构造函数本身也可能失败（如 schema 不匹配）
    console.warn("[app] ⚠ 无法初始化 Prisma 连接检查：" + (initErr.message || initErr));
  }

  console.log("[app] ========== 自检完成，继续启动 ==========");
})();

// ==================== Express 服务器入口 ====================
// 职责：初始化 Express 应用、挂载中间件和路由、启动 HTTP 服务器
// 端口 8888，与项目原有端口保持一致

const fs = require("fs"); // 文件系统操作（读取 package.json、获取文件修改时间）
const path = require("path"); // 路径工具
const express = require("express"); // Express Web 框架
const cors = require("cors"); // 跨域资源共享
const helmet = require("helmet"); // HTTP 安全头
const getSwaggerSpec = require("./config/swagger"); // 异步获取 OpenAPI 3.0 规范对象（swagger-jsdoc 是 ESM 包，需异步加载）

// ==================== 导入路由模块 ====================
// 认证路由：/api/v1/smtpcode、/api/v1/login
const authRouter = require("./API/auth");
// 教材上传路由：/api/v1/book/upload、/api/v1/book/:book_id/status
const POSTbookRouter = require("./API/POSTbook");
// 教材 CRUD 路由（待实现）：/api/v1/books
const bookRouter = require("./API/book");
// 课程学习路由：章节幻灯片数据（PPT/音频/字幕 URL）
const courseRouter = require("./API/course");
// 学习进度路由：保存/获取用户学习进度记录（课程记忆功能）
const progressRouter = require("./API/progress");
// 文件代理路由：代理访问 MinIO 文件，前端通过 /api/v1/files/{path} 访问
const filesRouter = require("./API/files");

// ==================== 创建 Express 应用 ====================
const app = express();
const port = process.env.PORT || 8888; // 端口从环境变量读取，默认 8888

// ==================== 全局中间件 ====================

// JSON 请求体解析中间件
// limit: 限制请求体大小为 1MB，防止大 payload 攻击
app.use(express.json({ limit: "1mb" }));

// HTTP 安全头中间件
// helmet 自动设置安全头，CSP 调整以允许 Scalar API 文档加载 CDN 脚本
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], // 默认只允许同源
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // 允许 Scalar CDN 脚本和内联脚本
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // 允许 Scalar CDN 样式和内联样式
        imgSrc: ["'self'", "data:", "https:"], // 允许 data: URI 和 HTTPS 图片
        connectSrc: ["'self'"], // API 请求只允许同源
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"], // 允许 CDN 字体
      },
    },
  })
);

// 跨域中间件
// 开发阶段放通所有来源，生产环境需限制具体域名
app.use(cors());

// 请求日志中间件
// 记录每个请求的方法、路径和响应状态码，便于调试
app.use((req, res, next) => {
  // 记录请求到达（实时输出，方便排查请求是否到达服务端）
  console.log("[app] ← " + req.method + " " + req.originalUrl + " [到达]");
  // 记录请求开始时间
  const startTime = Date.now();

  // 在响应完成后打印日志
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      "[app] " + req.method + " " + req.originalUrl + " → " + res.statusCode + " (" + duration + "ms)"
    );
  });

  next();
});

// ==================== 路由挂载 ====================

// 认证路由挂载到 /api/v1 前缀
// 实际端点：
//   POST /api/v1/smtpcode  — 发送邮箱验证码
//   POST /api/v1/login      — 验证码登录/注册
app.use("/api/v1", authRouter);

// 教材上传 + 状态查询路由挂载到 /api/v1 前缀
// 实际端点：
//   POST /api/v1/book/upload          — 上传教材文件
//   GET  /api/v1/book/:book_id/status — 查询教材处理状态
app.use("/api/v1", POSTbookRouter);

// 教材 CRUD 路由挂载到 /api/v1 前缀（占位，待实现）
// 实际端点：
//   GET    /api/v1/books          — 获取教材列表
//   GET    /api/v1/books/:id       — 获取教材详情
//   PUT    /api/v1/books/:id       — 更新教材信息
//   DELETE /api/v1/books/:id       — 删除教材
app.use("/api/v1", bookRouter);

// 课程学习路由挂载到 /api/v1 前缀
// 实际端点：
//   GET /api/v1/courses/:courseId/chapters/:chapterId/slides — 获取章节幻灯片数据（PPT/音频/字幕 URL）
app.use("/api/v1", courseRouter);
console.log("[app] ✅ 课程学习路由已注册: /api/v1/courses/*");

// 学习进度路由挂载到 /api/v1 前缀
// 实际端点：
//   PUT /api/v1/progress           — 保存学习进度（需 Token）
//   GET /api/v1/progress           — 获取学习进度（需 Token，可选 query: courseId）
app.use("/api/v1", progressRouter);
console.log("[app] ✅ 学习进度路由已注册: /api/v1/progress");

// 文件代理路由挂载到 /api/v1 前缀
// 实际端点：
//   GET /api/v1/files/{path} — 代理访问 MinIO 文件（图片、PDF 等）
app.use("/api/v1/files", filesRouter);
console.log("[app] ✅ 文件代理路由已注册: /api/v1/files/*");

// ==================== 启动 HTTP 服务器 ====================
// 404 和全局错误处理中间件已移入 async IIFE 内部（在 Scalar 路由之后注册），
// 确保 /api/v1/docs 路由在 404 中间件之前生效。
// 原因：Scalar UI 路由通过 ESM 动态 import 异步挂载，若 404 在外部同步注册，
// 请求会在 Scalar 路由挂载之前就被拦截。

/**
 * 初始化并启动服务器
 * 使用 async IIFE 包裹，以支持 @scalar/express-api-reference 的 ESM dynamic import
 * （该包为纯 ESM，无法在 CommonJS 中使用 require()）
 */
(async () => {
  // 异步获取 OpenAPI 规范对象（swagger-jsdoc v7+ 是 ESM-only，需动态 import）
  const swaggerSpec = await getSwaggerSpec();

  // API 文档 JSON 端点（放在 async IIFE 内，确保 swaggerSpec 已就绪）
  // 访问 http://localhost:8888/api/v1/docs/json 获取原始 OpenAPI JSON
  app.get("/api/v1/docs/json", (req, res) => {
    res.json(swaggerSpec); // 提供 OpenAPI 3.0 规范 JSON
  });

  // 动态导入 Scalar API 文档 UI（ESM 包，必须用 import()）
  const { apiReference } = await import("@scalar/express-api-reference");

  // 挂载 Scalar UI 路由
  // 使用 content 参数直接嵌入 OpenAPI JSON，避免 URL fetch 和 CDN 版本兼容性问题
  // @scalar/express-api-reference 中间件不解析 spec.url 嵌套格式，
  // 顶层 url 又在新版 CDN 客户端中被误解析为多文档模式（api-1）
  app.use(
    "/api/v1/docs",
    apiReference({
      content: JSON.stringify(swaggerSpec), // 直接将 spec 序列化嵌入 HTML
      theme: "purple", // Scalar 主题色（紫色主题，现代风格）
      authentication: {
        preferredSecurityScheme: "bearerAuth", // 默认认证方案
      },
    })
  );

  // ==================== 404 处理中间件 ====================
  // 放在 async IIFE 内部，确保在 Scalar /api/v1/docs 路由注册之后才生效
  // 所有未匹配的路径返回 404 JSON
  app.use((req, res) => {
    console.log("[app] 404: " + req.method + " " + req.originalUrl);
    res.status(404).json({
      code: 404,
      message: "Not Found：接口 " + req.method + " " + req.originalUrl + " 不存在。",
    });
  });

  // ==================== 全局错误处理中间件 ====================
  // 捕获所有未处理的异常，返回 500 错误
  app.use((err, req, res, _next) => {
    console.error("[app] 未捕获的异常: " + err.message);
    console.error(err.stack);
    if (res.headersSent) {
      return _next(err);
    }
    res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
    });
  });

  const server = app.listen(port, () => {
    // ==================== 读取版本号和最后修改时间 ====================
    // 从 package.json 读取版本号，从文件系统读取 app.js 的修改时间
    let version = "unknown"; // 版本号（默认值）
    let lastModified = "unknown"; // 最后修改时间（默认值）

    try {
      // 读取并解析 package.json 获取版本号
      const pkgPath = path.join(__dirname, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      version = pkg.version || "unknown";
    } catch (err) {
      console.log("[app] 无法读取版本号: " + err.message);
    }

    try {
      // 获取 app.js 文件的最后修改时间（mtime）
      const appStat = fs.statSync(__filename);
      lastModified = appStat.mtime.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    } catch (err) {
      console.log("[app] 无法读取修改时间: " + err.message);
    }

    // ==================== 启动横幅 ====================
    console.log("========================================");
    console.log("  JinMao Server 已启动");
    console.log("  版本: v" + version + "  |  最后修改: " + lastModified);
    console.log("  端口: " + port);
    console.log("  地址: http://localhost:" + port);
    console.log("  API 文档: http://localhost:" + port + "/api/v1/docs");
    console.log("  ---- 接口列表 ----");
    console.log("    POST /api/v1/smtpcode  — 发送邮箱验证码");
    console.log("    POST /api/v1/login      — 验证码登录/注册");
    console.log("    POST /api/v1/book/upload          — 上传教材文件");
    console.log("    GET  /api/v1/book/:book_id/status — 查询教材处理状态");
    console.log("    GET  /api/v1/book/:book_id/progress — 查询教材生成进度");
    console.log("    GET  /api/v1/books                — 教材列表（分页+搜索）");
    console.log("========================================");
  });

  // ==================== HTTP Server 超时配置 ====================
  // Node.js HTTP Server 默认 120 秒超时。
  // 异步归一化重构后，上传 API 的同步部分（步骤 1-3）只需几秒，
  // 但考虑到 500MB 大文件 MinIO 上传可能需要较长时间，设为 5 分钟。
  // 异步归一化（Doc2x 转换等）在后台运行，不受此超时限制。
  server.timeout = 5 * 60 * 1000; // 5 分钟请求超时
  server.headersTimeout = 5 * 60 * 1000 + 10 * 1000; // 略大于 timeout，避免过早关闭
  console.log("[app] HTTP Server 超时已配置（timeout=5min）");

  // ==================== 全局未捕获异常处理 ====================
  // 防止未处理的异常导致进程崩溃闪退，确保错误信息可被记录

  // 捕获同步代码中未处理的异常
  process.on("uncaughtException", (err) => {
    console.error("========================================");
    console.error("[app] !! 未捕获的同步异常（uncaughtException）!!");
    console.error("[app] 错误信息: " + err.message);
    console.error("[app] 错误堆栈:\n" + err.stack);
    console.error("========================================");
    // 不退出进程，让服务器继续运行（但需要人工排查问题）
  });

  // 捕获 Promise 中未处理的 rejection
  process.on("unhandledRejection", (reason, promise) => {
    console.error("========================================");
    console.error("[app] !! 未处理的 Promise Rejection（unhandledRejection）!!");
    console.error("[app] 错误信息: " + (reason?.message || reason));
    if (reason?.stack) {
      console.error("[app] 错误堆栈:\n" + reason.stack);
    }
    console.error("========================================");
    // 不退出进程，让服务器继续运行
  });

  // ==================== 优雅关闭处理 ====================
  // 捕获 SIGTERM 信号（如 Docker stop），优雅关闭服务器
  process.on("SIGTERM", () => {
    console.log("[app] 收到 SIGTERM 信号，正在关闭服务器...");
    server.close(() => {
      console.log("[app] 服务器已关闭。");
      process.exit(0);
    });
  });

  // 捕获 SIGINT 信号（Ctrl+C），优雅关闭服务器
  process.on("SIGINT", () => {
    console.log("[app] 收到 SIGINT 信号，正在关闭服务器...");
    server.close(() => {
      console.log("[app] 服务器已关闭。");
      process.exit(0);
    });
  });
})();
