// ==================== 环境变量加载（必须在所有模块 require 之前） ====================
// dotenv 将 .env 文件中的配置注入到 process.env，使后续模块能读取敏感凭据
require("dotenv").config();

// ==================== Express 服务器入口 ====================
// 职责：初始化 Express 应用、挂载中间件和路由、启动 HTTP 服务器
// 端口 8888，与项目原有端口保持一致

const express = require("express"); // Express Web 框架
const cors = require("cors"); // 跨域资源共享
const helmet = require("helmet"); // HTTP 安全头
const { apiReference } = require("@scalar/express-api-reference"); // Scalar API 文档 UI（现代化交互式文档）
const swaggerSpec = require("./config/swagger"); // OpenAPI 3.0 规范对象

// ==================== 导入路由模块 ====================
// 认证路由：/api/v1/smtpcode、/api/v1/login
const authRouter = require("./API/auth");
// 教材上传路由：/api/v1/book/upload、/api/v1/book/:book_id/status
const POSTbookRouter = require("./API/POSTbook");
// 教材 CRUD 路由（待实现）：/api/v1/books
const bookRouter = require("./API/book");

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

// API 文档 — Scalar UI（放在业务路由之前，避免被路由拦截）
// 访问 http://localhost:8888/api/v1/docs 查看交互式文档页面
// 访问 http://localhost:8888/api/v1/docs/json 获取原始 OpenAPI JSON
app.get("/api/v1/docs/json", (req, res) => {
  res.json(swaggerSpec); // 提供 OpenAPI 3.0 规范 JSON
});
app.use(
  "/api/v1/docs",
  apiReference({
    spec: { content: swaggerSpec }, // 直接注入 spec 对象，无需额外 HTTP 请求
    theme: "purple", // Scalar 主题色（紫色主题，现代风格）
    authentication: {
      // 指定默认使用的认证方案，Scalar UI 会自动显示 Token 输入框
      preferredSecurityScheme: "bearerAuth",
    },
  })
);

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

// ==================== 404 处理中间件 ====================
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
//（注册了 4 个参数的中间件，Express 会将其识别为错误处理中间件）
app.use((err, req, res, _next) => {
  console.error("[app] 未捕获的异常: " + err.message);
  console.error(err.stack);

  // 如果响应头已发送，交给 Express 默认错误处理
  if (res.headersSent) {
    return _next(err);
  }

  // 返回 500 错误响应
  res.status(500).json({
    code: 500,
    message: "服务器内部错误，请稍后再试。",
  });
});

// ==================== 启动 HTTP 服务器 ====================
const server = app.listen(port, () => {
  console.log("========================================");
  console.log("  JinMao Server 已启动");
  console.log("  端口: " + port);
  console.log("  地址: http://localhost:" + port);
  console.log("  API 文档: http://localhost:" + port + "/api/v1/docs");
  console.log("    POST /api/v1/smtpcode  — 发送邮箱验证码");
  console.log("    POST /api/v1/login      — 验证码登录/注册");
  console.log("    POST /api/v1/book/upload          — 上传教材文件");
  console.log("    GET  /api/v1/book/:book_id/status — 查询教材处理状态");
  console.log("    GET  /api/v1/books                — 教材列表（分页+搜索）");
  console.log("========================================");
});

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
