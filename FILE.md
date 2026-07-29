# 文件索引（FILE.md）

## 项目概述
金茂教材处理系统 — 用户上传教材文件，AI 自动生成带 PPT/语音/字幕的互动课程。

## 根目录文件

| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `start.ps1` | 项目快速启动脚本 | — |
| `pack.ps1` | 打包脚本（排除 node_modules/日志，生成 jinmao.zip 用于宝塔部署） | 2026-07-09 |
| `ftp_upload.ps1` | FTP 快速上传脚本（跳过打包解压，直接覆盖上传到服务器） | 2026-07-09 |
| `sync_wsl.ps1` | WSL 自动同步脚本（rsync → deps → build → restart，一键更新 WSL 中的项目） | 2026-07-06 |
| `IDEA.md` | 项目创意/设计文档 | — |
| `API文档.md` | API 接口文档 | — |
| `minio文件结构.md` | MinIO 对象存储文件组织设计 | — |
| `数据库结构.md` | 数据库设计文档（6张表规划） | — |
| `流水线.md` | 课程生成流水线设计文档 | — |
| `开发日志.md` | 开发变更记录 | 2026-07-29 |
| `WSL部署指南.md` | AI 智能体 WSL 部署操作指南（含前置检查、环境安装、数据库初始化、服务启动/重启/验证） | 2026-07-06 |
| `宝塔部署指南.md` | 宝塔面板3步快速部署指南（上传 → setup.sh → 添加Node项目） | 2026-07-09 |
| `待办.md` | 待办事项 | — |
| `测试命令.md` | 测试命令参考 | — |
| `测试报告.md` | 测试结果报告 | — |

## 后端 `node-jinmao/` 主要文件

### 入口文件
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `app.js` | Express 服务器入口（端口8888），挂载路由和中间件，含启动前自检 + 基于版本号的自动 Prisma migrate/generate | 2026-07-24 |
| `.migration_version` | 运行时版本记录文件（JSON），记录上次成功迁移对应的 package.json 版本号，由 app.js 启动流程自动维护 | 2026-07-10 |
| `setup.sh` | 宝塔部署一键初始化脚本（检查环境、安装依赖、初始化DB、构建前端） | 2026-07-09 |
| `ecosystem.config.js` | PM2 进程管理配置（宝塔PM2管理器可识别） | 2026-07-09 |

### API 路由层 `API/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `auth.js` | 认证路由：发送验证码、登录、获取/更新用户信息 | — |
| `POSTbook.js` | 教材上传+状态查询路由 | — |
| `book.js` | 教材 CRUD 路由：列表/详情（已实现），更新/删除（待实现） | 2026-07-06 |
| `progress.js` | 学习进度路由：PUT 保存进度（需 Token）、GET 获取进度（需 Token，支持单课程/全部） | **新建 2026-07-24** |
| `book/generate-next-chapter.js` | 下一章生成 + 章节进度查询路由，新增课程已完成状态双重检查 | **2026-07-29** |
| `book/fix-missing.js` | 文件缺失补全路由：POST 触发补全 / GET 查询补全状态（含完整 OpenAPI JSDoc） | **新建 2026-07-28** |

### 中间件 `middleware/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `auth.js` | JWT Bearer Token 验证中间件，将 userId 注入 req 对象 | — |

### Service 服务层 `service/`
| 文件/目录 | 用途 | 上次修改 |
|------|------|---------|
| `auth/index.js` | 认证服务统一入口 | — |
| `auth/login.js` | 验证码登录/注册逻辑 | — |
| `auth/otp.js` | 邮箱验证码发送与频率限制 | — |
| `auth/profile.js` | 用户信息查询与更新 | — |
| `POSTbook.js` | 教材上传+格式归一化（PDF/Word/MD/ZIP→MD） | — |
| `course_pipeline.js` | 课程生成6阶段流水线 + 文件缺失补全（`fixMissingFilesForChapter()` + 内存去重Map），新增 AI 行号校验 + 416 无更多内容处理，导出 `pipeline()`、`generateChapter()`、`fixMissingFilesForChapter()`、`getFixStatus()` | 2026-07-29 |
| `text_tts.js` | 火山引擎 TTS 语音合成+字幕生成 | — |

### Repository 数据访问层 `utils/repo/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `book_repo.js` | Course 表 CRUD：创建/查询/列表/更新/软删除 | — |
| `chapter_repo.js` | Chapter 表 CRUD：创建/查询/列表/更新/软删除，新增 `updateChapterProgress()` 和 `incrementChapterProgress()` | 2026-07-25 |
| `user_repo.js` | User 表查询操作 | — |
| `progress_repo.js` | UserStudyRecord 表 CRUD：upsertProgress、getProgress、getAllProgress | **新建 2026-07-24** |
| `update_repo.js` | 流水线进度更新封装 | — |

### 工具模块 `utils/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `prisma.js` | Prisma Client 单例 | — |
| `jwt.js` | JWT Token 生成/验证/提取 | — |
| `doc2x.js` | Doc2x API（PDF→Markdown）封装 | — |
| `extract_zip.js` | ZIP/RAR/7Z 解压工具 | — |
| `extractor_md.js` | Markdown 文本提取器 | — |
| `line_indexer.js` | 行号索引器 | — |
| `get_line.js` | AI 章节行号识别（DeepSeek 小模型） | 2026-07-20 |
| `generate_outline.js` | AI 大纲生成（DeepSeek 大模型 + thinking，PIC 格式含图片描述） | 2026-07-25 |
| `elaboration.js` | AI 文本细化/口播稿扩写（DeepSeek v4-flash） | 2026-07-23 |
| `htmlppt.js` | AI HTML PPT 生成（DeepSeek 大模型，支持图片 URL + 描述输入） | 2026-07-25 |
| `create_title.js` | AI 标题生成（DeepSeek 小模型） | 2026-07-20 |
| `upload_minio.js` | MinIO 文件上传封装 | — |
| `word2pdf.js` | Word→PDF 转换（LibreOffice） | — |
| `input_validator.js` | 输入参数校验工具 | — |
| `create_image.js` | 文生图模块（Grsai gpt-image-2 API 异步模式 + 轮询） | 2026-07-09 |

### 数据库
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `prisma/schema.prisma` | Prisma ORM 数据库模型定义（User/Course/Chapter/UserStudyRecord，Chapter 新增 `generation_progress` 字段） | 2026-07-25 |
| `prisma/migrations/` | 数据库迁移脚本（20260704072148_init → User 表；20260709105504_add_course_and_chapter → Course/Chapter 表；20260709_add_subtitle_to_course → Course.subtitle；20260724_add_user_study_record → UserStudyRecord 表；20260725_add_chapter_generation_progress → Chapter.generation_progress） | 2026-07-25 |

### 配置 `config/`
| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `index.js` | 统一配置加载（含 API Key 校验 + DeepSeek 超时常量） | 2026-07-20 |
| `swagger.js` | OpenAPI 3.0 规范定义 | — |
| `deepseek_config.json` | DeepSeek API 配置 | — |
| `doc2x_config.json` | Doc2x API 配置 | — |
| `minio_config.json` | MinIO 对象存储配置 | — |
| `volcengine_config.json` | 火山引擎 TTS 配置 | — |
| `grsai_config.json` | Grsai 文生图 API 配置（base URL、model、轮询参数） | 2026-07-09 |
| `outline_prompt.txt` | AI 大纲生成提示词 | — |
| `getline_prompt.txt` | AI 行号识别提示词 | — |
| `elaboration_prompt.txt` | AI 文本细化提示词 | — |
| `html_ppt_prompt.txt` | AI PPT 生成提示词 | — |

## 前端 `WEB/` 主要文件

| 文件 | 用途 | 上次修改 |
|------|------|---------|
| `src/api/auth.js` | 认证 API 封装（登录/注册/用户信息） | — |
| `src/api/books.js` | 教材 API 封装（上传/列表/详情/状态/进度/章节幻灯片，新增 `generateNextChapter()` 和 `getChapterGenerationProgress()`） | 2026-07-25 |
| `src/api/progress.js` | 学习进度 API 封装（保存/获取单课程/获取全部） | **新建 2026-07-24** |
| `src/api/client.js` | Axios 实例（baseURL/interceptors/Token 注入） | — |
| `src/pages/login/index.vue` | 登录页面模板 — NERV 双栏布局 | 2026-07-23 |
| `src/pages/login/script.js` | 登录页面逻辑 | 2026-07-23 |
| `src/pages/home/index.vue` | 首页模板 — NERV 蓝色战术风格 | 2026-07-23 |
| `src/pages/home/script.js` | 首页业务逻辑 | 2026-07-23 |
| `src/pages/study/index.vue` | 课程学习页模板 — NERV 三栏可拖动布局，PPT iframe 改用固定 1920×1080 + transform scale 缩放渲染 | 2026-07-29 |
| `src/pages/study/script.js` | 课程学习页逻辑（含播放控制、章节导航、SRT 字幕、学习进度、下一章生成、PPT 缩放渲染等） | 2026-07-29 |
| `src/stores/auth.js` | Pinia 认证状态管理 | — |
| `src/composables/useTheme.js` | 暗黑模式切换逻辑 | — |
| `src/composables/useResize.js` | 侧边栏拖动调整宽度 composable | 2026-07-23（新增） |
| `src/components/CourseCard.vue` | 教材卡片组件 | — |
| `src/components/HomeSidebar.vue` | 首页侧边栏 — NERV 蓝色状态轨 | 2026-07-23 |
| `src/components/HomeTopbar.vue` | 首页顶栏 — NERV 蓝色标签风格 | 2026-07-23 |
| `src/components/UploadBookDialog.vue` | 上传教材弹窗 | — |
| `src/styles/index.css` | 全局样式（Tailwind + NERV 装饰元素） | 2026-07-23 |
| `src/styles/tokens.css` | 设计令牌（NERV 蓝色战术色彩体系） | 2026-07-23 |
| `src/utils/storage.js` | 本地存储工具（Token 持久化） | — |
| `src/App.vue` | 根组件 — 三页导航 | 2026-07-23 |
| `src/main.js` | 前端入口 | — |
| `start.ps1` | 前端启动脚本 | — |
| `vite.config.js` | Vite 构建配置 | — |
| `index.html` | HTML 入口 | — |
