---
kind: build_system
name: 全栈构建与部署编排（PowerShell + Vite + PM2）
category: build_system
scope:
    - '**'
source_files:
    - start.ps1
    - pack.ps1
    - deploy.ps1
    - sync_wsl.ps1
    - ftp_upload.ps1
    - node-jinmao/package.json
    - node-jinmao/ecosystem.config.js
    - node-jinmao/setup.sh
    - WEB/package.json
    - WEB/vite.config.js
---

## 1. 使用的系统与工具
- **开发启动**：根目录 `start.ps1` 统一拉起后端 Express（node-jinmao，端口 8888）与前端 Vite Dev Server（WEB，端口 30000），自动清理占用端口、安装依赖、执行 Prisma 迁移。
- **打包发布**：`pack.ps1` 通过 robocopy + Compress-Archive 生成 `jinmao.zip`，排除 `node_modules`、日志与 PID 文件；`deploy.ps1` 在 WSL 目标路径 `/www/wwwroot/jinmao` 上解压并修正权限，作为“打包+部署”一体化脚本。
- **增量同步**：`sync_wsl.ps1` 使用 rsync 将 node-jinmao/ 与 WEB/ 增量同步到 WSL 指定目录，排除测试、文档等无关文件。
- **FTP 直传**：`ftp_upload.ps1` 通过 curl 以 5 并发上传至宝塔服务器，并在检测到 SSH 私钥时自动 SSH 执行 `prisma migrate deploy` 和 `npm run build`。
- **生产进程管理**：`node-jinmao/ecosystem.config.js` 为 PM2 提供标准化配置（单实例 fork、自动重启、内存上限 500M、日志输出到 logs/）。
- **一键初始化**：`node-jinmao/setup.sh` 在服务器上检查 Node.js ≥18、复制 `.env.example`、安装依赖、执行 Prisma 迁移、构建前端 dist/，并输出宝塔面板配置参数。

## 2. 核心文件与位置
- 根级编排脚本：`start.ps1`、`pack.ps1`、`deploy.ps1`、`sync_wsl.ps1`、`ftp_upload.ps1`
- 后端（Express）：`node-jinmao/package.json`、`node-jinmao/ecosystem.config.js`、`node-jinmao/setup.sh`、`node-jinmao/.env(.example)`
- 前端（Vue 3 + Vite）：`WEB/package.json`、`WEB/vite.config.js`
- 数据库迁移：`node-jinmao/prisma/migrations/*` 与 `node-jinmao/prisma/schema.prisma`

## 3. 架构与约定
- **双模块独立包管理**：后端与前端各自拥有 `package.json`，通过 npm scripts 分别管理依赖与构建命令。
- **前后端端口固定**：后端固定 8888，前端开发固定 30000，由 `start.ps1` 强制校验并释放占用端口。
- **Vite 代理规则**：`/api` 请求代理到 `http://localhost:8888`，覆盖大文件上传的 5 分钟超时。
- **Prisma 数据层**：后端通过 Prisma Client 连接 MySQL，迁移采用 `prisma generate` + `prisma migrate deploy` 两步，部署脚本中均显式执行。
- **PM2 生产运行**：后端以 `ecosystem.config.js` 启动，名称 `jinmao-backend`，关闭 watch 与集群模式，异常自动重启并限制内存。
- **WSL/Baota 双通道部署**：`deploy.ps1` 面向本地 WSL 环境直接解压部署；`ftp_upload.ps1` 面向远程宝塔服务器 FTP 上传并可选 SSH 自动构建。

## 4. 约定与约束
- **打包排除规则**：所有打包/同步脚本统一排除 `node_modules`、`.backend.log`、`.frontend.log`、`.backend.pid`、`.frontend.pid`、`.git`、`test`、`doc` 等目录与文件。
- **环境变量前置**：后端启动前必须存在 `.env` 文件（`start.ps1` 会检查），服务器部署时 `setup.sh` 从 `.env.example` 复制模板并提示填写必填字段（DATABASE_URL、JWT_SECRET、SMTP_*、DEEPSEEK_API_KEY、DOC2X_API_KEY）。
- **Node.js 版本要求**：服务器初始化脚本强制 Node.js ≥18，否则退出并提示通过宝塔 Node.js 版本管理器安装。
- **构建产物位置**：前端构建输出到 `WEB/dist/`，后端日志输出到 `node-jinmao/logs/pm2-out.log` 与 `pm2-error.log`。
- **无 Docker/CI**：仓库未包含 Dockerfile、GitHub Actions 等 CI/CD 配置，部署完全依赖 PowerShell 脚本与宝塔面板手动操作。