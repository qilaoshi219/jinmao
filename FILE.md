# 文件索引（FILE.md）

## 项目概述
金茂教材处理系统 — 用户上传教材文件，AI 自动生成带 PPT/语音/字幕的互动课程。

## 根目录文件

| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `start.ps1` | 项目快速启动脚本 | — |
| `pack.ps1` | **发布包打包脚本**（程序+部署说明 → jinmao.zip；排除 node_modules/.env/日志/运行时状态；内置前端 dist/，可用 -SkipDist 生成源码包；每次打包自动生成新的管理员安全后缀） | **修改 2026-08-04** |
| `部署说明.md` | **三环境部署说明**（Windows / Linux / 宝塔：环境准备、.env 配置、数据库初始化、启动、反代、验证、FAQ、检查清单） | **新建 2026-08-04** |
| `API文档.md` | API 接口文档 | — |
| `minio文件结构.md` | MinIO 对象存储文件组织设计 | — |
| `数据库结构.md` | 数据库设计文档（6张表规划） | — |
| `流水线.md` | 课程生成流水线设计文档 | — |
| `开发日志.md` | 开发变更记录 | **修改 2026-08-01** |

> 内部运维脚本（ftp_upload*.ps1、deploy.ps1、sync_wsl.ps1）与内部文档（待办.md、IDEA.md、
> 测试报告.md 等）已从开源仓库移除，仅保留本地副本（见 .gitignore）。

## 后端 `node-jinmao/` 主要文件

### 入口文件
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `app.js` | Express 服务器入口（端口8888），挂载路由和中间件，含启动前自检 + 基于版本号的自动 Prisma migrate/generate，新增兑换码/管理员路由，启动时显示安全后缀 | **修改 2026-07-31** |
| `.migration_version` | 运行时版本记录文件（JSON），记录上次成功迁移对应的 package.json 版本号，由 app.js 启动流程自动维护 | 2026-07-10 |
| `.gitignore` | Git 忽略规则 — 新增 admin_config.json | **修改 2026-07-31** |
| `setup.sh` | 宝塔部署一键初始化脚本（检查环境、安装依赖、初始化DB、构建前端） | 2026-07-09 |
| `ecosystem.config.js` | PM2 进程管理配置（宝塔PM2管理器可识别）；已移除硬编码 PORT，端口改由各环境 .env 控制 | **修改 2026-08-01** |
| `admin/index.html` | 管理员 CMS 骨架页（Vue3 + Element Plus + ECharts CDN）：模板/样式/JS 拆分为 admin/static 目录，由 main.js 运行时加载 | **修改 2026-08-02** |

### API 路由层 `API/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `auth.js` | 认证路由：发送验证码、登录、获取/更新用户信息 | — |
| `POSTbook.js` | 教材上传+状态查询+PDF页数预检路由（新增 check-pdf-pages） | **修改 2026-08-01** |
| `billing.js` | 账单查询路由：GET /api/v1/billing 返回用户 VIP 等级、余额、扣费记录分页列表（需 Token），新增 balanceLocked 字段 | **修改 2026-07-31** |
| `redeem.js` | 兑换码兑换路由：POST /api/v1/redeem 用户输入兑换码兑换余额（需 Token），Prisma事务保证原子性，频率限制每用户每小时3次 | **新建 2026-07-31** |
| `admin.js` | 管理员 API 路由聚合器：统一双重鉴权（URL后缀 + JWT管理员角色），挂载 API/admin/ 下 6 个功能子路由（兑换码/用户/账单/统计/安全/配置） | **修改 2026-08-02** |
| `recharge.js` | ~~充值路由（已被 redeem.js 替换，路由已从 app.js 移除，文件保留）~~ | ~~2026-07-31~~ |
| `book.js` | 教材 CRUD 路由：列表/详情（已实现），更新/删除（待实现） | 2026-07-06 |
| `progress.js` | 学习进度路由：PUT 保存进度（需 Token，支持 studyDuration 增量学习时长）、GET 获取进度（需 Token，支持单课程/全部），保存后自动记录每日活动 | **修改 2026-07-29** |
| `stats.js` | 统计数据路由：GET /api/v1/stats 聚合返回首页 4 项统计指标（学习时长/已完成章节/正确率/连续天数） | **新建 2026-07-29** |
| `book/generate-next-chapter.js` | 下一章生成 + 章节进度查询 + "生成下一章"按钮状态查询路由（含完整 OpenAPI 注解） | **修改 2026-08-03** |
| `book/fix-missing.js` | 文件缺失补全路由：POST 触发补全 / GET 查询补全状态（含完整 OpenAPI JSDoc） | **新建 2026-07-28** |
| `quiz/session.js` | 刷题会话路由：随机刷题（random-sessions）和顺序刷题（sequential-sessions）的完整 CRUD，含断点续做、进度保存、交卷，含完整 @openapi JSDoc 注释 | **修改 2026-07-30** |
| `quiz/textbooks.js` | 题库管理路由：列表/详情/删除/共享切换 | **修改 2026-07-30** |
| `quiz/market.js` | 题库市场路由：市场列表/详情/借用/取消借用（4个端点，含 @openapi 注释） | **新建 2026-07-30** |
| `quiz/detail.js` | 题库详情路由：题库统计查询 + 基于试卷的顺序/随机刷题会话创建（3个端点，含 @openapi 注释） | **新建 2026-07-30** |
| `quiz/import.js` | 题库导入路由：JSON 格式导入 | — |
| `quiz/pdf2quiz.js` | PDF 题库导入路由：上传 PDF → doc2x 转换 MD → 创建 MD→JSON 任务，新增余额前置校验 | **修改 2026-07-31** |
| `quiz/format-text.js` | AI 文本格式化路由：`POST /api/v1/quiz/format-text`，新增余额前置校验 + 后置锁定检查 | **修改 2026-07-31** |
| `quiz/report.js` | 刷题报告路由：报告列表/详情/SSE 实时进度 | — |
| `quiz/wrongbook.js` | 错题本路由：错题概览/复习会话 | — |
| `quiz/md2json.js` | MD→JSON 任务路由：创建/查询/列表 MD→JSON 生成任务，新增余额前置校验 | **修改 2026-07-31** |

### 中间件 `middleware/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `auth.js` | JWT Bearer Token 验证中间件，将 userId 注入 req 对象 | — |
| `admin.js` | 管理员双重鉴权中间件：第一层URL后缀校验(不匹配404伪装) + 第二层JWT+角色验证(role='admin') | **新建 2026-07-31** |

### Service 服务层 `service/`
| 文件/目录 | 用途 | 上次修改 |
|------|------|---------|
| `auth/index.js` | 认证服务统一入口 | — |
| `auth/login.js` | 验证码登录/注册逻辑 | — |
| `auth/otp.js` | 邮箱验证码发送与频率限制 | — |
| `auth/profile.js` | 用户信息查询与更新，返回结构含 vipLevel、balance、plan 字段 | **修改 2026-07-29** |
| `POSTbook.js` | 教材上传+格式归一化（PDF/Word/MD/ZIP→MD） | — |
| `course_pipeline.js` | 课程生成6阶段流水线 + 文件缺失补全（`fixMissingFilesForChapter()` + 内存去重Map），新增 AI 行号校验 + 416 无更多内容处理，导出 `pipeline()`、`generateChapter()`、`fixMissingFilesForChapter()`、`getFixStatus()` | 2026-07-29 |
| `text_tts.js` | 火山引擎 TTS 语音合成+字幕生成，支持超长文本按标点无损分块合成后合并为单一 MP3/SRT（导出 `synthesize()`、`validateInput()`、`splitTextByPunctuation()`） | **修改 2026-08-01** |
| `quiz_service.js` | 刷题核心业务：会话管理（随机/顺序双模式）、题目抽样/全量取题、判题、进度保存、交卷，新增每日活动记录（非阻塞） | **修改 2026-07-30** |
| `md2quiz/` | **MD→JSON 题库生成模块**（7 个文件）：PDF-to-MD 转换、AI 无损分段、逐块处理、答案归一化与合并、结果校验与入库 | **修改 2026-07-30** |
| `md2quiz/task-runner.js` | 核心执行器：分块→流式调用 DeepSeek→校验→合并题目答案→入库。导出 mergeResults（含题型前缀匹配）和 normalizeAnswerFromRaw，新增后置余额锁定检查 | **修改 2026-07-31** |
| `md2quiz/quiz-chunk-processor.js` | 分块内容处理器：逐块调用 AI 格式化，按 type 分类收集 questions/answers/complete/none | 2026-07-30 |
| `md2quiz/quiz-splitter.js` | AI 无损分段器：循环提取 1000 行，调用 AI 判断语义边界（maxLine），防止截断题目 | 2026-07-30 |
| `md2quiz/result-validator.js` | AI 输出校验器：校验 JSON 结构、题型合法性、数量配额匹配 | 2026-07-30 |
| `md2quiz/deepseek-client.js` | DeepSeek 流式客户端：fetch + ReadableStream reader 处理 SSE 流式响应 | 2026-07-30 |
| `md2quiz/pdf-to-md.js` | PDF-to-MD 转换器：Doc2x API → zip 下载 → 7z 解压提取 MD → 清理 | 2026-07-30 |
| `md2quiz/task-service.js` | 任务服务：创建/查询/列出 MD-to-JSON 任务，预创建 QuizTextbook + QuizExam | 2026-07-30 |
| `md2quiz/task-store.js` | 任务存储模块：内存 Map + 防抖 JSON 文件持久化 + 服务重启恢复 | 2026-07-30 |
| `md2quiz/task-stream-broker.js` | SSE 广播器：管理任务状态快照的订阅/取消订阅/广播 | 2026-07-30 |
| `md2quiz/types.js` | 类型定义：JSDoc 类型注释（TaskEntity、QuestionRecord、GenerationConfig） | 2026-07-30 |

### Repository 数据访问层 `utils/repo/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `book_repo.js` | Course 表 CRUD：创建/查询/列表/更新/软删除 | — |
| `chapter_repo.js` | Chapter 表 CRUD：创建/查询/列表/更新/软删除，新增 `updateChapterProgress()` 和 `incrementChapterProgress()` | 2026-07-25 |
| `user_repo.js` | User 表查询操作，新增余额操作函数：deductBalance / setBalanceLocked / getBalanceState | **修改 2026-07-31** |
| `progress_repo.js` | UserStudyRecord 表 CRUD：upsertProgress（支持 studyDuration 增量累加）、getProgress、getAllProgress | **修改 2026-07-29** |
| `stats_repo.js` | 统计数据查询仓库：getTotalStudyDuration、getCompletedChapters、getQuizAccuracy、getConsecutiveDays | **新建 2026-07-29** |
| `activity_repo.js` | 每日活动记录仓库：recordDailyActivity（upsert 模式，联合唯一约束防止重复） | **新建 2026-07-29** |
| `quiz_repo.js` | 题库数据访问层：题库 CRUD、共享管理（toggleShare/listMarket/borrow/unborrow）、会话管理（含 findActiveRandomSession / findActiveSequentialSession）、作答记录、错题本、报告 | **修改 2026-07-30** |
| `update_repo.js` | 流水线进度更新封装 | — |

### 工具模块 `utils/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `prisma.js` | Prisma Client 单例 | — |
| `jwt.js` | JWT Token 生成/验证/提取 | — |
| `doc2x.js` | Doc2x API（PDF→Markdown）封装，支持返回页数用于计费，导出 `getPdfPageCountLocally` 纯本地页数统计函数 | **修改 2026-08-01** |
| `extract_zip.js` | ZIP/RAR/7Z 解压工具 | — |
| `extractor_md.js` | Markdown 文本提取器 | — |
| `line_indexer.js` | 行号索引器 | — |
| `get_line.js` | AI 章节行号识别（DeepSeek 小模型） | 2026-07-20 |
| `generate_outline.js` | AI 大纲生成（DeepSeek 大模型 + thinking，PIC 格式含图片描述） | 2026-07-25 |
| `elaboration.js` | AI 文本细化/口播稿扩写（DeepSeek v4-flash） | 2026-07-23 |
| `htmlppt.js` | AI HTML PPT 生成（DeepSeek 大模型，支持图片 URL + 描述输入） | 2026-07-25 |
| `create_title.js` | AI 标题生成（DeepSeek 小模型） | 2026-07-20 |
| `upload_minio.js` | MinIO 文件上传封装 | — |
| `input_validator.js` | 输入参数校验工具 | — |
| `create_image.js` | 文生图模块（Grsai gpt-image-2 API 异步模式 + 轮询） | 2026-07-09 |
| `billing.js` | 计费模块：LLM Token / 文生图 / TTS / doc2x 统一计费，售价+成本双轨记账（成本来自 model_cost_config.json，利润=售价-成本），自动扣减用户余额（调用 balance.js） | **修改 2026-08-02** |
| `billing_config.js` | 计费配置工具：售价/成本两套配置共用的 JSON 读取、时段匹配、取价、金额取整 | **新建 2026-08-02** |
| `billing_cost.js` | 模型成本计算：按 model_cost_config.json 计算 LLM/文生图/TTS/doc2x 的成本单价/分项/总额，缺失时回退售价 | **新建 2026-08-02** |
| `balance.js` | 余额管理模块：统一管理余额检查（checkCanUseAI）、原子扣减（deductBalance）、锁定/解锁（lockUserIfNegative / unlockUserOnRecharge），是所有 AI 消费操作的安全边界 | **新建 2026-07-31** |
| `can_generate_next.js` | 统一判断函数：根据课程状态+章节列表计算是否可生成下一章 | 2026-07-29 |

### 数据库
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `prisma/schema.prisma` | Prisma ORM 数据库模型定义（User/Course/Chapter/UserStudyRecord/UserDailyActivity/QuizTextbook+isShared/QuizBookBorrow/QuizExam/QuizQuestion/QuizSession/QuizReport/QuizReportItem/QuizWrongQuestion/QuizUserAnswer/billing_record） | **修改 2026-07-30** |
| `prisma/migrations/` | 数据库迁移脚本（20260704072148_init → User 表；20260709105504_add_course_and_chapter → Course/Chapter 表；20260709_add_subtitle_to_course → Course.subtitle；20260724_add_user_study_record → UserStudyRecord 表；20260725_add_chapter_generation_progress → Chapter.generation_progress；20260729_add_user_daily_activity → UserDailyActivity 表；20260729_add_quiz_generating_task_id → QuizTextbook.generating_task_id；20260730_add_quiz_is_shared_and_borrow → QuizTextbook.is_shared + QuizBookBorrow 表） | **修改 2026-07-30** |

### 配置 `config/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `index.js` | 统一配置加载（含 API Key 校验 + DeepSeek 超时常量） | 2026-07-20 |
| `swagger.js` | OpenAPI 3.0 规范定义 | — |
| `deepseek_config.json` | DeepSeek API 配置 | — |
| `model_cost_config.json` | 模型成本价配置（与 billing_pricing.json 售价配置结构一致，独立调整；利润=售价-成本） | **新建 2026-08-02** |
| `doc2x_config.json` | Doc2x API 配置 | — |
| `minio_config.json` | MinIO 对象存储配置 | — |
| `volcengine_config.json` | 火山引擎 TTS 配置 | — |
| `grsai_config.json` | Grsai 文生图 API 配置（base URL、model、轮询参数） | 2026-07-09 |
| `outline_prompt.txt` | AI 大纲生成提示词 | — |
| `getline_prompt.txt` | AI 行号识别提示词 | — |
| `elaboration_prompt.txt` | AI 文本细化提示词 | — |
| `html_ppt_prompt.txt` | AI PPT 生成提示词 | — |
| `quiz-format-prompt.md` | MD→JSON 内容格式化 prompt：5 种题型识别规则 + 4 种输出格式 + warnings 规则 | **修改 2026-07-30** |
| `quiz-split-prompt.md` | MD→JSON 分段 prompt：纯边界检测，AI 只返回 maxLine | 2026-07-30 |
| `quiz-format-text-prompt.md` | 文本粘贴导入专用 Prompt：6 条核心规则 + 6 种常见文本格式识别模式 + 注意事项 | **新建 2026-07-30** |
| `admin_config.json` | 管理员配置：安全后缀存储（不提交到版本控制），由管理员页面动态修改 | **新建 2026-07-31** |

## 前端 `WEB/` 主要文件

| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `src/api/auth.js` | 认证 API 封装（登录/注册/用户信息） | — |
| `src/api/quiz.js` | 题库/刷题 API 封装：题库 CRUD、共享管理（市场列表/借用/取消借用/共享切换）、随机/顺序刷题会话、报告、错题本、AI 文本格式化 | **修改 2026-07-30** |
| `src/api/books.js` | 教材 API 封装（上传/列表/详情/状态/进度/章节幻灯片/PDF页数预检/生成下一章状态查询） | **修改 2026-08-03** |
| `src/api/progress.js` | 学习进度 API 封装（保存/获取单课程/获取全部，saveProgress 新增 studyDuration 参数） | **修改 2026-07-29** |
| `src/api/stats.js` | 首页统计数据 API 封装（getStats） | **新建 2026-07-29** |
| `src/api/client.js` | Axios 实例（baseURL/interceptors/Token 注入） | — |
| `src/pages/login/index.vue` | 登录页面模板 — NERV 双栏布局 | 2026-07-23 |
| `src/pages/login/script.js` | 登录页面逻辑 | 2026-07-23 |
| `src/pages/home/index.vue` | 首页模板 — NERV 蓝色战术风格，4 个统计卡片改为数据绑定（学习时长/已完成章节/正确率/连续天数），新增顺序刷题事件绑定 + 文本导入按钮 | **修改 2026-07-30** |
| `src/pages/home/script.js` | 首页业务逻辑：课程加载/上传/删除，底部加载更多，新增 navigateToRedeem | **修改 2026-07-31** |
| `src/pages/study/index.vue` | 课程学习页模板 — NERV 三栏可拖动布局，PPT iframe 改用固定 1920×1080 + transform scale 缩放渲染 | 2026-07-29 |
| `src/pages/study/script.js` | 课程学习页逻辑（含播放控制、章节导航、SRT 字幕、学习进度、下一章生成三态轮询、PPT 缩放渲染、学习时长追踪与上报等；修复恢复进度后进度条显示 00:00） | **修改 2026-08-03** |
| `src/stores/auth.js` | Pinia 认证状态管理 | — |
| `src/composables/useTheme.js` | 暗黑模式切换逻辑 | — |
| `src/composables/useResize.js` | 侧边栏拖动调整宽度 composable | 2026-07-23（新增） |
| `src/components/CourseCard.vue` | 教材卡片组件 | — |
| `src/components/UploadBookDialog.vue` | 上传教材弹窗（PDF页数预检 + 模式选择 + 拖拽上传 + AI模型/文本细化开关） | **修改 2026-08-01** |
| `src/components/HomeSidebar.vue` | 首页侧边栏 — NERV 蓝色战术风格导航，新增兑换码福利弹窗，新增"题库市场"入口 | **修改 2026-07-31** |
| `src/components/HomeTopbar.vue` | 首页顶部栏 — 搜索框、主题切换、用户头像 | — |
| `src/components/CourseCard.vue` | 教材卡片 — 封面、进度条、AI 生成状态指示器、三点操作菜单 | 2026-07-20 |
| `src/components/QuizTextbookCard.vue` | 题库卡片 — 题目/试卷统计、生成进度条、三点菜单（删除/共享切换）、借用/共享标签 | **修改 2026-07-30** |
| `src/components/ImportQuizDialog.vue` | 题库导入弹窗（PDF/MD/JSON/格式化四Tab） | — |
| `src/pages/quiz/index.vue` | 刷题页模板 — 题目区+答题卡+底部导航 | — |
| `src/pages/quiz/script.js` | 刷题页业务逻辑：随机/顺序双模式适配、会话加载、作答保存、交卷 | **修改 2026-07-30** |
| `src/pages/quiz/report.vue` | 刷题报告页模板 — 分数环+答题卡+详情 | — |
| `src/pages/quiz/report-script.js` | 报告页逻辑：SSE 实时判题进度 | — |
| `src/pages/market/index.vue` | 题库市场页面 — 卡片网格布局，搜索/分页/借用按钮 | **修改 2026-07-30** |
| `src/pages/market/script.js` | 市场页面业务逻辑：列表加载、搜索、分页、借用操作 | **修改 2026-07-30** |
| `src/pages/quiz-detail/index.vue` | 题库详情页模板 — 题库信息/统计卡片/试卷列表/刷题入口 | **新建 2026-07-30** |
| `src/pages/quiz-detail/script.js` | 详情页业务逻辑：数据加载、SVG环形正确率图、试卷维度刷题 | **新建 2026-07-30** |
| `src/pages/quiz-import/index.vue` | 文本粘贴导入题库页模板 — 双栏布局（左文本输入 + 右可编辑题目卡片），顶部工具栏（返回+题名称+试卷名称+导入按钮） | **新建 2026-07-30** |
| `src/pages/quiz-import/script.js` | 文本导入页业务逻辑：AI 格式化调用、题目编辑、题型切换联动、删除题目、批量导入 | **新建 2026-07-30** |
| `src/pages/redeem/index.vue` | 兑换码领取页面 — 居中卡片布局，输入兑换码兑换余额，含格式校验、成功提示 | **新建 2026-07-31** |
| `src/api/redeem.js` | 兑换码 API 封装 — redeemCode(code) | **新建 2026-07-31** |
| `src/api/billing.js` | 账单 API 封装 — getBilling（移除旧 recharge 函数） | **修改 2026-07-31** |
| `src/styles/index.css` | 全局样式（Tailwind + NERV 装饰元素） | 2026-07-23 |
| `src/styles/tokens.css` | 设计令牌（NERV 蓝色战术色彩体系） | 2026-07-23 |
| `src/utils/storage.js` | 本地存储工具（Token 持久化） | — |
| `src/App.vue` | 根组件 — 七页导航（home/study/quiz/billing/quiz-detail/profile/redeem/quiz-import） | **修改 2026-07-31** |
| `src/main.js` | 前端入口 | — |
| `start.ps1` | 前端启动脚本 | — |
| `vite.config.js` | Vite 构建配置 | — |
| `index.html` | HTML 入口 | — |

