# 邮箱验证码注册/登录鉴权后端 — 实施计划（v2：独立端点）

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**目标：** 在 `node-jinmao` 项目中使用 `express-email-verify-secure` 行业标准库构建认证模块。核心设计：`/auth/send-code` 发送验证码（后台自动判断注册/登录），`/auth/login` 同时支持邮箱验证码登录和密码登录（按字段自动区分）。

**架构：** Express 4 + Prisma ORM（MySQL）+ JWT 无状态鉴权 + express-email-verify-secure（OTP）。前端只需调两个核心端点即可完成注册+登录全流程。

**技术栈：** Express 4、Prisma 6、express-email-verify-secure 1.0、bcryptjs、jsonwebtoken、dotenv、express-rate-limit、helmet、cors

---

## 变更概览

| 维度 | 现状 | 目标 |
|------|------|------|
| HTTP 框架 | 原生 `http` 模块（10 行 demo） | Express 4 + 中间件体系 |
| 路由分发 | 无 | Express Router 前缀分发 |
| 数据库 | 无 ORM | Prisma 6 + MySQL |
| 认证 | 无 | 邮箱验证码 + 密码双通道，JWT |
| 邮件 | 无 | express-email-verify-secure（nodemailer） |

---

## 一、API 设计

### 端点总览

| 方法 | 路径 | 说明 | 需 Token |
|------|------|------|----------|
| POST | `/api/v1/auth/send-code` | 发送邮箱验证码（自动判断注册/登录） | 否 |
| POST | `/api/v1/auth/login` | 登录（验证码或密码，按字段自动区分） | 否 |
| POST | `/api/v1/auth/change-password` | 修改密码（需邮箱验证码） | 否 |
| GET | `/api/v1/auth/profile` | 获取个人信息 | 是 |
| PUT | `/api/v1/auth/profile` | 更新个人信息 | 是 |
| POST | `/api/v1/auth/logout` | 登出 | 是 |

### 1.1 发送验证码 — `POST /api/v1/auth/send-code`

**前端只需调这一个端点，无需关心"注册还是登录"。**

```
POST /api/v1/auth/send-code
```

请求：
```json
{ "email": "user@example.com" }
```

后台逻辑：

```
用户存在？
  ├─ 否 → 自动创建无密码用户 → is_new_user: true → 发送验证码
  └─ 是 → 检查 isBanned → 是 → 403
         → 检查频率（5 分钟内 > 3 次）→ 是 → 429
         → is_new_user: false → 发送验证码
```

响应（200）：
```json
{
  "code": 200,
  "message": "验证码已发送",
  "data": { "is_new_user": false }
}
```

| 字段 | 含义 |
|------|------|
| `is_new_user: true` | 首次使用，系统已自动注册（无密码），前端可提示"欢迎注册" |
| `is_new_user: false` | 老用户，前端可提示"欢迎回来" |

### 1.2 登录 — `POST /api/v1/auth/login`

**一个端点支持两种登录方式，按请求体字段自动区分。**

```
POST /api/v1/auth/login
```

#### 方式 A：邮箱验证码登录

请求：
```json
{ "email": "user@example.com", "code": "123456" }
```

响应（200）：
```json
{
  "code": 200,
  "message": "登录成功",
  "data": { "user_id": 1001, "token": "eyJhbG..." }
}
```

#### 方式 B：密码登录

请求：
```json
{ "account": "user@example.com", "password": "mypassword" }
```

响应（200）：
```json
{
  "code": 200,
  "message": "登录成功",
  "data": { "user_id": 1001, "token": "eyJhbG..." }
}
```

**路由规则（后台自动判断）：**

| 请求体含 | 走哪个流程 |
|---------|-----------|
| `email` + `code` | 验证码登录 |
| `account` + `password` | 密码登录 |
| 其他组合 | 400 参数错误 |

**验证码登录流程：**
```
1. 校验 email + code
2. user_repo.findByEmail → 不存在 → 404
3. verifyEmailOTP(email, code) → 失败 → 401
4. jwt.generateToken({ userId })
5. 返回 token
```

**密码登录流程：**
```
1. 校验 account + password
2. user_repo.findByEmail(account) → 不存在 → 401
3. user.password === null → 422 "该账号未设置密码，请使用验证码登录"
4. 检查 isBanned → 403
5. bcryptjs.compare → 不匹配 → 401
6. jwt.generateToken({ userId })
7. 返回 token
```

### 1.3 修改密码 — `POST /api/v1/auth/change-password`

用户未来在个人信息页设置/修改密码，需要先请求验证码再提交。

```
POST /api/v1/auth/change-password
```

请求：
```json
{
  "email": "user@example.com",
  "code": "123456",
  "new_password": "newSecurePass123"
}
```

响应（200）：
```json
{ "code": 200, "message": "密码修改成功" }
```

**流程：**
```
1. 校验 email + code + new_password（6~128 字符）
2. user_repo.findByEmail → 不存在 → 404
3. verifyEmailOTP(email, code) → 失败 → 401
4. bcryptjs.hash(new_password, 12)
5. user_repo.updatePassword(userId, hashedPwd)
6. 返回成功
```

> 设计决策：不要求 Authorization header，因为用户可能在未登录状态下重置密码（如忘记密码场景）。若未来需要强制登录态校验，加中间件即可。

### 1.4 获取个人信息 — `GET /api/v1/auth/profile`

```
GET /api/v1/auth/profile
Authorization: Bearer <token>
```

响应（200）：
```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "id": 1001,
    "username": "zhangsan",
    "nickname": "张三",
    "email": "zhangsan@example.com",
    "phone": "13800138000",
    "role": "user",
    "has_password": true,
    "create_time": "2026-07-01T08:00:00Z"
  }
}
```

> `has_password: true/false` 表示用户是否设置过密码，前端可据此决定是否展示"修改密码"入口。

### 1.5 更新个人信息 — `PUT /api/v1/auth/profile`

```
PUT /api/v1/auth/profile
Authorization: Bearer <token>
```

请求（所有字段可选）：
```json
{ "nickname": "新昵称", "phone": "13800138000" }
```

### 1.6 登出 — `POST /api/v1/auth/logout`

```
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

> v1.0 仅记录日志返回成功（无状态 JWT，不维护黑名单）。

### 错误码体系

| code | HTTP 状态码 | 说明 |
|------|-----------|------|
| 200 | 200 | 成功 |
| 400 | 400 | 请求参数不合法 |
| 401 | 401 | 未认证 / Token 无效或过期 / 验证码错误 / 密码错误 |
| 403 | 403 | 账号已被禁用 |
| 404 | 404 | 用户不存在 |
| 422 | 422 | 业务逻辑拒绝（如：该账号未设置密码） |
| 429 | 429 | 发送频率超限（5 分钟内 > 3 次） |
| 500 | 500 | 服务器内部错误 |

---

## 二、完整调用时序

### 场景 1：新用户首次验证码登录

```
前端                         后端
 │                            │
 │─ POST /auth/send-code ────→│
 │  { email }                 │─ 用户不存在 → 自动注册无密码用户
 │                            │─ sendEmailOTP() → 发邮件
 │← { is_new_user: true } ───│
 │                            │
 │  用户查收邮件，输入 6 位码   │
 │                            │
 │─ POST /auth/login ────────→│
 │  { email, code }           │─ verifyEmailOTP() → 验证
 │                            │─ jwt.generateToken()
 │← { user_id, token } ──────│
```

### 场景 2：老用户设置密码

```
 │─ POST /auth/send-code ────→│  先获取验证码
 │  { email }                 │
 │← { is_new_user: false } ──│
 │                            │
 │─ POST /auth/change-password→│  再提交修改
 │  { email, code, new_pw }   │
 │← { code:200 } ────────────│
 │                            │
 │─ POST /auth/login ────────→│  之后可用密码登录
 │  { account, password }     │
 │← { user_id, token } ──────│
```

---

## 三、数据模型（Prisma Schema）

### 3.1 User 表（已存在于 MySQL，Prisma 做 db pull introspect）

```prisma
model User {
  id          BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  username    String?   @db.VarChar(50)          // 验证码注册时为 NULL
  password    String?   @db.VarChar(255)         // bcrypt 哈希，无密码用户为 NULL
  nickname    String?   @db.VarChar(50)
  email       String    @unique @db.VarChar(100)
  phone       String?   @unique @db.VarChar(20)
  role        String    @default("user") @db.VarChar(10)
  createTime  DateTime  @default(now()) @map("create_time")
  updateTime  DateTime  @updatedAt @map("update_time")
  isBanned    Boolean   @default(false) @map("is_banned")
  banReason   String?   @db.VarChar(255) @map("ban_reason")
  isDeleted   Boolean   @default(false) @map("is_deleted")

  verifyCodes VerifyCode[]

  @@map("User")
}
```

### 3.2 VerifyCode 表（本次新建 — 仅用于审计日志和频率控制）

```prisma
model VerifyCode {
  id         BigInt   @id @default(autoincrement()) @db.UnsignedBigInt
  userId     BigInt   @map("user_id") @db.UnsignedBigInt
  code       String   @db.VarChar(10)       // 6 位数字验证码明文（审计用）
  createTime DateTime @default(now()) @map("create_time")
  updateTime DateTime @updatedAt @map("update_time")
  isDeleted  Boolean  @default(false) @map("is_deleted")

  user       User     @relation(fields: [userId], references: [id])

  @@map("VerifyCode")
}
```

> **OTP 校验由 `express-email-verify-secure` 内存存储处理**，不查 VerifyCode 表。VerifyCode 仅用于：① 安全审计（谁在什么时候收过验证码） ② 频率控制（countRecentCodes 统计 N 分钟内发送次数）。

---

## 四、文件清单

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `.env` | ~15 | 环境变量（JWT/邮箱/数据库） |
| `prisma/schema.prisma` | ~45 | 数据库 Schema |
| `utils/prisma.js` | ~25 | Prisma Client 单例 |
| `utils/jwt.js` | ~60 | JWT 生成/验证/提取 |
| `utils/repo/user_repo.js` | ~130 | 用户 Repository |
| `service/auth.js` | ~280 | 认证业务逻辑 |
| `middleware/auth.js` | ~40 | JWT 鉴权中间件（Express 格式） |
| `API/auth.js` | ~100 | Auth 路由（Express Router） |
| `test_results/scripts/test_auth.js` | ~200 | API 全链路测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `app.js` | 10 行原生 http → Express 服务器（json/cors/helmet/rate-limit + 路由挂载 + dotenv） |
| `package.json` | 新增 9 个依赖 |
| `start.ps1` | 增加 `npx prisma generate` + `npx prisma migrate deploy` 步骤 |
| `FILE.md` | 新增 8 个条目，更新 app.js |
| `开发日志.md` | 顶部新增认证模块记录 |
| `API文档.md` | 新增认证模块章节 |

---

## 五、架构分层 & 调用流程

```
HTTP Request
  │
  ▼
app.js (Express + dotenv + helmet + cors + rate-limit + 1MB JSON 限制)
  │
  ├── /api/v1/auth/* ──→ API/auth.js (Express Router)
  │                         │
  │                         ├── POST /send-code  →  service/auth.js.sendCode()
  │                         │    ├── input_validator.js          (邮箱校验)
  │                         │    ├── user_repo.findByEmail       (Prisma: 查用户)
  │                         │    ├── user_repo.createByEmail      (Prisma: 新用户注册)
  │                         │    ├── [Service 层] 检查 isBanned
  │                         │    ├── user_repo.countRecentCodes   (频率检查)
  │                         │    ├── sendEmailOTP()               (express-email-verify-secure)
  │                         │    └── user_repo.createVerifyCode   (Prisma: 审计日志)
  │                         │
  │                         ├── POST /login      →  service/auth.js.login()
  │                         │    ├── { email, code }    →  verifyCodeLogin()
  │                         │    │    ├── user_repo.findByEmail
  │                         │    │    ├── verifyEmailOTP()
  │                         │    │    └── jwt.generateToken()
  │                         │    │
  │                         │    └── { account, password } →  passwordLogin()
  │                         │         ├── user_repo.findByEmail
  │                         │         ├── [Service 层] 检查 isBanned → 403
  │                         │         ├── [Service 层] 检查有无密码 → 422
  │                         │         ├── bcryptjs.compare()
  │                         │         └── jwt.generateToken()
  │                         │
  │                         ├── POST /change-password → service/auth.js.changePassword()
  │                         │    ├── user_repo.findByEmail
  │                         │    ├── verifyEmailOTP()
  │                         │    ├── bcryptjs.hash(pwd, 12)
  │                         │    └── user_repo.updatePassword()
  │                         │
  │                         ├── GET  /profile  →  middleware/auth (仅验证Token)
  │                         │                   →  service/auth.js.getProfile()
  │                         │
  │                         ├── PUT  /profile  →  middleware/auth (仅验证Token)
  │                         │                   →  service/auth.js.updateProfile()
  │                         │
  │                         └── POST /logout   →  middleware/auth (仅验证Token)
  │                                              →  service/auth.js.logout()
  │
  └── 其他路径  → 404 JSON
```

---

## 六、中间件职责边界

```
middleware/auth.js  →  仅验证 Token 有效性（"你是谁"）
                       Express 中间件格式：(req, res, next)
                       成功 → req.userId = userId → next()
                       失败 → res.status(401).json({ code:401 })

service/auth.js     →  检查用户状态 isBanned / isDeleted（"你能做什么"）
```

这个分离确保未来如需"禁用用户仍可访问密码重置页"，只需 Service 层调整。

---

## 七、常用库对标

| 功能 | 库 | 说明 |
|------|---|------|
| OTP 生成/发送/验证 | `express-email-verify-secure` | 一站式：MX 检查 + 安全 OTP + 发送 + 验证 + 内置频率限制 |
| 密码哈希 | `bcryptjs` | 纯 JS，Windows 无编译问题，salt=12 |
| JWT | `jsonwebtoken` | Node.js 生态标准 |
| ORM | `@prisma/client` + `prisma` | Schema 集中管理、类型安全、自动迁移 |
| 环境变量 | `dotenv` | 加载 .env |
| 邮件发送 | `nodemailer`（库的依赖） | 间接使用，由 express-email-verify-secure 内部管理 |

---

## 八、express-email-verify-secure 已知限制 & 应对

| 限制 | 影响 | 应对 |
|------|------|------|
| OTP 存储在内存中（v1.0） | 服务器重启后未验证的 OTP 丢失 | 验证码有效期仅 5-10 分钟，窗口极小。用户重新请求即可 |
| OTP 过期时间不可配置 | 使用库默认值 | 实测后如不满足再评估是否 fork 或切换 |
| 无 Redis 持久化 | 多实例部署时 OTP 不共享 | v1.0 单实例部署。库 v1.1 计划支持 Redis，届时无缝升级 |
| 仅 1 个版本、1 位维护者 | 成熟度风险 | API 表面简单（sendEmailOTP + verifyEmailOTP），出问题可无损切换到 nodemailer 直调 |

---

## 九、分步实施任务

### Task 1: 安装依赖 & 初始化 Prisma

**步骤：**
1. `cd node-jinmao && npm install express express-email-verify-secure express-rate-limit cors helmet @prisma/client bcryptjs jsonwebtoken dotenv`
2. `npm install -D prisma`
3. 创建 `.env`
4. `npx prisma init`
5. `npx prisma db pull`（introspect 现有 User 表）
6. 在 schema 中新增 VerifyCode model
7. `npx prisma migrate dev --name add_verify_code`
8. `npx prisma generate`

**验证：** `npx prisma studio` 可查看 User 和 VerifyCode 表

---

### Task 2: 创建基础设施模块

- `utils/prisma.js` — Prisma Client 单例
- `utils/jwt.js` — JWT 生成/验证/提取
- `utils/repo/user_repo.js` — 用户 Repository（findByEmail、createByEmail、updatePassword、updateProfile、createVerifyCode、countRecentCodes）
- `middleware/auth.js` — Express JWT 鉴权中间件

---

### Task 3: 创建 service/auth.js — 认证业务逻辑

**文件：** `node-jinmao/service/auth.js`

**导出方法：**
- `sendCode(email)` → `{ code, data: { is_new_user }, message }`
- `login(body)` → `{ code, data: { user_id, token }, message }` （内部按字段自动分发到 verifyCodeLogin / passwordLogin）
- `changePassword(email, code, newPassword)` → `{ code, message }`
- `getProfile(userId)` → `{ code, data }`
- `updateProfile(userId, updates)` → `{ code, message }`
- `logout(userId)` → `{ code, message }`

---

### Task 4: 创建 API/auth.js — Auth 路由

**文件：** `node-jinmao/API/auth.js`

Express Router，6 个端点。

---

### Task 5: 重构 app.js → Express

替换 10 行 demo：
- `require('dotenv').config()` 顶部
- Express + json(1MB) + cors + helmet + rate-limit
- `app.use('/api/v1/auth', authRouter)`
- 404 / 全局错误处理
- 端口 8888

---

### Task 6: 更新 start.ps1

新增 Prisma 初始化步骤（generate + migrate deploy），放在 npm install 之后、node app.js 之前。

---

### Task 7: 编写测试脚本 & 端到端验证

**文件：** `test_results/scripts/test_auth.js`

**测试用例（12 条）：**

| # | 测试 | 预期 |
|---|------|------|
| 1 | send-code（新邮箱） | 200 + is_new_user=true |
| 2 | send-code（刚注册的邮箱） | 200 + is_new_user=false |
| 3 | send-code（5 分钟内第 4 次） | 429 |
| 4 | login（email + 正确 code） | 200 + token |
| 5 | login（email + 错误 code） | 401 |
| 6 | login（account + 正确 password） | 200 + token |
| 7 | login（account + 错误 password） | 401 |
| 8 | login（无密码用户 + password） | 422 |
| 9 | change-password（正确 code） | 200 |
| 10 | get profile（有效 token） | 200 + 用户数据 |
| 11 | get profile（无 token） | 401 |
| 12 | update profile / logout | 200 |

**真实验证要求：** 必须用真实 SMTP 发邮件，从收件箱获取验证码填入测试，不能 mock。

---

### Task 8: 更新项目文档

- `FILE.md` — 新增 8 个文件条目
- `开发日志.md` — 顶部新增认证模块记录
- `API文档.md` — 新增认证模块章节

---

## 十、端到端验证命令

```bash
# 1. 安装依赖
cd node-jinmao && npm install

# 2. 生成 Prisma Client + 执行迁移
npx prisma generate && npx prisma migrate deploy

# 3. 启动服务器
.\start.ps1

# 4. 发送验证码
curl -s -X POST http://localhost:8888/api/v1/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"your-real-email@gmail.com"}'

# 5. 验证码登录（从邮箱获取真实 code）
curl -s -X POST http://localhost:8888/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-real-email@gmail.com","code":"123456"}'

# 6. 用 token 获取个人信息
curl -s http://localhost:8888/api/v1/auth/profile \
  -H "Authorization: Bearer <token>"
```

---

## 十一、风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| `express-email-verify-secure` 质量未知 | 中 | API 简单（sendEmailOTP + verifyEmailOTP），出问题无缝切换 nodemailer |
| SMTP 凭据未配置 | 高 | 需祁老师提供。开发阶段可用 Ethereal/Mailtrap |
| Prisma db pull 与现有 User 表匹配度 | 低 | introspect 自动生成，手动校正字段映射即可 |
| service/auth.js 超 300 行 | 低 | 按方法拆分为子模块（service/auth/send_code.js 等） |

---

## 十二、决策记录

| 决策 | 结论 | 理由 |
|------|------|------|
| API 端点设计 | 独立端点 `/send-code` + `/login` | 语义清晰、符合 REST 惯例、前端调用无歧义 |
| 登录端点 | `/login` 同时支持 email+code 和 account+password | 按字段自动区分，前端只需一个登录页 |
| 成功码 | `code: 200` | 与项目现有 utils 一致 |
| HTTP 框架 | Express 4 | express-email-verify-secure 是 Express 生态库 |
| ORM | Prisma 6 | Schema 集中管理，类型安全 |
| 密码哈希 | bcryptjs, salt=12 | 纯 JS，Windows 无编译问题 |
| OTP 存储 | 库内存存储 | 库自带；v1.1 支持 Redis 后可升级 |
| 登出 | v1.0 占位 | 无状态 JWT，后续引入 Redis 黑名单 |
| change-password 鉴权 | 不要求 Token | 兼容忘记密码场景，验证码本身就是第二因子 |
| profile 返回 has_password | 是 | 前端据此判断是否展示"设置密码"入口 |
