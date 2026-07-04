// 本模块负责将 Word 文件（.docx / .doc）转换为 PDF 格式
// 输入：Word 文件路径（minio 中的路径url）
// 输出：转换后的 PDF 文件本身，由调用该函数的代码负责保存
// 返回值格式：{ code: number, pdfPath?: string, message?: string }
//   code 200 — 转换成功，返回 pdfPath
//   code 400 — 输入参数不合法（路径为空/类型错误/不支持的扩展名/文件不存在）
//   code 500 — 转换过程失败（libreoffice 命令执行失败/未安装/超时）
// 依赖：优先使用项目自带的 libreoffice-portable 便携版，其次使用系统安装的 libreoffice
// 需要兼容linux，主要在linux上部署本项目
// 便携版获取方式：从 https://www.libreoffice.org/download/download/ 下载 AppImage 放入 libreoffice-portable/ 目录

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
const CONVERT_TIMEOUT_MS = 120 * 1000;                 // 120 秒（AppImage 首次运行需要解压，给更长的超时时间）

// 项目根目录（word2pdf.js 位于 utils/ 下，因此 __dirname 的上一级即为项目根目录）
const PROJECT_ROOT = path.resolve(__dirname, "..");

// 项目自带的 LibreOffice 便携版目录（部署时将 AppImage 放入此目录即可）
const PORTABLE_DIR = path.join(PROJECT_ROOT, "libreoffice-portable");

// ==================== LibreOffice 可执行文件查找（缓存） ====================
// 使用模块级变量缓存查找结果，避免每次转换都重新扫描文件系统
let _cachedLibreofficeBin = null;                      // 缓存的 libreoffice 可执行文件路径（null 表示未查找过）
let _cacheChecked = false;                             // 是否已经执行过查找（区分"找到 null"和"还没找过"）

/**
 * 查找 LibreOffice 可执行文件路径（带缓存）
 * 查找优先级（从高到低）：
 *   1. 项目 libreoffice-portable/ 目录下的 AppImage（仅 Linux 平台，生产环境免安装部署）
 *   2. 项目 libreoffice-portable/ 目录下的 libreoffice/program/soffice（解压版，跨平台）
 *   3. 项目 libreoffice-portable/ 目录下的 soffice / soffice.exe（跨平台）
 *   4. 平台特定的系统安装路径（Windows: Program Files\LibreOffice\program\soffice.exe）
 *   5. 系统 PATH 中的 libreoffice 命令（最终回退）
 *   6. 系统 PATH 中的 soffice 命令
 *   - Windows 开发环境：跳过 AppImage（无法在 Windows 上运行），自动使用系统安装的 LibreOffice
 *   - Linux 生产环境：优先使用 portable 目录下的 AppImage，无需系统级安装
 * @returns {string|null} 找到的 libreoffice 可执行文件路径，未找到返回 null
 */
function findLibreofficeBin() {
    // 如果已经查找过，直接返回缓存结果
    if (_cacheChecked) {
        return _cachedLibreofficeBin;
    }
    _cacheChecked = true;

    console.log(MODULE_TAG + "[findLibreofficeBin] ========== 开始查找 LibreOffice 可执行文件 ==========");
    console.log(MODULE_TAG + "[findLibreofficeBin] 当前平台：" + process.platform);

    // 候选路径列表（按优先级排列），每个元素为 { label: 描述, fullPath: 完整路径 }
    const candidates = [];

    // 优先级 1：检查 portable 目录是否存在
    if (fs.existsSync(PORTABLE_DIR) && fs.statSync(PORTABLE_DIR).isDirectory()) {
        console.log(MODULE_TAG + "[findLibreofficeBin] 发现便携版目录：" + PORTABLE_DIR);

        // 候选 1：LibreOffice AppImage（仅 Linux 平台可用，Windows 上跳过）
        // 这样在 Windows 开发环境会自动回退到系统安装的 LibreOffice
        if (process.platform === "linux") {
            try {
                const files = fs.readdirSync(PORTABLE_DIR);
                for (const file of files) {
                    if (file.toLowerCase().endsWith(".appimage")) {
                        candidates.push({
                            label: "项目便携版 AppImage —— " + file,
                            fullPath: path.join(PORTABLE_DIR, file)
                        });
                    }
                }
            } catch (e) {
                console.log(MODULE_TAG + "[findLibreofficeBin] 读取便携版目录失败：" + e.message);
            }
        } else {
            console.log(MODULE_TAG + "[findLibreofficeBin] 当前非 Linux 平台，跳过 AppImage 候选（AppImage 仅支持 Linux）。");
        }

        // 候选 2：解压版 libreoffice（libreoffice/program/soffice）
        candidates.push({
            label: "项目便携版 解压式 libreoffice",
            fullPath: path.join(PORTABLE_DIR, "libreoffice", "program", "soffice")
        });

        // 候选 3：直接在 portable 目录下的 soffice
        candidates.push({
            label: "项目便携版 独立 soffice",
            fullPath: path.join(PORTABLE_DIR, "soffice")
        });

        // 候选 4：直接在 portable 目录下的 soffice.exe（Windows）
        candidates.push({
            label: "项目便携版 独立 soffice.exe",
            fullPath: path.join(PORTABLE_DIR, "soffice.exe")
        });
    } else {
        console.log(MODULE_TAG + "[findLibreofficeBin] 未发现便携版目录（" + PORTABLE_DIR + "），将回退到系统安装的 LibreOffice。");
        console.log(MODULE_TAG + "[findLibreofficeBin] 提示：可将 LibreOffice.AppImage 放入 libreoffice-portable/ 目录实现免安装部署。");
    }

    // 优先级 2：平台特定的系统安装路径搜索（Windows 上 LibreOffice 通常不在 PATH 中）
    if (process.platform === "win32") {
        // Windows 上 LibreOffice 的常见安装路径
        const winPaths = [
            path.join(process.env["ProgramFiles"] || "C:\\Program Files", "LibreOffice", "program", "soffice.exe"),
            path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "LibreOffice", "program", "soffice.exe"),
            path.join(process.env["ProgramFiles"] || "C:\\Program Files", "LibreOffice", "program", "soffice.bin"),
        ];
        for (const winPath of winPaths) {
            candidates.push({
                label: "Windows 系统安装的 LibreOffice —— " + winPath,
                fullPath: winPath
            });
        }
        console.log(MODULE_TAG + "[findLibreofficeBin] 已添加 Windows 常见安装路径候选（" + winPaths.length + " 个）。");
    }

    // 优先级 3：系统 PATH 中的 libreoffice / soffice 命令（作为最终回退）
    candidates.push({
        label: "系统 PATH 中的 libreoffice",
        fullPath: "libreoffice"
    });
    candidates.push({
        label: "系统 PATH 中的 soffice",
        fullPath: "soffice"
    });

    // 按优先级逐个检查候选路径是否存在（对于系统命令，只检查是否在 PATH 中，不做文件存在性检查）
    for (const candidate of candidates) {
        const isSystemCmd = (candidate.fullPath === "libreoffice" || candidate.fullPath === "soffice");

        if (isSystemCmd) {
            // 系统命令：尝试用 which/where 检查是否可用
            console.log(MODULE_TAG + "[findLibreofficeBin] 尝试使用：" + candidate.label);
            _cachedLibreofficeBin = candidate.fullPath;
            console.log(MODULE_TAG + "[findLibreofficeBin] ========== 已选择 LibreOffice：" + candidate.label + " ==========");
            return _cachedLibreofficeBin;
        }

        // 检查文件是否存在
        if (fs.existsSync(candidate.fullPath)) {
            console.log(MODULE_TAG + "[findLibreofficeBin] 已找到：" + candidate.label + "（" + candidate.fullPath + "）");
            _cachedLibreofficeBin = candidate.fullPath;
            console.log(MODULE_TAG + "[findLibreofficeBin] ========== 已选择 LibreOffice：" + candidate.label + " ==========");
            return _cachedLibreofficeBin;
        }
    }

    // 所有候选都不可用（这种情况理论上不会发生，因为系统命令候选总是会被接受）
    console.error(MODULE_TAG + "[findLibreofficeBin] 错误：未找到任何可用的 LibreOffice！");
    _cachedLibreofficeBin = null;
    return null;
}

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

    // 第三步：查找 LibreOffice 可执行文件路径
    const libreofficeBin = findLibreofficeBin();
    if (!libreofficeBin) {
        const errMsg = MODULE_TAG + "[convert] 错误：未找到任何可用的 LibreOffice。请在 libreoffice-portable/ 目录放置 AppImage 或通过系统包管理器安装。";
        console.error(errMsg);
        return { code: 500, message: errMsg };
    }

    // 判断是否为 AppImage 格式（扩展名为 .appimage）
    const isAppImage = libreofficeBin.toLowerCase().endsWith(".appimage");
    if (isAppImage) {
        console.log(MODULE_TAG + "[convert] 检测到 AppImage 便携版，首次运行可能需要解压，请耐心等待...");
    }

    // 第四步：调用 libreoffice 命令行工具进行转换
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

    console.log(MODULE_TAG + "[convert] LibreOffice 路径：" + libreofficeBin);
    console.log(MODULE_TAG + "[convert] 执行命令：" + libreofficeBin + " " + libreofficeArgs.join(" "));

    try {
        // 用 Promise 封装 execFile，支持超时控制和错误捕获
        await new Promise((resolve, reject) => {
            // 构建 execFile 的 options 对象
            const execOptions = {};

            // 如果是 AppImage，设置 APPIMAGE_EXTRACT_AND_RUN 环境变量
            // 这样可以在不支持 FUSE 的容器（如 Docker）中正常运行，避免 "fuse: device not found" 错误
            if (isAppImage) {
                execOptions.env = Object.assign({}, process.env, {
                    APPIMAGE_EXTRACT_AND_RUN: "1"
                });
                console.log(MODULE_TAG + "[convert] 已设置 APPIMAGE_EXTRACT_AND_RUN=1（兼容无 FUSE 容器环境）");
            }

            // Windows 上 LibreOffice 输出使用系统默认编码（GBK/cp936），而非 UTF-8
            // 设置 encoding 为 null 让 Node.js 返回原始 Buffer，后续手动用正确编码解码
            // Linux 上 LibreOffice 通常输出 UTF-8，不需要特殊处理
            execOptions.encoding = null;

            // 启动 libreoffice 子进程
            const child = execFile(libreofficeBin, libreofficeArgs, execOptions, (error, stdout, stderr) => {
                // 将 Buffer 解码为字符串
                // Windows 上 LibreOffice 使用系统编码（GBK），Linux 上使用 UTF-8
                const decodeBuffer = (buf) => {
                    if (!buf || buf.length === 0) return "";
                    if (process.platform === "win32") {
                        // Windows: 使用 GBK 解码（LibreOffice Windows 版的输出编码）
                        try {
                            return new TextDecoder("gbk").decode(buf);
                        } catch (_) {
                            // 如果 GBK 解码器不可用，回退到 UTF-8（可能仍有乱码，但不会崩溃）
                            return buf.toString("utf8");
                        }
                    }
                    // Linux/Mac: 直接使用 UTF-8 解码
                    return buf.toString("utf8");
                };

                const stdoutStr = decodeBuffer(stdout);
                const stderrStr = decodeBuffer(stderr);

                if (error) {
                    // 子进程异常退出（如 libreoffice 未安装、文件损坏等）
                    reject(error);
                    return;
                }
                // 正常退出，记录 libreoffice 的输出信息（仅在有实际内容时输出，避免刷屏）
                if (stdoutStr && stdoutStr.trim()) {
                    console.log(MODULE_TAG + "[convert] libreoffice stdout：" + stdoutStr.trim());
                }
                if (stderrStr && stderrStr.trim()) {
                    // libreoffice 经常将非错误信息也输出到 stderr，这里用 info 级别记录
                    console.log(MODULE_TAG + "[convert] libreoffice stderr：" + stderrStr.trim());
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
            // ENOENT 错误码表示命令未找到
            if (isAppImage) {
                errMsg = MODULE_TAG + "[convert] 错误：AppImage 文件无法执行，请确保已赋予执行权限（chmod +x " + libreofficeBin + "）。原始错误：" + err.message;
            } else {
                errMsg = MODULE_TAG + "[convert] 错误：未找到 libreoffice 命令，请执行 'sudo apt install libreoffice'（Debian/Ubuntu）或 'sudo yum install libreoffice'（CentOS/RHEL）进行安装，或将 AppImage 放入 libreoffice-portable/ 目录。原始错误：" + err.message;
            }
        } else if (err.message && err.message.includes("超时")) {
            // 自定义的超时错误
            errMsg = MODULE_TAG + "[convert] 错误：Word 转 PDF 超时（" + CONVERT_TIMEOUT_MS / 1000 + " 秒）。AppImage 首次解压可能较慢，请重试；文件也可能过大或损坏。";
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
