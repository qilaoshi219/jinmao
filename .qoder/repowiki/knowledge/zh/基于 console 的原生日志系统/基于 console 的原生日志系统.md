---
kind: logging_system
name: 基于 console 的原生日志系统
category: logging_system
scope:
    - '**'
source_files:
    - node-jinmao/app.js
    - node-jinmao/API/auth.js
    - node-jinmao/service/md2quiz/task-service.js
    - WEB/src/api/auth.js
    - WEB/src/api/books.js
    - WEB/src/api/billing.js
---

本仓库未引入任何第三方日志框架（如 winston、pino、morgan、debug 等），后端与前端均采用 Node.js/浏览器原生 `console` API 进行日志输出，属于最基础的原生日志方案。

### 1. 使用的系统与工具
- **后端**：全部使用 `console.log`、`console.error`、`console.warn` 直接输出到标准输出（stdout/stderr）。
- **前端**：在 `WEB/src/api/*.js` 中同样使用 `console.log` 打印请求/响应调试信息。
- **无结构化日志库**：项目中不存在 `package.json` 中的日志依赖，也未发现 `winston`、`pino`、`morgan`、`bunyan`、`debug` 等库的引用。

### 2. 关键文件与位置
- **后端入口日志集中点**：`node-jinmao/app.js` 是日志输出的核心位置，包含启动自检、中间件请求日志、404/错误处理、进程信号处理等所有 `console.*` 调用。
- **API 路由层日志**：各 `node-jinmao/API/*.js` 文件中通过 `TAG` 常量（如 `[API_auth]`）前缀标记日志来源，在每个路由入口处记录请求，在返回前记录响应状态码。
- **Service 层日志**：业务逻辑文件（如 `service/md2quiz/task-service.js`）使用模块级 `TAG` 常量标识日志来源，记录任务创建、执行、异常等关键节点。
- **前端调试日志**：`WEB/src/api/auth.js`、`WEB/src/api/books.js`、`WEB/src/api/billing.js` 等文件中使用 `TAG` + `console.log` 打印 API 请求/响应调试信息。

### 3. 架构与约定
- **统一 TAG 前缀约定**：每个模块定义一个 `const TAG = "[模块名]"` 常量，所有日志以该前缀开头，便于在控制台快速过滤和定位来源。例如：
  - `app.js` 使用 `[app]`
  - `API/auth.js` 使用 `[API_auth]`
  - `service/md2quiz/task-service.js` 使用 `[md2quiz_service]`
- **分层日志策略**：
  - **启动阶段**：`app.js` 的 IIFE 自检代码使用 `console.log`/`console.error`/`console.warn` 输出环境检查、Prisma Client 生成、数据库迁移等关键步骤。
  - **请求链路**：Express 中间件统一记录 `← METHOD URL [到达]` 和 `METHOD URL → STATUS (durationms)` 格式的请求日志。
  - **错误处理**：全局错误中间件捕获未处理异常，`process.on('uncaughtException')` 和 `process.on('unhandledRejection')` 分别处理同步和异步异常。
- **无日志级别配置**：没有按级别（DEBUG/INFO/WARN/ERROR）区分输出，仅依靠 `console.log/error/warn` 三种方法粗略区分。
- **无日志文件输出**：所有日志直接输出到 stdout/stderr，由外部进程管理器（如 PM2、Docker）或终端收集，未发现日志轮转或文件落盘配置。

### 4. 约定与约束
- **强制 TAG 前缀**：每个模块必须定义 `TAG` 常量并用于所有 `console.*` 调用，确保日志可溯源。
- **请求日志格式统一**：中间件统一使用 `[app] ← METHOD URL [到达]` 和 `[app] METHOD URL → STATUS (durationms)` 格式，便于自动化解析。
- **错误必须用 console.error**：异常堆栈、启动失败、数据库连接失败等错误场景统一使用 `console.error` 输出。
- **生产环境无敏感信息**：日志中不包含密码、Token、API Key 等敏感字段，仅记录必要的业务上下文（如 userId、bookId、taskId）。
- **前端调试日志可清理**：`WEB/src/api/*.js` 中的 `console.log` 主要用于开发调试，上线前应移除或替换为正式日志系统。

### 5. 局限性
- 无结构化日志格式，难以被 ELK/Splunk 等日志平台解析。
- 无日志级别控制，无法在生产环境动态调整输出粒度。
- 无日志聚合与持久化，依赖外部进程管理。
- 前后端日志格式不统一，缺乏统一的 traceId 关联机制。

当前方案适合小型项目快速开发，但如需生产级日志能力，建议引入结构化日志库（如 pino）并建立统一的日志规范。