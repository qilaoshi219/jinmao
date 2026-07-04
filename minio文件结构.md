# MinIO 文件结构规范

> 本文档定义项目中所有文件在 MinIO 对象存储上的目录结构和命名规范。

---

## 完整目录树

```
/usercourse/{userid}/{bookid}/
├── 源文件.pdf                           # 用户上传的原始文件
│                                         （支持 pdf / docx / doc / md / zip / rar / 7z）
├── {文件名}-{时间戳}-{6位随机数}/         # 格式归一后的产物目录
│   ├── {文件名}.md                       # 归一化后的 Markdown 原文
│   └── image/                            # 教材插图（doc2x 转换时自动提取）
│       ├── image_001.jpg
│       ├── image_002.jpg
│       └── ...
└── {courseid}/                           # 课程目录（courseid = 章节编号，一个 book 可含多个章节）
    ├── {courseid}.json                   # 课程结构化 JSON
    │                                      内容：章节标题、slides 数组
    │                                      每张 slide 含口播稿、PPT 指引、助教提示等
    │                                      生成脚本：/utils/generate_course.js
    ├── PPT/                              # HTML 格式的 PPT 幻灯片
    │   ├── {pptid_1}.html                #   每张幻灯片一个独立 HTML 文件
    │   ├── {pptid_2}.html                #   生成脚本：/utils/htmlppt.js
    │   └── ...
    ├── Audio/                            # MP3 口播语音
    │   ├── {audioid_1}.mp3               #   每张幻灯片一个 MP3
    │   ├── {audioid_2}.mp3               #   生成脚本：/service/text_tts.js
    │   └── ...
    └── SRT/                              # SRT 字幕文件
        ├── {srtid_1}.srt                 #   每张幻灯片一个 SRT
        ├── {srtid_2}.srt                 #   生成脚本：/service/text_tts.js
        └── ...

/bank/{bankid}/
├── 源文件.pdf                            # 用户上传的原始文件，可选（部分题库来源于教材，无源文件）
│                                         （支持 pdf / docx / doc / md / zip / rar / 7z）
├── {文件名}-{时间戳}/                     # 格式归一后的产物目录，可选
│   ├── {文件名}.md                       #   归一化后的 Markdown 原文
│   └── image/                            #   题目插图（doc2x 转换时自动提取）
│       ├── image_001.jpg
│       ├── image_002.jpg
│       └── ...
├── export/                               # 题库导出目录
│   ├── export_{时间戳}_{6位随机数}.md     #   Markdown 格式导出
│   ├── export_{时间戳}_{6位随机数}.docx   #   Word 格式导出
│   └── ...
└── ...
```

---

## 各目录说明

| 路径 | 类型 | 生成阶段 | 负责脚本 |
|------|------|----------|----------|
| `/usercourse/{userid}/{bookid}/源文件.xxx` | 原始文件 | 上传 | `POSTbook.js` |
| `/usercourse/{userid}/{bookid}/{文件名}-{时间戳}/` | 归一产物 | 格式转换 | `POSTbook.js` → doc2x / extract_zip / upload_minio |
| `/usercourse/{userid}/{bookid}/{courseid}/` | 课程目录 | 流水线 | `course_pipeline.js` |
| `/usercourse/{userid}/{bookid}/{courseid}/PPT/` | HTML PPT | Phase 4 | `/utils/htmlppt.js` |
| `/usercourse/{userid}/{bookid}/{courseid}/Audio/` | MP3 语音 | Phase 5 | `/service/text_tts.js` |
| `/usercourse/{userid}/{bookid}/{courseid}/SRT/` | SRT 字幕 | Phase 5 | `/service/text_tts.js` |
| `/bank/{bankid}/` | 题库根目录 | 上传 | `POSTbank.js` |
| `/bank/{bankid}/export/` | 题库导出 | 导出 | `/utils/export_bank.js` |

## 命名规则

- **{userid}** — 用户唯一标识
- **{bookid}** — 教材/书籍唯一标识
- **{bankid}** — 题库唯一标识
- **{courseid}** — 章节编号（如 `chapter_01`）
- **{pptid} / {audioid} / {srtid}** — 幻灯片编号（如 `slide_01`），三者一一对应
- **{时间戳}** — 格式 `YYYYMMDDTHHmmss`（如 `20260703T120000`）
- **{6位随机数}** — 6 位大小写字母+数字随机串（如 `Ab3Xz9`），防同名覆盖
- **{文件名}-{时间戳}** — 格式归一目录（如 `闸门运行工教材_20260703T120000`）
- **{文件名}-{时间戳}-{6位随机数}** — 教材归一目录含随机数版本（如 `闸门运行工教材_20260703T120000_Ab3Xz9`）
