---
kind: configuration_system
name: 环境变量与 JSON 配置分层加载系统
category: configuration_system
scope:
    - '**'
source_files:
    - node-jinmao/.env
    - node-jinmao/.env.example
    - node-jinmao/config/index.js
    - node-jinmao/config/deepseek_config.json
    - node-jinmao/config/doc2x_config.json
    - node-jinmao/config/volcengine_config.json
    - node-jinmao/config/grsai_config.json
    - node-jinmao/config/billing_pricing.json
    - node-jinmao/app.js
---

## 系统概述

后端服务采用「.env 环境变量 + JSON 配置文件」双层配置架构，通过 `config/index.js` 统一入口加载并合并，敏感凭据仅从环境变量注入，非敏感业务配置以 JSON 文件形式维护。

## 核心机制

### 1. 环境变量加载（.env）
- 使用 `dotenv` 模块在 `app.js` 顶部优先加载 `.env` 文件到 `process.env`
- `.env.example` 提供完整模板，包含数据库连接、JWT、SMTP、DeepSeek、Doc2x、火山引擎 TTS、MinIO、Grsai 等全部配置项
- 启动前自检：检查 `.env` 是否存在、`DATABASE_URL` 是否设置、AI 服务 Key 缺失时给出警告

### 2. JSON 配置文件（非敏感字段）
- `deepseek_config.json`：API Base URL 和模型名称（不含 API_KEY）
- `doc2x_config.json`：Doc2x API Base URL
- `volcengine_config.json`：TTS 资源 ID、说话人、API URL（不含 APP_ID/ACCESS_KEY）
- `grsai_config.json`：文生图 API Base、模型、轮询参数
- `billing_pricing.json`：按时间段配置的计费价格表，支持运行时热更新

### 3. 统一配置加载器（config/index.js）
- 每个子模块的 JSON 配置加载后，从 `process.env` 注入对应的敏感字段
- 内置 API Key 格式校验：检查非空且全 ASCII 字符，防止中文占位符导致 HTTP 异常
- 导出统一的配置对象 `{ deepseek, doc2x, volcengine, grsai, DEEPSEEK_TIMEOUT, billing }`
- 所有业务模块通过 `require('../config')` 获取完整配置，不再直接读取 JSON 文件

## 架构约定

- **敏感信息隔离**：API Key、密码等仅存在于 `.env`，JSON 配置不包含任何凭据
- **配置即代码**：Prisma schema 哈希对比自动同步 Client，版本号控制数据库迁移
- **启动前验证**：强制检查关键依赖（.env、Prisma Client、MySQL），失败则阻止启动
- **运行时可更新**：`billing_pricing.json` 修改后无需重启服务即可生效

## 前端配置

前端项目（WEB/ 和 test/金毛刷题/frontend/）各自管理独立的 `.env` 或构建期环境变量，通过 Vite 的 `import.meta.env` 访问，与后端配置体系相互独立。