// 本文件因流水线编排逻辑复杂且不可分割，特批允许超过 300 行限制

"use strict";

// ==================== 依赖导入 ====================

// Node.js 核心模块
const fs = require("fs");            // 文件系统：读写临时文件、清理临时目录
const os = require("os");            // 操作系统工具：获取临时目录路径
const path = require("path");        // 路径处理：拼接临时文件路径

// 第三方库
const Minio = require("minio");      // MinIO 客户端：从对象存储下载/上传文件
// 注意：p-queue v9+ 是纯 ESM 包，不能使用 require()，改为惰性动态 import
let _PQueue = null;
async function getPQueue() {
    if (!_PQueue) {
        _PQueue = (await import("p-queue")).default;
        console.log("[course_pipeline] p-queue 已加载（惰性加载）");
    }
    return _PQueue;
}

// Repository 数据访问层
const bookRepo = require("../utils/repo/book_repo");       // 课程 (Course) 表的 CRUD
const chapterRepo = require("../utils/repo/chapter_repo"); // 章节 (Chapter) 表的 CRUD

// 工具函数模块
const { extractLines } = require("../utils/extractor_md");         // 从 MD 文件中提取指定行范围的文本
const { addLineNumbers } = require("../utils/line_indexer");       // 给文本每行添加行号前缀
const { getLine } = require("../utils/get_line");                  // 调用 AI 识别章节起止行号
const { generateOutline } = require("../utils/generate_outline");  // 调用 AI 生成 PPT 大纲
const { elaborateText } = require("../utils/elaboration");         // 调用 AI 扩写口播稿
const { generateHtmlPpt } = require("../utils/htmlppt");           // 调用 AI 生成互动式 HTML PPT
const { synthesize } = require("./text_tts");                      // 调用 TTS 合成语音 + SRT 字幕

// MinIO 上传工具（用于上传 JSON / HTML / MP3 / SRT 文件）
const uploadMinio = require("../utils/upload_minio");

// 图片尺寸提取工具（从 MinIO 读取图片头获取像素宽高）
const { getImageSize } = require("../utils/image_size");

// 异步服务模块（Phase 1 后触发，后台执行不阻塞流水线）
const { startTitleGeneration } = require("./create_title");       // 异步生成课程标题和副标题
const { startCoverGeneration } = require("./create_cover_image"); // 异步生成课程封面图片并上传 MinIO

// ==================== MinIO 客户端初始化 ====================
// 从环境变量读取 MinIO 连接配置，支持默认值用于本地开发

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",          // MinIO 服务地址
  port: parseInt(process.env.MINIO_PORT) || 9000,               // MinIO 端口（默认 9000）
  useSSL: process.env.MINIO_USE_SSL === "true",                 // 是否启用 SSL
  accessKey: process.env.MINIO_ACCESS_KEY,                      // 访问密钥
  secretKey: process.env.MINIO_SECRET_KEY,                      // 私有密钥
});

// MinIO Bucket 名称（存放所有课程文件）
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// ==================== 辅助函数 ====================

/**
 * 数字补零 —— 将数字格式化为两位数
 * 如 pad(3) → "03"，用于文件名中的序号
 * @param {number} n - 待格式化的数字
 * @returns {string} 补零后的两位字符串
 */
const pad = (n) => String(n).padStart(2, "0");

// ==================== 图片尺寸批量查询辅助函数 ====================
// 从 imageInfos 的 URL 中推导 MinIO 对象键，并发查询所有图片的像素尺寸
// 尺寸查询为可选操作：单个图片查询失败不会阻塞整体流程，无尺寸信息时仅记录日志

/**
 * 从图片代理 URL 推导 MinIO 对象键
 * 代理 URL 格式：/api/v1/files/usercourse/1/20/xxx/image/a.jpg
 * MinIO 对象键格式：usercourse/1/20/xxx/image/a.jpg
 *
 * @param {string} url - 图片代理 URL（以 /api/v1/files/ 开头）
 * @returns {string} MinIO 对象键，推导失败返回空字符串
 */
function deriveMinioKey(url) {
    const prefix = "/api/v1/files/";
    const idx = url.indexOf(prefix);
    if (idx !== -1) {
        return url.substring(idx + prefix.length);
    }
    // 兼容：URL 可能已经是相对路径（不以 /api/v1/files/ 开头）
    if (url.startsWith("/")) {
        return url.replace(/^\//, "");
    }
    return url;
}

/**
 * 批量查询图片尺寸并注入到 imageInfos 中
 * 并发查询所有图片，单个失败不影响其他图片
 *
 * @param {Array<{url: string, desc: string}>} imageInfos - 图片信息数组
 * @returns {Promise<Array<{url: string, desc: string, width?: number, height?: number}>>}
 *   注入 width/height 后的图片信息数组（无尺寸信息时这两个字段不存在）
 */
async function enrichImageInfosWithSize(imageInfos) {
    if (!imageInfos || imageInfos.length === 0) {
        return imageInfos;
    }

    console.log("[course_pipeline][enrichSize] 开始查询 " + imageInfos.length + " 张图片的尺寸...");
    const enrichStartTime = Date.now();

    // 并发查询所有图片尺寸
    const sizePromises = imageInfos.map(async (info) => {
        const minioKey = deriveMinioKey(info.url);
        if (!minioKey) {
            console.warn("[course_pipeline][enrichSize] 无法推导 MinIO 键: " + info.url);
            return null;
        }

        const sizeResult = await getImageSize(minioClient, BUCKET, minioKey);
        if (sizeResult.code === 200) {
            return { width: sizeResult.width, height: sizeResult.height };
        }
        // 查询失败不阻塞流程，仅记录日志
        console.warn("[course_pipeline][enrichSize] 图片尺寸查询失败（code=" + sizeResult.code + "）: " +
            info.url + " - " + (sizeResult.message || "未知错误"));
        return null;
    });

    const sizes = await Promise.all(sizePromises);

    // 将尺寸注入到 imageInfos
    let successCount = 0;
    const enriched = imageInfos.map((info, i) => {
        if (sizes[i]) {
            successCount++;
            return { ...info, width: sizes[i].width, height: sizes[i].height };
        }
        return info; // 无尺寸信息，保持原样
    });

    const elapsed = ((Date.now() - enrichStartTime) / 1000).toFixed(1);
    console.log("[course_pipeline][enrichSize] 尺寸查询完成: " + successCount + "/" + imageInfos.length +
        " 张成功，耗时 " + elapsed + "s");
    return enriched;
}

// ==================== 流水线各阶段函数 ====================

/**
 * 阶段一：数据获取
 * 从数据库查询课程元信息，从 MinIO 下载归一化 MD 文件到本地临时目录
 *
 * @param {string|number} courseId - 课程 ID
 * @returns {Promise<{ course: Object, tempMDPath: string }>}
 *   成功时返回 course 对象和 MD 临时文件路径
 *   失败时抛出异常（由上层 catch 统一处理）
 */
async function phase1_fetchData(courseId) {
  const startTime = Date.now();
  console.log("[course_pipeline][Phase1] ========== 阶段一：数据获取 ==========");

  // 1.1 从数据库查询课程信息
  const courseResult = await bookRepo.getCourseById(courseId);
  if (courseResult.code !== 200) {
    throw new Error("课程查询失败（courseId=" + courseId + "）: " + (courseResult.message || "未知错误"));
  }
  const course = courseResult.course;
  console.log("[course_pipeline][Phase1] 课程信息获取成功: " + course.name + "（textbookPath=" + course.textbookPath + "）");

  // 1.2 更新流水线状态为"提取中"
  await bookRepo.updatePipelineStatus(courseId, "1000_extracting");

  // 1.3 从 MinIO 下载归一化 MD 文件到本地临时目录
  // 临时文件命名规则：jinmao-pipeline-{courseId}.md，存储在 OS 临时目录
  const tempMDPath = path.join(os.tmpdir(), "jinmao-pipeline-" + courseId + ".md");
  console.log("[course_pipeline][Phase1] 从 MinIO 下载 MD 文件: " + course.textbookPath + " → " + tempMDPath);

  try {
    // minioClient.fGetObject(bucket, objectName, localFilePath)：流式下载文件
    await minioClient.fGetObject(BUCKET, course.textbookPath, tempMDPath);
    console.log("[course_pipeline][Phase1] MD 文件下载完成，路径: " + tempMDPath);
  } catch (minioErr) {
    throw new Error("MinIO 文件下载失败: " + minioErr.message);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("[course_pipeline][Phase1] 阶段一完成，耗时: " + elapsed + " 秒");
  return { course, tempMDPath };
}

/**
 * 阶段二：文本提取与行号识别
 * 从下载的 MD 文件中提取指定范围文本 → 添加行号 → AI 识别章节起止行号
 *
 * @param {string|number} courseId - 课程 ID
 * @param {Object} course - 课程对象（包含 endline 字段）
 * @param {string} tempMDPath - 已下载的 MD 临时文件路径
 * @returns {Promise<{ chapterText: string, startline: number, endline: number }>}
 */
async function phase2_extractAndIndex(courseId, course, tempMDPath) {
  const startTime = Date.now();
  console.log("[course_pipeline][Phase2] ========== 阶段二：文本提取与行号识别 ==========");

  // 2.1 从 MD 文件中提取文本（从当前 endline 开始，最多提取 1000 行）
  // extractLines 参数：(mdFilePath, startLine, endLine)
  const extractStart = (course.endline || 0) + 1;        // 起始行（数据库 endline 已处理到的行，+1 跳过已处理行）
  const extractEnd = (course.endline || 0) + 1000;       // 结束行（最多提取 1000 行）
  console.log("[course_pipeline][Phase2] 提取文本范围: [" + extractStart + ", " + extractEnd + "]");

  const extractedResult = await extractLines(tempMDPath, extractStart, extractEnd);
  // extractLines 成功码为 200 或 206（206 表示末尾截断，仍可继续）
  if (extractedResult.code !== 200 && extractedResult.code !== 206) {
    throw new Error("文本提取失败: " + (extractedResult.message || "未知错误"));
  }
  const extractedText = extractedResult.text;
  console.log("[course_pipeline][Phase2] 文本提取成功，长度: " + extractedText.length + " 字符" +
    (extractedResult.code === 206 ? "（已截断到文件末尾）" : ""));

  // 检测是否为最后一章：extractLines 返回 206 表示已到文件末尾，本次提取覆盖了剩余全部内容
  const isLastChapter = extractedResult.code === 206;
  if (isLastChapter) {
    console.log("[course_pipeline][Phase2] 检测到文件末尾 → 标记为最后一章，保存到 pipelineProgress");
    await bookRepo.updatePipelineProgress(courseId, { isLastChapter: true });
  }
  // 2.2 更新状态：提取完成 → 编号中
  await bookRepo.updatePipelineStatus(courseId, "1000_extracted");
  await bookRepo.updatePipelineStatus(courseId, "1000_indexing");

  // 2.3 给提取的文本添加行号前缀（如 "  27 | 内容..."）
  const indexedResult = await addLineNumbers(extractedText);
  if (indexedResult.code !== 200) {
    throw new Error("行号添加失败: " + (indexedResult.message || "未知错误"));
  }
  const indexedText = indexedResult.text;
  console.log("[course_pipeline][Phase2] 行号索引完成");

  // 2.4 更新状态：编号完成 → 获取行号中
  await bookRepo.updatePipelineStatus(courseId, "1000_indexed");
  await bookRepo.updatePipelineStatus(courseId, "getting_line");

  // 2.5 调用 AI 识别章节的起始行号和结束行号
  const lineResult = await getLine(course.userId, indexedText);
  if (lineResult.code !== 200) {
    throw new Error("行号识别失败: " + (lineResult.message || "未知错误"));
  }
  let { startline, endline } = lineResult;
  console.log("[course_pipeline][Phase2] 行号识别完成: startline=" + startline + ", endline=" + endline);

  // 校验 AI 返回的结束行号不超出提取范围
  // extractLines 可能已截断到文件末尾，AI 仍可能返回超出实际提取范围的 endline
  const maxExtractedLine = extractStart + extractedText.split("\n").length - 1;
  if (endline > maxExtractedLine) {
    console.warn("[course_pipeline][Phase2] AI 返回的 endline(" + endline + ")超出提取范围最大行号(" + maxExtractedLine + ")，截断为实际行号");
    endline = maxExtractedLine;
  }

  // 2.6 更新状态：获取行号完成
  await bookRepo.updatePipelineStatus(courseId, "get_line_done");

  // 2.7 创建章节记录，写入数据库
  // chapterRoot 使用 /usercourse/{userId}/{courseId}/chapter_01/ 格式
  const chapterRoot = "/usercourse/" + course.userId + "/" + courseId + "/chapter_01/";
  const chapterResult = await chapterRepo.createChapter({
    courseId: courseId,
    sequence: 1,
    name: "第一章",
    chapterRoot: chapterRoot,
    startline: startline,
    endline: endline,
  });
  if (chapterResult.code !== 200) {
    throw new Error("章节创建失败: " + (chapterResult.message || "未知错误"));
  }
  const chapter = chapterResult.chapter;
  console.log("[course_pipeline][Phase2] 章节已创建，ID: " + chapter.id + "，chapterRoot: " + chapterRoot);

  // 2.8 更新课程的 endline（推进进度）
  await bookRepo.updateEndline(courseId, endline);

  // 2.9 提取用于阶段三的章节原文文本
  // 从 indexed 文本中提取 startline 到 endline 之间的内容
  // 行号格式示例: "  27 | 这是内容..."
  const indexedLines = indexedText.split("\n");
  const chapterLines = [];
  for (const line of indexedLines) {
    // 解析行号前缀（如 "  218 | ..."）
    const match = line.match(/^\s*(\d+)\s*\|/);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      if (lineNum >= startline && lineNum <= endline) {
        // 取 "|" 之后的内容
        const contentIdx = line.indexOf("|");
        chapterLines.push(line.substring(contentIdx + 1).trim());
      }
    }
  }
  const chapterText = chapterLines.join("\n");
  console.log("[course_pipeline][Phase2] 章节原文提取完成，共 " + chapterLines.length + " 行");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("[course_pipeline][Phase2] 阶段二完成，耗时: " + elapsed + " 秒");
  return { chapterText, startline, endline, chapter };
}

/**
 * 阶段三：课程大纲生成 + 条件性口播稿扩写
 * AI 生成 PPT 大纲 → 可选扩写口播稿 → 上传 outline.json 到 MinIO
 *
 * @param {string|number} courseId - 课程 ID
 * @param {Object} course - 课程对象（含 elaborationEnabled 字段）
 * @param {Object} chapter - 章节对象
 * @param {string} chapterText - 章节原文文本
 */
async function phase3_generateCourse(courseId, course, chapter, chapterText) {
  const startTime = Date.now();
  console.log("[course_pipeline][Phase3] ========== 阶段三：课程大纲生成 ==========");

  // 3.1 更新状态：课程生成中
  await bookRepo.updatePipelineStatus(courseId, "course_generating");
  // 记录大纲生成启动时间戳，用于前端 15 分钟看门狗进度条
  await bookRepo.updatePipelineProgress(courseId, { outlineStartTime: Date.now() });

  // 3.2 调用 AI 生成 PPT 大纲
  // generateOutline 参数：(userId, yuanwen, pptother)，pptother 传课程名称
  const outlineResult = await generateOutline(course.userId, chapterText, course.name || "课程");
  if (outlineResult.code !== 200) {
    throw new Error("大纲生成失败: " + (outlineResult.message || "未知错误"));
  }
  let outline = outlineResult.outline;
  console.log("[course_pipeline][Phase3] 大纲生成成功，共 " + (outline.slides ? outline.slides.length : 0) + " 张幻灯片");

  // 防御性诊断：当 slides 为空时，输出 outline 的类型和结构便于排查
  if (!outline.slides || outline.slides.length === 0) {
    console.warn("[course_pipeline][Phase3] 警告：outline.slides 为空！outline 类型: " +
      (Array.isArray(outline) ? "Array(长度=" + outline.length + ")" : typeof outline) +
      "，keys: " + (outline && typeof outline === "object" && !Array.isArray(outline)
        ? Object.keys(outline).join(", ") : "N/A") +
      "，内容摘要: " + JSON.stringify(outline).substring(0, 500));
  }

  // 3.2b 字段名规范化：映射大纲 Prompt 字段名 → Pipeline 内部字段名
  // 背景：outline_prompt.txt 要求 AI 输出 ppt/kbg 字段，
  //       而 Phase 4 读 slide.pptGuide，Phase 5 读 slide.script，字段名不一致导致数据为空。
  // 此处做兼容映射，确保下游各阶段能正确读取数据，不修改 Prompt 以保持 AI 输出质量。
  if (outline.slides && outline.slides.length > 0) {
    let pptMapped = 0;  // 统计 ppt → pptGuide 映射次数
    let kbgMapped = 0;  // 统计 kbg → script 映射次数
    outline.slides = outline.slides.map(slide => {
      // pptGuide：优先使用已有的 pptGuide/ppt_guide，否则从 ppt 字段映射
      const hasPptGuide = (slide.pptGuide || slide.ppt_guide);
      // script：优先使用已有的 script/elaboration，否则从 kbg 字段映射
      const hasScript = (slide.script || slide.elaboration);
      if (!hasPptGuide && slide.ppt) pptMapped++;
      if (!hasScript && slide.kbg) kbgMapped++;
      return {
        ...slide,
        pptGuide: hasPptGuide || slide.ppt || "",
        script: hasScript || slide.kbg || ""
      };
    });
    console.log("[course_pipeline][Phase3] 字段规范化完成，ppt→pptGuide 映射 " + pptMapped +
      " 页，kbg→script 映射 " + kbgMapped + " 页");
  }

  // 3.3 条件性口播稿扩写（p-queue 并发，上限 5）
  if (course.elaborationEnabled && outline.slides && outline.slides.length > 0) {
    const totalSlidesCount = outline.slides.length;
    // 提前写入 totalSlides，确保前端在轮询进度时能正确获取总页数
    // 修复：之前 totalSlides 在扩写完成之后才写入，导致前端显示 "3/0" 的问题
    await bookRepo.updatePipelineProgress(courseId, { totalSlides: totalSlidesCount });
    // 切换到扩写状态，通知前端当前进入口播稿扩写阶段
    await bookRepo.updatePipelineStatus(courseId, "elaborating");
    console.log("[course_pipeline][Phase3] 扩写功能已开启，开始并发扩写口播稿（并发上限 5）...");
    let enrichedCount = 0;

    const PQueue = await getPQueue();
    const elaborationQueue = new PQueue({ concurrency: 5 });

    // 为每张幻灯片创建异步任务并加入并发队列
    const tasks = outline.slides.map((slide, i) => {
      return elaborationQueue.add(async () => {
        const slideScript = slide.script || slide.elaboration || "";
        const slideNum = i + 1;

        if (!slideScript.trim()) {
          console.log("[course_pipeline][Phase3] 扩写进度 " + slideNum + "/" + totalSlidesCount + " — 跳过空口播稿");
          // 空口播稿也算已完成一页（用户能感知到总页数在推进）
          enrichedCount++;
          await bookRepo.updatePipelineProgress(courseId, { elaborationCompleted: enrichedCount });
          return;
        }

        // 输出当前扩写进度，让用户知道程序仍在运行
        console.log("[course_pipeline][Phase3] 扩写进度 " + slideNum + "/" + totalSlidesCount + " — 正在调用大模型扩写幻灯片...");
        try {
          // 预期字数：第一页（i=0）用1.5倍系数（概述页简练），其他页用3倍系数
          const wordMultiplier = (i === 0) ? 1.5 : 3;
          const expectedWords = Math.max(100, Math.min(5000, Math.round(slideScript.length * wordMultiplier)));
          const elaborationResult = await elaborateText(course.userId, slideScript, chapterText, expectedWords, i);

          if (elaborationResult.code === 200 && elaborationResult.script) {
            slide.script = elaborationResult.script; // 用扩写后的脚本替换原脚本
          } else {
            console.warn("[course_pipeline][Phase3] 幻灯片 " + slideNum + " 扩写失败: " +
              (elaborationResult.message || "未知错误") + "，保留原口播稿");
          }
          enrichedCount++;
          // 每完成一页扩写后更新进度到数据库，供前端轮询查询
          await bookRepo.updatePipelineProgress(courseId, { elaborationCompleted: enrichedCount });
        } catch (err) {
          console.warn("[course_pipeline][Phase3] 幻灯片 " + slideNum + " 扩写异常: " + err.message + "，保留原口播稿");
          enrichedCount++;
          await bookRepo.updatePipelineProgress(courseId, { elaborationCompleted: enrichedCount });
        }
      });
    });

    // 等待所有扩写任务完成
    await Promise.all(tasks);

    console.log("[course_pipeline][Phase3] 口播稿扩写完成，成功扩写 " + enrichedCount + "/" + outline.slides.length + " 页");
  } else {
    console.log("[course_pipeline][Phase3] 扩写功能未开启，跳过口播稿扩写");
  }

  // 3.4 将大纲序列化并上传到 MinIO
  const chapterRoot = chapter.chapterRoot;
  const outlineJsonPath = chapterRoot + "chapter_01.json";
  const outlineJsonStr = JSON.stringify(outline, null, 2);
  // 写入本地临时文件再上传
  const tempOutlinePath = path.join(os.tmpdir(), "jinmao-outline-" + courseId + ".json");
  fs.writeFileSync(tempOutlinePath, outlineJsonStr, "utf-8");
  console.log("[course_pipeline][Phase3] 临时大纲文件已写入: " + tempOutlinePath);

  const uploadResult = await uploadMinio.upload(tempOutlinePath, outlineJsonPath);
  if (uploadResult.code !== 200) {
    throw new Error("大纲上传 MinIO 失败: " + (uploadResult.message || "未知错误"));
  }
  console.log("[course_pipeline][Phase3] 大纲已上传到 MinIO: " + outlineJsonPath);

  // 3.5 清理临时文件
  try { fs.unlinkSync(tempOutlinePath); } catch (_) { /* 忽略清理错误 */ }

  // 3.6 更新章节信息：总页数 + 大纲路径
  const totalSlides = outline.slides ? outline.slides.length : 0;
  await chapterRepo.updateChapterTotalPages(chapter.id, totalSlides, outlineJsonPath);
  // 写入大纲总页数到进度数据，供前端展示扩写/PPT/TTS 总数
  await bookRepo.updatePipelineProgress(courseId, { totalSlides: totalSlides });

  // 3.7 更新流程状态
  await bookRepo.updatePipelineStatus(courseId, "course_generated");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("[course_pipeline][Phase3] 阶段三完成，耗时: " + elapsed + " 秒");
  return outline;
}

/**
 * 阶段四：PPT 批量生成（并发上限 5）
 * 遍历所有幻灯片，并行调用 AI 生成 HTML PPT 并上传 MinIO
 *
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} userId - 用户 ID（用于 llm_client 计费关联）
 * @param {string} chapterRoot - 章节 MinIO 根路径（用于上传 PPT 文件）
 * @param {Object} outline - PPT 大纲对象（含 slides 数组，每页含 PIC 图片信息）
 * @param {string} imageBaseUrl - 图片基础代理 URL（如 "/api/v1/files/usercourse/1/42/xxx"），不含目录后缀，图片子目录由 PIC 的 path 字段自带
 * @returns {Promise<boolean>} 全部成功返回 true，部分失败返回 false
 */
async function phase4_generatePpt(courseId, userId, chapterRoot, outline, imageBaseUrl) {
  const startTime = Date.now();
  console.log("[course_pipeline][Phase4] ========== 阶段四：PPT 生成（并发5） ==========");

  // 4.1 更新状态
  await bookRepo.updatePipelineStatus(courseId, "ppt_generating");

  const slides = outline.slides || [];
  if (slides.length === 0) {
    console.warn("[course_pipeline][Phase4] 无幻灯片，跳过 PPT 生成");
    await bookRepo.updatePipelineStatus(courseId, "ppt_generated");
    return true;
  }

  // 4.2 创建并发队列（并发上限 5）
  const PQueue = await getPQueue(); // p-queue v9+ 是 ESM，惰性动态 import
  const pptQueue = new PQueue({ concurrency: 5 });
  let successCount = 0;
  let failCount = 0;

  // 4.3 为每张幻灯片创建任务并加入队列
  const tasks = slides.map((slide, idx) => {
    return pptQueue.add(async () => {
      const slideNum = pad(idx + 1);
      console.log("[course_pipeline][Phase4] 幻灯片 " + slideNum + " PPT 生成开始...");

      try {
        // 4.3a 构造图片信息列表：从 PIC 字段读取图片路径和描述，转为完整代理 URL
        // 兼容旧格式（string[]）和新格式（object[]: {path, desc}）
        const rawPic = slide.PIC || [];
        const imageInfos = rawPic.map((item) => {
            if (typeof item === "string") {
                // 旧格式：纯路径字符串 → item 自带子目录（如 "image/xxx.jpg" 或 "images/xxx.jpg"），原样拼接
                return {
                    url: imageBaseUrl + "/" + item,
                    desc: "" // 旧格式无描述
                };
            } else if (item && typeof item === "object") {
                // 新格式：{ path, desc } → path 自带子目录，原样拼接
                return {
                    url: imageBaseUrl + "/" + (item.path || ""),
                    desc: item.desc || ""
                };
            }
            return { url: "", desc: "" };
        }).filter(info => info.url); // 过滤掉空 URL

        // 4.3a2 批量查询图片像素尺寸（并发查询，失败不阻塞流程）
        const enrichedImageInfos = await enrichImageInfosWithSize(imageInfos);

        console.log("[course_pipeline][Phase4] 幻灯片 " + slideNum + " 图片信息: " +
            enrichedImageInfos.length + " 张" +
            (enrichedImageInfos.length > 0 ? "（含描述=" + enrichedImageInfos.filter(i => i.desc).length + "，含尺寸=" + enrichedImageInfos.filter(i => i.width).length + "）" : "（无配图）"));

        // 4.3b 调用 AI 生成 HTML PPT
        // generateHtmlPpt 参数：(userId, pptGuide, originalText, imageInfos)
        const pptGuide = slide.pptGuide || slide.ppt_guide || "";
        const slideText = slide.script || slide.content || "";
        const htmlResult = await generateHtmlPpt(userId, pptGuide, slideText, enrichedImageInfos);

        if (htmlResult.code !== 200 || !htmlResult.html) {
          console.error("[course_pipeline][Phase4] 幻灯片 " + slideNum + " PPT 生成失败: " +
            (htmlResult.message || "未知错误"));
          failCount++;
          return;
        }

        // 4.3b 后处理 HTML：将转义的换行符还原
        let htmlContent = htmlResult.html;
        if (typeof htmlContent === "string") {
          htmlContent = htmlContent.replace(/\\n/g, "\n");
        }

        // 4.3c 写入本地临时文件并上传 MinIO
        const tempHtmlPath = path.join(os.tmpdir(), "jinmao-ppt-" + courseId + "-" + slideNum + ".html");
        fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");

        const minioPath = chapterRoot + "PPT/slide_" + slideNum + ".html";
        const uploadResult = await uploadMinio.upload(tempHtmlPath, minioPath);

        // 4.3d 清理临时文件
        try { fs.unlinkSync(tempHtmlPath); } catch (_) { /* 忽略清理错误 */ }

        if (uploadResult.code !== 200) {
          console.error("[course_pipeline][Phase4] 幻灯片 " + slideNum + " PPT 上传失败: " +
            (uploadResult.message || "未知错误"));
          failCount++;
          return;
        }

        console.log("[course_pipeline][Phase4] 幻灯片 " + slideNum + " PPT 完成: " + minioPath);
        successCount++;
        // 原子递增加载 filesCompleted（PPT 每文件计 1，前端显示总数为 totalSlides × 3）
        bookRepo.incrementPipelineProgress(courseId, "filesProgress.current", 1).catch(() => {});
      } catch (err) {
        console.error("[course_pipeline][Phase4] 幻灯片 " + slideNum + " PPT 异常: " + err.message);
        failCount++;
      }
    });
  });

  // 4.4 等待所有 PPT 任务完成
  await Promise.all(tasks);

  // 4.5 更新状态
  await bookRepo.updatePipelineStatus(courseId, "ppt_generated");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("[course_pipeline][Phase4] 阶段四完成，成功 " + successCount + " / 失败 " + failCount +
    "，总耗时: " + elapsed + " 秒");
  return failCount === 0;
}

/**
 * 阶段五：TTS 语音 + 字幕批量生成（并发上限 3）
 * 遍历所有幻灯片，并行调用 TTS 合成 MP3 和 SRT 并上传 MinIO
 *
 * @param {string|number} courseId - 课程 ID
 * @param {string} chapterRoot - 章节 MinIO 根路径
 * @param {Object} outline - PPT 大纲对象（含 slides 数组）
 * @returns {Promise<boolean>} 全部成功返回 true，部分失败返回 false
 */
async function phase5_generateTts(courseId, userId, chapterRoot, outline) {
  const startTime = Date.now();
  console.log("[course_pipeline][Phase5] ========== 阶段五：TTS 生成（并发3） ==========");

  // 5.1 更新状态
  await bookRepo.updatePipelineStatus(courseId, "tts_generating");

  const slides = outline.slides || [];
  if (slides.length === 0) {
    console.warn("[course_pipeline][Phase5] 无幻灯片，跳过 TTS 生成");
    await bookRepo.updatePipelineStatus(courseId, "tts_generated");
    return true;
  }

  // 5.2 创建并发队列（并发上限 3，TTS API 限制更严格）
  const PQueue = await getPQueue(); // p-queue v9+ 是 ESM，惰性动态 import
  const ttsQueue = new PQueue({ concurrency: 3 });
  let successCount = 0;
  let failCount = 0;

  // 5.3 为每张幻灯片创建 TTS 任务并加入队列
  const tasks = slides.map((slide, idx) => {
    return ttsQueue.add(async () => {
      const slideNum = pad(idx + 1);
      const script = slide.script || slide.elaboration || "";

      // 跳过空脚本
      if (!script.trim()) {
        console.log("[course_pipeline][Phase5] 幻灯片 " + slideNum + " 脚本为空，跳过 TTS");
        return;
      }

      console.log("[course_pipeline][Phase5] 幻灯片 " + slideNum + " TTS 合成开始...");

      try {
        // 5.3a 调用 TTS 合成 API
        const ttsResult = await synthesize(userId, script);

        if (ttsResult.code !== 200) {
          console.error("[course_pipeline][Phase5] 幻灯片 " + slideNum + " TTS 合成失败: " +
            (ttsResult.message || "未知错误"));
          failCount++;
          return;
        }

        const { mp3Path, srtPath } = ttsResult;

        // 5.3b 上传 MP3 到 MinIO
        const mp3MinioPath = chapterRoot + "Audio/slide_" + slideNum + ".mp3";
        const mp3UploadResult = await uploadMinio.upload(mp3Path, mp3MinioPath);
        if (mp3UploadResult.code !== 200) {
          console.error("[course_pipeline][Phase5] 幻灯片 " + slideNum + " MP3 上传失败: " +
            (mp3UploadResult.message || "未知错误"));
        }

        // 5.3c 上传 SRT 到 MinIO
        const srtMinioPath = chapterRoot + "SRT/slide_" + slideNum + ".srt";
        const srtUploadResult = await uploadMinio.upload(srtPath, srtMinioPath);
        if (srtUploadResult.code !== 200) {
          console.error("[course_pipeline][Phase5] 幻灯片 " + slideNum + " SRT 上传失败: " +
            (srtUploadResult.message || "未知错误"));
        }

        // 5.3d 清理本地临时文件（TTS 生成的 MP3 和 SRT）
        try { fs.unlinkSync(mp3Path); } catch (cleanErr) {
          console.warn("[course_pipeline][Phase5] 清理 MP3 临时文件失败: " + cleanErr.message);
        }
        try { fs.unlinkSync(srtPath); } catch (cleanErr) {
          console.warn("[course_pipeline][Phase5] 清理 SRT 临时文件失败: " + cleanErr.message);
        }

        if (mp3UploadResult.code === 200 && srtUploadResult.code === 200) {
          console.log("[course_pipeline][Phase5] 幻灯片 " + slideNum + " TTS 完成（MP3 + SRT）");
          successCount++;
          // 原子递增加载 filesCompleted（MP3 + SRT 各计 1，共 +2）
          bookRepo.incrementPipelineProgress(courseId, "filesProgress.current", 2).catch(() => {});
        } else {
          failCount++;
        }
      } catch (err) {
        console.error("[course_pipeline][Phase5] 幻灯片 " + slideNum + " TTS 异常: " + err.message);
        failCount++;
      }
    });
  });

  // 5.4 等待所有 TTS 任务完成
  await Promise.all(tasks);

  // 5.5 更新状态
  await bookRepo.updatePipelineStatus(courseId, "tts_generated");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("[course_pipeline][Phase5] 阶段五完成，成功 " + successCount + " / 失败 " + failCount +
    "，总耗时: " + elapsed + " 秒");
  return failCount === 0;
}

/**
 * 阶段六：数据完整性校验
 * 检查所有文件是否都已上传到 MinIO，更新课程和章节状态
 *
 * @param {string|number} courseId - 课程 ID
 * @param {Object} chapter - 章节对象（含 chapterRoot）
 * @param {Object} outline - PPT 大纲对象（含 slides 数组）
 * @param {boolean} pptAllSuccess - PPT 生成是否全部成功
 * @param {boolean} ttsAllSuccess - TTS 合成是否全部成功
 */
async function phase6_validate(courseId, chapter, outline, pptAllSuccess, ttsAllSuccess) {
  const startTime = Date.now();
  console.log("[course_pipeline][Phase6] ========== 阶段六：数据完整性校验 ==========");

  // 6.1 更新状态：校验中
  await bookRepo.updatePipelineStatus(courseId, "data_validating");

  // 在校验阶段清理进度数据之前，先读取 isLastChapter 标记（后续判断最终状态时需要）
  let progressData_phase6 = {};
  const courseForProgress = await bookRepo.getCourseById(courseId);
  if (courseForProgress.code === 200 && courseForProgress.course.pipelineProgress) {
    try {
      progressData_phase6 = JSON.parse(courseForProgress.course.pipelineProgress);
    } catch (_) { /* JSON 解析失败时使用空对象 */ }
  }
  const isLastChapter = progressData_phase6.isLastChapter || false;
  console.log("[course_pipeline][Phase6] isLastChapter: " + isLastChapter);

  // 清除流水线进度数据（进入校验阶段，前端显示"正在检查课程完整性"）
  // 注意：保留 isLastChapter 标记以便后续章节判断
  await bookRepo.updatePipelineProgress(courseId, { outlineStartTime: null, totalSlides: null, elaborationCompleted: null, filesCompleted: null });

  const slides = outline.slides || [];
  const chapterRoot = chapter.chapterRoot;
  const missingFiles = []; // 记录缺失文件列表

  // 6.2 检查大纲 JSON 文件
  const outlineKey = chapterRoot + "chapter_01.json";
  try {
    await minioClient.statObject(BUCKET, outlineKey.replace(/^\/+/, ""));
    console.log("[course_pipeline][Phase6] 大纲 JSON 文件已确认: " + outlineKey);
  } catch {
    console.warn("[course_pipeline][Phase6] 缺失大纲 JSON: " + outlineKey);
    missingFiles.push(outlineKey);
  }

  // 6.3 逐页检查 PPT /音频 / 字幕文件
  if (slides.length > 0) {
    console.log("[course_pipeline][Phase6] 开始逐页检查 " + slides.length + " 张幻灯片的文件...");
  }

  for (let i = 0; i < slides.length; i++) {
    const slideNum = pad(i + 1);

    // 6.3a 检查 HTML PPT 文件
    const pptKey = (chapterRoot + "PPT/slide_" + slideNum + ".html").replace(/^\/+/, "");
    try {
      await minioClient.statObject(BUCKET, pptKey);
    } catch {
      console.warn("[course_pipeline][Phase6] 缺失 PPT 文件: " + pptKey);
      missingFiles.push(pptKey);
    }

    // 6.3b 检查 MP3 文件（仅对非空脚本的 slide）
    const slideScript = slides[i].script || slides[i].elaboration || "";
    if (slideScript.trim()) {
      const mp3Key = (chapterRoot + "Audio/slide_" + slideNum + ".mp3").replace(/^\/+/, "");
      try {
        await minioClient.statObject(BUCKET, mp3Key);
      } catch {
        console.warn("[course_pipeline][Phase6] 缺失 MP3 文件: " + mp3Key);
        missingFiles.push(mp3Key);
      }

      // 6.3c 检查 SRT 文件
      const srtKey = (chapterRoot + "SRT/slide_" + slideNum + ".srt").replace(/^\/+/, "");
      try {
        await minioClient.statObject(BUCKET, srtKey);
      } catch {
        console.warn("[course_pipeline][Phase6] 缺失 SRT 文件: " + srtKey);
        missingFiles.push(srtKey);
      }
    }
  }

  // 6.4 根据校验结果设置最终状态
  let finalStatus;
  if (isLastChapter) {
    // 最后一章：教材全部生成完毕，但需根据文件完整性区分章节状态
    if (missingFiles.length > 0) {
      // 最后一章仍有文件缺失 → 章节设为 partial_completed，并自动触发补全
      finalStatus = "partial_completed";
      console.warn("[course_pipeline][Phase6] 最后一章校验未通过，缺失 " + missingFiles.length + " 个文件: " +
        missingFiles.join(", "));

      // 自动启动后台文件补全任务（fixMissingFilesForChapter 异步非阻塞，内部有去重机制）
      console.log("[course_pipeline][Phase6] 自动触发文件补全，章节 ID: " + chapter.id);
      fixMissingFilesForChapter(courseId, chapter.id).catch(err => {
        console.error("[course_pipeline][Phase6] 自动补全启动失败: " + err.message);
      });
    } else {
      finalStatus = "completed";
      console.log("[course_pipeline][Phase6] 最后一章，所有文件完整，设置状态为 completed");
    }
  } else if (missingFiles.length === 0 && pptAllSuccess && ttsAllSuccess) {
    // 全部文件完整且各阶段均成功
    finalStatus = "completed";
    console.log("[course_pipeline][Phase6] 校验通过，所有文件完整");
  } else if (missingFiles.length > 0) {
    // 有文件缺失 → 自动触发补全重试
    finalStatus = "partial_completed";
    console.warn("[course_pipeline][Phase6] 校验未通过，缺失 " + missingFiles.length + " 个文件: " +
      missingFiles.join(", "));

    // 自动启动后台文件补全任务（fixMissingFilesForChapter 异步非阻塞，内部有去重机制）
    console.log("[course_pipeline][Phase6] 自动触发文件补全，章节 ID: " + chapter.id);
    fixMissingFilesForChapter(courseId, chapter.id).catch(err => {
      console.error("[course_pipeline][Phase6] 自动补全启动失败: " + err.message);
    });
  } else {
    // 文件完整但部分阶段有失败
    finalStatus = "partial_completed";
    console.warn("[course_pipeline][Phase6] 文件完整但部分阶段有失败（PPT全部成功=" + pptAllSuccess +
      ", TTS全部成功=" + ttsAllSuccess + "）");
  }

  // 6.5 更新课程最终状态
  await bookRepo.updatePipelineStatus(courseId, finalStatus);

  // 6.6 更新章节状态
  await chapterRepo.updateChapter(chapter.id, { status: finalStatus });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("[course_pipeline][Phase6] 阶段六完成，最终状态: " + finalStatus + "，耗时: " + elapsed + " 秒");
  return { finalStatus, missingFiles };
}

// ==================== 主流水线函数 ====================

/**
 * 课程生成流水线主入口
 * 接收课程 ID，依次执行 6 个阶段完成课程生成全流程：
 *   阶段一：数据获取（DB 查询 + MinIO 下载）
 *   阶段二：文本提取与行号识别（extractLines → addLineNumbers → getLine）
 *   阶段三：课程大纲生成 + 条件性口播稿扩写（generateOutline → elaborateText）
 *   阶段四&五：PPT & TTS 并行生成（generateHtmlPpt + synthesize，各自队列并发）
 *   阶段六：数据完整性校验（MinIO statObject 逐文件检查）
 *
 * @param {string|number} courseId - 课程数据库 ID
 * @returns {Promise<{ code: number, status?: string, message?: string }>}
 *   成功: { code: 200, status: "completed"|"partial_completed" }
 *   失败: { code: 500, message: "错误描述" }
 */
async function pipeline(courseId) {
  const pipelineStartTime = Date.now();
  console.log("[course_pipeline][pipeline] ========== 流水线启动 ==========");
  console.log("[course_pipeline][pipeline] 课程 ID: " + courseId);

  // 输入参数校验
  if (!courseId) {
    console.error("[course_pipeline][pipeline] 错误：courseId 参数为空");
    return { code: 400, message: "课程 ID 不能为空" };
  }

  try {
    // ───── 阶段一：数据获取 ─────
    const { course, tempMDPath } = await phase1_fetchData(courseId);

    // ───── 阶段一后：异步启动标题生成和封面生成（后台执行，不阻塞流水线）─────
    // 标题生成：调用 AI 为课程生成更合适的标题和副标题
    startTitleGeneration(courseId, course.userId, course.name, course.textbookPath);
    console.log("[course_pipeline][pipeline] 标题生成已加入后台异步队列");

    // 封面生成：先读取 MD 文件前 2000 字符作为内容样本，再启动异步封面生成
    try {
      const sampleText = fs.readFileSync(tempMDPath, "utf-8").substring(0, 2000);
      startCoverGeneration(courseId, course.userId, course.name, sampleText);
      console.log("[course_pipeline][pipeline] 封面生成已加入后台异步队列");
    } catch (sampleErr) {
      console.warn("[course_pipeline][pipeline] 提取封面样本失败，跳过封面生成: " + sampleErr.message);
    }

    // ───── 阶段二：文本提取与行号识别 ─────
    const { chapterText, chapter } = await phase2_extractAndIndex(courseId, course, tempMDPath);

    // ───── 清理阶段一下载的临时 MD 文件 ─────
    try { fs.unlinkSync(tempMDPath); } catch (_) { /* 忽略清理错误 */ }

    // ───── 阶段三：课程大纲生成 + 扩写 ─────
    const outline = await phase3_generateCourse(courseId, course, chapter, chapterText);

    // ───── 阶段四 & 五：PPT 和 TTS 并行启动 ─────
    console.log("[course_pipeline][pipeline] ========== 阶段四&五：PPT + TTS 并行启动 ==========");
    const chapterRoot = chapter.chapterRoot;

    // 从 textbookPath 推导图片基础代理 URL，供 Phase4 构造完整图片 URL
    // textbookPath 格式: /usercourse/{userId}/{bookId}/{归一产物目录}/{filename}.md
    // imageBaseUrl 格式: /api/v1/files/usercourse/{userId}/{bookId}/{归一产物目录}（不含子目录，子目录由 PIC 的 path 字段自带如 images/xxx.jpg）
    const mdDir = course.textbookPath.replace(/\/[^/]+\.md$/, '');
    const imageBaseUrl = '/api/v1/files' + mdDir;
    console.log("[course_pipeline][pipeline] 图片基础 URL 已推导: " + imageBaseUrl);

    // 两个阶段同时开始，互不等待
    const pptPromise = phase4_generatePpt(courseId, course.userId, chapterRoot, outline, imageBaseUrl);
    const ttsPromise = phase5_generateTts(courseId, course.userId, chapterRoot, outline);

    const [pptAllSuccess, ttsAllSuccess] = await Promise.all([pptPromise, ttsPromise]);

    // ───── 阶段六：数据完整性校验 ─────
    const { finalStatus } = await phase6_validate(courseId, chapter, outline, pptAllSuccess, ttsAllSuccess);

    const totalElapsed = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    console.log("[course_pipeline][pipeline] ========== 流水线完成 ==========");
    console.log("[course_pipeline][pipeline] 最终状态: " + finalStatus + "，总耗时: " + totalElapsed + " 秒");

    return { code: 200, status: finalStatus };

  } catch (err) {
    // 捕获任意阶段的致命错误
    const elapsed = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    console.error("[course_pipeline][pipeline] ========== 流水线致命错误 ==========");
    console.error("[course_pipeline][pipeline] 错误信息: " + err.message);
    console.error("[course_pipeline][pipeline] 错误堆栈: " + err.stack);
    console.error("[course_pipeline][pipeline] 已耗时: " + elapsed + " 秒");

    // 尝试将课程状态标记为失败
    try {
      await bookRepo.updatePipelineStatus(courseId, "failed");
    } catch (statusErr) {
      console.error("[course_pipeline][pipeline] 更新失败状态时出错: " + statusErr.message);
    }

    return { code: 500, message: "流水线执行失败: " + err.message };
  }
}

// ==================== 单章节生成流水线 ====================

/**
 * 单章节生成流水线（Phase 2-6）
 * 用于"下一章生成"功能，针对已创建的章节记录执行完整的生成流程
 * 与主流水线 pipeline() 的区别：
 *   - 跳过 Phase 1（数据获取）：课程已存在，MD 已在 MinIO
 *   - 跳过异步标题/封面生成：仅在首次上传时触发
 *   - 进度写入 Chapter.generationProgress 而非 Course.pipelineProgress
 *
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 已创建的章节 ID（status 应为 "generating"）
 * @returns {Promise<{ code: number, status?: string, message?: string }>}
 */
async function generateChapter(courseId, chapterId) {
  const startTime = Date.now();
  const TAG = "[course_pipeline][generateChapter]";
  console.log(TAG + " ========== 单章生成流水线启动 ==========");
  console.log(TAG + " 课程 ID: " + courseId + "，章节 ID: " + chapterId);

  let isLastChapter = false; // 提升到 try-catch 外层，catch 块需要判断是否需要标记课程完成

  try {
    // ───── Step 1：查询课程和章节数据 ─────
    const courseResult = await bookRepo.getCourseById(courseId);
    if (courseResult.code !== 200) {
      throw new Error("课程查询失败: " + (courseResult.message || "未知错误"));
    }
    const course = courseResult.course;

    const chapterResult = await chapterRepo.getChapterById(chapterId);
    if (chapterResult.code !== 200) {
      throw new Error("章节查询失败: " + (chapterResult.message || "未知错误"));
    }
    const chapter = chapterResult.chapter;

    console.log(TAG + " 课程: " + course.name + "，章节: " + chapter.name + "（sequence=" + chapter.sequence + "）");

    // 显式更新章节状态为 generating（若此前为 pending，确保前端轮询能正确识别）
    await chapterRepo.updateChapter(chapterId, { status: "generating" });

    // 初始化章节进度
    await chapterRepo.updateChapterProgress(chapterId, {
      phase: "outline_generating",
      outlineProgress: { percentage: 0, isComplete: false },
      elaborationProgress: { current: 0, total: 0, isComplete: false },
      filesProgress: { current: 0, total: 0, isComplete: false },
    });

    // ───── Step 2：从 MinIO 下载 MD 文件 ─────
    console.log(TAG + " [Step2] 从 MinIO 下载 MD 文件: " + course.textbookPath);
    const tempMDPath = path.join(os.tmpdir(), "jinmao-chapter-" + courseId + "-" + chapterId + ".md");
    await minioClient.fGetObject(BUCKET, course.textbookPath, tempMDPath);
    console.log(TAG + " [Step2] MD 文件下载完成: " + tempMDPath);

    // ───── Step 3：提取文本 + AI 识别行号 ─────
    console.log(TAG + " [Step3] 提取文本范围: [" + (course.endline + 1) + ", " + (course.endline + 1000) + "]");
    const extractStart = (course.endline || 0) + 1;
    const extractEnd = (course.endline || 0) + 1000;
    const extractedResult = await extractLines(tempMDPath, extractStart, extractEnd);
    // 416 表示起始行超出文件总行数 → 无更多内容，课程已完成
    if (extractedResult.code === 416) {
      console.log(TAG + " [Step3] 起始行(" + extractStart + ")已超出文件总行数，无更多内容可提取");
      // 持久化 isLastChapter 标记，确保前后端一致拒绝继续生成
      await bookRepo.updatePipelineProgress(courseId, { isLastChapter: true });
      // 更新课程状态为 completed（全部内容已处理完毕）
      await bookRepo.updatePipelineStatus(courseId, "completed");
      // 将本章节标记为 failed（无效章节，无内容可生成）
      await chapterRepo.updateChapter(chapterId, { status: "failed", generationProgress: null });
      console.log(TAG + " [Step3] 课程已标记为 completed，章节 " + chapterId + " 已标记为 failed");
      return { code: 200, status: "no_more_content", message: "无更多内容可生成，课程已完成" };
    }
    if (extractedResult.code !== 200 && extractedResult.code !== 206) {
      throw new Error("文本提取失败: " + (extractedResult.message || "未知错误"));
    }
    const extractedText = extractedResult.text;
    isLastChapter = extractedResult.code === 206; // 使用外层变量（非 const），catch 块需要判断
    console.log(TAG + " [Step3] 文本提取成功，长度: " + extractedText.length + " 字符" +
      (isLastChapter ? "（已截断到文件末尾）" : ""));

    // 立即持久化 isLastChapter 标记到数据库，防止后续步骤异常导致拦截失效
    // API 端已有双重检查（pipelineStatus 和 pipelineProgress.isLastChapter），持久化后立即生效
    if (isLastChapter) {
      await bookRepo.updatePipelineProgress(courseId, { isLastChapter: true });
      console.log(TAG + " [Step3] 已是最后一章，已持久化 isLastChapter 标记到 pipelineProgress");
    }

    // 添加行号
    const indexedResult = await addLineNumbers(extractedText);
    if (indexedResult.code !== 200) {
      throw new Error("行号添加失败: " + (indexedResult.message || "未知错误"));
    }
    const indexedText = indexedResult.text;

    // AI 识别章节行号
    const lineResult = await getLine(course.userId, indexedText);
    if (lineResult.code !== 200) {
      throw new Error("行号识别失败: " + (lineResult.message || "未知错误"));
    }
    let { startline, endline } = lineResult;
    console.log(TAG + " [Step3] 行号识别完成: startline=" + startline + ", endline=" + endline);

    // 校验 AI 返回的结束行号不超出提取范围
    // extractLines 可能已截断到文件末尾，AI 仍可能返回超出实际提取范围的 endline
    const maxExtractedLine = extractStart + extractedText.split("\n").length - 1;
    if (endline > maxExtractedLine) {
      console.warn(TAG + " [Step3] AI 返回的 endline(" + endline + ")超出提取范围最大行号(" + maxExtractedLine + ")，截断为实际行号");
      endline = maxExtractedLine;
    }

    // 更新章节行号信息
    await chapterRepo.updateChapter(chapterId, { startline, endline });

    // 更新课程 endline（推进进度）
    await bookRepo.updateEndline(courseId, endline);

    // 提取章节原文
    const indexedLines = indexedText.split("\n");
    const chapterLines = [];
    for (const line of indexedLines) {
      const match = line.match(/^\s*(\d+)\s*\|/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        if (lineNum >= startline && lineNum <= endline) {
          const contentIdx = line.indexOf("|");
          chapterLines.push(line.substring(contentIdx + 1).trim());
        }
      }
    }
    const chapterText = chapterLines.join("\n");
    console.log(TAG + " [Step3] 章节原文提取完成，共 " + chapterLines.length + " 行");

    // 清理临时 MD 文件
    try { fs.unlinkSync(tempMDPath); } catch (_) { /* 忽略清理错误 */ }

    // ───── Step 4：大纲生成 ─────
    console.log(TAG + " [Step4] 开始生成大纲...");
    await chapterRepo.updateChapterProgress(chapterId, {
      phase: "outline_generating",
      outlineProgress: { percentage: 0, isComplete: false, startTime: Date.now() },
    });

    const outlineResult = await generateOutline(course.userId, chapterText, course.name || "课程");
    if (outlineResult.code !== 200) {
      throw new Error("大纲生成失败: " + (outlineResult.message || "未知错误"));
    }
    let outline = outlineResult.outline;
    console.log(TAG + " [Step4] 大纲生成成功，共 " + (outline.slides ? outline.slides.length : 0) + " 张幻灯片");

    // 字段名规范化（同主流水线 Phase 3）
    if (outline.slides && outline.slides.length > 0) {
      outline.slides = outline.slides.map(slide => ({
        ...slide,
        pptGuide: slide.pptGuide || slide.ppt_guide || slide.ppt || "",
        script: slide.script || slide.elaboration || slide.kbg || ""
      }));
    }

    const totalSlides = outline.slides ? outline.slides.length : 0;
    await chapterRepo.updateChapterProgress(chapterId, {
      outlineProgress: { percentage: 100, isComplete: true },
    });

    // ───── Step 5：条件性口播稿扩写 ─────
    if (course.elaborationEnabled && outline.slides && outline.slides.length > 0) {
      console.log(TAG + " [Step5] 扩写功能已开启，开始并发扩写口播稿（并发上限 5）...");
      await chapterRepo.updateChapterProgress(chapterId, {
        phase: "elaborating",
        elaborationProgress: { current: 0, total: totalSlides, isComplete: false },
      });

      let enrichedCount = 0;
      const PQueue = await getPQueue();
      const elaborationQueue = new PQueue({ concurrency: 5 });

      const tasks = outline.slides.map((slide, i) => {
        return elaborationQueue.add(async () => {
          const slideScript = slide.script || slide.elaboration || "";
          if (!slideScript.trim()) {
            enrichedCount++;
            await chapterRepo.updateChapterProgress(chapterId, {
              elaborationProgress: { current: enrichedCount, total: totalSlides, isComplete: false },
            });
            return;
          }
          try {
            const wordMultiplier = (i === 0) ? 1.5 : 3;
            const expectedWords = Math.max(100, Math.min(5000, Math.round(slideScript.length * wordMultiplier)));
            const elaborationResult = await elaborateText(course.userId, slideScript, chapterText, expectedWords, i);
            if (elaborationResult.code === 200 && elaborationResult.script) {
              slide.script = elaborationResult.script;
            }
            enrichedCount++;
            await chapterRepo.updateChapterProgress(chapterId, {
              elaborationProgress: { current: enrichedCount, total: totalSlides, isComplete: false },
            });
          } catch (err) {
            console.warn(TAG + " [Step5] 幻灯片 " + (i + 1) + " 扩写异常: " + err.message);
            enrichedCount++;
            await chapterRepo.updateChapterProgress(chapterId, {
              elaborationProgress: { current: enrichedCount, total: totalSlides, isComplete: false },
            });
          }
        });
      });
      await Promise.all(tasks);
      console.log(TAG + " [Step5] 口播稿扩写完成，成功 " + enrichedCount + "/" + totalSlides + " 页");
    }

    await chapterRepo.updateChapterProgress(chapterId, {
      elaborationProgress: { current: totalSlides, total: totalSlides, isComplete: true },
    });

    // ───── Step 6：上传大纲 JSON ─────
    console.log(TAG + " [Step6] 上传大纲 JSON...");
    const chapterRoot = chapter.chapterRoot;
    const outlineJsonPath = chapterRoot + "chapter_" + pad(chapter.sequence) + ".json";
    const outlineJsonStr = JSON.stringify(outline, null, 2);
    const tempOutlinePath = path.join(os.tmpdir(), "jinmao-outline-ch" + chapterId + ".json");
    fs.writeFileSync(tempOutlinePath, outlineJsonStr, "utf-8");
    const uploadResult = await uploadMinio.upload(tempOutlinePath, outlineJsonPath);
    if (uploadResult.code !== 200) {
      throw new Error("大纲上传 MinIO 失败: " + (uploadResult.message || "未知错误"));
    }
    try { fs.unlinkSync(tempOutlinePath); } catch (_) { /* 忽略清理错误 */ }
    console.log(TAG + " [Step6] 大纲已上传: " + outlineJsonPath);

    // 更新章节 totalPages + outlinePath
    await chapterRepo.updateChapterTotalPages(chapterId, totalSlides, outlineJsonPath);

    // ───── Step 7：PPT + TTS 并行生成 ─────
    console.log(TAG + " [Step7] PPT + TTS 并行生成启动...");

    // 初始化文件进度
    await chapterRepo.updateChapterProgress(chapterId, {
      phase: "ppt_generating",
      filesProgress: { current: 0, total: totalSlides * 3, isComplete: false },
    });

    // 推导图片基础 URL（不含子目录，子目录由 PIC 的 path 字段自带如 images/xxx.jpg）
    const mdDir = course.textbookPath.replace(/\/[^/]+\.md$/, "");
    const imageBaseUrl = "/api/v1/files" + mdDir;

    // PPT 生成（复用 Phase 4，但进度写 chapter 而非 course）
    const pptAllSuccess = await (async () => {
      if (totalSlides === 0) { return true; }
      const PQueue = await getPQueue();
      const pptQueue = new PQueue({ concurrency: 5 });
      let pptSuccessCount = 0, pptFailCount = 0;

      const tasks = outline.slides.map((slide, idx) => {
        return pptQueue.add(async () => {
          const slideNum = pad(idx + 1);
          try {
            const pptGuide = slide.pptGuide || slide.ppt_guide || "";
            const slideText = slide.script || slide.content || "";
            // 构造图片信息列表：从 PIC 字段读取图片路径和描述，转为完整代理 URL
            // PIC 的 path 自带子目录（如 "images/xxx.jpg" 或 "image/xxx.jpg"），原样拼接到 imageBaseUrl 后
            const rawPic = slide.PIC || [];
            const imageInfos = rawPic.map((item) => {
                if (typeof item === "string") {
                    return { url: imageBaseUrl + "/" + item, desc: "" };
                } else if (item && typeof item === "object") {
                    return { url: imageBaseUrl + "/" + (item.path || ""), desc: item.desc || "" };
                }
                return { url: "", desc: "" };
            }).filter(info => info.url);
            // 批量查询图片像素尺寸
            const enrichedImageInfos = await enrichImageInfosWithSize(imageInfos);
            const htmlResult = await generateHtmlPpt(course.userId, pptGuide, slideText, enrichedImageInfos);
            if (htmlResult.code !== 200 || !htmlResult.html) {
              pptFailCount++;
              return;
            }
            let htmlContent = htmlResult.html;
            if (typeof htmlContent === "string") {
              htmlContent = htmlContent.replace(/\\n/g, "\n");
            }
            const tempHtmlPath = path.join(os.tmpdir(), "jinmao-ppt-ch" + chapterId + "-" + slideNum + ".html");
            fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");
            const minioPath = chapterRoot + "PPT/slide_" + slideNum + ".html";
            const upResult = await uploadMinio.upload(tempHtmlPath, minioPath);
            try { fs.unlinkSync(tempHtmlPath); } catch (_) { /* 忽略 */ }
            if (upResult.code !== 200) { pptFailCount++; return; }
            pptSuccessCount++;
            // 原子递增加载章节进度（PPT 每文件计 1）
            chapterRepo.incrementChapterProgress(chapterId, "filesProgress.current", 1).catch(() => {});
          } catch (err) {
            console.error(TAG + " [Step7] PPT 幻灯片 " + slideNum + " 异常: " + err.message);
            pptFailCount++;
          }
        });
      });
      await Promise.all(tasks);
      console.log(TAG + " [Step7] PPT 生成完成，成功 " + pptSuccessCount + " / 失败 " + pptFailCount);
      return pptFailCount === 0;
    })();

    // TTS 生成（复用 Phase 5，但进度写 chapter 而非 course）
    const ttsAllSuccess = await (async () => {
      if (totalSlides === 0) { return true; }
      const PQueue = await getPQueue();
      const ttsQueue = new PQueue({ concurrency: 3 });
      let ttsSuccessCount = 0, ttsFailCount = 0;

      const tasks = outline.slides.map((slide, idx) => {
        return ttsQueue.add(async () => {
          const slideNum = pad(idx + 1);
          const script = slide.script || slide.elaboration || "";
          if (!script.trim()) { return; }
          try {
            const ttsResult = await synthesize(course.userId, script);
            if (ttsResult.code !== 200) { ttsFailCount++; return; }
            const { mp3Path, srtPath } = ttsResult;
            const mp3MinioPath = chapterRoot + "Audio/slide_" + slideNum + ".mp3";
            const srtMinioPath = chapterRoot + "SRT/slide_" + slideNum + ".srt";
            const mp3Up = await uploadMinio.upload(mp3Path, mp3MinioPath);
            const srtUp = await uploadMinio.upload(srtPath, srtMinioPath);
            try { fs.unlinkSync(mp3Path); } catch (_) { /* 忽略 */ }
            try { fs.unlinkSync(srtPath); } catch (_) { /* 忽略 */ }
            if (mp3Up.code === 200 && srtUp.code === 200) {
              ttsSuccessCount++;
              // 原子递增加载章节进度（MP3 + SRT 各计 1，共 +2）
              chapterRepo.incrementChapterProgress(chapterId, "filesProgress.current", 2).catch(() => {});
            } else {
              ttsFailCount++;
            }
          } catch (err) {
            console.error(TAG + " [Step7] TTS 幻灯片 " + slideNum + " 异常: " + err.message);
            ttsFailCount++;
          }
        });
      });
      await Promise.all(tasks);
      console.log(TAG + " [Step7] TTS 生成完成，成功 " + ttsSuccessCount + " / 失败 " + ttsFailCount);
      return ttsFailCount === 0;
    })();

    // ───── Step 8：校验与最终状态 ─────
    console.log(TAG + " [Step8] 数据完整性校验...");
    await chapterRepo.updateChapterProgress(chapterId, { phase: "validating" });

    let finalStatus;
    if (isLastChapter) {
      // 最后一章：课程流水线标记为已完成（无更多章节要生成）
      if (pptAllSuccess && ttsAllSuccess) {
        finalStatus = "completed";
        console.log(TAG + " [Step8] 最后一章，全部文件完整，标记为 completed");
        await bookRepo.updatePipelineStatus(courseId, "completed");
      } else {
        // 最后一章存在文件缺失 → 章节设为 partial_completed，并自动触发补全
        finalStatus = "partial_completed";
        console.warn(TAG + " [Step8] 最后一章但存在文件缺失（PPT全部成功=" + pptAllSuccess + ", TTS全部成功=" + ttsAllSuccess + "）");
        // 课程流水线仍标记为已完成（无更多章节），但章节状态反映文件完整性
        await bookRepo.updatePipelineStatus(courseId, "completed");
        // 自动启动后台文件补全任务
        console.log(TAG + " [Step8] 自动触发文件补全，章节 ID: " + chapterId);
        fixMissingFilesForChapter(courseId, chapterId).catch(err => {
          console.error(TAG + " [Step8] 自动补全启动失败: " + err.message);
        });
      }
    } else if (pptAllSuccess && ttsAllSuccess) {
      finalStatus = "completed";
      console.log(TAG + " [Step8] 校验通过，所有文件完整");
    } else {
      finalStatus = "partial_completed";
      console.warn(TAG + " [Step8] 部分文件缺失（PPT全部成功=" + pptAllSuccess + ", TTS全部成功=" + ttsAllSuccess + "）");

      // 自动启动后台文件补全任务（fixMissingFilesForChapter 异步非阻塞，内部有去重机制）
      console.log(TAG + " [Step8] 自动触发文件补全，章节 ID: " + chapterId);
      fixMissingFilesForChapter(courseId, chapterId).catch(err => {
        console.error(TAG + " [Step8] 自动补全启动失败: " + err.message);
      });
    }

    // 更新章节状态 + 清空进度数据
    await chapterRepo.updateChapter(chapterId, { status: finalStatus, generationProgress: null });

    // ========== 兜底检测：如果 endline 已到达或超出文件总行数，补设 isLastChapter ==========
    // Step3 的 isLastChapter 只在 extractLines 返回 206 时触发。
    // 但若提取范围恰好精确匹配文件末尾（不触发 206 截断），则需要在此处兜底检测。
    // totalLineCount 从 extractLines 的返回值中获取（v1.21.12+ 新增字段）
    const totalLineCount = extractedResult.totalLineCount;
    if (!isLastChapter && totalLineCount && endline && endline >= totalLineCount) {
      console.log(TAG + " [兜底] endline(" + endline + ") >= 文件总行数(" + totalLineCount + ")，补设 isLastChapter=true");
      await bookRepo.updatePipelineProgress(courseId, { isLastChapter: true });
      isLastChapter = true; // 同步本地变量（虽然此处已近结束，但保持一致性）
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(TAG + " ========== 单章生成完成 ==========");
    console.log(TAG + " 最终状态: " + finalStatus + "，耗时: " + elapsed + " 秒");

    return { code: 200, status: finalStatus };

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(TAG + " ========== 单章生成致命错误 ==========");
    console.error(TAG + " 错误信息: " + err.message);
    console.error(TAG + " 已耗时: " + elapsed + " 秒");

    // 如果已是最后一章（pipelineProgress 中已持久化 isLastChapter 标记），
    // 即使流水线异常也要标记课程为 completed，防止用户继续创建无效章节
    if (isLastChapter) {
      try {
        await bookRepo.updatePipelineStatus(courseId, "completed");
        console.log(TAG + " 最后一章生成异常，但课程已标记为 completed（无更多内容可生成）");
      } catch (statusErr) {
        console.error(TAG + " 更新 pipelineStatus 为 completed 时出错: " + statusErr.message);
      }
    }

    // 将章节标记为失败
    try {
      await chapterRepo.updateChapter(chapterId, { status: "failed", generationProgress: null });
    } catch (statusErr) {
      console.error(TAG + " 更新失败状态时出错: " + statusErr.message);
    }

    return { code: 500, message: "章节生成失败: " + err.message };
  }
}

// ==================== 文件补全去重 Map ====================
// key = chapterId（字符串），value = { isFixing: true, startTime, missingFiles: [...] }
// 用于防止用户多次刷新/重复请求时创建多个补全任务
const fixingChapters = new Map();

// ==================== 文件补全函数 ====================

/**
 * 检查章节下所有文件完整性，对缺失的 PPT/MP3/SRT 文件进行异步补全
 * 用于 partial_completed 状态章节的自动修复
 *
 * @param {string|number} courseId - 课程 ID
 * @param {string|number} chapterId - 章节 ID
 * @returns {Promise<{ code: number, status: string, missingFiles: string[], message: string }>}
 *   code=200 补全任务已启动，code=409 已有进行中任务
 */
async function fixMissingFilesForChapter(courseId, chapterId) {
  const FIX_TAG = "[fix_missing]";
  console.log(FIX_TAG + " 收到补全请求: courseId=" + courseId + ", chapterId=" + chapterId);

  // ========== 去重检查 ==========
  if (fixingChapters.has(String(chapterId))) {
    const existing = fixingChapters.get(String(chapterId));
    console.log(FIX_TAG + " 章节 " + chapterId + " 已有补全任务进行中，跳过");
    return {
      code: 409,
      status: "already_fixing",
      missingFiles: existing.missingFiles || [],
      message: "该章节已有文件补全任务在进行中",
    };
  }

  // ========== 设置去重标记 ==========
  fixingChapters.set(String(chapterId), { isFixing: true, startTime: Date.now(), missingFiles: [] });
  console.log(FIX_TAG + " 开始异步补全章节 " + chapterId);

  // ========== 异步执行补全（不阻塞 API 响应） ==========
  (async () => {
    try {
      // ---- a. 查 DB 获取章节信息 ----
      const chapterResult = await chapterRepo.getChapterById(chapterId);
      if (chapterResult.code !== 200) {
        console.error(FIX_TAG + " 章节查询失败: " + (chapterResult.message || "未知错误"));
        fixingChapters.delete(String(chapterId));
        return;
      }
      const chapter = chapterResult.chapter;
      const chapterRoot = chapter.chapterRoot;           // 如 "/usercourse/1/19/chapter_01/"
      const outlinePath = chapter.outlinePath;            // 如 "/usercourse/1/19/chapter_01/chapter_01.json"
      const totalPages = chapter.totalPages || 0;

      console.log(FIX_TAG + " 章节信息: name=" + chapter.name + ", totalPages=" + totalPages +
        ", chapterRoot=" + chapterRoot + ", outlinePath=" + outlinePath);

      if (!outlinePath || totalPages === 0) {
        console.warn(FIX_TAG + " 章节缺少大纲路径或总页数，无法补全");
        fixingChapters.delete(String(chapterId));
        return;
      }

      // ---- b. 从 MinIO 读取大纲 JSON ----
      let outline;
      try {
        const cleanPath = outlinePath.replace(/^\/+/, "");
        console.log(FIX_TAG + " 读取大纲: " + cleanPath);
        const stream = await minioClient.getObject(BUCKET, cleanPath);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const jsonStr = Buffer.concat(chunks).toString("utf-8");
        outline = JSON.parse(jsonStr);
        console.log(FIX_TAG + " 大纲解析成功，slides 数量: " + (outline?.slides?.length || 0));
      } catch (err) {
        console.error(FIX_TAG + " 大纲读取失败: " + err.message);
        fixingChapters.delete(String(chapterId));
        return;
      }

      const slides = outline.slides || [];
      if (slides.length === 0) {
        console.warn(FIX_TAG + " 大纲中无幻灯片数据");
        fixingChapters.delete(String(chapterId));
        return;
      }

      // ---- c. 逐页检查 MinIO 文件是否存在 ----
      const missingFiles = [];
      const cleanRoot = chapterRoot.replace(/^\/+/, ""); // "usercourse/1/19/chapter_01/"

      for (let i = 0; i < slides.length; i++) {
        const slideNum = pad(i + 1);

        // 检查 PPT 文件
        const pptKey = cleanRoot + "PPT/slide_" + slideNum + ".html";
        try {
          await minioClient.statObject(BUCKET, pptKey);
        } catch {
          missingFiles.push({ type: "ppt", page: i + 1, key: pptKey });
        }

        // 检查 MP3 文件（仅对有脚本的 slide）
        const slideScript = slides[i].script || slides[i].elaboration || "";
        if (slideScript.trim()) {
          const mp3Key = cleanRoot + "Audio/slide_" + slideNum + ".mp3";
          try {
            await minioClient.statObject(BUCKET, mp3Key);
          } catch {
            missingFiles.push({ type: "mp3", page: i + 1, key: mp3Key });
          }

          // 检查 SRT 文件
          const srtKey = cleanRoot + "SRT/slide_" + slideNum + ".srt";
          try {
            await minioClient.statObject(BUCKET, srtKey);
          } catch {
            missingFiles.push({ type: "srt", page: i + 1, key: srtKey });
          }
        }
      }

      if (missingFiles.length === 0) {
        console.log(FIX_TAG + " 所有文件完整，无需补全");
        // 如果章节是 partial_completed，更新为 completed
        if (chapter.status === "partial_completed") {
          await chapterRepo.updateChapter(chapterId, { status: "completed" });
          console.log(FIX_TAG + " 章节状态已更新为 completed");
        }
        fixingChapters.delete(String(chapterId));
        return;
      }

      // 更新去重 Map 中的缺失文件列表
      const missingFileKeys = missingFiles.map(f => f.key);
      fixingChapters.set(String(chapterId), {
        isFixing: true,
        startTime: Date.now(),
        missingFiles: missingFileKeys,
      });

      // 如果章节是 completed 但有缺失文件，更新为 partial_completed（前端显示琥珀色警告图标）
      if (chapter.status === "completed") {
        console.log(FIX_TAG + " 章节状态为 completed 但发现 " + missingFiles.length + " 个缺失文件，更新为 partial_completed");
        await chapterRepo.updateChapter(chapterId, { status: "partial_completed" });
      }

      console.log(FIX_TAG + " 发现 " + missingFiles.length + " 个缺失文件，开始补全...");
      missingFiles.forEach(f => console.log(FIX_TAG + "  缺失: " + f.key + " (类型: " + f.type + ", 页码: " + f.page + ")"));

      // ---- d. 按页分组补全文件 ----
      // 按页码分组，同一页的 MP3+SRT 可共享一次 TTS 调用
      const pagesNeedingFix = new Map(); // key=page, value={ needPpt, needTts }
      for (const missing of missingFiles) {
        if (!pagesNeedingFix.has(missing.page)) {
          pagesNeedingFix.set(missing.page, { needPpt: false, needTts: false });
        }
        const entry = pagesNeedingFix.get(missing.page);
        if (missing.type === "ppt") entry.needPpt = true;
        if (missing.type === "mp3" || missing.type === "srt") entry.needTts = true;
      }

      let fixedCount = 0;
      let failCount = 0;

      // 获取课程信息（用于 PPT 生成时的图片引用 + userId 计费关联）
      const courseResult = await bookRepo.getCourseById(courseId);
      let imageBaseUrl = "";
      let fixUserId = "unknown"; // 默认值，后续从 course 对象中提取
      if (courseResult.code === 200 && courseResult.course) {
        const mdDir = (courseResult.course.textbookPath || "").replace(/\/[^/]+\.md$/, "");
        imageBaseUrl = "/api/v1/files" + mdDir;
        fixUserId = String(courseResult.course.userId || "unknown");
      }

      for (const [page, needs] of pagesNeedingFix) {
        const slideNum = pad(page);
        const slide = slides[page - 1];
        const slideScript = slide.script || slide.elaboration || "";

        // ---- 修复 TTS 文件（MP3+SRT） ----
        if (needs.needTts && slideScript.trim()) {
          try {
            console.log(FIX_TAG + " 补全 TTS: 第 " + page + " 页...");
            const ttsResult = await synthesize(fixUserId, slideScript);
            if (ttsResult.code !== 200) {
              console.warn(FIX_TAG + " TTS 合成失败 第 " + page + " 页: code=" + ttsResult.code);
              failCount++;
            } else {
              const { mp3Path: localMp3, srtPath: localSrt } = ttsResult;

              // 上传 MP3
              if (needs.needTts || missingFiles.some(f => f.page === page && f.type === "mp3")) {
                const mp3MinioPath = cleanRoot + "Audio/slide_" + slideNum + ".mp3";
                try {
                  const mp3Up = await uploadMinio.upload(localMp3, mp3MinioPath);
                  if (mp3Up.code === 200) {
                    fixedCount++;
                    console.log(FIX_TAG + "  已补全 MP3: " + mp3MinioPath);
                  } else {
                    failCount++;
                  }
                } catch (err) {
                  console.warn(FIX_TAG + " MP3 上传失败: " + err.message);
                  failCount++;
                }
              }

              // 上传 SRT
              if (needs.needTts || missingFiles.some(f => f.page === page && f.type === "srt")) {
                const srtMinioPath = cleanRoot + "SRT/slide_" + slideNum + ".srt";
                try {
                  const srtUp = await uploadMinio.upload(localSrt, srtMinioPath);
                  if (srtUp.code === 200) {
                    fixedCount++;
                    console.log(FIX_TAG + "  已补全 SRT: " + srtMinioPath);
                  } else {
                    failCount++;
                  }
                } catch (err) {
                  console.warn(FIX_TAG + " SRT 上传失败: " + err.message);
                  failCount++;
                }
              }

              // 清理 TTS 本地临时文件
              try { fs.unlinkSync(localMp3); } catch (_) { /* 忽略 */ }
              try { fs.unlinkSync(localSrt); } catch (_) { /* 忽略 */ }
            }
          } catch (err) {
            console.error(FIX_TAG + " TTS 补全异常 第 " + page + " 页: " + err.message);
            failCount++;
          }
        }

        // ---- 修复 PPT 文件 ----
        if (needs.needPpt) {
          try {
            console.log(FIX_TAG + " 补全 PPT: 第 " + page + " 页...");
            const pptGuide = slide.pptGuide || slide.ppt_guide || "";
            const slideText = slideScript || slide.content || "";
            // 构造图片信息列表：PIC 的 path 自带子目录，原样拼接到 imageBaseUrl 后
            const rawPic = slide.PIC || [];
            const imageInfos = rawPic.map((item) => {
                if (typeof item === "string") {
                    return { url: imageBaseUrl + "/" + item, desc: "" };
                } else if (item && typeof item === "object") {
                    return { url: imageBaseUrl + "/" + (item.path || ""), desc: item.desc || "" };
                }
                return { url: "", desc: "" };
            }).filter(info => info.url);
            // 批量查询图片像素尺寸
            const enrichedImageInfos = await enrichImageInfosWithSize(imageInfos);
            const htmlResult = await generateHtmlPpt(fixUserId, pptGuide, slideText, enrichedImageInfos);
            if (htmlResult.code !== 200 || !htmlResult.html) {
              console.warn(FIX_TAG + " PPT 生成失败 第 " + page + " 页");
              failCount++;
            } else {
              let htmlContent = htmlResult.html;
              if (typeof htmlContent === "string") {
                htmlContent = htmlContent.replace(/\\n/g, "\n");
              }
              const tempHtmlPath = path.join(os.tmpdir(), "jinmao-fix-ppt-ch" + chapterId + "-" + slideNum + ".html");
              fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");
              const pptMinioPath = cleanRoot + "PPT/slide_" + slideNum + ".html";
              const upResult = await uploadMinio.upload(tempHtmlPath, pptMinioPath);
              try { fs.unlinkSync(tempHtmlPath); } catch (_) { /* 忽略 */ }
              if (upResult.code === 200) {
                fixedCount++;
                console.log(FIX_TAG + "  已补全 PPT: " + pptMinioPath);
              } else {
                failCount++;
              }
            }
          } catch (err) {
            console.error(FIX_TAG + " PPT 补全异常 第 " + page + " 页: " + err.message);
            failCount++;
          }
        }
      }

      console.log(FIX_TAG + " 补全完成: 成功 " + fixedCount + " / 失败 " + failCount);

      // ---- e. 补全后再次检查完整性，更新章节状态 ----
      let allComplete = true;
      // 重新检查所有文件
      for (const missing of missingFiles) {
        try {
          await minioClient.statObject(BUCKET, missing.key);
        } catch {
          allComplete = false;
          break;
        }
      }

      if (allComplete && chapter.status === "partial_completed") {
        await chapterRepo.updateChapter(chapterId, { status: "completed" });
        console.log(FIX_TAG + " 章节状态已更新为 completed");
      }

    } catch (err) {
      console.error(FIX_TAG + " 补全过程异常: " + err.message);
      console.error(err.stack);
    } finally {
      // ---- f. 清除去重标记 ----
      fixingChapters.delete(String(chapterId));
      console.log(FIX_TAG + " 补全任务结束，去重标记已清除");
    }
  })();

  // ========== 立即返回（补全在后台异步执行） ==========
  return {
    code: 200,
    status: "fixing",
    missingFiles: [],
    message: "文件补全任务已启动，正在后台执行",
  };
}

/**
 * 查询章节文件补全状态（供前端轮询）
 */
function getFixStatus(chapterId) {
  const entry = fixingChapters.get(String(chapterId));
  if (entry && entry.isFixing) {
    return {
      isFixing: true,
      missingFiles: entry.missingFiles || [],
    };
  }
  return {
    isFixing: false,
    missingFiles: [],
  };
}

// ==================== 模块导出 ====================
module.exports = { pipeline, generateChapter, fixMissingFilesForChapter, getFixStatus };
