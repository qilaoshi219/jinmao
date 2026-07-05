# API 文档

> **Base URL**: `/api/v1`
> **认证方式**: `Authorization: Bearer {token}`
> **Content-Type**: `application/json`（文件上传除外）

---

## 通用说明

### 通用响应格式

**成功响应：**

```json
{
    "code": 0,
    "message": "ok",
    "data": { ... }
}
```

**分页响应（data 中包含分页信息）：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "items": [ ... ],
        "total": 100,
        "page": 1,
        "page_size": 10
    }
}
```

**错误响应：**

```json
{
    "code": 422,
    "message": "邮箱已被注册",
    "data": null
}
```

### 通用错误码

| code | HTTP 状态码 | 说明 |
|------|-----------|------|
| `0` | 200 | 成功 |
| `401` | 401 | 未认证 / Token 无效或已过期 |
| `403` | 403 | 无权限 / 账号已被禁用 |
| `404` | 404 | 资源不存在 |
| `422` | 422 | 请求参数校验失败 |
| `500` | 500 | 服务器内部错误 |

---

## 一、认证模块

> **在线调试**: 访问 `http://localhost:8888/api/v1/docs` 使用 Scalar UI 交互式测试

认证方式：邮箱验证码登录/注册，无需密码。登录后返回 JWT Token。

### 1.1 【已实现】【测试通过】发送邮箱验证码

```
POST /api/v1/smtpcode
```

向指定邮箱发送 6 位数字验证码，有效期 **10 分钟**。同一邮箱 **5 分钟内最多发送 3 次**。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 用户邮箱地址 |

```json
{
    "email": "user@example.com"
}
```

**响应 `200 OK`：**

```json
{
    "code": 200,
    "message": "验证码已发送，请查收邮件。"
}
```

> 错误：`400` 邮箱格式不正确 / `429` 发送频率超限 / `500` SMTP 配置不完整或发送失败

---

### 1.2 【已实现】【测试通过】验证码登录/注册

```
POST /api/v1/login
```

提交邮箱和验证码。后台自动判断：**用户不存在则自动注册**，**用户已存在则直接登录**。返回 JWT Token。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 用户邮箱地址 |
| `code` | string | 是 | 6 位数字验证码 |

```json
{
    "email": "user@example.com",
    "code": "123456"
}
```

**响应 `200 OK`：**

```json
{
    "code": 200,
    "message": "登录成功",
    "data": {
        "user_id": "1",
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "is_new_user": false
    }
}
```

| 字段 | 说明 |
|------|------|
| `user_id` | 用户 ID（字符串类型） |
| `token` | JWT 访问令牌，有效期由 `JWT_EXPIRES_IN` 控制（默认 7 天） |
| `is_new_user` | `true` = 新用户注册并登录；`false` = 老用户登录 |

> 错误：`400` 参数不合法 / `401` 验证码错误或已过期 / `403` 账号已被禁用 / `500` 服务器错误

---

### 1.3 【已实现】【测试通过】获取当前用户信息

```
GET /api/v1/auth/profile
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "id": 1001,
        "username": "zhangsan",
        "nickname": "张三",
        "email": "zhangsan@example.com",
        "phone": "13800138000",
        "role": "user",
        "create_time": "2026-07-01T08:00:00Z"
    }
}
```

---

### 1.4 更新用户信息【已实现】【测试通过】

```
PUT /api/v1/auth/profile
```

**说明**：通过邮箱验证码验证身份后，更新当前登录用户的个人信息。每次修改都需获取新的邮箱验证码。

**请求头**：
| 字段 | 说明 |
|------|------|
| `Authorization` | `Bearer {token}`，JWT Token |

**请求体（所有字段均为可选，但 `code` 为必填）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nickname` | string | 否 | 新昵称 |
| `phone` | string | 否 | 新手机号（11位中国大陆手机号码） |
| `password` | string | 否 | 新密码 |
| `code` | string | 是 | 邮箱验证码，通过 `POST /api/v1/smtpcode` 获取，有效期 10 分钟，一次性使用 |

```json
{
    "nickname": "张三（新）",
    "phone": "13900139000",
    "code": "123456"
}
```

**响应 `200 OK` — 更新成功：**

```json
{
    "code": 200,
    "message": "个人信息更新成功。",
    "data": {
        "id": "1",
        "username": null,
        "nickname": "张三（新）",
        "email": "zhangsan@example.com",
        "phone": "13900139000",
        "role": "user",
        "create_time": "2026-07-01T08:00:00.000Z",
        "update_time": "2026-07-05T10:30:00.000Z"
    }
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 400 | 缺少验证码 / 没有提供更新字段 / 手机号格式错误 |
| 401 | 验证码无效或已过期 / Token 无效 |
| 403 | 账号已被禁用 |
| 404 | 用户不存在 |
| 500 | 服务器内部错误 |

**安全机制说明**：
1. 用户需先通过 `POST /api/v1/smtpcode` 获取邮箱验证码（发到注册邮箱）
2. 验证码有效期为 10 分钟，相同邮箱 5 分钟内最多发送 3 次
3. 验证码使用后立即删除，防止重放攻击
4. 仅允许更新 `nickname`、`phone`、`password`，`username` 和 `email` 不可通过此接口修改

---

### 1.5 用户登出

```
POST /api/v1/auth/logout
```

无请求体，使当前 Token 失效。

---

## 二、教材模块

### 2.1 上传教材

```
POST /api/v1/book/upload
Content-Type: multipart/form-data
```

**表单字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 上传文件（pdf / docx / doc / md / zip / rar / 7z） |
| `name` | string | 否 | 教材名称，默认取文件名 |
| `description` | string | 否 | 教材描述 |

**响应 `200 OK` — 上传成功，后台异步进行格式归一：**

```json
{
    "code": 0,
    "message": "上传成功，正在处理中",
    "data": {
        "book_id": 2001,
        "textbook_filename": "闸门运行工教材.pdf",
        "textbook_path": "/usercourse/1001/2001/闸门运行工教材.pdf",
        "status": "processing"
    }
}
```

> 上传后在 MinIO 创建 `/usercourse/{userid}/{bookid}/` 目录，存入源文件后触发格式归一流水线。

---

### 2.2 获取教材列表

```
GET /api/v1/book
```

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 10 | 每页条数，最大 50 |
| `keyword` | string | 否 | — | 搜索关键词（匹配 name） |

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "items": [
            {
                "id": 2001,
                "user_id": 1001,
                "name": "闸门运行工教材",
                "description": "水利工程闸门操作指南",
                "textbook_filename": "闸门运行工教材.pdf",
                "textbook_path": "/usercourse/1001/2001/闸门运行工教材.pdf",
                "create_time": "2026-07-01T08:00:00Z",
                "update_time": "2026-07-01T08:00:00Z"
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 10
    }
}
```

---

### 2.3 获取教材详情

```
GET /api/v1/book/{book_id}
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "id": 2001,
        "user_id": 1001,
        "name": "闸门运行工教材",
        "description": "水利工程闸门操作指南",
        "textbook_filename": "闸门运行工教材.pdf",
        "textbook_path": "/usercourse/1001/2001/闸门运行工教材.pdf",
        "chapters": [
            { "id": 3001, "name": "第一章 概述", "total_pages": 15 },
            { "id": 3002, "name": "第二章 结构", "total_pages": 20 }
        ],
        "create_time": "2026-07-01T08:00:00Z",
        "update_time": "2026-07-01T08:00:00Z"
    }
}
```

> 错误：`404` 教材不存在

---

### 2.4 更新教材信息

```
PUT /api/v1/book/{book_id}
```

**请求体（所有字段可选）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 教材名称 |
| `description` | string | 否 | 教材描述 |

```json
{
    "name": "闸门运行工教材（修订版）"
}
```

---

### 2.5 删除教材

```
DELETE /api/v1/book/{book_id}
```

> 软删除，同时标记关联章节和 MinIO 文件为待清理。

---

### 2.6 获取教材文件（文件流）

```
GET /api/v1/book/{book_id}/file/{file_type}
```

**路径参数：**

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `file_type` | 文件类型 | `pdf`（源文件）、`md`（归一后的 Markdown） |

> 直接代理 MinIO 中文件，返回文件流。

---

## 三、章节模块

### 3.1 新增章节

```
POST /api/v1/chapter
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `course_id` | integer | 是 | 所属课程 ID |
| `name` | string | 是 | 章节名称，1~100 字符 |
| `description` | string | 否 | 章节描述 |
| `startline` | integer | 是 | 开始行号 |
| `endline` | integer | 是 | 结束行号 |

```json
{
    "course_id": 2001,
    "name": "第一章 概述",
    "description": "闸门基本概念与分类",
    "startline": 1,
    "endline": 120
}
```

**响应 `200 OK` — 后台异步生成 course JSON + PPT + Audio + SRT：**

```json
{
    "code": 0,
    "message": "创建成功，正在生成课程内容",
    "data": {
        "chapter_id": 3001,
        "status": "generating"
    }
}
```

> 创建章节后触发课程流水线：结构化 JSON → HTML PPT → TTS 语音 → SRT 字幕。

---

### 3.2 获取课程下的章节列表

```
GET /api/v1/chapter
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `course_id` | integer | 是 | 课程 ID |

---

### 3.3 获取章节详情

```
GET /api/v1/chapter/{chapter_id}
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "id": 3001,
        "course_id": 2001,
        "name": "第一章 概述",
        "description": "闸门基本概念与分类",
        "chapter_root": "/usercourse/1001/2001/chapter_01/",
        "startline": 1,
        "endline": 120,
        "total_pages": 15,
        "course_json_url": "/api/v1/chapter/3001/course_json",
        "slides": [
            {
                "slide_id": "slide_01",
                "ppt_url": "/api/v1/chapter/3001/slide/slide_01.html",
                "audio_url": "/api/v1/chapter/3001/audio/slide_01.mp3",
                "srt_url": "/api/v1/chapter/3001/srt/slide_01.srt"
            }
        ],
        "create_time": "2026-07-01T09:00:00Z",
        "update_time": "2026-07-01T09:30:00Z"
    }
}
```

---

### 3.4 更新章节

```
PUT /api/v1/chapter/{chapter_id}
```

**请求体（所有字段可选）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 章节名称 |
| `description` | string | 否 | 章节描述 |
| `startline` | integer | 否 | 开始行号 |
| `endline` | integer | 否 | 结束行号 |

> 若修改了 `startline` / `endline`，将重新触发课程流水线。

---

### 3.5 删除章节

```
DELETE /api/v1/chapter/{chapter_id}
```

> 软删除，同时标记 MinIO 对应目录为待清理。

---

### 3.6 获取课程结构化 JSON

```
GET /api/v1/chapter/{chapter_id}/course_json
```

> 返回 `{courseid}.json` 完整内容，包含章节标题和 slides 数组。

---

### 3.7 获取 PPT / 语音 / 字幕文件（文件流）

```
GET /api/v1/chapter/{chapter_id}/slide/{slide_id}.html
GET /api/v1/chapter/{chapter_id}/audio/{slide_id}.mp3
GET /api/v1/chapter/{chapter_id}/srt/{slide_id}.srt
```

> 直接代理 MinIO 静态文件，`slide_id` 示例：`slide_01`

---

## 四、题库模块

### 4.1 创建题库

```
POST /api/v1/bank
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 题库名称，1~100 字符 |
| `description` | string | 否 | 题库描述 |
| `course_id` | integer | 否 | 关联课程 ID |
| `type` | string | 是 | `"course_generated"`（课程自动生成）或 `"imported"`（独立导入） |

```json
{
    "name": "闸门基础知识题库",
    "description": "第一章配套练习",
    "course_id": 2001,
    "type": "course_generated"
}
```

> 创建成功后自动在`题库用户关联表`插入一条 `permission = "owner"` 记录。

---

### 4.2 上传题库文件

```
POST /api/v1/bank/upload
Content-Type: multipart/form-data
```

**表单字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 上传文件（pdf / docx / doc / md / zip / rar / 7z） |
| `name` | string | 是 | 题库名称 |
| `description` | string | 否 | 题库描述 |

> 上传后在 MinIO 创建 `/bank/{bankid}/` 目录，触发格式归一和题目解析流水线。

---

### 4.3 获取题库列表

```
GET /api/v1/bank
```

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 10 | 每页条数 |
| `keyword` | string | 否 | — | 搜索关键词（匹配 name） |
| `course_id` | integer | 否 | — | 按课程筛选 |

> 仅返回当前用户有权限的题库（owner / editor / viewer）。

---

### 4.4 获取题库详情

```
GET /api/v1/bank/{bank_id}
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "id": 4001,
        "course_id": 2001,
        "type": "course_generated",
        "name": "闸门基础知识题库",
        "description": "第一章配套练习",
        "question_count": 50,
        "permission": "owner",
        "create_time": "2026-07-01T10:00:00Z",
        "update_time": "2026-07-01T10:00:00Z"
    }
}
```

---

### 4.5 更新题库信息

```
PUT /api/v1/bank/{bank_id}
```

**请求体（所有字段可选）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 题库名称 |
| `description` | string | 否 | 题库描述 |

> 需要 `owner` 或 `editor` 权限。

---

### 4.6 删除题库

```
DELETE /api/v1/bank/{bank_id}
```

> 软删除，需要 `owner` 权限。同时清理关联题目和 MinIO 文件。

---

### 4.7 导出题库

```
POST /api/v1/bank/{bank_id}/export
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `format` | string | 是 | `"markdown"` 或 `"docx"` |

```json
{
    "format": "markdown"
}
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "导出成功",
    "data": {
        "download_url": "/api/v1/bank/4001/export/download/export_20260703T120000_Ab3Xz9.md"
    }
}
```

---

### 4.8 下载导出文件（文件流）

```
GET /api/v1/bank/{bank_id}/export/download/{filename}
```

---

## 五、题目模块

### 5.1 新增题目

```
POST /api/v1/question
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bank_id` | integer | 是 | 所属题库 ID |
| `type` | string | 是 | `"single_choice"` / `"multiple_choice"` / `"true_false"` / `"fill_blank"` / `"short_answer"` |
| `content` | string | 是 | 题干 |
| `options` | string | 否 | 选项 JSON 字符串（题型相关，见下表） |
| `answer` | string | 是 | 答案 JSON 字符串（题型相关，见下表） |
| `analysis` | string | 否 | 题目解析 |
| `difficulty` | integer | 否 | 难度 1~5，默认 1 |
| `tags` | string | 否 | 知识点标签，逗号分隔 |
| `sort_order` | integer | 否 | 排序号，默认 0 |

**题型与 options/answer 格式对照表：**

| type | options 是否必填 | answer 格式 |
|------|:---:|------|
| `single_choice` | 是 | `"A"` |
| `multiple_choice` | 是 | `["A","C"]` |
| `true_false` | 是 | `"正确"` 或 `"错误"` |
| `fill_blank` | 否 | `["答案1","答案2"]` |
| `short_answer` | 否 | `{"keywords":["关键词1","关键词2"],"reference":"参考答案文本"}` |

**示例（单选题）：**

```json
{
    "bank_id": 4001,
    "type": "single_choice",
    "content": "以下哪个是 Java 的基本数据类型？",
    "options": "[\"A. int\",\"B. String\",\"C. List\",\"D. Map\"]",
    "answer": "\"A\"",
    "analysis": "int 是 Java 的 8 种基本数据类型之一",
    "difficulty": 2,
    "tags": "Java,数据类型"
}
```

---

### 5.2 批量导入题目

```
POST /api/v1/question/batch
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bank_id` | integer | 是 | 所属题库 ID |
| `questions` | array | 是 | 题目数组，格式同新增题目，单次最多 200 条 |

```json
{
    "bank_id": 4001,
    "questions": [
        {
            "type": "single_choice",
            "content": "...",
            "options": "...",
            "answer": "..."
        },
        { "...": "..." }
    ]
}
```

---

### 5.3 获取题库的题目列表

```
GET /api/v1/question
```

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `bank_id` | integer | 是 | — | 题库 ID |
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 20 | 每页条数 |
| `type` | string | 否 | — | 题型筛选 |
| `difficulty` | integer | 否 | — | 难度筛选（1-5） |
| `keyword` | string | 否 | — | 搜索关键词（匹配 content 和 tags） |

---

### 5.4 获取题目详情

```
GET /api/v1/question/{question_id}
```

---

### 5.5 更新题目

```
PUT /api/v1/question/{question_id}
```

**请求体（所有字段可选）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 否 | 题干 |
| `options` | string | 否 | 选项 JSON |
| `answer` | string | 否 | 答案 JSON |
| `analysis` | string | 否 | 解析 |
| `difficulty` | integer | 否 | 难度 1~5 |
| `tags` | string | 否 | 标签，逗号分隔 |
| `sort_order` | integer | 否 | 排序号 |

---

### 5.6 删除题目

```
DELETE /api/v1/question/{question_id}
```

> 软删除。

---

### 5.7 更新题目排序

```
PUT /api/v1/question/sort
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bank_id` | integer | 是 | 题库 ID |
| `orders` | array | 是 | 排序列表，按新顺序排列 |

```json
{
    "bank_id": 4001,
    "orders": [
        { "question_id": 5001, "sort_order": 1 },
        { "question_id": 5002, "sort_order": 2 },
        { "question_id": 5003, "sort_order": 3 }
    ]
}
```

---

## 六、学习记录模块

### 6.1 更新学习进度

```
POST /api/v1/study/progress
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `course_id` | integer | 是 | 课程 ID |
| `chapter_id` | integer | 是 | 章节 ID |
| `progress` | integer | 是 | 当前学到了第几页 PPT（从 1 开始） |
| `duration` | integer | 是 | 本次学习时长，单位秒 |

```json
{
    "course_id": 2001,
    "chapter_id": 3001,
    "progress": 12,
    "duration": 300
}
```

> 使用 `INSERT ... ON DUPLICATE KEY UPDATE` 实现 Upsert（联合唯一键 `user_id + course_id + chapter_id`）。
> `progress` 只增不减，`duration` 累加。

---

### 6.2 获取学习记录

```
GET /api/v1/study/record
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `course_id` | integer | 是 | 课程 ID |

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "course_id": 2001,
        "chapters": [
            {
                "chapter_id": 3001,
                "chapter_name": "第一章 概述",
                "progress": 12,
                "total_pages": 15,
                "study_duration": 3600,
                "percent": 80.0
            }
        ],
        "total_study_duration": 3600,
        "overall_progress": 80.0
    }
}
```

---

### 6.3 获取学习统计

```
GET /api/v1/study/stats
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": {
        "total_duration": 7200,
        "total_chapters": 5,
        "completed_chapters": 3,
        "today_duration": 1200,
        "weekly_duration": 5400
    }
}
```

| 字段 | 说明 |
|------|------|
| `total_duration` | 总学习时长（秒） |
| `total_chapters` | 已学习章节数 |
| `completed_chapters` | 已完成章节数（progress = total_pages） |
| `today_duration` | 今日学习时长（秒） |
| `weekly_duration` | 本周学习时长（秒） |

---

## 七、题库协作模块（预留）

> 共享功能为预留接口，上线时启用权限校验。

### 7.1 获取协作成员列表

```
GET /api/v1/bank/{bank_id}/share/members
```

**响应 `200 OK`：**

```json
{
    "code": 0,
    "message": "ok",
    "data": [
        {
            "user_id": 1001,
            "nickname": "张三",
            "email": "zhangsan@example.com",
            "permission": "owner"
        }
    ]
}
```

---

### 7.2 添加协作成员

```
POST /api/v1/bank/{bank_id}/share/members
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | integer | 是 | 被添加的用户 ID |
| `permission` | string | 是 | `"editor"`（可编辑题目）或 `"viewer"`（仅查看） |

> 需要 `owner` 权限。

---

### 7.3 移除协作成员

```
DELETE /api/v1/bank/{bank_id}/share/members/{user_id}
```

> 需要 `owner` 权限，不能移除 owner 自己。

---

### 7.4 修改成员权限

```
PUT /api/v1/bank/{bank_id}/share/members/{user_id}
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `permission` | string | 是 | `"editor"` 或 `"viewer"` |

> 需要 `owner` 权限，不能修改 owner 自己的权限。

---

## 八、管理接口

> 仅 `role = "admin"` 可访问。

### 8.1 获取用户列表

```
GET /api/v1/admin/users
```

**查询参数：** `page`、`page_size`、`keyword`、`role`、`is_banned`

---

### 8.2 禁用/启用用户

```
PUT /api/v1/admin/users/{user_id}/ban
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `is_banned` | boolean | 是 | `true` 禁用，`false` 解禁 |
| `ban_reason` | string | 否 | 禁用原因 |

```json
{
    "is_banned": true,
    "ban_reason": "违规发布内容"
}
```

---

### 8.3 删除用户（软删除）

```
DELETE /api/v1/admin/users/{user_id}
```

---

## 附录 A：接口速查表

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/smtpcode` | 发送邮箱验证码 |
| `POST` | `/login` | 验证码登录/注册 |
| `GET` | `/auth/profile` | 获取个人信息 |
| `PUT` | `/auth/profile` | 更新个人信息 |
| `POST` | `/auth/logout` | 登出 |
| `POST` | `/book/upload` | 上传教材 |
| `GET` | `/book` | 教材列表 |
| `GET` | `/book/{id}` | 教材详情 |
| `PUT` | `/book/{id}` | 更新教材 |
| `DELETE` | `/book/{id}` | 删除教材 |
| `GET` | `/book/{id}/file/{type}` | 获取教材文件 |
| `POST` | `/chapter` | 新增章节 |
| `GET` | `/chapter` | 章节列表 |
| `GET` | `/chapter/{id}` | 章节详情 |
| `PUT` | `/chapter/{id}` | 更新章节 |
| `DELETE` | `/chapter/{id}` | 删除章节 |
| `GET` | `/chapter/{id}/course_json` | 课程结构化 JSON |
| `GET` | `/chapter/{id}/slide/{sid}.html` | PPT 幻灯片 |
| `GET` | `/chapter/{id}/audio/{sid}.mp3` | 口播音频 |
| `GET` | `/chapter/{id}/srt/{sid}.srt` | SRT 字幕 |
| `POST` | `/bank` | 创建题库 |
| `POST` | `/bank/upload` | 上传题库文件 |
| `GET` | `/bank` | 题库列表 |
| `GET` | `/bank/{id}` | 题库详情 |
| `PUT` | `/bank/{id}` | 更新题库 |
| `DELETE` | `/bank/{id}` | 删除题库 |
| `POST` | `/bank/{id}/export` | 导出题库 |
| `GET` | `/bank/{id}/export/download/{name}` | 下载导出 |
| `POST` | `/question` | 新增题目 |
| `POST` | `/question/batch` | 批量导入题目 |
| `GET` | `/question` | 题目列表 |
| `GET` | `/question/{id}` | 题目详情 |
| `PUT` | `/question/{id}` | 更新题目 |
| `DELETE` | `/question/{id}` | 删除题目 |
| `PUT` | `/question/sort` | 更新排序 |
| `POST` | `/study/progress` | 更新学习进度 |
| `GET` | `/study/record` | 学习记录 |
| `GET` | `/study/stats` | 学习统计 |
| `GET` | `/bank/{id}/share/members` | 协作成员 |
| `POST` | `/bank/{id}/share/members` | 添加成员 |
| `DELETE` | `/bank/{id}/share/members/{uid}` | 移除成员 |
| `PUT` | `/bank/{id}/share/members/{uid}` | 修改权限 |
| `GET` | `/admin/users` | 用户管理列表 |
| `PUT` | `/admin/users/{id}/ban` | 禁用/解禁 |
| `DELETE` | `/admin/users/{id}` | 删除用户 |

## 附录 B：文件上传限制

| 格式 | 大小限制 | 处理方式 |
|------|---------|----------|
| `.pdf` | 100 MB | doc2x → Markdown |
| `.docx` / `.doc` | 50 MB | doc2x → Markdown |
| `.md` | 20 MB | 直接使用 |
| `.zip` / `.rar` / `.7z` | 200 MB | 解压后寻找主文档 |
