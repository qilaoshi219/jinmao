//本脚本负责接受用户POST来的课程文件，文件格式包括pdf,docx,doc,md,zip,rar,7z
//POST /api/v1/book/upload
//本脚本返回是否成功接收文件
//收到文件后将源文件保存到minio存储中(/utils/upload_minio.js脚本)
//将返回的url增加到数据库(/utils/repo/update_repo.js脚本)
//如果是md格式，就直接按照文件夹结构上传到minio存储中(/utils/upload_minio.js脚本)
//如果是zip,rar,7z格式，就发送给解压脚本(/utils/extract_zip.js脚本)，解压完成后发送给上传脚本进行上传到minio存储中(/utils/upload_minio.js脚本)
//如果是pdf格式，发送给doc2x脚本(/utils/doc2x.js脚本)，转换为md格式压缩包，发送给解压脚本(/utils/extract_zip.js脚本)，解压完成后发送给上传脚本进行上传到minio存储中(/utils/upload_minio.js脚本)
//如果是docx，doc格式，先发送给word2pdf脚本(/utils/word2pdf.js脚本)，转换为pdf后发送给doc2x脚本转换为md格式压缩包，然后发送给解压脚本(/utils/extract_zip.js脚本)，解压完成后发送给上传脚本进行上传到minio存储中(/utils/upload_minio.js脚本)
//文件上传完成后，进行格式审查和内容审查，确保 MinIO 上的文件夹结构符合以下规范：
//
// /{userid}/{bookid}/
// │
// ├── 源文件.pdf          ← 用户上传的原始文件（pdf/docx/doc/md/zip/rar/7z）
// │
// ├── {文件名}-{时间戳}/   ← 格式归一后的产物目录（doc2x 转换 + 解压后的结果）
// │   ├── {文件名}.md      ← 归一化后的 Markdown 原文
// │   └── image/           ← 教材中的插图（doc2x 转换时提取）
// │       ├── image_001.jpg
// │       ├── image_002.jpg
// │       └── ...
// │（以上为本脚本应该生成的，以下为其他脚本生成的）
// └── {courseid}/          ← 课程目录（courseid = 章节编号，一个 book 可有多个章节）
//     │
//     ├── {courseid}.json  ← 课程结构化 JSON（/utils/generate_course.js 生成）
//     │                       包含章节标题、slides 数组（每张幻灯片的口播稿、PPT 指引、助教提示等）
//     │
//     ├── PPT/             ← HTML 格式的 PPT 幻灯片
//     │   ├── {pptid_1}.html
//     │   ├── {pptid_2}.html
//     │   └── ...          ← 每张幻灯片一个 HTML（/utils/htmlppt.js 生成）
//     │
//     ├── Audio/           ← MP3 口播语音
//     │   ├── {audioid_1}.mp3
//     │   ├── {audioid_2}.mp3
//     │   └── ...          ← 每张幻灯片一个 MP3（/service/text_tts.js 生成）
//     │
//     └── SRT/             ← 字幕文件
//         ├── {srtid_1}.srt
//         ├── {srtid_2}.srt
//         └── ...          ← 每张幻灯片一个 SRT（/service/text_tts.js 生成）


//需要编写的脚本有：
// /utils/word2pdf.js(转换word文件为pdf格式脚本)
// /utils/doc2x.js(转换docx文件为md格式脚本)
// /utils/extract_zip.js(解压文件脚本)
// /utils/upload_minio.js(上传文件到minio存储脚本)
// /utils/repo/update_repo.js(数据库操作脚本)
