---
kind: dependency_management
name: Node.js 多包依赖管理（npm + lockfile）
category: dependency_management
scope:
    - '**'
source_files:
    - node-jinmao/package.json
    - WEB/package.json
    - node-jinmao/package-lock.json
    - WEB/package-lock.json
    - WSL部署指南.md
---

本仓库采用 npm 作为统一的依赖管理工具，前后端各自维护独立的 package.json 与 package-lock.json，形成典型的 monorepo 式多包结构。

**使用的系统与工具**
- 包管理器：npm（lockfileVersion 3），通过 package-lock.json 锁定精确版本，保证构建可重复。
- 前端（WEB/）：基于 Vite + Vue 3 + Element Plus + Tailwind CSS，依赖声明在 WEB/package.json，开发脚本包含 dev/build/preview。
- 后端（node-jinmao/）：基于 Express + Prisma + OpenAI SDK，依赖声明在 node-jinmao/package.json，启动脚本为 `node app.js`。
- 根目录 package.json 为空对象 `{}`，仅作为工作区占位，不参与依赖解析。

**关键文件与位置**
- `node-jinmao/package.json`：后端运行时依赖（express、prisma/client、openai、minio、jsonwebtoken、helmet、cors、dotenv、multer、nodemailer、p-queue、swagger-jsdoc 等）及 devDependencies（prisma）。
- `WEB/package.json`：前端运行时依赖（vue、element-plus、axios、@vueuse/core、tailwindcss、@tailwindcss/vite、pinia 等）及 devDependencies（vite、@vitejs/plugin-vue、unplugin-auto-import、unplugin-vue-components）。
- `node-jinmao/package-lock.json` 与 `WEB/package-lock.json`：分别锁定后端与前端的完整依赖树，包含 sha512 integrity hash 与 resolved 地址。
- `WSL部署指南.md`：文档中提及通过 `~/.npmrc` 配置 registry，说明部署环境可能使用镜像源。

**架构与约定**
- 每个子模块独立声明依赖，不共享 node_modules，避免跨模块版本冲突。
- 依赖版本统一使用 `^` 语义化版本范围，允许小版本升级，同时由 lockfile 锁定实际安装版本。
- 未使用 vendoring（无 vendor/ 目录），所有第三方包均从 npm 注册表下载。
- 未使用私有 npm 仓库或 .npmrc 项目级配置，依赖来源为官方 npm 注册表（部分包在 lockfile 中显示 npmmirror.com 镜像地址，表明本地可能配置了国内镜像）。
- 未使用 pnpm/yarn/bun 等其他包管理器，整个仓库统一使用 npm。

**约束与规范**
- 依赖变更需同步更新对应的 package.json 与 package-lock.json，确保 CI/部署环境可复现安装。
- 后端依赖按功能域组织（认证、题库、MinIO、邮件、OpenAI 调用等），前端依赖按 UI 框架与工具库划分，职责清晰。
- 未发现对 Go（go.mod）、Python（requirements.txt/pipenv）、Java（pom.xml/gradle）等其他语言依赖管理的统一策略，当前仅覆盖 Node.js 生态。