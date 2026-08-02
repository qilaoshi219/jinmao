// ============================================================================
// 特殊情况注明（项目规则：非特殊 js 文件超过 300 行即视为 bug）：
// 本文件超过 300 行（不含注释），属于特殊情况——TTS 流式合成涉及
// 输入校验、无损分块、流式响应解析、SRT 生成、分块文件合并等完整逻辑，
// 各环节职责单一、内聚，拆分反而会增加模块间耦合，故保留为单文件。
// ============================================================================
//该脚本负责将输入的文本转换为mp3文件和srt字幕文件
//该脚本接受输入一段字符串，将字符串发送给火山引擎的tts转换模型，可以得到返回，将返回的内容解析为MP3文件和SRT字幕文件，然后返回这两个文件。
//srt文件的每一行不能过长，每一个逗号每一个句号都应该被单独处理，不能被合并到上一行。
//返回时，将MP3文件和SRT字幕文件的路径返回。此外还返回一个错误码，错误码请参考其他模块的错误码
//返回值格式：{ code: number, mp3Path?: string, srtPath?: string, message?: string }
//  code 200 — 合成成功，返回 mp3Path 和 srtPath
//  code 400 — 输入参数不合法（空文本/非字符串类型）
//  code 500 — TTS API 调用失败（网络错误/服务端错误）
//  code 502 — API 返回数据解析失败（JSON 解析错误）
//  code 503 — API 返回格式不符合预期（缺少必要字段）
//  code 504 — 配置加载失败（volcengine_config.json 不存在或格式错误）

const https = require("https"); // Node.js 内置 HTTPS 模块，用于发起 API 请求
const fs = require("fs");        // 文件系统模块，用于读写 MP3 和 SRT 文件
const path = require("path");    // 路径处理模块，用于拼接输出文件路径
const { volcengine: volcengineConfig } = require("../config"); // 统一配置入口（敏感字段从 .env 注入）
const { recordExternalCost } = require("../utils/billing");   // 计费模块

// 输出文件目录路径
const OUTPUT_DIR = path.join(__dirname, "..", "data", "output");
// 最大文本长度限制（火山引擎 TTS 单次合成文本长度限制）
const MAX_TEXT_LENGTH = 1024;

// ==================== SRT 字幕分句标点符号 ====================
// 这些标点符号结尾的 word 将作为 SRT 条目的分隔点
// 每个标点结束一个 SRT 子条目，确保字幕逐句显示
const SENTENCE_END_PUNCTUATION = /[。，；！？：,;!?:]$/;

// ==================== 时间戳格式化辅助函数 ====================

/**
 * 将秒数（浮点数）转换为 SRT 时间格式 HH:MM:SS,mmm
 * 例如：10.505 → 00:00:10,505
 * @param {number} seconds - 以秒为单位的时间值（支持小数）
 * @returns {string} SRT 格式的时间字符串
 */
function formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
    // 使用 padStart 确保每段都是两位或三位数
    return String(hours).padStart(2, "0") + ":" +
           String(minutes).padStart(2, "0") + ":" +
           String(secs).padStart(2, "0") + "," +
           String(millis).padStart(3, "0");
}

// ==================== 输入校验函数 ====================

/**
 * 校验输入文本参数的合法性
 * 检查内容：
 *   1. text 不能为空（null / undefined / 空字符串）
 *   2. text 必须为 string 类型
 *   3. text 长度不能超过限制（可通过 opts.checkLength=false 跳过，
 *      由 synthesize 的长文本无损分块逻辑保证每块不超过限制）
 * @param {string} text - 待合成的文本
 * @param {{ checkLength?: boolean }} [opts] - 可选配置，checkLength 默认 true
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateInput(text, opts) {
    opts = opts || {}; // 可选配置，避免 null 崩溃

    // 1. 空值检查
    if (text === null || text === undefined || text === "") {
        let errMsg = "[text_tts][validateInput] 错误：输入文本(text)不能为空。";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    // 2. 类型检查
    if (typeof text !== "string") {
        let errMsg = "[text_tts][validateInput] 错误：输入文本(text)必须为字符串类型，实际类型为 " + typeof text + "。";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    // 3. 长度限制检查（仅当未显式跳过时执行）
    if (opts.checkLength !== false && text.length > MAX_TEXT_LENGTH) {
        let errMsg = "[text_tts][validateInput] 错误：输入文本长度(" + text.length + ")超过最大限制(" + MAX_TEXT_LENGTH + ")。";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    console.log("[text_tts][validateInput] 输入验证通过，文本长度: " + text.length + " 字符。");
    return { valid: true };
}

// ==================== 长文本无损分块函数 ====================

// 强分隔符：句号、问号、感叹号、分号（优先在此类标点后切分，语义完整、语音自然）
const STRONG_SPLIT_PUNCTS = "。！？；!?;";
// 弱分隔符：逗号、顿号、冒号（窗口内没有强分隔符时退而求其次）
const WEAK_SPLIT_PUNCTS = "，、：:,";

/**
 * 按标点符号对超长文本进行无损分块
 * 背景：火山引擎 TTS 单次合成有 1024 字符硬限制，超长文本必须切分为多块逐块合成。
 * 分块策略（保证每块不超过 maxLength 且语义完整，避免语音被拦腰截断产生顿挫感）：
 *   1. 在前 maxLength 个字符的窗口内，优先找最后一个"强分隔符"（句号/问号/感叹号/分号），在其后切分
 *   2. 若无强分隔符，则找最后一个"弱分隔符"（逗号/顿号/冒号），在其后切分
 *   3. 若窗口内完全无标点（连续超长无标点文本），只能硬切，避免死循环
 * 切分后每块末尾保留标点，语音模型朗读到标点处自然停顿，衔接连贯。
 * @param {string} text - 待分块的完整文本
 * @param {number} maxLength - 每块的最大字符数
 * @returns {string[]} 分块结果数组（每块非空且长度不超过 maxLength）
 */
function splitTextByPunctuation(text, maxLength) {
    const chunks = [];    // 分块结果数组
    let remaining = text; // 尚未分块的剩余文本

    while (remaining.length > maxLength) {
        // 只在前 maxLength 个字符范围内寻找切分点，保证每块长度不超限
        const window = remaining.substring(0, maxLength);

        // 1. 优先找窗口内最后一个强分隔符（语义最完整的切分点）
        let splitPos = -1;
        for (const p of STRONG_SPLIT_PUNCTS) {
            const idx = window.lastIndexOf(p);
            if (idx > splitPos) splitPos = idx;
        }

        // 2. 没有强分隔符时，找窗口内最后一个弱分隔符
        if (splitPos <= 0) {
            for (const p of WEAK_SPLIT_PUNCTS) {
                const idx = window.lastIndexOf(p);
                if (idx > splitPos) splitPos = idx;
            }
        }

        // 3. 窗口内完全没有标点（或标点出现在第 0 位），只能硬切，避免产生空块
        if (splitPos <= 0) {
            splitPos = maxLength - 1;
        }

        // 切出当前块（substring 包含 splitPos 处的标点，语义完整）
        chunks.push(remaining.substring(0, splitPos + 1));
        remaining = remaining.substring(splitPos + 1);
    }

    // 剩余不足一块的内容直接作为最后一块（保证不丢文本）
    if (remaining.length > 0) {
        chunks.push(remaining);
    }
    return chunks;
}

// ==================== 生成输出文件时间戳 ====================

/**
 * 生成格式化的时间戳字符串，用于输出文件命名
 * 格式：YYYY-MM-DDTHH-mm-ss
 * @returns {string} 时间戳字符串
 */
function generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return year + "-" + month + "-" + day + "T" + hours + "-" + minutes + "-" + seconds;
}

// ==================== SRT 字幕生成函数 ====================

/**
 * 将 API 返回的字幕 words 列表转换为 SRT 格式文本
 * 分句规则：遇到以标点符号（句号、逗号、分号、感叹号、问号、冒号）结尾的 word 时，
 * 将当前累加的子句作为一条独立的 SRT 条目输出。
 * 每个 SRT 条目格式：
 *   序号
 *   HH:MM:SS,mmm --> HH:MM:SS,mmm
 *   字幕文本
 * @param {Array<{text: string, words: Array<{word: string, startTime: number, endTime: number, confidence: number}>}>} sentenceList
 *   - 从 API 收集的字幕句子列表
 * @returns {string} 完整的 SRT 格式文本
 */
function generateSrtContent(sentenceList) {
    let srtContent = "";          // 最终输出的 SRT 文本
    let entryIndex = 1;           // SRT 条目序号，从 1 开始
    let currentWords = "";        // 当前子句累加的文本
    let currentStartTime = null;  // 当前子句的起始时间
    let currentEndTime = null;    // 当前子句的结束时间

    // 遍历每个句子中的所有 word
    for (const sentence of sentenceList) {
        if (!sentence.words || sentence.words.length === 0) {
            continue; // 跳过无 words 的句子
        }

        for (const wordInfo of sentence.words) {
            const wordText = wordInfo.word;
            const startTime = wordInfo.startTime;
            const endTime = wordInfo.endTime;

            // 如果是当前子句的第一个词，记录起始时间
            if (currentStartTime === null) {
                currentStartTime = startTime;
            }

            // 累加文本和更新结束时间
            currentWords += wordText;
            currentEndTime = endTime;

            // 检查当前 word 是否以标点符号结尾
            if (SENTENCE_END_PUNCTUATION.test(wordText)) {
                // 遇到分隔标点，输出当前子句为一个 SRT 条目
                srtContent += entryIndex + "\n";
                srtContent += formatSrtTime(currentStartTime) + " --> " + formatSrtTime(currentEndTime) + "\n";
                srtContent += currentWords + "\n\n";
                entryIndex++;

                // 重置当前子句状态，准备下一个子句
                currentWords = "";
                currentStartTime = null;
                currentEndTime = null;
            }
        }
    }

    // 处理末尾没有标点符号的剩余文本（如果有的话）
    if (currentWords.length > 0) {
        srtContent += entryIndex + "\n";
        srtContent += formatSrtTime(currentStartTime) + " --> " + formatSrtTime(currentEndTime) + "\n";
        srtContent += currentWords + "\n\n";
        entryIndex++;
    }

    console.log("[text_tts][generateSrtContent] SRT 字幕生成完成，共 " + (entryIndex - 1) + " 个子条目。");
    return srtContent;
}

// ==================== 分块文件的解析与合并函数 ====================

/**
 * 将 SRT 时间字符串（HH:MM:SS,mmm）转换为毫秒数
 * @param {string} timeStr - SRT 时间字符串，如 "00:00:10,505"
 * @returns {number} 对应的毫秒数
 */
function parseSrtTimeToMs(timeStr) {
    const m = timeStr.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!m) return 0; // 格式异常时按 0 处理
    return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]);
}

/**
 * 将毫秒数格式化为 SRT 时间字符串（HH:MM:SS,mmm）
 * @param {number} ms - 毫秒数
 * @returns {string} SRT 时间字符串
 */
function formatSrtTimeFromMs(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return String(hours).padStart(2, "0") + ":" +
           String(minutes).padStart(2, "0") + ":" +
           String(secs).padStart(2, "0") + "," +
           String(millis).padStart(3, "0");
}

/**
 * 解析 SRT 文件内容为条目数组
 * SRT 每条目格式：
 *   序号
 *   HH:MM:SS,mmm --> HH:MM:SS,mmm
 *   字幕文本
 * @param {string} srtPath - SRT 文件路径
 * @returns {Array<{ startMs: number, endMs: number, text: string }>} 字幕条目数组
 */
function parseSrtFile(srtPath) {
    const content = fs.readFileSync(srtPath, "utf-8");
    const entries = [];
    // SRT 条目之间以空行分隔，按空行切块解析
    const blocks = content.trim().split(/\r?\n\r?\n/);
    for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        if (lines.length < 2) continue; // 跳过异常块
        // 第 1 行为条目序号（忽略），第 2 行为时间行
        const timeMatch = lines[1].match(/^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (!timeMatch) continue; // 时间行格式异常，跳过
        entries.push({
            startMs: parseSrtTimeToMs(timeMatch[1]), // 条目起始毫秒数
            endMs: parseSrtTimeToMs(timeMatch[2]),   // 条目结束毫秒数
            text: lines.slice(2).join("\n"),         // 字幕文本（可能多行）
        });
    }
    return entries;
}

/**
 * 合并多个分块生成的 MP3 和 SRT 文件，输出单一的 MP3/SRT 文件
 * - MP3：按字节直接拼接（各块采样率/编码一致，拼接后可连续播放）
 * - SRT：逐条累加时间偏移（偏移量 = 前面所有块的音频总时长），保证字幕时间轴连续不重叠
 * 合并完成后删除各分块临时文件。
 * @param {string[]} mp3Paths - 各分块的 MP3 文件路径
 * @param {string[]} srtPaths - 各分块的 SRT 文件路径
 * @returns {{ mp3Path: string, srtPath: string }} 合并后的文件路径
 */
function mergeChunkFiles(mp3Paths, srtPaths) {
    const timestamp = generateTimestamp();
    const mp3Path = path.join(OUTPUT_DIR, "tts_" + timestamp + ".mp3");
    const srtPath = path.join(OUTPUT_DIR, "tts_" + timestamp + ".srt");

    // 确保输出目录存在
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 1. 合并 MP3：按字节拼接
    const mp3Buffers = mp3Paths.map(p => fs.readFileSync(p));
    const mergedMp3 = Buffer.concat(mp3Buffers);
    fs.writeFileSync(mp3Path, mergedMp3);
    console.log("[text_tts][mergeChunkFiles] MP3 合并完成: " + mp3Path +
        "（共 " + mp3Paths.length + " 块，" + mergedMp3.length + " 字节）");

    // 2. 合并 SRT：时间轴偏移累加
    let offsetMs = 0;   // 当前块需要累加的时间偏移（毫秒）
    let entryIndex = 1; // 合并后 SRT 的条目序号（从 1 重新编号）
    let mergedSrt = ""; // 合并后的 SRT 文本
    for (let i = 0; i < srtPaths.length; i++) {
        const entries = parseSrtFile(srtPaths[i]);
        for (const entry of entries) {
            mergedSrt += entryIndex + "\n";
            mergedSrt += formatSrtTimeFromMs(entry.startMs + offsetMs) + " --> " +
                         formatSrtTimeFromMs(entry.endMs + offsetMs) + "\n";
            mergedSrt += entry.text + "\n\n";
            entryIndex++;
        }
        // 更新偏移量：本块最后一条字幕的结束时间即本块音频总时长
        if (entries.length > 0) {
            offsetMs += entries[entries.length - 1].endMs;
        }
    }
    fs.writeFileSync(srtPath, mergedSrt, "utf-8");
    console.log("[text_tts][mergeChunkFiles] SRT 合并完成: " + srtPath +
        "（共 " + (entryIndex - 1) + " 条字幕）");

    // 3. 清理各分块的临时文件
    for (const p of mp3Paths.concat(srtPaths)) {
        try { fs.unlinkSync(p); } catch (_) { /* 忽略删除失败 */ }
    }

    return { mp3Path, srtPath };
}

// ==================== 核心合成函数：流式调用 TTS API ====================

/**
 * 调用火山引擎 TTS HTTP Chunked API 进行文本合成
 * 流式接收音频数据（base64）和字幕数据（sentence），
 * 分别写入 MP3 文件和 SRT 文件。
 * @param {string} text - 待合成的文本
 * @param {object} ttsConfig - 火山引擎 TTS 配置对象
 * @param {string} userId - 用户 ID（用于计费关联）
 * @param {string} [fileTag] - 可选文件标识，用于长文本分块合成时区分临时文件，避免同名覆盖
 * @returns {Promise<{ code: number, mp3Path?: string, srtPath?: string, message?: string }>}
 */
function callTtsApi(text, ttsConfig, userId, fileTag) {
    return new Promise((resolve) => {
        // 构造请求体，启用字幕功能
        const requestBody = JSON.stringify({
            user: {
                uid: "node-jinmao-tts" // 用户标识
            },
            req_params: {
                text: text,                           // 待合成文本
                speaker: ttsConfig.SPEAKER,           // 发音人音色
                model: "",                            // 为空则使用默认模型 seed-tts-2.0-expressive
                audio_params: {
                    format: "mp3",                    // 音频编码格式
                    sample_rate: 24000,               // 音频采样率
                    enable_subtitle: true             // 启用字幕返回（TTS 2.0 支持）
                }
            }
        });

        console.log("[text_tts][callTtsApi] 准备发起 TTS API 请求，文本: " + text.substring(0, 50) + (text.length > 50 ? "..." : ""));

        // 解析 API URL，提取 hostname 和 path
        const apiUrl = new URL(ttsConfig.API_URL);

        // 构造请求选项
        const options = {
            hostname: apiUrl.hostname,
            path: apiUrl.pathname,
            method: "POST",
            headers: {
                "Content-Type": "application/json",           // 请求体格式
                "X-Api-App-Id": ttsConfig.APP_ID,             // 火山引擎应用 ID
                "X-Api-Access-Key": ttsConfig.ACCESS_KEY,     // 火山引擎访问密钥
                "X-Api-Resource-Id": ttsConfig.RESOURCE_ID,   // 资源 ID（模型版本）
                "Content-Length": Buffer.byteLength(requestBody) // 请求体长度
            }
        };

        // 发起 HTTPS 请求
        const req = https.request(options, (res) => {
            // 收集音频 base64 数据的缓冲区
            let audioBase64Buffer = "";
            // 收集字幕句子数据的列表
            let sentenceList = [];
            // 记录 API 返回的第一个非零错误码（用于在 end 时明确报错）
            let apiErrorCode = null;
            let apiErrorMessage = null;

            console.log("[text_tts][callTtsApi] API 响应状态码: " + res.statusCode);

            // 检查 HTTP 状态码
            if (res.statusCode !== 200) {
                let errMsg = "[text_tts][callTtsApi] 错误：API 返回非 200 状态码: " + res.statusCode;
                console.error(errMsg);
                // 读取错误响应体以便调试
                let errorBody = "";
                res.on("data", (chunk) => { errorBody += chunk.toString(); });
                res.on("end", () => {
                    console.error("[text_tts][callTtsApi] 错误响应体: " + errorBody);
                    resolve({ code: 500, message: errMsg });
                });
                return; // 不再继续处理流式响应
            }

            // 用于缓存不完整的 JSON 行（跨 chunk 的情况）
            let lineBuffer = "";

            // 流式接收响应数据
            res.on("data", (chunk) => {
                // 将当前 chunk 追加到行缓冲区
                lineBuffer += chunk.toString();

                // 按换行符分割，逐行处理 JSON
                const lines = lineBuffer.split("\n");
                // 最后一行可能不完整（被截断），保留到下一次 data 事件
                lineBuffer = lines.pop() || "";

                for (const line of lines) {
                    // 跳过空行
                    if (line.trim() === "") {
                        continue;
                    }

                    try {
                        const json = JSON.parse(line);

                        // 根据实际 API 返回格式判断事件类型：
                        //   音频数据: {"data": "base64..."}  — 无 code 字段
                        //   字幕事件: {"sentence": {...}}     — 无 code 字段
                        //   附加信息: {"addition": {...}}     — 无 code 字段
                        //   正常结束: {"code": 20000000, "message": "OK"}
                        //   业务错误: {"reqid":"", "code": 55000000, "message": "..."}

                        // 错误条件：code 存在，且不是 0（数据事件）也不是 20000000（结束标记）
                        if (json.code !== undefined && json.code !== 0 && json.code !== 20000000) {
                            // 记录第一个非零错误码，用于在 end 时精准报错
                            if (apiErrorCode === null) {
                                apiErrorCode = json.code;
                                apiErrorMessage = json.message || "未知错误";
                            }
                            let errMsg = "[text_tts][callTtsApi] API 返回错误: code=" +
                                json.code + ", message=" + json.message;
                            console.error(errMsg);
                            continue; // 跳过此行，继续处理后续数据（有利于容错）
                        }

                        // 正常结束标记
                        if (json.code === 20000000) {
                            if (json.usage) {
                                console.log("[text_tts][callTtsApi] 合成完成，用量: " +
                                    JSON.stringify(json.usage));
                            }
                            console.log("[text_tts][callTtsApi] 收到合成结束标记(code=20000000)。");
                            continue;
                        }

                        // 音频 base64 数据
                        if (json.data) {
                            audioBase64Buffer += json.data;
                            continue;
                        }

                        // 字幕数据
                        if (json.sentence) {
                            sentenceList.push(json.sentence);
                            console.log("[text_tts][callTtsApi] 收到字幕数据: " +
                                json.sentence.text.substring(0, 30) + "...");
                            continue;
                        }

                        // 附加信息（音频总时长等）
                        if (json.addition) {
                            console.log("[text_tts][callTtsApi] 收到附加信息: " +
                                JSON.stringify(json.addition));
                            continue;
                        }

                        // 无法识别的 JSON 格式，记录警告
                        console.warn("[text_tts][callTtsApi] 收到未识别的响应行: " + line.substring(0, 100));
                    } catch (parseErr) {
                        // JSON 解析失败，记录警告但不中断处理
                        console.error("[text_tts][callTtsApi] JSON 解析失败: " +
                            parseErr.message + ", 原始行: " + line.substring(0, 100));
                    }
                }
            });

            // 响应结束事件
            res.on("end", () => {
                // 处理行缓冲区中可能残留的不完整行
                if (lineBuffer.trim() !== "") {
                    try {
                        const json = JSON.parse(lineBuffer);
                        // 残留行的数据也按实际格式处理（无 code 字段的数据直接按字段判断）
                        if (json.data) {
                            audioBase64Buffer += json.data;
                        }
                        if (json.sentence) {
                            sentenceList.push(json.sentence);
                        }
                        if (json.code !== undefined && json.code !== 0 && json.code !== 20000000) {
                            if (apiErrorCode === null) {
                                apiErrorCode = json.code;
                                apiErrorMessage = json.message || "未知错误";
                            }
                            console.error("[text_tts][callTtsApi] 残留行返回错误: code=" +
                                json.code + ", message=" + json.message);
                        }
                    } catch (parseErr) {
                        console.error("[text_tts][callTtsApi] 最后一行 JSON 解析失败: " + parseErr.message);
                    }
                }

                console.log("[text_tts][callTtsApi] 流式响应接收完成。");

                // 优先检查 API 是否返回了业务错误码
                if (apiErrorCode !== null) {
                    let errMsg = "[text_tts][callTtsApi] 错误：API 返回业务错误码 " + apiErrorCode
                        + "，消息: " + apiErrorMessage
                        + "。请检查 config/volcengine_config.json 中的 RESOURCE_ID 是否与 SPEAKER 匹配。";
                    console.error(errMsg);
                    resolve({ code: 502, message: errMsg });
                    return;
                }

                console.log("[text_tts][callTtsApi] 音频数据长度(base64): " + audioBase64Buffer.length + " 字符。");
                console.log("[text_tts][callTtsApi] 字幕句子数量: " + sentenceList.length + " 个。");

                // 检查是否收到了音频数据
                if (audioBase64Buffer.length === 0) {
                    let errMsg = "[text_tts][callTtsApi] 错误：未收到任何音频数据，可能是 API 返回为空或文本无法合成。";
                    console.error(errMsg);
                    resolve({ code: 503, message: errMsg });
                    return;
                }

                // 检查是否收到了字幕数据
                if (sentenceList.length === 0) {
                    console.warn("[text_tts][callTtsApi] 警告：未收到任何字幕数据，" +
                        "可能音色不支持字幕或文本过短。");
                }

                // 生成时间戳用于文件命名
                // fileTag 用于长文本分块合成时区分各分块的临时文件，避免同秒内生成的文件名冲突
                const timestamp = generateTimestamp();
                const fileSuffix = fileTag ? "_" + fileTag : "";
                const mp3Path = path.join(OUTPUT_DIR, "tts_" + timestamp + fileSuffix + ".mp3");
                const srtPath = path.join(OUTPUT_DIR, "tts_" + timestamp + fileSuffix + ".srt");

                try {
                    // 确保输出目录存在
                    if (!fs.existsSync(OUTPUT_DIR)) {
                        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                        console.log("[text_tts][callTtsApi] 输出目录已创建: " + OUTPUT_DIR);
                    }

                    // 将 base64 音频数据解码并写入 MP3 文件
                    const mp3Buffer = Buffer.from(audioBase64Buffer, "base64");
                    fs.writeFileSync(mp3Path, mp3Buffer);
                    console.log("[text_tts][callTtsApi] MP3 文件已保存: " + mp3Path +
                        " (大小: " + mp3Buffer.length + " 字节)");

                    // 生成 SRT 字幕内容并写入文件
                    if (sentenceList.length > 0) {
                        const srtContent = generateSrtContent(sentenceList);
                        fs.writeFileSync(srtPath, srtContent, "utf-8");
                        console.log("[text_tts][callTtsApi] SRT 文件已保存: " + srtPath +
                            " (大小: " + Buffer.byteLength(srtContent, "utf-8") + " 字节)");
                    }

                    // 合成成功，返回路径
                    // ========== 计费记录：TTS 按字符数计费 ==========
                    // 计费错误不应影响主流程，使用独立 try-catch 保护
                    try {
                        let audioDuration = 0;
                        if (sentenceList.length > 0) {
                            const lastSentence = sentenceList[sentenceList.length - 1];
                            if (lastSentence.words && lastSentence.words.length > 0) {
                                audioDuration = lastSentence.words[lastSentence.words.length - 1].endTime || 0;
                            }
                        }
                        recordExternalCost({
                            userId: userId,
                            provider: "volcengine",
                            model: "seed-tts-2.0",
                            callTag: "tts",
                            status: "success",
                            textLength: text.length,
                            audioDuration: audioDuration,
                        }).catch(err => console.error("[text_tts] 计费记录写入失败：" + err.message));
                    } catch (billingErr) {
                        // 计费失败不影响文件返回
                        console.error("[text_tts] 计费记录失败（不影响文件输出）：" + billingErr.message);
                    }

                    resolve({
                        code: 200,
                        mp3Path: mp3Path,
                        srtPath: srtPath
                    });
                } catch (fileErr) {
                    // 文件写入失败
                    let errMsg = "[text_tts][callTtsApi] 错误：文件写入失败: " + fileErr.message;
                    console.error(errMsg);
                    resolve({ code: 500, message: errMsg });
                }
            });

            // 响应错误事件（网络中断等）
            res.on("error", (err) => {
                let errMsg = "[text_tts][callTtsApi] 错误：响应流异常: " + err.message;
                console.error(errMsg);
                resolve({ code: 500, message: errMsg });
            });
        });

        // 请求错误事件（连接失败、DNS 解析失败等）
        req.on("error", (err) => {
            let errMsg = "[text_tts][callTtsApi] 错误：API 请求失败: " + err.message;
            console.error(errMsg);
            resolve({ code: 500, message: errMsg });
        });

        // 设置请求超时（30 秒）
        req.setTimeout(30000, () => {
            let errMsg = "[text_tts][callTtsApi] 错误：API 请求超时（30 秒）。";
            console.error(errMsg);
            req.destroy(); // 销毁连接
            resolve({ code: 500, message: errMsg });
        });

        // 发送请求体，结束请求
        req.write(requestBody);
        req.end();
    });
}

// ==================== 主入口函数 ====================

/**
 * 主合成函数 —— 文本转语音（TTS）+ 字幕生成
 * 流程：
 *   1. 调用 validateInput 校验输入参数
 *   2. 读取 volcengine_config.json 配置
 *   3. 长文本按标点无损分块（单次合成有 1024 字符硬限制）
 *   4. 单块直接合成；多块逐块调用火山引擎 TTS API 流式合成
 *   5. 多块时合并 MP3（字节拼接）与 SRT（时间轴偏移），输出单一的 MP3/SRT
 *   6. 返回文件路径和状态码
 * @param {string} userId - 用户 ID（用于计费关联）
 * @param {string} text - 待合成语音的文本
 * @returns {Promise<{ code: number, mp3Path?: string, srtPath?: string, message?: string }>}
 */
async function synthesize(userId, text) {
    console.log("[text_tts][synthesize] ========== 开始 TTS 合成 ==========");

    // 第一步：输入校验（在校验通过前不直接使用 text 的方法，避免 null/undefined 崩溃）
    // 注意：checkLength=false 跳过长度检查——超长文本会走无损分块后逐块合成，
    // 每块长度由 splitTextByPunctuation 保证不超过 1024，单块场景长度必然不超限
    const validation = validateInput(text, { checkLength: false });
    if (!validation.valid) {
        return { code: validation.errorCode, message: validation.error };
    }

    // 校验通过后，text 安全可用
    console.log("[text_tts][synthesize] 输入文本: " + text.substring(0, 50) + (text.length > 50 ? "..." : ""));

    // 第二步：校验配置完整性
    // 配置已通过统一入口 config/index.js 加载（敏感字段从 .env 注入）
    const ttsConfig = volcengineConfig.VOLCENGINE_TTS;
    if (!ttsConfig.APP_ID || !ttsConfig.ACCESS_KEY) {
        let errMsg = "[text_tts][synthesize] 错误：火山引擎 TTS 的 APP_ID 或 ACCESS_KEY 未配置，请在 .env 中填写。";
        console.error(errMsg);
        return { code: 504, message: errMsg };
    }
    console.log("[text_tts][synthesize] 火山引擎 TTS 配置校验通过。");

    // 第三步：长文本无损分块
    // 单次 TTS 合成有 1024 字符硬限制，超长文本按标点（句号/逗号等）语义切分为多块，
    // 每块末尾保留标点保证语音连贯无顿挫；各块合成后合并为一个 MP3 和一个 SRT
    const chunks = splitTextByPunctuation(text, MAX_TEXT_LENGTH);
    console.log("[text_tts][synthesize] 文本无损分块: 共 " + chunks.length + " 块" +
        (chunks.length > 1 ? "，各块长度: " + chunks.map(c => c.length).join(", ") : "（无需分块）"));

    // 第四步：单块场景（常见情况）直接合成，与原有行为完全一致，零回归风险
    if (chunks.length === 1) {
        const result = await callTtsApi(chunks[0], ttsConfig, userId);
        console.log("[text_tts][synthesize] ========== TTS 合成结束，code: " + result.code + " ==========");
        return result;
    }

    // 第五步：多块场景——逐块调用 TTS API 合成（传入 userId 用于计费）
    const mp3Paths = []; // 各分块的 MP3 临时文件路径
    const srtPaths = []; // 各分块的 SRT 临时文件路径
    for (let i = 0; i < chunks.length; i++) {
        console.log("[text_tts][synthesize] 正在合成第 " + (i + 1) + "/" + chunks.length +
            " 块，文本长度: " + chunks[i].length + " 字符");
        // fileTag 用于区分各分块的临时文件，避免同一秒内生成的文件名相互覆盖
        const result = await callTtsApi(chunks[i], ttsConfig, userId, "chunk" + (i + 1));
        if (result.code !== 200) {
            // 任一块失败则整体失败，清理已生成的分块临时文件（避免残留垃圾文件）
            console.error("[text_tts][synthesize] 第 " + (i + 1) + " 块合成失败，清理已生成的分块临时文件");
            for (const p of mp3Paths.concat(srtPaths)) {
                try { fs.unlinkSync(p); } catch (_) { /* 忽略删除失败 */ }
            }
            return result;
        }
        mp3Paths.push(result.mp3Path);
        srtPaths.push(result.srtPath);
    }

    // 第六步：合并各分块文件（MP3 字节拼接 + SRT 时间轴偏移），输出单一的 MP3/SRT
    let finalResult;
    try {
        const merged = mergeChunkFiles(mp3Paths, srtPaths);
        finalResult = { code: 200, mp3Path: merged.mp3Path, srtPath: merged.srtPath };
    } catch (mergeErr) {
        let errMsg = "[text_tts][synthesize] 错误：分块文件合并失败: " + mergeErr.message;
        console.error(errMsg);
        finalResult = { code: 500, message: errMsg };
    }

    console.log("[text_tts][synthesize] ========== TTS 合成结束，code: " + finalResult.code + " ==========");
    return finalResult;
}

// ==================== 模块导出 ====================
// 导出 synthesize 主函数、validateInput 校验函数、splitTextByPunctuation 无损分块函数
module.exports = {
    synthesize,
    validateInput,
    splitTextByPunctuation,
};
