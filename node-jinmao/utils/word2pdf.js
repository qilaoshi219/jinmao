// 本模块负责将 Word 文件（.docx / .doc）转换为 PDF 格式
// 输入：Word 文件路径（minio 中的路径url）
// 输出：转换后的 PDF 文件本身，由调用该函数的代码负责保存
// 返回值格式：{ code: number, pdfPath?: string, message?: string }
//   code 200 — 转换成功，返回 pdfPath
//   code 400 — 输入参数不合法（路径为空/类型错误/不支持的扩展名/文件不存在）
//   code 500 — 转换过程失败（libreoffice 命令执行失败/未安装/超时）
// 依赖：需系统安装 libreoffice 命令行工具
// 需要兼容linux，主要在linux上部署本项目

// ==================== 依赖导入 ====================
const fs = require("fs");                             // 文件系统操作：检查文件是否存在
const path = require("path");                         // 路径处理：解析文件名、扩展名、拼接路径
const { execFile } = require("child_process");        // 子进程管理：执行 libreoffice 命令行工具（execFile 比 exec 更安全，不会产生 shell 注入风险）
const { validateString } = require("./input_validator"); // 统一输入校验模块：复用已有的字符串安全校验逻辑

// ==================== 常量定义 ====================
const MODULE_TAG = "[word2pdf]";                      // 控制台日志前缀，用于标识本模块的输出

// 允许的 Word 文件扩展名列表（仅支持 .docx 和 .doc 格式）
const ALLOWED_EXTENSIONS = [".docx", ".doc"];

// libreoffice 转换超时时间（毫秒），超过此时间视为转换失败
const CONVERT_TIMEOUT_MS = 30 * 1000;                  // 30 秒

// ==================== 输入校验函数 ====================

/**
 * 校验输入参数的合法性
 * 校验步骤：
 *   1. 调用 input_validator.validateString 进行基础安全检查（空值、类型、注入攻击、Unicode 控制字符）
 *   2. 校验文件扩展名是否在允许列表中（.docx / .doc）
 *   3. 校验文件路径对应的文件是否确实存在
 * @param {string} wordPath - Word 文件的本地路径
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateInput(wordPath) {
    console.log(MODULE_TAG + "[validateInput] ========== 开始输入校验 ==========");

    // 第一步：使用统一的字符串校验器进行基础安全检查
    // 包括：空值检查、类型检查（必须为 string）、注入攻击检测、Unicode 控制字符检查
    const baseValidation = validateString(wordPath, "Word文件路径(wordPath)", {
        maxLength: 1024,                                // Word 文件路径最大 1024 字符（Linux 路径上限为 4096，留足余量）
        moduleTag: MODULE_TAG
    });
    if (!baseValidation.valid) {
        // 直接透传基础校验的错误码和错误信息
        return {
            valid: false,
            errorCode: baseValidation.errorCode,
            error: baseValidation.error
        };
    }

    // 第二步：校验文件扩展名
    // 获取文件扩展名并转为小写（兼容 .DOCX、.Docx 等大小写变体）
    const ext = path.extname(wordPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        const errMsg = MODULE_TAG + "[validateInput] 拦截：不支持的文件扩展名 '" + ext + "'，仅支持 " + ALLOWED_EXTENSIONS.join("、") + " 格式。";
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    // 第三步：校验文件是否存在
    const absolutePath = path.resolve(wordPath);         // 将相对路径转为绝对路径，确保路径一致性
    if (!fs.existsSync(absolutePath)) {
        const errMsg = MODULE_TAG + "[validateInput] 拦截：Word 文件不存在 —— " + absolutePath;
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    // 额外检查：确保路径指向的是文件而非目录
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
        const errMsg = MODULE_TAG + "[validateInput] 拦截：路径指向的不是文件 —— " + absolutePath;
        console.error(errMsg);
        return { valid: false, errorCode: 400, error: errMsg };
    }

    console.log(MODULE_TAG + "[validateInput] 校验通过，Word 文件路径：" + absolutePath + "，大小：" + stat.size + " 字节。");
    return { valid: true };
}

// ==================== 核心转换函数 ====================

/**
 * 将 Word 文件（.docx / .doc）转换为 PDF 格式
 * 使用 libreoffice --headless 模式在后台执行转换，不弹出 GUI 界面
 * 转换后的 PDF 文件输出到与源文件相同的目录下，文件名保持一致，仅扩展名改为 .pdf
 *
 * 处理流程：
 *   1. 输入校验（调用 validateInput）
 *   2. 确定输出 PDF 文件路径（同目录、同名、.pdf 扩展名）
 *   3. 调用 libreoffice 命令行执行转换
 *   4. 等待转换完成（设置超时 30 秒）
 *   5. 检查输出文件是否生成
 *   6. 返回结果
 *
 * @param {string} wordPath - Word 文件的本地路径
 * @returns {Promise<{ code: number, pdfPath?: string, message?: string }>}
 */
async function convert(wordPath) {
    console.log(MODULE_TAG + "[convert] ========== 开始 Word 转 PDF ==========");

    // 第一步：输入校验
    const validation = validateInput(wordPath);
    if (!validation.valid) {
        // 校验失败时，直接返回错误信息给调用方
        return { code: validation.errorCode, message: validation.error };
    }

    // 第二步：确定输入文件的绝对路径和输出 PDF 的路径
    const absoluteInputPath = path.resolve(wordPath);                       // 输入文件的绝对路径
    const inputDir = path.dirname(absoluteInputPath);                        // 输入文件所在目录
    const inputBaseName = path.basename(absoluteInputPath, path.extname(absoluteInputPath)); // 输入文件名（不含扩展名）
    const outputPdfPath = path.join(inputDir, inputBaseName + ".pdf");       // 输出 PDF 的完整路径

    console.log(MODULE_TAG + "[convert] 输入文件：" + absoluteInputPath);
    console.log(MODULE_TAG + "[convert] 输出 PDF：" + outputPdfPath);

    // 第三步：调用 libreoffice 命令行工具进行转换
    // 命令格式：libreoffice --headless --convert-to pdf --outdir <输出目录> <输入文件>
    // --headless：无头模式，不启动 GUI 界面，适合服务器环境
    // --convert-to pdf：指定输出格式为 PDF
    // --outdir：指定输出目录，libreoffice 会将生成的 PDF 放在该目录下
    const libreofficeArgs = [
        "--headless",                    // 无头模式，不启动图形界面
        "--convert-to", "pdf",           // 转换为 PDF 格式
        "--outdir", inputDir,            // 输出到源文件所在目录
        absoluteInputPath                // 要转换的 Word 文件
    ];

    console.log(MODULE_TAG + "[convert] 执行命令：libreoffice " + libreofficeArgs.join(" "));

    try {
        // 用 Promise 封装 execFile，支持超时控制和错误捕获
        await new Promise((resolve, reject) => {
            // 启动 libreoffice 子进程
            const child = execFile("libreoffice", libreofficeArgs, (error, stdout, stderr) => {
                if (error) {
                    // 子进程异常退出（如 libreoffice 未安装、文件损坏等）
                    reject(error);
                    return;
                }
                // 正常退出，记录 libreoffice 的输出信息（仅在有实际内容时输出，避免刷屏）
                if (stdout && stdout.trim()) {
                    console.log(MODULE_TAG + "[convert] libreoffice stdout：" + stdout.trim());
                }
                if (stderr && stderr.trim()) {
                    // libreoffice 经常将非错误信息也输出到 stderr，这里用 info 级别记录
                    console.log(MODULE_TAG + "[convert] libreoffice stderr：" + stderr.trim());
                }
                resolve();
            });

            // 设置超时定时器，防止转换卡住无限等待
            const timeoutId = setTimeout(() => {
                child.kill();                                           // 强制终止子进程
                reject(new Error("转换超时（" + CONVERT_TIMEOUT_MS / 1000 + " 秒）"));
            }, CONVERT_TIMEOUT_MS);

            // 子进程结束时清除超时定时器，避免内存泄漏
            child.on("close", () => clearTimeout(timeoutId));
        });

        console.log(MODULE_TAG + "[convert] libreoffice 进程已正常退出。");

    } catch (err) {
        // 捕获所有执行失败的情况：libreoffice 未安装、命令执行失败、超时等
        let errMsg;
        if (err.code === "ENOENT") {
            // ENOENT 错误码表示命令未找到，即系统未安装 libreoffice
            errMsg = MODULE_TAG + "[convert] 错误：系统未安装 libreoffice，请执行 'sudo apt install libreoffice'（Debian/Ubuntu）或 'sudo yum install libreoffice'（CentOS/RHEL）进行安装。原始错误：" + err.message;
        } else if (err.message && err.message.includes("超时")) {
            // 自定义的超时错误
            errMsg = MODULE_TAG + "[convert] 错误：Word 转 PDF 超时（" + CONVERT_TIMEOUT_MS / 1000 + " 秒）。文件可能过大或损坏。";
        } else {
            // 其他未知错误
            errMsg = MODULE_TAG + "[convert] 错误：libreoffice 命令执行失败 —— " + err.message;
        }
        console.error(errMsg);
        return { code: 500, message: errMsg };
    }

    // 第四步：检查输出 PDF 文件是否成功生成
    if (!fs.existsSync(outputPdfPath)) {
        const errMsg = MODULE_TAG + "[convert] 错误：libreoffice 命令执行完毕，但输出 PDF 文件未生成 —— " + outputPdfPath;
        console.error(errMsg);
        return { code: 500, message: errMsg };
    }

    // 获取输出文件大小用于日志
    const pdfStat = fs.statSync(outputPdfPath);
    console.log(MODULE_TAG + "[convert] ========== 转换成功！PDF 大小：" + pdfStat.size + " 字节 ==========");
    console.log(MODULE_TAG + "[convert] PDF 路径：" + outputPdfPath);

    // 第五步：返回成功结果
    return { code: 200, pdfPath: outputPdfPath };
}

// ==================== 模块导出 ====================
module.exports = { convert, validateInput };
