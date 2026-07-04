# FILE.md - node-jinmao 项目文件索引

> 最后更新：2026-07-04

## 项目目录结构

```
node-jinmao/
├── app.js                          # Node.js HTTP 服务器入口
├── package.json                    # 项目依赖与脚本配置
├── package-lock.json               # 依赖锁定文件
├── .env                            # 敏感凭据配置文件（API Key 等，已被 .gitignore 忽略，禁止提交）
├── .env.example                    # 敏感凭据配置模板（可提交到版本控制，供新开发者参考）
├── .gitignore                      # Git 忽略规则
├── start.ps1                       # 快速启动脚本（Windows PowerShell）
├── API/                            # API 路由层
│   └── POSTbook.js                 # 教材上传 API 路由处理
├── config/                         # 配置目录
│   ├── index.js                    # 统一配置加载入口（合并 JSON + .env 敏感字段）
│   ├── deepseek_config.json        # DeepSeek API 模型与 Base URL 配置（非敏感）
│   ├── prompt.json                 # Prompt 文件路径映射
│   ├── volcengine_config.json      # 火山引擎 TTS 非敏感配置（RESOURCE_ID / SPEAKER / API_URL）
│   ├── outline_prompt.txt          # 大纲生成的 Prompt 模板
│   ├── getline_prompt.txt          # 行号识别的 Prompt 模板
│   ├── elaboration_prompt.txt      # 口播稿扩写细化的 Prompt 模板
│   ├── html_ppt_prompt.txt         # HTML PPT 生成的 Prompt 模板
│   └── doc2x_config.json           # Doc2x API Base URL 配置（非敏感）
├── service/                        # 服务模块目录
│   ├── course_pipeline.js          # 课程生成流水线调度服务
│   ├── POSTbook.js                 # 教材上传核心业务逻辑服务
│   └── text_tts.js                 # 火山引擎 TTS 文本转语音 + SRT 字幕生成服务
├── utils/                          # 工具模块目录
│   ├── repo/                       # 数据库操作子模块
│   │   └── update_repo.js          # 通用数据库 CRUD 操作封装
│   ├── doc2x.js                    # PDF 文件转 Markdown 压缩包（调用 Doc2x API v2）
│   ├── elaboration.js              # 调用 DeepSeek 大模型对口播稿进行扩写细化（仅返回数据，不写文件）
│   ├── extract_zip.js              # 解压压缩包（.zip / .rar / .7z）
│   ├── extractor_md.js             # 从 Markdown 文件中按行号范围提取文本内容
│   ├── generate_outline.js         # 调用 DeepSeek 生成 PPT 大纲（仅返回数据，不写文件）
│   ├── get_line.js                 # 将已编号文本发送给 DeepSeek 小模型，识别章节起止行号（返回 JSON 字符串）
│   ├── htmlppt.js                  # 将 PPT 生成指引转换为互动式 HTML PPT（调用 DeepSeek 大模型）
│   ├── line_indexer.js             # 给 Markdown 文本每一行添加行号索引
│   ├── upload_minio.js             # 上传文件到 MinIO 对象存储
│   └── word2pdf.js                 # Word 文件转 PDF 格式
├── tools/                          # 外部工具目录
│   └── 7z/                         # 7-Zip 命令行工具（7za.exe）
```

## 文件说明

| 文件名 | 用途 | 最后修改 |
|--------|------|----------|
| `app.js` | Node.js HTTP 服务器，监听 8888 端口，返回简单 HTML 响应（当前为演示状态） | 2026-07-02 |
| `package.json` | 定义项目名、依赖（openai SDK）、启动脚本 | 2026-07-02 |
| `API/POSTbook.js` | 教材上传 API 路由处理，接收 POST 请求，调用 service 层和 utils 层完成上传流程 | 2026-07-02 |
| `config/index.js` | 统一配置加载入口，读取各 JSON 配置并用 process.env 注入敏感字段，导出 `{ deepseek, doc2x, volcengine }` | 2026-07-04 |
| `config/deepseek_config.json` | 存储 DeepSeek API 的 Base URL 和模型名称（API Key 已迁移到 .env） | 2026-07-04 |
| `config/prompt.json` | 映射 Prompt 模板文件路径 | 2026-07-02 |
| `config/outline_prompt.txt` | 大纲生成的 System Prompt 模板，含 `{{yuanwen}}` 和 `{{pptother}}` 占位符 | 2026-07-02 |
| `config/getline_prompt.txt` | 行号识别的 System Prompt 模板，指导 DeepSeek 分析已编号文本并返回章节起止行号 | 2026-07-02 |
| `config/elaboration_prompt.txt` | 口播稿扩写细化的 System Prompt 模板，含 `{{elaboration}}`、`{{original}}`、`{{expected_words}}` 占位符 | 2026-07-02 |
| `config/html_ppt_prompt.txt` | HTML PPT 生成的 System Prompt 模板，含 `{{pptGuide}}`、`{{originalText}}`、`{{imageUrls}}` 占位符 | 2026-07-02 |
| `config/doc2x_config.json` | Doc2x API Base URL 配置（API Key 已迁移到 .env） | 2026-07-04 |
| `config/volcengine_config.json` | 存储火山引擎 TTS 非敏感配置（RESOURCE_ID、SPEAKER、API_URL），APP_ID 和 ACCESS_KEY 已迁移到 .env | 2026-07-04 |
| `service/course_pipeline.js` | 课程生成流水线调度服务，按顺序编排：大纲生成 → 行号识别 → 内容提取 → 口播稿扩写 → PPT 生成 → TTS 语音合成 | 2026-07-02 |
| `service/POSTbook.js` | 教材上传核心业务逻辑，校验文件 → 上传 MinIO → 写入数据库 → 返回结果 | 2026-07-03 |
| `service/text_tts.js` | 火山引擎 TTS 文本转语音 + SRT 字幕生成服务，输入文本返回 MP3 和 SRT 文件路径，导出 `synthesize()` 和 `validateInput()` | 2026-07-02 |
| `utils/repo/update_repo.js` | 通用数据库 CRUD 操作封装，提供增删改查方法供 API 层调用 | 2026-07-03 |
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
