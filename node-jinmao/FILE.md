# FILE.md - node-jinmao 项目文件索引

> 最后更新：2026-08-02

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
│   ├── files.js                    # 文件代理路由：GET /api/v1/files/{path}，代理访问 MinIO 文件（图片、PDF 等），无需暴露 MinIO 服务
│   ├── book/                       # 教材 CRUD 路由模块（已拆分为 5 个文件）
│   │   ├── index.js                # 统一入口，组合各子路由模块
│   │   ├── list.js                 # GET /api/v1/books — 教材列表（分页+关键词搜索）
│   │   ├── detail.js               # GET /api/v1/books/:id — 教材详情（含完整章节列表+权限校验）
│   │   ├── update.js               # PUT /api/v1/books/:id — 更新教材信息（待实现）
│   │   └── delete.js               # DELETE /api/v1/books/:id — 软删除教材（所有者校验）
│   └── auth.js                     # 认证路由（Express Router）：POST /api/v1/smtpcode、/api/v1/login
│   ├── quiz/                        # 题库相关路由模块
│   │   ├── pdf2quiz.js              # PDF→题库上传路由：POST /api/v1/quiz/pdf-upload（Multer 文件处理 + 任务创建）
│   │   └── md2json.js               # MD→JSON 任务 API：POST /api/v1/quiz/md2json/create + GET/POST /api/v1/quiz/md2json/task/:id
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
│   ├── cover_prompt.txt            # 封面图片生成的 Prompt 模板（含 {{title}} 和 {{sample}} 占位符）
│   ├── doc2x_config.json           # Doc2x API Base URL 配置（非敏感）
│   ├── md2quiz_prompt.md            # MD→JSON 题库生成系统提示词模板
│   ├── quiz-format-prompt.md        # 分块内容格式化提示词（5 种题型识别 + 格式化规则）
│   └── quiz-split-prompt.md         # AI 无损分段提示词（纯边界检测，只返回 maxLine）
├── middleware/                      # 中间件目录
│   └── auth.js                     # JWT 鉴权中间件：验证 Bearer Token，注入 req.userId
├── prisma/                          # Prisma ORM 目录
│   └── schema.prisma               # 数据库 Schema 定义（User 模型）
├── scripts/                         # 运维/数据修复脚本目录
│   └── repair_endline.js           # 一次性数据修复脚本：重建 endline 倒退损坏课程的绝对行号（dry-run 预览 / --apply 写库）
├── service/                        # 服务模块目录
│   ├── auth/                      # 认证业务逻辑（已拆分）
│   │   ├── index.js                # 统一导出入口（转发 4 个函数）
│   │   ├── otp.js                  # 验证码核心模块：sendCode（发送验证码）、verifyAndConsumeOtp（验证并消费验证码）
│   │   ├── login.js                # 登录/注册模块：login（验证码登录/注册）
│   │   └── profile.js              # 用户资料模块：getProfile（获取用户信息）、updateProfile（更新用户信息）
│   ├── course_pipeline.js          # 课程生成流水线调度服务
│   ├── POSTbook.js                 # 教材上传核心业务逻辑服务
│   ├── create_cover_image.js       # 图书封面图片生成服务（异步执行，调用文生图 API + MinIO 上传 + 数据库更新）
│   ├── create_title.js             # 标题生成服务（异步执行，从 MinIO 下载 MD → 提取前 1000 行 → 调用 AI 生成标题 → 更新数据库）
│   └── text_tts.js                 # 火山引擎 TTS 文本转语音 + SRT 字幕生成服务
│   ├── md2quiz/                     # 题库生成服务模块（MD→JSON）
│   │   ├── chunker.js               # 传统盲切分块器：按 3000 字符固定阈值切分 Markdown（降级备用）
│   │   ├── quiz-splitter.js         # AI 无损分段器：提取 1000 行 → AI 判断 maxLine → 循环推进
│   │   ├── quiz-chunk-processor.js  # 分块内容处理器：逐块调用 AI 格式化题目/答案，支持嵌套答案扁平化
│   │   ├── result-validator.js      # 结果校验器：校验 AI 生成 JSON 的结构和题目数量
│   │   ├── task-runner.js           # 任务执行器：编排分段→处理→合并→导入全流程，含答案归一化 + 题型前缀解析
│   │   ├── task-service.js          # 任务服务：对外 createTask / cancelTask / listTasksByUser API
│   │   ├── task-store.js            # 任务存储：内存 Map + 防抖 JSON 持久化 + 服务重启恢复
│   │   ├── task-stream-broker.js    # 任务状态广播：SSE 订阅推送（Publish/Subscribe 模式）
│   │   └── types.js                 # JSDoc 类型定义：TaskEntity / GenerationConfig / QuestionRecord 等
├── utils/                          # 工具模块目录
│   ├── repo/                       # 数据库操作子模块
│   │   ├── update_repo.js          # 通用数据库 CRUD 操作封装
│   │   ├── user_repo.js            # 用户 Repository：findByEmail、createByEmail
│   │   ├── book_repo.js            # 教材 Repository：createCourse、getCourseById、listCoursesByUser、updateEndline、updateMaxline、updatePipelineStatus 等
│   │   ├── chapter_repo.js         # 章节 Repository：createChapter、listChaptersByCourse、updateChapterTotalPages 等
│   │   └── quiz_repo.js              # 题库 Repository：createTextbookWithExam、updateQuestionCounts、cleanupEmptyImport 等
│   ├── prisma.js                   # Prisma Client 单例实例
│   ├── jwt.js                      # JWT Token 工具：generateToken、verifyToken、extractBearer
│   ├── doc2x.js                    # PDF 文件转 Markdown 压缩包（调用 Doc2x API v2），含本地页数读取备用方案
│   ├── elaboration.js              # 调用 DeepSeek 大模型对口播稿进行扩写细化（仅返回数据，不写文件）
│   ├── extract_zip.js              # 解压压缩包（.zip / .rar / .7z）
│   ├── extractor_md.js             # 从 Markdown 文件中按行号范围提取文本内容
│   ├── generate_outline.js         # 调用 DeepSeek 生成 PPT 大纲（仅返回数据，不写文件），PIC 格式为 [{path, desc}]
│   ├── get_line.js                 # 将已编号文本发送给 DeepSeek 小模型，识别章节起止行号（返回 JSON 字符串）
│   ├── htmlppt.js                  # 将 PPT 生成指引转换为互动式 HTML PPT（通过 llm_client 调用 DeepSeek 大模型，支持图片 URL + 描述输入，需传入 userId 用于计费）
│   ├── input_validator.js          # 统一输入验证（validateString / validateNumber / validateFields）
│   ├── image_size.js               # 图片尺寸提取工具：从 MinIO 读取图片头获取像素宽高，支持 JPEG/PNG/GIF/WebP/BMP
│   ├── line_indexer.js             # 给 Markdown 文本每一行添加行号索引
│   └── upload_minio.js             # 上传文件到 MinIO 对象存储
├── tools/                          # 外部工具目录
│   └── 7z/                         # 7-Zip 命令行工具（7za.exe）
```

## 文件说明

| 文件名 | 用途 | 最后修改 |
|--------|------|----------|
| `app.js` | Express HTTP 服务器，监听 8888 端口，挂载 /api/v1 路由；helmet 安全头已针对纯 HTTP 环境关闭 COOP/OAC/HSTS/upgrade-insecure-requests，CSP 放宽 connect-src/font-src 允许 Scalar CDN | **修改 2026-08-01** |
| `package.json` | 定义项目名、依赖（express、multer、nodemailer、Prisma 等）、启动脚本 | 2026-07-05 |
| `setup_first_deploy.sh` | **首次部署建库脚本**（全新空库专用：`prisma db push` 按 schema.prisma 建全表 + `prisma migrate resolve --applied` 标记历史迁移已应用，跳过迁移链） | **新建 2026-08-01** |
| `API/POSTbook.js` | 教材上传与状态查询路由：POST /api/v1/book/upload（multer 文件上传 + JWT 鉴权 → Service 层上传） + GET /api/v1/book/:book_id/status（查询流水线状态与章节信息），含完整 OpenAPI 注解 | 2026-07-05 |
| `API/files.js` | 文件代理路由：GET /api/v1/files/{path}，后端从 MinIO 获取文件流 pipe 到前端响应，MIME 类型通过内置映射表判断，支持图片/PDF/音频等，无需暴露 MinIO 服务 | 2026-07-09 |
| `API/book/` | 教材 CRUD 路由模块（已拆分）：`index.js` 统一入口，`list.js` 列表（分页+搜索），`detail.js` 详情（含章节+权限校验），`update.js` 更新（待实现），`delete.js` 软删除（所有者校验），`generate-next-chapter.js` 章节生成/进度/按钮状态查询，`fix-missing.js` 文件缺失补全。全部含完整 OpenAPI 注解 | 2026-08-03 |
| `API/auth.js` | 认证路由（Express Router），4 个端点：POST /api/v1/smtpcode（发送验证码）、POST /api/v1/login（验证码登录/注册）、GET /api/v1/auth/profile（获取当前用户信息，需 Token）、PUT /api/v1/auth/profile（更新用户信息，需 Token + 邮箱验证码） | 2026-07-05 |
| `API/quiz/pdf2quiz.js` | PDF→题库上传路由：POST /api/v1/quiz/pdf-upload（Multer 文件处理 + JWT 鉴权 + 任务创建），含完整 OpenAPI 注解 | 2026-07-30 |
| `API/quiz/md2json.js` | MD→JSON 任务 API：POST /api/v1/quiz/md2json/create（创建任务）、GET /api/v1/quiz/md2json/task/:id（查询状态）、POST /api/v1/quiz/md2json/task/:id/cancel（取消任务），含完整 OpenAPI 注解 | 2026-07-30 |
| `middleware/auth.js` | JWT 鉴权 Express 中间件，验证 Bearer Token 并注入 req.userId（不检查用户状态） | 2026-07-04 |
| `middleware/security.js` | 安全防护中间件：在路由之前检测并阻断可疑攻击（超长URL/SQL注入/XSS/路径遍历/敏感文件/扫描路径/恶意UA/重复字符载荷），命中后写入 SecurityEvent 表，防刷屏日志（同IP同类型10秒内只打一次） | 2026-08-01 |
| `admin/index.html` | 管理员 CMS 骨架页（Vue3 + Element Plus + ECharts CDN）：仅页面骨架，模板/样式/JS 拆分为 admin/static/{tpl,css,js}；完整功能含 6 个 Tab（兑换码/用户/账单/消费统计/安全防护/系统设置），暗黑模式 | **修改 2026-08-02** |
| `API/admin/` | 管理员 API 子路由目录（由 API/admin.js 聚合器挂载）：codes.js 兑换码、users.js 用户管理（列表/禁用/解禁）、billing.js 全局账单（含成本/利润）、stats.js 平台统计（含成本/利润汇总与趋势）、security.js 安全事件（含 CSV 导出）、config.js 系统配置 | **修改 2026-08-02** |
| `utils/billing_config.js` | 计费配置工具：售价/成本两套配置共用的 JSON 读取、时段匹配、取价、金额向上取整到 7 位小数 | **新建 2026-08-02** |
| `utils/billing_cost.js` | 模型成本计算模块：按 config/model_cost_config.json 实时计算 LLM/文生图/TTS/doc2x 成本单价/分项/总额，配置缺失返回 null 由 billing.js 回退售价 | **新建 2026-08-02** |
| `config/model_cost_config.json` | 模型成本价配置（结构与 billing_pricing.json 一致，初始值=现有售价，可独立调整；利润=售价-成本） | **新建 2026-08-02** |
| `scripts/backfill_billing_cost.js` | 一次性历史账单成本回填脚本：旧记录（成本引入前售价=成本）成本字段回填为对应售价字段 | **新建 2026-08-02** |
| `middleware/admin.js` | 管理员双重鉴权中间件：第一层 URL 安全后缀校验（不匹配返回404伪装），第二层 JWT Token + 管理员角色验证 | 2026-07-05 |
| `prisma/schema.prisma` | Prisma ORM 数据库 Schema 定义，包含 User、Course、Chapter 模型，映射 MySQL 表 | 2026-07-05 |
| `config/index.js` | 统一配置加载入口，读取各 JSON 配置并用 process.env 注入敏感字段，导出 `{ deepseek, doc2x, volcengine }` | 2026-07-04 |
| `config/swagger.js` | OpenAPI 3.0 文档配置，swagger-jsdoc 扫描 API/*.js 的 @openapi 注释生成规范，配合 Scalar UI 渲染交互式文档页面；servers.url 改为相对路径 "/" 避免线上文档仍请求 localhost | **修改 2026-08-01** |
| `config/deepseek_config.json` | 存储 DeepSeek API 的 Base URL 和模型名称（API Key 已迁移到 .env） | 2026-07-04 |
| `config/prompt.json` | 映射 Prompt 模板文件路径 | 2026-07-02 |
| `config/outline_prompt.txt` | 大纲生成的 System Prompt 模板，含 `{{yuanwen}}` 和 `{{pptother}}` 占位符，PIC 字段格式为 `[{path, desc}]` 含图片描述 | 2026-07-25 |
| `config/getline_prompt.txt` | 行号识别的 System Prompt 模板，指导 DeepSeek 分析已编号文本并返回章节起止行号 | 2026-07-02 |
| `config/elaboration_prompt.txt` | 口播稿扩写细化的 System Prompt 模板，含 `{{elaboration}}`、`{{original}}`、`{{expected_words}}` 占位符 | 2026-07-02 |
| `config/html_ppt_prompt.txt` | HTML PPT 生成的 System Prompt 模板，含 `{{pptGuide}}`、`{{originalText}}`、`{{imageUrls}}` 占位符，支持图片描述+原始尺寸引导排版；固定 4 级字号体系（大标题 3rem / 小节标题 2.25rem / 正文 2rem / 辅助文字 1.5rem，全页仅允许这 4 个字号）；16:9 画布铁律（1920×1080，html/body 必须 overflow:hidden，内容不得超出画布，禁止滚动条与 overflow:auto/scroll）；含四规则图片处理（禁止自绘专业图、仅允许简单图形自绘、强制 `<img>` 引用且严禁补全为绝对 URL、尺寸决定空间+宽高比布局指导） | 2026-08-03 |
| `config/cover_prompt.txt` | 封面图片生成的 System Prompt 模板，含 `{{title}}` 和 `{{sample}}` 占位符，用于生成 16:9 课程封面 | 2026-07-09 |
| `config/title_prompt.txt` | 标题生成的 System Prompt 模板，含 `{{filename}}` 和 `{{content}}` 占位符，用于生成书籍标题和副标题 | 2026-07-09 |
| `config/doc2x_config.json` | Doc2x API Base URL 配置（API Key 已迁移到 .env） | 2026-07-04 |
| `config/md2quiz_prompt.md` | MD→JSON 题库生成系统提示词模板，定义 5 种题型输出格式、配额要求、严格禁止规则 | 2026-07-30 |
| `config/quiz-format-prompt.md` | 分块内容格式化提示词：5 种题型识别规则（单选/多选/判断/填空/简答）+ 自适应输出格式（questions/answers/complete/none） | 2026-07-30 |
| `config/quiz-split-prompt.md` | AI 无损分段提示词：纯边界检测，只返回 maxLine，不关心题目内容 | 2026-07-30 |
| `config/volcengine_config.json` | 存储火山引擎 TTS 非敏感配置（RESOURCE_ID、SPEAKER、API_URL），APP_ID 和 ACCESS_KEY 已迁移到 .env | 2026-07-04 |
| `service/course_pipeline.js` | 课程生成6阶段流水线（Phase1~Phase6），使用p-queue控制并发。PPT/TTS生成通过 `llm_client` 统一调用（需传入 userId）。含 `deriveMinioKey()` 和 `enrichImageInfosWithSize()` 批量查询图片尺寸。导出 `pipeline(courseId)`、`generateChapter(courseId, chapterId)`、`fixMissingFilesForChapter()`（含内存去重Map）、`getFixStatus()` 状态查询。`generateChapter`/`phase2_extractAndIndex` 已修复相对/绝对行号换算 | 2026-08-01 |
| `scripts/repair_endline.js` | 一次性数据修复脚本：检测 `course.endline < max(非删除章节 endline)` 的损坏课程（endline 倒退 bug 导致），按"相对跨度=绝对跨度"迭代还原绝对行号并更新课程/章节；默认 dry-run 预览，`--apply` 写库（事务批量提交），修复后 endline ≥ maxline 自动补设 isLastChapter | 2026-08-01 |
| `service/POSTbook.js` | 教材上传核心业务逻辑，校验文件 → 上传 MinIO → 写入数据库 → 返回结果，含 `uploadImageDir()` 通用图片上传辅助函数（兼容 image/images 目录名） | 2026-07-10 |
| `service/create_cover_image.js` | 图书封面图片生成服务，调用文生图 API 生成封面 → 下载图片 → 上传 MinIO → 更新数据库 coverPath，导出 `createCoverImage()` 和 `startCoverGeneration()`（异步执行） | 2026-07-09 |
| `service/create_title.js` | 标题生成服务，从 MinIO 下载 MD 文件 → 提取前 1000 行 → 调用 AI 生成标题和副标题 → 更新数据库 name 和 subtitle，导出 `generateCourseTitle()` 和 `startTitleGeneration()`（异步执行） | 2026-07-09 |
| `service/auth/index.js` | Auth 服务统一导出入口，聚合 otp.js / login.js / profile.js 的 4 个函数，保持与拆分前一致的对外接口 | 2026-07-05 |
| `service/auth/otp.js` | 验证码核心模块：sendCode（SMTP发送验证码）、verifyAndConsumeOtp（验证并消费验证码，供 login 和 updateProfile 共用） | 2026-07-05 |
| `service/auth/login.js` | 登录/注册模块：login（验证码登录/注册，自动判断新老用户，调用 otp.js.verifyAndConsumeOtp 校验验证码） | 2026-07-05 |
| `service/auth/profile.js` | 用户资料模块：getProfile（获取用户信息）、updateProfile（邮箱验证码验证后更新用户信息，调用 otp.js.verifyAndConsumeOtp 校验验证码） | 2026-07-05 |
| `service/text_tts.js` | 火山引擎 TTS 文本转语音 + SRT 字幕生成服务，输入文本返回 MP3 和 SRT 文件路径；支持超长文本按标点无损分块合成后合并为单一 MP3/SRT，导出 `synthesize()`、`validateInput()`、`splitTextByPunctuation()` | 2026-08-01 |
| `service/md2quiz/chunker.js` | 传统盲切分块器：按 3000 字符固定阈值切分 Markdown 文本，降级备用方案 | 2026-07-30 |
| `service/md2quiz/quiz-splitter.js` | AI 无损分段器：提取 1000 行 → 添加行号 → DeepSeek 判断 maxLine → 循环推进，确保不在题目中间截断 | 2026-07-30 |
| `service/md2quiz/quiz-chunk-processor.js` | 分块内容处理器：逐块调用 AI 格式化题目/答案，支持嵌套答案扁平化（题型分组→扁平前缀），分类收集 questionMap/answerMap/completeQuestions | 2026-07-30 |
| `service/md2quiz/result-validator.js` | 结果校验器：校验 AI 生成 JSON 的结构完整性、题目数量与配额是否匹配、题型合法性 | 2026-07-30 |
| `service/md2quiz/task-runner.js` | 任务主执行器：编排分段→处理→合并→导入全流程，含 `normalizeAnswerFromRaw`（5 种题型答案归一化）、`mergeResults`（题型前缀解析+按题号匹配）、`importQuestionsToTextbook`（Prisma 批量写入） | 2026-07-30 |
| `service/md2quiz/task-service.js` | 任务服务：对外提供 createTask（创建并启动）/ cancelTask（取消）/ listTasksByUser（列举）/ getTask 等 API | 2026-07-30 |
| `service/md2quiz/task-store.js` | 任务存储：内存 Map 存储 + 防抖 JSON 文件持久化 + 服务重启恢复（未完成任务标记为 failed） | 2026-07-30 |
| `service/md2quiz/task-stream-broker.js` | 任务状态广播：基于 EventEmitter 的 Publish/Subscribe 模式，向 SSE 订阅者推送任务状态快照 | 2026-07-30 |
| `service/md2quiz/types.js` | JSDoc 类型定义：TaskEntity / GenerationConfig / QuestionRecord / ChunkRecord / ValidationResult 等 | 2026-07-30 |
| `utils/repo/update_repo.js` | 通用数据库 CRUD 操作封装，提供增删改查方法供 API 层调用 | 2026-07-03 |
| `utils/repo/user_repo.js` | 用户 Repository：findByEmail（按邮箱查用户）、createByEmail（仅邮箱创建用户）、findById（按 ID 查用户）、updateProfile（按 ID 更新用户信息） | 2026-07-05 |
| `utils/repo/book_repo.js` | 教材 Repository：createCourse、getCourseById（含章节）、listCoursesByUser（分页+搜索）、updateCourse、updateEndline、updateMaxline、updatePipelineStatus、updatePipelineProgress、incrementPipelineProgress、softDeleteCourse | 2026-07-31 |
| `utils/repo/chapter_repo.js` | 章节 Repository：createChapter、getChapterById、listChaptersByCourse（按序号）、updateChapter、updateChapterTotalPages（含outlinePath）、softDeleteChapter | 2026-07-05 |
| `utils/repo/quiz_repo.js` | 题库 Repository：createTextbookWithExam（创建教材+试卷）、updateQuestionCounts（更新题目数）、cleanupEmptyImport（清理空导入） | 2026-07-30 |
| `utils/repo/security_repo.js` | 安全事件 Repository：recordAttack（去重写入，同IP同类型5分钟窗口内count累加）、listEvents（分页查询+筛选）、listAllEvents（无分页全量查询，供 CSV 导出）、countUnhandled（未处理数统计）、markHandled（标记已处理） | **修改 2026-08-02** |
| `utils/prisma.js` | Prisma Client 全局单例实例，确保整个应用共享同一个数据库连接池 | 2026-07-04 |
| `utils/jwt.js` | JWT Token 工具模块：generateToken（签发）、verifyToken（验证+区分过期/无效）、extractBearer（从请求头提取） | 2026-07-04 |
| `utils/doc2x.js` | 将 PDF 文件通过 Doc2x API v2 转换为 Markdown 压缩包，返回 zip 下载 URL + 页数。页数通过 `getPdfPageCountLocally()` 从 PDF 本地读取（API 不返回页数）。导出 `convertPdfToMarkdown()` | 2026-07-30 |
| `utils/elaboration.js` | 调用 DeepSeek 大模型对口播稿进行扩写细化（通过统一 llm_client，自动处理心跳/看门狗/计费），输入 userId、原始口播稿、教材原文、预期字数，返回 `{code, script?, message?}`。导出 `elaborateText()` | 2026-07-29 |
| `utils/extract_zip.js` | 解压压缩包（.zip / .rar / .7z），递归查找解压目录中的 .md 主文档，内置 7za.exe 调用，含超时自动清理机制。导出 `extractZip()`、`cleanUp()` 和 `validateInput()` | 2026-07-03 |
| `tools/7z/` | 7-Zip 命令行工具（7za.exe v9.20），用于解压压缩包 | 2026-07-03 |
| `utils/extractor_md.js` | 从 Markdown 文件中按行号范围提取文本内容，支持输入校验与自动截断，返回 `{code, text?, message?}`。导出 `extractLines()` 和 `validateParams()` | 2026-07-02 |
| `utils/generate_outline.js` | 通过统一的 `llm_client` 模块调用 DeepSeek 大模型生成 PPT 大纲（`main(userId, yuanwen, pptother)`），返回 `{code, outline?, message?}`，含数组自动包装为 `{slides: [...]}` 的兜底逻辑。大纲中 PIC 字段格式为 `[{path, desc}]`。导出 `generateOutline()` | 2026-07-29 |
| `utils/get_line.js` | 接受已编号的 Markdown 文本，通过 `llmClient.chat()` 统一调用 DeepSeek 小模型识别可做 PPT 的章节起止行号，返回对象 `{code,startline?,endline?,message?}`。导出 `getLine(userId, indexedMarkdown)` | 2026-07-29 |
| `utils/htmlppt.js` | 将 PPT 生成指引转换为互动式 HTML PPT，通过 `llm_client` 统一调用 DeepSeek 大模型。输入 `(userId, pptGuide, originalText, imageInfos)`，imageInfos 支持 `string[]` 和 `object[]: {url, desc, width?, height?}` 格式，含尺寸信息时会格式化为 `原始尺寸=WxHpx`。返回 `{code, html?, message?}`。含 URL 规范化后处理；清理链抽为 `cleanAndValidateHtml()`；新增"生成结果规范校验 + 自动重试 1 次"（设计说明污染 + 16:9 画布/滚动条违规，配合 `utils/htmlppt_guard.js`）。导出 `generateHtmlPpt()` | 2026-08-03 |
| `utils/htmlppt_guard.js` | HTML PPT 生成结果规范校验（纯函数，无副作用）：`extractVisibleText(html)` 剔除 script/style/pre/code 后提取可见文本；`detectDesignGuideContamination(html)` 检测可见正文是否混入"设计说明/设计复盘"文字或非法 Markdown 语法（``` 围栏、### 标题、**加粗**、设计说明关键词），返回 `{contaminated, reasons}`；`detectOverflowViolation(html)` 检测是否违反 16:9 画布规范（html/body 未设 overflow:hidden，或样式中出现 overflow:auto/scroll），返回 `{violated, reasons}`。供 `htmlppt.js` 生成后校验使用，可独立单元测试 | 2026-08-03 |
| `utils/image_size.js` | 纯 Node.js 图片尺寸提取工具：从 MinIO 读取图片头部（最多 64KB），通过解析二进制文件头获取像素宽高，支持 JPEG/PNG/GIF/WebP/BMP 五种格式，含自动格式检测 fallback。导出 `getImageSize(minioClient, bucket, objectKey)` | 2026-07-29 |
| `utils/can_generate_next.js` | 统一计算函数：根据课程状态和章节列表判断是否可以生成下一章，前后端共用 | 2026-07-29 |
| `utils/create_title.js` | 调用 DeepSeek 小模型（deepseek-v4-flash）为教材内容生成标题和副标题，输入文件名和原文内容，返回 `{code, title?, subtitle?, message?}`。导出 `createTitle()` | 2026-07-09 |
| `utils/line_indexer.js` | 给 Markdown 文本每一行添加行号索引，支持输入安全校验（防注入/空值/类型检查），返回 `{code, text, message?}` | 2026-07-02 |
| `utils/upload_minio.js` | 上传文件到 MinIO 对象存储，输入本地路径 + MinIO 目标路径，返回文件 URL | 2026-07-03 |
