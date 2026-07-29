// ==================== 图片尺寸提取工具模块 ====================
// 职责：从 MinIO 读取图片文件的头部数据，解析出像素宽高
// 不需要完整下载图片，仅读取头部足够字节即可获取尺寸信息
//
// 支持的格式：JPEG、PNG、GIF、WebP、BMP
//
// 返回值格式：{ code: number, width?: number, height?: number, message?: string }
//   code 200 — 成功提取尺寸
//   code 400 — 输入参数不合法
//   code 404 — 文件不存在
//   code 415 — 不支持的图片格式
//   code 500 — 读取或解析失败
//
// 依赖：MinIO Client（由调用方传入实例，保持灵活性）

const path = require("path");

// ==================== 日志前缀 ====================
const TAG = "[image_size]";

// ==================== 需要读取的最大字节数 ====================
// 大多数图片格式的尺寸信息在文件头的前 64KB 内
const MAX_HEADER_BYTES = 65536; // 64KB

/**
 * 从 MinIO 读取图片文件的像素宽高（仅读取头部，不完整下载）
 *
 * @param {Object} minioClient - MinIO 客户端实例
 * @param {string} bucket - MinIO Bucket 名称
 * @param {string} objectKey - MinIO 对象路径（如 "usercourse/1/20/xxx/image/14_172_889_1041_596_0.jpg"）
 * @returns {Promise<{code: number, width?: number, height?: number, message?: string}>}
 */
async function getImageSize(minioClient, bucket, objectKey) {
    // ========== 1. 输入验证 ==========
    if (!minioClient) {
        return { code: 400, message: "minioClient 参数不能为空。" };
    }
    if (!bucket || typeof bucket !== "string") {
        return { code: 400, message: "bucket 参数无效。" };
    }
    if (!objectKey || typeof objectKey !== "string") {
        return { code: 400, message: "objectKey 参数无效。" };
    }

    const ext = path.extname(objectKey).toLowerCase();
    console.log(TAG + " 读取图片尺寸: bucket=" + bucket + ", key=" + objectKey + ", ext=" + ext);

    // ========== 2. 从 MinIO 读取文件头部数据 ==========
    let buffer;
    try {
        // 先检查文件是否存在
        await minioClient.statObject(bucket, objectKey);

        // 使用 getPartialObject 只读取前 MAX_HEADER_BYTES 字节
        const dataStream = await minioClient.getPartialObject(bucket, objectKey, 0, MAX_HEADER_BYTES);

        // 将流收集为 Buffer
        buffer = await streamToBuffer(dataStream);
        console.log(TAG + " 成功读取 " + buffer.length + " 字节头部数据");
    } catch (error) {
        if (error.code === "NoSuchKey" || error.code === "NotFound") {
            console.warn(TAG + " 文件不存在: " + objectKey);
            return { code: 404, message: "图片文件不存在。" };
        }
        console.error(TAG + " MinIO 读取失败: " + error.message);
        return { code: 500, message: "读取图片文件失败: " + error.message };
    }

    // ========== 3. 根据扩展名解析尺寸 ==========
    try {
        let dimensions;
        switch (ext) {
            case ".jpg":
            case ".jpeg":
                dimensions = parseJPEG(buffer);
                break;
            case ".png":
                dimensions = parsePNG(buffer);
                break;
            case ".gif":
                dimensions = parseGIF(buffer);
                break;
            case ".webp":
                dimensions = parseWebP(buffer);
                break;
            case ".bmp":
                dimensions = parseBMP(buffer);
                break;
            default:
                // 不支持的格式，尝试自动检测
                dimensions = autoDetect(buffer);
                if (!dimensions) {
                    return { code: 415, message: "不支持的图片格式: " + ext };
                }
                break;
        }

        if (dimensions) {
            console.log(TAG + " 尺寸解析成功: " + dimensions.width + "x" + dimensions.height + " (" + ext + ")");
            return { code: 200, width: dimensions.width, height: dimensions.height };
        } else {
            return { code: 500, message: "无法解析图片尺寸，文件可能已损坏。" };
        }
    } catch (parseError) {
        console.error(TAG + " 尺寸解析异常: " + parseError.message);
        return { code: 500, message: "解析图片尺寸失败: " + parseError.message };
    }
}

// ==================== 流 → Buffer 转换 ====================
/**
 * 将可读流收集为 Buffer
 * @param {ReadableStream} stream - 可读流
 * @returns {Promise<Buffer>} 完整的 Buffer
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

// ==================== 各格式解析函数 ====================

/**
 * 解析 JPEG 文件头获取尺寸
 * JPEG 结构：SOI(FFD8) → [APPn/MISC] → SOF0(FFC0) 或 SOF2(FFC2)
 * SOF 段：标记(2B) + 长度(2B) + 精度(1B) + 高度(2B) + 宽度(2B)
 *
 * @param {Buffer} buffer - JPEG 文件头部数据
 * @returns {{width: number, height: number}|null}
 */
function parseJPEG(buffer) {
    // 检查 SOI 标记
    if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
        console.warn(TAG + " [JPEG] 无效的 SOI 标记");
        return null;
    }

    let offset = 2;
    const len = buffer.length;

    while (offset < len) {
        // 查找段标记（0xFF 开头）
        if (buffer[offset] !== 0xFF) {
            offset++;
            continue;
        }

        const marker = buffer[offset + 1];
        // SOF0 (基线) 或 SOF2 (渐进式)
        if (marker === 0xC0 || marker === 0xC2) {
            // 段长度（包含自身，不含标记）
            const segLength = buffer.readUInt16BE(offset + 2);
            if (offset + 8 < len) {
                const height = buffer.readUInt16BE(offset + 5);
                const width = buffer.readUInt16BE(offset + 7);
                return { width, height };
            }
        }

        // 跳过当前段：标记(2B) + 长度(2B) + 数据
        if (marker === 0xD8 || marker === 0xD9) {
            // SOI(无长度) 或 EOI(无长度)
            offset += 2;
        } else if (marker >= 0xD0 && marker <= 0xD7) {
            // RST 标记（无长度）
            offset += 2;
        } else {
            // 其他段：跳过 2B标记 + 2B长度 + 数据
            if (offset + 4 <= len) {
                const segLength = buffer.readUInt16BE(offset + 2);
                offset += 2 + segLength;
            } else {
                offset += 2;
            }
        }
    }

    console.warn(TAG + " [JPEG] 未找到 SOF 段");
    return null;
}

/**
 * 解析 PNG 文件头获取尺寸
 * PNG 结构：签名(8B) → IHDR(长度4B + "IHDR"4B + 宽度4B + 高度4B + ...)
 * IHDR 宽度位于字节 16-19，高度位于字节 20-23（大端序）
 *
 * @param {Buffer} buffer - PNG 文件头部数据
 * @returns {{width: number, height: number}|null}
 */
function parsePNG(buffer) {
    // 检查 PNG 签名：89 50 4E 47 0D 0A 1A 0A
    const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
        if (buffer[i] !== PNG_SIGNATURE[i]) {
            console.warn(TAG + " [PNG] 无效的签名");
            return null;
        }
    }

    // 字节 16-19：宽度（Big Endian uint32）
    // 字节 20-23：高度（Big Endian uint32）
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
}

/**
 * 解析 GIF 文件头获取尺寸
 * GIF 结构：签名(6B "GIF89a"或"GIF87a") → 宽度(2B LE) → 高度(2B LE)
 *
 * @param {Buffer} buffer - GIF 文件头部数据
 * @returns {{width: number, height: number}|null}
 */
function parseGIF(buffer) {
    // 检查 GIF 签名
    const sig = buffer.toString("ascii", 0, 6);
    if (sig !== "GIF89a" && sig !== "GIF87a") {
        console.warn(TAG + " [GIF] 无效的签名: " + sig);
        return null;
    }

    // 字节 6-7：宽度（Little Endian uint16）
    // 字节 8-9：高度（Little Endian uint16）
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height };
}

/**
 * 解析 WebP 文件头获取尺寸
 * WebP 结构：
 *   - RIFF 头(12B)：'RIFF' + 文件大小(4B) + 'WEBP'
 *   - VP8 无损：'VP8L' + 4B(含尺寸编码)  宽度=1+(bits[0:13])，高度=1+(bits[16:29])
 *   - VP8 有损：'VP8 ' + 帧标签
 *   - VP8X 扩展：'VP8X' + 宽度(3B) + 高度(3B)
 *
 * @param {Buffer} buffer - WebP 文件头部数据
 * @returns {{width: number, height: number}|null}
 */
function parseWebP(buffer) {
    // 检查 RIFF 头
    if (buffer.toString("ascii", 0, 4) !== "RIFF") {
        console.warn(TAG + " [WebP] 无效的 RIFF 签名");
        return null;
    }
    if (buffer.toString("ascii", 8, 12) !== "WEBP") {
        console.warn(TAG + " [WebP] 无效的 WEBP 签名");
        return null;
    }

    const chunkHeader = buffer.toString("ascii", 12, 16);

    if (chunkHeader === "VP8X") {
        // 扩展格式：宽度和高度各占 3 字节（小端序，低 24 位 + 1）
        const w1 = buffer[24], w2 = buffer[25], w3 = buffer[26];
        const h1 = buffer[27], h2 = buffer[28], h3 = buffer[29];
        const width = (w1 | (w2 << 8) | (w3 << 16)) + 1;
        const height = (h1 | (h2 << 8) | (h3 << 16)) + 1;
        return { width, height };
    } else if (chunkHeader === "VP8L") {
        // 无损格式：4字节中包含尺寸编码
        // byte[0] = 0x2F, byte[1..3] 包含 width-1 和 height-1
        const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
        const width = 1 + ((b1 & 0x3F) | ((b2 & 0xFF) << 6) | ((b3 & 0x3F) << 14));
        const height = 1 + (((b3 >> 6) & 0x03) | (b0 << 2) | ((b2 & 0xC0) << 4));
        return { width, height };
    } else if (chunkHeader === "VP8 ") {
        // 有损格式：帧标签中有宽度和高度
        if (buffer[20] === 0x9D && buffer[21] === 0x01 && buffer[22] === 0x2A) {
            const width = buffer.readUInt16LE(26) & 0x3FFF;
            const height = buffer.readUInt16LE(30) & 0x3FFF;
            return { width, height };
        }
        console.warn(TAG + " [WebP] 不支持的 VP8 帧标签格式");
    }

    console.warn(TAG + " [WebP] 未知的 chunk: " + chunkHeader);
    return null;
}

/**
 * 解析 BMP 文件头获取尺寸
 * BMP 结构：'BM'(2B) + 文件大小(4B) + 保留(4B) + 数据偏移(4B)
 *          + DIB头大小(4B) + 宽度(4B) + 高度(4B) ...
 * 宽度位于字节 18-21，高度位于字节 22-25（小端序 int32）
 *
 * @param {Buffer} buffer - BMP 文件头部数据
 * @returns {{width: number, height: number}|null}
 */
function parseBMP(buffer) {
    // 检查 BMP 签名
    if (buffer[0] !== 0x42 || buffer[1] !== 0x4D) {
        console.warn(TAG + " [BMP] 无效的 BM 签名");
        return null;
    }

    // 字节 18-21：宽度（Little Endian int32）
    // 字节 22-25：高度（Little Endian int32，可能是负数表示自上而下）
    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22)); // 取绝对值
    return { width, height };
}

/**
 * 自动检测图片格式并解析尺寸（通过魔数判断）
 *
 * @param {Buffer} buffer - 图片文件头部数据
 * @returns {{width: number, height: number}|null}
 */
function autoDetect(buffer) {
    if (buffer.length < 4) return null;

    // JPEG: 0xFF 0xD8
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        console.log(TAG + " [自动检测] 识别为 JPEG");
        return parseJPEG(buffer);
    }

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        console.log(TAG + " [自动检测] 识别为 PNG");
        return parsePNG(buffer);
    }

    // GIF: "GIF8"
    const sig3 = buffer.toString("ascii", 0, 4);
    if (sig3 === "GIF8") {
        console.log(TAG + " [自动检测] 识别为 GIF");
        return parseGIF(buffer);
    }

    // WebP: "RIFF"
    if (sig3 === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
        console.log(TAG + " [自动检测] 识别为 WebP");
        return parseWebP(buffer);
    }

    // BMP: "BM"
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        console.log(TAG + " [自动检测] 识别为 BMP");
        return parseBMP(buffer);
    }

    console.warn(TAG + " [自动检测] 无法识别图片格式，前4字节: " +
        buffer[0].toString(16) + " " + buffer[1].toString(16) + " " +
        buffer[2].toString(16) + " " + buffer[3].toString(16));
    return null;
}

// ==================== 模块导出 ====================
module.exports = { getImageSize };
