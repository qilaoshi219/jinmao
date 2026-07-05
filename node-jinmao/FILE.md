# FILE.md - node-jinmao 项目文件索引

> 最后更新：2026-07-05

## 项目目录结构

```
node-jinmao/
├── app.js                          # Express HTTP 服务器入口（端口 8888）
├── package.json                    # 项目依赖与脚本配置
├── package-lock.json               # 依赖锁定文件
├── .env                            # 敏感凭据配置文件（API Key / JWT / SMTP / DB，已被 .gitignore 忽略，禁止提交）
├── .env.example                    # 敏感凭据配置模板（可提交到版本控制，供新开发者参考）
├── .gitignore                      # Git 忽略规则
├── start.ps1                       # 快速启动脚本（Windows PowerShell）
├── API/                            # API 路由层
│   ├── POSTbook.js                 # 教材上传与状态查询路由：POST /api/v1/book/upload、GET /api/v1/book/:book_id/status（multer 文件处理 + JWT 鉴权）
│   ├── book.js                     # 教材 CRUD 路由（占位）：GET/PUT/DELETE /api/v1/books（待实现）
│   └── auth.js                     # 认证路由（Express Router）：POST /api/v1/smtpcode、/api/v1/login
├── config/                         # 配置目录
│   ├── index.js                    # 统一配置加载入口（合并 JSON + .env 敏感字段）
│   ├── swagger.js                  # OpenAPI 文档配置（swagger-jsdoc + Scalar UI）
│   ├── deepseek_config.json        # DeepSeek API 模型与 Base URL 配置（非敏感）
│   ├── prompt.json                 # Prompt 文件路径映射
│   ├── volcengine_config.json      # 火山引擎 TTS 非敏感配置（RESOURCE_ID / SPEAKER / API_URL）
│   ├── outline_prompt.txt          # 大纲生成的 Prompt 模板
│   ├── getline_prompt.txt          # 行号识别的 Prompt 模板
│   ├── elaboration_prompt.txt      # 口播稿扩写细化的 Prompt 模板
│   ├── html_ppt_prompt.txt         # HTML PPT 生成的 Prompt 模板
│   └── doc2x_config.json           # Doc2x API Base URL 配置（非敏感）
├── middleware/                      # 中间件目录
│   └── auth.js                     # JWT 鉴权中间件：验证 Bearer Token，注入 req.userId
├── prisma/                          # Prisma ORM 目录
│   └── schema.prisma               # 数据库 Schema 定义（User 模型）
├── service/                        # 服务模块目录
│   ├── auth/                      # 认证业务逻辑（已拆分）
│   │   ├── index.js                # 统一导出入口（转发 4 个函数）
│   │   ├── otp.js                  # 验证码核心模块：sendCode（发送验证码）、verifyAndConsumeOtp（验证并消费验证码）
│   │   ├── login.js                # 登录/注册模块：login（验证码登录/注册）
│   │   └── profile.js              # 用户资料模块：getProfile（获取用户信息）、updateProfile（更新用户信息）
│   ├── course_pipeline.js          # 课程生成流水线调度服务
│   ├── POSTbook.js                 # 教材上传核心业务逻辑服务
│   └── text_tts.js                 # 火山引擎 TTS 文本转语音 + SRT 字幕生成服务
├── utils/                          # 工具模块目录
│   ├── repo/                       # 数据库操作子模块
│   │   ├── update_repo.js          # 通用数据库 CRUD 操作封装
│   │   ├── user_repo.js            # 用户 Repository：findByEmail、createByEmail
│   │   ├── book_repo.js            # 教材 Repository：createCourse、getCourseById、listCoursesByUser、updatePipelineStatus 等
│   │   └── chapter_repo.js         # 章节 Repository：createChapter、listChaptersByCourse、updateChapterTotalPages 等
│   ├── prisma.js                   # Prisma Client 单例实例
│   ├── jwt.js                      # JWT Token 工具：generateToken、verifyToken、extractBearer
│   ├── doc2x.js                    # PDF 文件转 Markdown 压缩包（调用 Doc2x API v2）
│   ├── elaboration.js              # 调用 DeepSeek 大模型对口播稿进行扩写细化（仅返回数据，不写文件）
│   ├── extract_zip.js              # 解压压缩包（.zip / .rar / .7z）
│   ├── extractor_md.js             # 从 Markdown 文件中按行号范围提取文本内容
│   ├── generate_outline.js         # 调用 DeepSeek 生成 PPT 大纲（仅返回数据，不写文件）
│   ├── get_line.js                 # 将已编号文本发送给 DeepSeek 小模型，识别章节起止行号（返回 JSON 字符串）
│   ├── htmlppt.js                  # 将 PPT 生成指引转换为互动式 HTML PPT（调用 DeepSeek 大模型）
│   ├── input_validator.js          # 统一输入验证（validateString / validateNumber / validateFields）
│   ├── line_indexer.js             # 给 Markdown 文本每一行添加行号索引
│   ├── upload_minio.js             # 上传文件到 MinIO 对象存储
│   └── word2pdf.js                 # Word 文件转 PDF 格式
├── tools/                          # 外部工具目录
│   └── 7z/                         # 7-Zip 命令行工具（7za.exe）
```

## 文件说明

| 文件名 | 用途 | 最后修改 |
|--------|------|----------|
| `app.js` | Express HTTP 服务器，监听 8888 端口，挂载 /api/v1 路由，集成 helmet/cors/JSON 解析中间件 | 2026-07-05 |
| `package.json` | 定义项目名、依赖（express、multer、nodemailer、Prisma 等）、启动脚本 | 2026-07-05 |
| `API/POSTbook.js` | 教材上传与状态查询路由：POST /api/v1/book/upload（multer 文件上传 + JWT 鉴权 → Service 层上传） + GET /api/v1/book/:book_id/status（查询流水线状态与章节信息），含完整 OpenAPI 注解 | 2026-07-05 |
| `API/book.js` | 教材 CRUD 路由（占位）：GET /api/v1/books（列表）、GET /api/v1/books/:id（详情）、PUT /api/v1/books/:id（更新）、DELETE /api/v1/books/:id（删除），均返回 "待实现"，含 OpenAPI 注解 | 2026-07-05 |
| `API/auth.js` | 认证路由（Express Router），4 个端点：POST /api/v1/smtpcode（发送验证码）、POST /api/v1/login（验证码登录/注册）、GET /api/v1/auth/profile（获取当前用户信息，需 Token）、PUT /api/v1/auth/profile（更新用户信息，需 Token + 邮箱验证码） | 2026-07-05 |
| `middleware/auth.js` | JWT 鉴权 Express 中间件，验证 Bearer Token 并注入 req.userId（不检查用户状态） | 2026-07-04 |
| `prisma/schema.prisma` | Prisma ORM 数据库 Schema 定义，包含 User、Course、Chapter 模型，映射 MySQL 表 | 2026-07-05 |
| `config/index.js` | 统一配置加载入口，读取各 JSON 配置并用 process.env 注入敏感字段，导出 `{ deepseek, doc2x, volcengine }` | 2026-07-04 |
| `config/swagger.js` | OpenAPI 3.0 文档配置，swagger-jsdoc 扫描 API/*.js 的 @openapi 注释生成规范，配合 Scalar UI 渲染交互式文档页面 | 2026-07-04 |
| `config/deepseek_config.json` | 存储 DeepSeek API 的 Base URL 和模型名称（API Key 已迁移到 .env） | 2026-07-04 |
| `config/prompt.json` | 映射 Prompt 模板文件路径 | 2026-07-02 |
| `config/outline_prompt.txt` | 大纲生成的 System Prompt 模板，含 `{{yuanwen}}` 和 `{{pptother}}` 占位符 | 2026-07-02 |
| `config/getline_prompt.txt` | 行号识别的 System Prompt 模板，指导 DeepSeek 分析已编号文本并返回章节起止行号 | 2026-07-02 |
| `config/elaboration_prompt.txt` | 口播稿扩写细化的 System Prompt 模板，含 `{{elaboration}}`、`{{original}}`、`{{expected_words}}` 占位符 | 2026-07-02 |
| `config/html_ppt_prompt.txt` | HTML PPT 生成的 System Prompt 模板，含 `{{pptGuide}}`、`{{originalText}}`、`{{imageUrls}}` 占位符 | 2026-07-02 |
| `config/doc2x_config.json` | Doc2x API Base URL 配置（API Key 已迁移到 .env） | 2026-07-04 |
| `config/volcengine_config.json` | 存储火山引擎 TTS 非敏感配置（RESOURCE_ID、SPEAKER、API_URL），APP_ID 和 ACCESS_KEY 已迁移到 .env | 2026-07-04 |
| `service/course_pipeline.js` | 课程生成6阶段流水线（Phase1数据获取 → Phase2文本提取与行号识别 → Phase3大纲生成+条件性扩写 → Phase4 PPT批量生成(并发5) → Phase5 TTS语音+字幕批量生成(并发3) → Phase6数据完整性校验），使用p-queue控制并发，导出`pipeline(courseId)` | 2026-07-05 |
| `service/POSTbook.js` | 教材上传核心业务逻辑，校验文件 → 上传 MinIO → 写入数据库 → 返回结果 | 2026-07-03 |
| `service/auth/index.js` | Auth 服务统一导出入口，聚合 otp.js / login.js / profile.js 的 4 个函数，保持与拆分前一致的对外接口 | 2026-07-05 |
| `service/auth/otp.js` | 验证码核心模块：sendCode（SMTP发送验证码）、verifyAndConsumeOtp（验证并消费验证码，供 login 和 updateProfile 共用） | 2026-07-05 |
| `service/auth/login.js` | 登录/注册模块：login（验证码登录/注册，自动判断新老用户，调用 otp.js.verifyAndConsumeOtp 校验验证码） | 2026-07-05 |
| `service/auth/profile.js` | 用户资料模块：getProfile（获取用户信息）、updateProfile（邮箱验证码验证后更新用户信息，调用 otp.js.verifyAndConsumeOtp 校验验证码） | 2026-07-05 |
| `service/text_tts.js` | 火山引擎 TTS 文本转语音 + SRT 字幕生成服务，输入文本返回 MP3 和 SRT 文件路径，导出 `synthesize()` 和 `validateInput()` | 2026-07-02 |
| `utils/repo/update_repo.js` | 通用数据库 CRUD 操作封装，提供增删改查方法供 API 层调用 | 2026-07-03 |
| `utils/repo/user_repo.js` | 用户 Repository：findByEmail（按邮箱查用户）、createByEmail（仅邮箱创建用户）、findById（按 ID 查用户）、updateProfile（按 ID 更新用户信息） | 2026-07-05 |
| `utils/repo/book_repo.js` | 教材 Repository：createCourse、getCourseById（含章节）、listCoursesByUser（分页+搜索）、updateCourse、updateEndline、updatePipelineStatus、softDeleteCourse | 2026-07-05 |
| `utils/repo/chapter_repo.js` | 章节 Repository：createChapter、getChapterById、listChaptersByCourse（按序号）、updateChapter、updateChapterTotalPages（含outlinePath）、softDeleteChapter | 2026-07-05 |
| `utils/prisma.js` | Prisma Client 全局单例实例，确保整个应用共享同一个数据库连接池 | 2026-07-04 |
| `utils/jwt.js` | JWT Token 工具模块：generateToken（签发）、verifyToken（验证+区分过期/无效）、extractBearer（从请求头提取） | 2026-07-04 |
| `utils/doc2x.js` | 将 PDF 文件通过 Doc2x API v2 转换为 Markdown 压缩包，返回 zip 下载 URL。导出 `convertPdfToMarkdown()` | 2026-07-03 |
| `utils/elaboration.js` | 调用 DeepSeek 大模型对口播稿进行扩写细化，输入原始口播稿、教材原文、预期字数，返回 `{code, script?, message?}`。导出 `elaborateText()` 和 `validateInput()` | 2026-07-02 |
| `utils/extract_zip.js` | 解压压缩包（.zip / .rar / .7z），递归查找解压目录中的 .md 主文档，内置 7za.exe 调用，含超时自动清理机制。导出 `extractZip()`、`cleanUp()` 和 `validateInput()` | 2026-07-03 |
| `tools/7z/` | 7-Zip 命令行工具（7za.exe v9.20），用于解压压缩包 | 2026-07-03 |
| `utils/extractor_md.js` | 从 Markdown 文件中按行号范围提取文本内容，支持输入校验与自动截断，返回 `{code, text?, message?}`。导出 `extractLines()` 和 `validateParams()` | 2026-07-02 |
| `utils/generate_outline.js` | 调用 DeepSeek 大模型生成 PPT 大纲，输入原文和标题，返回 `{code, outline?, message?}`。导出 `generateOutline()` 和 `validateInput()` | 2026-07-02 |
| `utils/get_line.js` | 接受已编号的 Markdown 文本，调用 DeepSeek 小模型识别可做 PPT 的章节起止行号，返回 JSON 字符串 `{code,startline?,endline?,message?}`。导出 `getLine()` 和 `validateInput()` | 2026-07-02 |
| `utils/htmlppt.js` | 将 PPT 生成指引转换为互动式 HTML PPT，输入指引文本、教材原文、可选图片 URL 数组，返回 `{code, html?, message?}`。导出 `generateHtmlPpt()` 和 `validateInput()` | 2026-07-02 |
| `utils/line_indexer.js` | 给 Markdown 文本每一行添加行号索引，支持输入安全校验（防注入/空值/类型检查），返回 `{code, text, message?}` | 2026-07-02 |
| `utils/upload_minio.js` | 上传文件到 MinIO 对象存储，输入本地路径 + MinIO 目标路径，返回文件 URL | 2026-07-03 |
| `utils/word2pdf.js` | 将 Word 文件（.docx / .doc）转为 PDF。优先使用项目 `libreoffice-portable/` 目录下的便携版，不存在时回退到系统安装的 LibreOffice。导出 `convert()` 和 `validateInput()` | 2026-07-04 |
