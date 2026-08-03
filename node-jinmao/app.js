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

  // --- 3.5 基于 schema 哈希的 Prisma Client 同步检查 ---
  // prisma migrate deploy 内部会自动 generate，但当版本未变跳过迁移时不会执行
  // ftp_upload.ps1 排除了 node_modules，服务器上的 Client 可能落后于上传的 schema.prisma
  // 此处对比 schema.prisma 的 MD5 哈希，仅在变更时运行 prisma generate，避免每次重启都重新生成
  var schemaPath = path.join(__dirname, "prisma", "schema.prisma");
  var schemaHashFile = path.join(__dirname, ".schema_hash"); // schema 哈希记录文件
  var currentSchemaHash = null;
  try {
    if (fs.existsSync(schemaPath)) {
      var crypto = require("crypto");
      var schemaContent = fs.readFileSync(schemaPath, "utf-8");
      currentSchemaHash = crypto.createHash("md5").update(schemaContent).digest("hex");
      console.log("[app] 📐 当前 schema 哈希: " + currentSchemaHash.substring(0, 8) + "...");
    } else {
      console.warn("[app] ⚠ schema.prisma 文件不存在: " + schemaPath);
    }
  } catch (hashErr) {
    console.warn("[app] ⚠ 计算 schema 哈希失败: " + hashErr.message);
  }

  // 读取上次记录的 schema 哈希
  var lastSchemaHash = null;
  try {
    if (fs.existsSync(schemaHashFile)) {
      var hashContent = fs.readFileSync(schemaHashFile, "utf-8");
      var hashData = JSON.parse(hashContent);
      lastSchemaHash = hashData.hash || null;
      console.log("[app] 📐 上次 schema 哈希: " + (lastSchemaHash ? lastSchemaHash.substring(0, 8) + "..." : "无"));
    } else {
      console.log("[app] 📐 .schema_hash 不存在，将生成 Prisma Client");
    }
  } catch (readErr) {
    console.warn("[app] ⚠ 读取 .schema_hash 失败: " + readErr.message);
  }

  // 判断是否需要重新生成 Prisma Client
  // 即使 schema 哈希匹配，也需要验证生成的 Prisma Client 是否包含所有 schema 中定义的模型
  // 场景：ftp_upload.ps1 会排除 node_modules 但可能上传 .schema_hash，导致服务器上的
  //       Prisma Client 落后于 schema.prisma 但哈希仍匹配，进而跳过 generate
  var needRegenerate = true; // 默认需要重新生成
  var regenerateReason = ""; // 记录需要重新生成的原因
  if (currentSchemaHash && lastSchemaHash === currentSchemaHash) {
    // 哈希匹配，但还需要验证生成的 Prisma Client 模型完整性
    var schemaContentCheck = fs.readFileSync(schemaPath, "utf-8");
    // 提取 schema 中定义的 model 名称（正则匹配 "model ModelName {"）
    var modelMatches = schemaContentCheck.match(/^model\s+(\w+)\s*\{/gm);
    if (modelMatches) {
      var schemaModelNames = modelMatches.map(function (m) { return m.replace(/^model\s+/, "").replace(/\s*\{/, ""); });
      // 创建临时 PrismaClient 验证所有模型是否已生成
      try {
        var { PrismaClient: TempPrismaClient } = require("@prisma/client");
        var tempPrisma = new TempPrismaClient();
        var missingModels = schemaModelNames.filter(function (modelName) {
          // 将 PascalCase model 名转换为 camelCase（Prisma Client 的访问方式）
          var camelName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
          return !tempPrisma[camelName];
        });
        if (missingModels.length > 0) {
          console.log("[app] ⚠ schema 哈希匹配，但 Prisma Client 缺少以下模型: " + missingModels.join(", "));
          console.log("[app]    原因：服务器上的 Prisma Client 是用旧版 schema 生成的（node_modules 未更新）。");
          regenerateReason = "Prisma Client 模型缺失（" + missingModels.join(", ") + "）";
        } else {
          // 模型完整性校验通过，追加字段级完整性校验
          // 场景：schema 哈希匹配且模型都存在，但 Prisma Client 是用旧 schema 生成的
          //       新字段（如 balanceLocked）在 MySQL 中已存在但 Prisma Client 不认识
          // 通过检查 Prisma DMMF（Data Model Meta Format）确认字段是否已生成
          var fieldCheckFailed = false;
          try {
            var PrismaPkg = require("@prisma/client");
            var dmmf = PrismaPkg.Prisma ? PrismaPkg.Prisma.dmmf : null;
            if (dmmf && dmmf.datamodel && dmmf.datamodel.models) {
              var userModel = dmmf.datamodel.models.find(function (m) { return m.name === "User"; });
              if (userModel) {
                var hasBalanceLocked = userModel.fields.some(function (f) { return f.name === "balanceLocked"; });
                if (!hasBalanceLocked) {
                  console.log("[app] ⚠ schema 哈希匹配，但 Prisma Client DMMF 中缺少 balanceLocked 字段。");
                  console.log("[app]    原因：Prisma Client 是用旧版 schema 生成的，缺少新字段映射。");
                  fieldCheckFailed = true;
                }
              }
            }
          } catch (dmmfErr) {
            // DMMF 检查失败（如 @prisma/client 版本过旧），保守处理：不阻塞启动
            console.log("[app] ⚠ 字段级 DMMF 检查失败: " + dmmfErr.message + "，将跳过字段校验");
          }
          if (fieldCheckFailed) {
            regenerateReason = "Prisma Client 字段缺失（缺少 balanceLocked 等新字段）";
          } else {
            needRegenerate = false;
            console.log("[app] ✅ schema 未变，Prisma Client 已是最新（模型+字段完整性校验通过），跳过生成");
          }
        }
        // 断开临时连接，避免资源泄漏
        tempPrisma.$disconnect().catch(function () {});
      } catch (verifyErr) {
        // 验证失败（如 @prisma/client 不存在），视为需要重新生成
        console.log("[app] ⚠ Prisma Client 模型验证失败: " + verifyErr.message + "，将重新生成");
        regenerateReason = "Prisma Client 模型验证失败";
      }
    } else {
      needRegenerate = false;
      console.log("[app] ✅ schema 未变，Prisma Client 已是最新，跳过生成");
    }
  }
  if (needRegenerate) {
    var hashReason = regenerateReason || (lastSchemaHash === null
      ? "首次启动或哈希记录缺失"
      : "schema 已变更");
    console.log("[app] ⏳ " + hashReason + "，正在同步 Prisma Client（prisma generate）...");
    try {
      var genOutput2 = require("child_process").execSync("npx prisma generate", {
        cwd: __dirname,
        encoding: "utf-8",
        timeout: 60000
      });
      console.log("[app] ✅ Prisma Client 已同步");
      // 清除 Node.js require 缓存，确保后续模块加载的是新生成的 Prisma Client
      // 因为上方的模型验证代码（require("@prisma/client")）已缓存了旧版本
      // 必须在 prisma generate 之后清除，否则后续 require 仍会得到旧版本
      Object.keys(require.cache).forEach(function (cacheKey) {
        if (cacheKey.includes(".prisma") || cacheKey.includes("@prisma")) {
          delete require.cache[cacheKey];
        }
      });
      console.log("[app] 🧹 已清除 Prisma Client require 缓存");
      // 生成成功后更新哈希记录
      try {
        if (currentSchemaHash) {
          var hashRecord = { hash: currentSchemaHash, updatedAt: new Date().toISOString() };
          fs.writeFileSync(schemaHashFile, JSON.stringify(hashRecord, null, 2), "utf-8");
          console.log("[app] 📝 .schema_hash 已更新");
        }
      } catch (writeErr) {
        console.warn("[app] ⚠ 无法写入 .schema_hash: " + writeErr.message);
      }
    } catch (genErr) {
      console.error("[app] ❌ Prisma Client 生成失败！");
      console.error("[app]    错误信息：" + (genErr.stderr || genErr.message || genErr));
      console.error("[app]    请手动运行 npx prisma generate");
      process.exit(1);
    }
  }

  // --- 3.6 基于版本号的数据库迁移检查 ---
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
const securityMiddleware = require("./middleware/security"); // 安全防护中间件（检测并阻断可疑攻击请求）

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
// 统计数据路由：首页 4 项统计指标（学习时长/已完成章节/正确率/连续天数）
const statsRouter = require("./API/stats");
// 文件代理路由：代理访问 MinIO 文件，前端通过 /api/v1/files/{path} 访问
const filesRouter = require("./API/files");
// 题库管理路由：/api/v1/quiz/textbooks
const quizTextbooksRouter = require("./API/quiz/textbooks");
// 题库导入路由：/api/v1/quiz/import-json
const quizImportRouter = require("./API/quiz/import");
// 刷题会话路由：/api/v1/quiz/random-*
const quizSessionRouter = require("./API/quiz/session");
// 刷题报告路由：/api/v1/quiz/reports*
const quizReportRouter = require("./API/quiz/report");
// 错题本路由：/api/v1/quiz/wrongbook*
const quizWrongbookRouter = require("./API/quiz/wrongbook");
// 题库市场路由：/api/v1/quiz/market*
const quizMarketRouter = require("./API/quiz/market");
// 题库详情路由：/api/v1/quiz/textbooks/:id/stats + exams 刷题
const quizDetailRouter = require("./API/quiz/detail");
// 公开考试路由：/api/v1/quiz/public-exams/*（二维码考试）
const quizPublicExamRouter = require("./API/quiz/public-exams");
// 账单查询路由：/api/v1/billing（需 Token）
const billingRouter = require("./API/billing");
// MD→JSON 生成任务路由：/api/v1/quiz/md2json/*
const quizMd2jsonRouter = require("./API/quiz/md2json");
// PDF→Quiz 上传路由：/api/v1/quiz/pdf2quiz/*
const quizPdf2QuizRouter = require("./API/quiz/pdf2quiz");
// AI 文本格式化路由：/api/v1/quiz/format-text（文本粘贴导入题库）
const quizFormatTextRouter = require("./API/quiz/format-text");
// 兑换码兑换路由：/api/v1/redeem（替换原有充值路由）
const redeemRouter = require("./API/redeem");
// 管理员 CMS 路由：/admin/:suffix/api/*（安全后缀 + JWT 管理员角色双重鉴权）
const adminRouter = require("./API/admin");
// 管理员配置（安全后缀）
const adminConfig = require("./config/admin_config.json");

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
      // 保留 Helmet 的默认安全基线，但显式关闭会把 HTTP 页面强制升级到 HTTPS 的指令。
      // 线上 30080 端口当前只提供 HTTP，若保留该指令会导致 Scalar 文档页里的资源被错误升级到 https://...:30080。
      directives: {
        defaultSrc: ["'self'"], // 默认只允许同源
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // 允许 Scalar CDN 脚本和内联脚本
        // Helmet v7+ 默认将 script-src-attr 设为 'none'，阻止内联事件处理器（如 onclick）
        // 显式设置 unsafe-inline + unsafe-hashes，允许幻灯片 HTML 中的内联事件处理器正常运行
        scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // 允许 Scalar CDN 样式和内联样式
        imgSrc: ["'self'", "data:", "https:", "http:"], // 允许 HTTP/HTTPS 图片（含幻灯片内嵌的绝对 URL 兜底）
        connectSrc: ["'self'", "https://cdn.jsdelivr.net"], // 允许同源 API 调试请求和 jsDelivr source map 拉取
        fontSrc: ["'self'", "https:", "data:"], // 允许 Scalar 从 HTTPS CDN 加载字体资源
        upgradeInsecureRequests: null, // 禁止浏览器把 http://...:30080 自动升级成 https://...:30080
      },
    },
    crossOriginOpenerPolicy: false, // 关闭 COOP，避免 HTTP 文档页在非可信源上触发浏览器拦截
    crossOriginResourcePolicy: false, // 文档页会加载 CDN 资源，关闭 CORP 避免资源策略冲突
    originAgentCluster: false, // 关闭 OAC，避免浏览器报 origin-keyed / site-keyed cluster 冲突
    strictTransportSecurity: false, // 当前服务仍通过 HTTP 端口访问，不能向浏览器宣告 HSTS
  })
);

// 跨域中间件
// 开发阶段放通所有来源，生产环境需限制具体域名
app.use(cors());

// 安全防护中间件
// 在路由之前检测并阻断可疑攻击请求（SQL注入/XSS/路径遍历/超长URL/扫描器探测等），
// 命中的攻击会写入 SecurityEvent 表供管理员后台分析研究
app.use(securityMiddleware);
console.log("[app] ✅ 安全防护中间件已挂载");

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

// 统计数据路由挂载到 /api/v1 前缀
// 实际端点：
//   GET /api/v1/stats — 获取首页 4 项统计数据（需 Token）
app.use("/api/v1", statsRouter);
console.log("[app] ✅ 统计数据路由已注册: /api/v1/stats");

// 文件代理路由挂载到 /api/v1 前缀
// 实际端点：
//   GET /api/v1/files/{path} — 代理访问 MinIO 文件（图片、PDF 等）
app.use("/api/v1/files", filesRouter);
console.log("[app] ✅ 文件代理路由已注册: /api/v1/files/*");

// 题库路由挂载到 /api/v1/quiz 前缀
app.use("/api/v1/quiz", quizTextbooksRouter);
app.use("/api/v1/quiz", quizImportRouter);
app.use("/api/v1/quiz", quizSessionRouter);
app.use("/api/v1/quiz", quizReportRouter);
app.use("/api/v1/quiz", quizWrongbookRouter);
app.use("/api/v1/quiz", quizMarketRouter);
app.use("/api/v1/quiz", quizDetailRouter);
app.use("/api/v1/quiz", quizPublicExamRouter);
app.use("/api/v1/quiz/md2json", quizMd2jsonRouter);
app.use("/api/v1/quiz/pdf2quiz", quizPdf2QuizRouter);
app.use("/api/v1/quiz", quizFormatTextRouter);
console.log("[app] ✅ 题库刷题路由已注册: /api/v1/quiz/*");
// 账单查询路由挂载到 /api/v1 前缀
app.use("/api/v1", billingRouter);
console.log("[app] ✅ 账单查询路由已注册: /api/v1/billing");
// 兑换码兑换路由挂载到 /api/v1 前缀（替换原有充值路由）
app.use("/api/v1", redeemRouter);
console.log("[app] ✅ 兑换码兑换路由已注册: /api/v1/redeem");
// 管理员 API 路由挂载（安全后缀 + JWT管理员角色双重鉴权）
app.use("/admin", adminRouter);
console.log("[app] ✅ 管理员 API 路由已注册: /admin/:suffix/api/*");
// 管理员 CMS 静态资源挂载（css/js/tpl 文件，供管理页面按需加载）
app.use("/admin/static", express.static(path.join(__dirname, "admin", "static")));
console.log("[app] ✅ 管理员静态资源已挂载: /admin/static/*");

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

  // ==================== 管理员页面路由 ====================
  // GET /admin/:suffix — 渲染管理员 CMS 页面
  // 不匹配安全后缀时返回 404，伪装路径不存在
  app.get("/admin/:suffix", (req, res) => {
    const { suffix } = req.params;
    // 从配置读取当前安全后缀
    const currentSuffix = adminConfig.securitySuffix;
    if (suffix !== currentSuffix) {
      console.log("[app] 管理员页面请求后缀不匹配: " + suffix + "（期望: " + currentSuffix + "），返回404");
      return res.status(404).send("Not Found");
    }
    console.log("[app] ✅ 管理员页面访问，后缀验证通过: " + suffix);
    // 管理员页面需要更宽松的 CSP：Vue 模板编译器需要 'unsafe-eval'
    // 同时允许 jsdelivr CDN 加载脚本和样式，以及 connect-src 允许 source map 请求
    res.setHeader("Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://cdn.jsdelivr.net; " +
      "font-src 'self' https://cdn.jsdelivr.net"
    );
    // 发送管理员 SPA 页面
    res.sendFile(path.join(__dirname, "admin", "index.html"));
  });

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

  // ==================== 初始化 MD→JSON 任务存储 ====================
  // 从持久化文件恢复服务重启前未完成的任务，标记为 failed
  const { initializeTaskStore } = require("./service/md2quiz/task-store");
  await initializeTaskStore();
  console.log("[app] ✅ MD→JSON 任务存储已初始化");

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
    console.log("    POST /api/v1/redeem               — 兑换码兑换余额");
    console.log("  ---- 管理员入口 ----");
    console.log("  🔐 安全后缀: " + adminConfig.securitySuffix);
    console.log("    管理页面: http://localhost:" + port + "/admin/" + adminConfig.securitySuffix);
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
