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
 *   3. text 长度不能超过限制
 * @param {string} text - 待合成的文本
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateInput(text) {
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

    // 3. 长度限制检查
    if (text.length > MAX_TEXT_LENGTH) {
        let errMsg = "[text_tts][validateInput] 错误：输入文本长度(" + text.length + ")超过最大限制(" + MAX_TEXT_LENGTH + ")。";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    console.log("[text_tts][validateInput] 输入验证通过，文本长度: " + text.length + " 字符。");
    return { valid: true };
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

// ==================== 核心合成函数：流式调用 TTS API ====================

/**
 * 调用火山引擎 TTS HTTP Chunked API 进行文本合成
 * 流式接收音频数据（base64）和字幕数据（sentence），
 * 分别写入 MP3 文件和 SRT 文件。
 * @param {string} text - 待合成的文本
 * @param {object} ttsConfig - 火山引擎 TTS 配置对象
 * @param {string} userId - 用户 ID（用于计费关联）
 * @returns {Promise<{ code: number, mp3Path?: string, srtPath?: string, message?: string }>}
 */
function callTtsApi(text, ttsConfig, userId) {
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
                const timestamp = generateTimestamp();
                const mp3Path = path.join(OUTPUT_DIR, "tts_" + timestamp + ".mp3");
                const srtPath = path.join(OUTPUT_DIR, "tts_" + timestamp + ".srt");

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
 *   3. 调用火山引擎 TTS API 流式合成
 *   4. 将返回的音频和字幕写入本地文件
 *   5. 返回文件路径和状态码
 * @param {string} userId - 用户 ID（用于计费关联）
 * @param {string} text - 待合成语音的文本
 * @returns {Promise<{ code: number, mp3Path?: string, srtPath?: string, message?: string }>}
 */
async function synthesize(userId, text) {
    console.log("[text_tts][synthesize] ========== 开始 TTS 合成 ==========");

    // 第一步：输入校验（在校验通过前不直接使用 text 的方法，避免 null/undefined 崩溃）
    const validation = validateInput(text);
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

    // 第三步：调用 TTS API 进行合成（传入 userId 用于计费）
    const result = await callTtsApi(text, ttsConfig, userId);

    console.log("[text_tts][synthesize] ========== TTS 合成结束，code: " + result.code + " ==========");
    return result;
}

// ==================== 模块导出 ====================
// 导出 synthesize 主函数和 validateInput 校验函数
module.exports = {
    synthesize,
    validateInput,
};
