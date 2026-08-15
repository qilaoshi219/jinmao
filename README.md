# 金毛教你学AI自学网课平台（JinMao）

> AI 驱动的互动课程生成平台：上传教材，自动生成带 PPT / 语音 / 字幕的互动课程与题库。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 项目简介

用户上传教材文件（支持 **PDF / Markdown / ZIP / RAR / 7Z**），系统自动完成
**大纲生成 → 章节拆分 → 口播稿扩写 → HTML PPT 生成 → 语音合成（TTS）→ 字幕生成（SRT）**
全流水线，生成可交互的富媒体课程；同时提供完整的**题库刷题系统**与**管理员后台**。

## 功能特性

### 📚 AI 课程生成
- 教材上传（PDF/MD/压缩包，含 PDF 页数预检）→ AI 自动生成完整课程
- 6 阶段生成流水线：大纲 → 章节 → 口播稿 → PPT → 语音 → 字幕，进度实时可见
- 支持"生成下一章"按需续写、缺失文件自动补全
- 文生图封面 / 配图（Grsai gpt-image-2）

### 📝 题库刷题
- AI 从教材提取题目（单选 / 多选 / 判断 / 填空 / 简答），5 种题型识别
- 随机刷题 / 顺序刷题 / 断点续做 / 实时判题（SSE）
- 错题本、刷题报告、题库市场（共享 / 借用）

### 👤 用户与运营
- 邮箱验证码注册 / 登录（SMTP），JWT 认证
- VIP 等级、余额计费（LLM / 文生图 / TTS / PDF 转换统一计费，售价 + 成本双轨）
- 兑换码系统（生成 / 兑换，事务保证原子性）
- 管理员后台：用户 / 兑换码 / 账单 / 统计 / 安全事件 / 计费配置（URL 安全后缀 + JWT 双重鉴权）

### 🛡️ 安全
- 启动前自检（.env / Prisma Client / MySQL / 数据库迁移）
- 安全防护中间件（SQL 注入 / XSS / 路径遍历 / 扫描器拦截，事件入库分析）
- 余额锁定机制，防止 AI 消费超额

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | Vue 3 · Vite 8 · Element Plus · Tailwind CSS 4 · Pinia |
| 后端 | Node.js ≥ 18 · Express 4 · Prisma ORM |
| 数据库 | MySQL 8.0（utf8mb4） |
| 对象存储 | MinIO |
| AI 服务 | DeepSeek（LLM）· Doc2x（PDF→MD）· 火山引擎 TTS · Grsai（文生图） |
| 进程守护 | PM2 |

## 项目结构

```
├── node-jinmao/          # 后端（Express + Prisma + 流水线 + 题库 + 管理后台）
│   ├── app.js            # 入口（启动自检 + 自动数据库迁移）
│   ├── API/              # 路由层
│   ├── service/          # 业务层（课程流水线 / 题库 / TTS / md2quiz）
│   ├── utils/            # 工具层（计费 / 余额 / MinIO / 文档解析）
│   ├── prisma/           # 数据模型与迁移
│   └── setup.sh          # 一键初始化脚本
├── WEB/                  # 前端（Vue3 + Vite）
│   └── src/              # 页面 / 组件 / 状态管理
├── 部署说明.md           # 三环境部署指南（Windows / Linux / 宝塔）
├── API文档.md            # 接口文档
└── 数据库结构.md         # 数据库设计文档
```

## 快速开始（开发环境）

**环境要求**：Node.js ≥ 18、MySQL 8.0、MinIO（详见 [部署说明.md](部署说明.md)）

```bash
# 1. 配置环境变量
cd node-jinmao
cp .env.example .env      # 填写数据库 / SMTP / AI Key（见 部署说明.md 附录 A）

# 2. 后端：安装依赖 + 初始化数据库 + 启动
npm install
npx prisma generate
npx prisma db push        # 首次建库（已有库升级用 npx prisma migrate deploy）
node app.js               # 监听 8888，API 文档: http://localhost:8888/api/v1/docs

# 3. 前端：安装依赖 + 启动开发服务器
cd ../WEB
npm install
npm run dev               # http://localhost:30000（/api 自动代理到后端）
```

## 部署

生产环境部署（Windows / Linux / 宝塔面板 三套方案、`.env` 全字段说明、
Nginx 反向代理、PM2 守护、常见问题排查）见 **[部署说明.md](部署说明.md)**。

## 文档

| 文档 | 说明 |
|------|------|
| [部署说明.md](部署说明.md) | 三环境部署指南（Windows / Linux / 宝塔） |
| [API文档.md](API文档.md) | 后端 API 接口文档 |
| [数据库结构.md](数据库结构.md) | 数据库设计文档 |
| [minio文件结构.md](minio文件结构.md) | MinIO 对象存储设计 |
| [流水线.md](流水线.md) | 课程生成流水线设计 |
| [开发日志.md](开发日志.md) | 开发变更记录 |

## 开源说明

- 敏感配置通过 `.env` 注入，仓库内仅提供 `.env.example` 模板；
- 内部运维文件（`ftp_upload*.ps1`、`deploy.ps1`、`sync_wsl.ps1`、`.trae/` 等）
  不随仓库分发，如需部署请参考 `部署说明.md`。

## License

[MIT](LICENSE)
