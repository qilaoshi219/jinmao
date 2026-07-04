// 本模块负责解压压缩包文件（.zip / .rar / .7z），并在解压目录中寻找主文档
// 输入：压缩包本地文件路径（绝对路径）
// 输出：解压后的目录路径（放在/data/temp目录下，随机生成目录名，防止冲突和清理旧文件）
// clean_up函数：用于在收件方收件完成后删除该临时目录
// 防呆超时删除机制：默认30分钟自动清理，防止解压目录被占用过久硬盘被占满
// 返回值格式：{ code: number, extractDir?: string, mainDocPath?: string, message?: string }
//   code 200 — 解压成功，找到主文档，返回 extractDir 和 mainDocPath
//   code 201 — 解压成功，但未找到支持的主文档格式（.md），仅返回 extractDir
//   code 400 — 输入参数不合法（路径为空/类型错误/不支持的格式）
//   code 404 — 指定的压缩包文件不存在
//   code 500 — 解压过程失败
// 依赖：项目内置 tools/7z/7za.exe 命令行工具，支持 .zip / .rar / .7z 格式

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const { validateString } = require("./input_validator");

// ==================== 常量配置 ====================

// 7z 命令行工具路径（项目内置）
const SZ_EXE_PATH = path.join(__dirname, "..", "tools", "7z", "7za.exe");

// 支持的压缩包扩展名（大小写不敏感）
const SUPPORTED_EXTENSIONS = [".zip", ".rar", ".7z"];

// 主文档扩展名（要寻找的文档格式）
const MAIN_DOC_EXTENSION = ".md";

// 临时目录根路径
const TEMP_ROOT = path.resolve("/data/temp");

// 默认超时自动清理时间（毫秒），默认30分钟
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// ==================== 超时自动清理管理器 ====================

/**
 * 管理解压目录与其对应的 setTimeout 定时器映射
 * 确保 cleanUp 被调用后取消对应的定时器，防止重复清理
 * 使用 Map<extractDirAbsolutePath, timeoutId>
 */
const timeoutMap = new Map();

// ==================== 输入校验函数 ====================

/**
 * 校验输入参数的合法性
 * 检查内容：
 *   1. filePath 不能为空、必须为字符串类型
 *   2. 指定文件是否存在
 *   3. 文件扩展名是否属于支持的压缩格式（.zip / .rar / .7z）
 * @param {string} filePath - 本地压缩包文件路径
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateInput(filePath) {
  console.log("[extract_zip][validateInput] 开始输入校验...");

  // 第一步：基础字符串校验（空值、类型、注入检查、危险字符）
  const strValidation = validateString(filePath, "压缩包文件路径(filePath)", {
    maxLength: 4096,        // 合理的文件路径长度上限
    moduleTag: "[extract_zip]",
  });
  if (!strValidation.valid) {
    return { valid: false, errorCode: 400, error: strValidation.error };
  }

  // 第二步：检查文件是否存在
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    let errMsg = "[extract_zip][validateInput] 错误：文件不存在 —— " + absolutePath;
    console.error(errMsg);
    return { valid: false, errorCode: 404, error: errMsg };
  }

  // 第三步：检查扩展名是否属于支持的压缩格式
  const ext = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    let errMsg = "[extract_zip][validateInput] 错误：不支持的压缩格式 '" + ext +
      "'，支持格式：" + SUPPORTED_EXTENSIONS.join("、");
    console.error(errMsg);
    return { valid: false, errorCode: 400, error: errMsg };
  }

  console.log("[extract_zip][validateInput] 输入验证通过，文件: " + absolutePath);
  return { valid: true, resolvedPath: absolutePath };
}

// ==================== 临时目录生成函数 ====================

/**
 * 在 /data/temp 下生成唯一的临时解压目录
 * 目录名格式：extract_<8位随机hex>
 * 使用 crypto.randomBytes 生成随机ID，避免冲突
 * @returns {{ success: boolean, dirPath?: string, errorCode?: number, error?: string }}
 */
function generateTempDir() {
  console.log("[extract_zip][generateTempDir] 生成临时解压目录...");

  try {
    // 确保根临时目录存在
    if (!fs.existsSync(TEMP_ROOT)) {
      fs.mkdirSync(TEMP_ROOT, { recursive: true });
      console.log("[extract_zip][generateTempDir] 创建临时根目录: " + TEMP_ROOT);
    }

    // 生成唯一目录名（8位随机十六进制）
    const randomId = crypto.randomBytes(4).toString("hex");
    const dirName = "extract_" + randomId;
    const dirPath = path.join(TEMP_ROOT, dirName);

    // 创建目录
    fs.mkdirSync(dirPath, { recursive: true });

    console.log("[extract_zip][generateTempDir] 临时解压目录已创建: " + dirPath);
    return { success: true, dirPath: dirPath };
  } catch (err) {
    let errMsg = "[extract_zip][generateTempDir] 错误：创建临时目录失败: " + err.message;
    console.error(errMsg);
    return { success: false, errorCode: 500, error: errMsg };
  }
}

// ==================== 7z 解压执行函数 ====================

/**
 * 使用 7za.exe 执行实际解压操作
 * 使用 child_process.exec 异步调用，返回 Promise
 * @param {string} filePath - 压缩包绝对路径
 * @param {string} extractDir - 解压目标目录绝对路径
 * @returns {Promise<{ success: boolean, errorCode?: number, error?: string }>}
 */
function executeExtract(filePath, extractDir) {
  return new Promise((resolve) => {
    console.log("[extract_zip][executeExtract] 开始解压...");
    console.log("[extract_zip][executeExtract] 源文件: " + filePath);
    console.log("[extract_zip][executeExtract] 目标目录: " + extractDir);

    // 检查 7za.exe 是否存在
    if (!fs.existsSync(SZ_EXE_PATH)) {
      let errMsg = "[extract_zip][executeExtract] 错误：7z 工具不存在，路径: " + SZ_EXE_PATH;
      console.error(errMsg);
      resolve({ success: false, errorCode: 500, error: errMsg });
      return;
    }

    // 构建解压命令
    // 7z x <archive> -o<dir> -y : x = 解压并保留目录结构, -o = 输出目录, -y = 自动确认覆盖
    // 注意：-o 与目录路径之间不能有空格
    const command = '"' + SZ_EXE_PATH + '" x "' + filePath + '" -o"' + extractDir + '" -y';
    console.log("[extract_zip][executeExtract] 执行命令: " + command);

    // 设置较长的超时时间（大文件解压可能需要更久，设为5分钟）
    exec(command, { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) {
        // 7z 即使部分成功也可能返回非零退出码，检查 stdout/stderr 中是否有成功信息
        const combined = (stdout || "") + (stderr || "");
        // 如果 stdout 包含 "Everything is Ok"，视为解压成功
        if (combined.includes("Everything is Ok")) {
          console.log("[extract_zip][executeExtract] 解压完成（非零退出码但内容完整）");
          resolve({ success: true });
          return;
        }

        let errMsg = "[extract_zip][executeExtract] 错误：解压失败: " + error.message;
        if (stderr) {
          errMsg += " | stderr: " + stderr.trim();
        }
        console.error(errMsg);
        resolve({ success: false, errorCode: 500, error: errMsg });
        return;
      }

      console.log("[extract_zip][executeExtract] 解压完成。");
      // 输出简要的 7z 统计信息（只取最后几行）
      const outputLines = (stdout || "").trim().split("\n");
      const summaryLines = outputLines.slice(-3); // 最后3行通常是统计信息
      summaryLines.forEach(line => {
        if (line.trim()) {
          console.log("[extract_zip][executeExtract] " + line.trim());
        }
      });
      resolve({ success: true });
    });
  });
}

// ==================== 主文档查找函数 ====================

/**
 * 递归遍历解压目录，查找第一个 .md 主文档
 * 遍历策略：广度优先，从根目录开始逐层查找
 * @param {string} extractDir - 解压目录绝对路径
 * @returns {string|null} - 找到的 .md 文件绝对路径，未找到返回 null
 */
function findMainDoc(extractDir) {
  console.log("[extract_zip][findMainDoc] 在解压目录中查找主文档（.md）...");

  try {
    // 递归遍历目录
    const files = walkDir(extractDir);

    // 筛选出 .md 文件
    const mdFiles = files.filter(filePath =>
      path.extname(filePath).toLowerCase() === MAIN_DOC_EXTENSION
    );

    if (mdFiles.length === 0) {
      console.log("[extract_zip][findMainDoc] 未找到 .md 文件。");
      return null;
    }

    // 返回第一个找到的 .md 文件
    const mainDocPath = mdFiles[0];
    console.log("[extract_zip][findMainDoc] 找到主文档: " + mainDocPath);
    return mainDocPath;
  } catch (err) {
    console.error("[extract_zip][findMainDoc] 错误：查找主文档时发生异常: " + err.message);
    return null;
  }
}

/**
 * 递归遍历目录，返回所有文件的绝对路径列表
 * 不输出逐文件日志，避免控制台刷屏
 * @param {string} dirPath - 目录路径
 * @returns {string[]} - 文件绝对路径数组
 */
function walkDir(dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // 递归遍历子目录
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

// ==================== 核心入口函数 ====================

/**
 * 解压压缩包并在解压目录中寻找主文档
 * 完整流程：输入校验 → 生成临时目录 → 7z解压 → 查找主文档 → 注册超时清理 → 返回结果
 * @param {string} filePath - 本地压缩包文件绝对路径
 * @param {number} [timeoutMs] - 超时自动清理时间（毫秒），默认30分钟，传0表示不启用超时清理
 * @returns {Promise<{ code: number, extractDir?: string, mainDocPath?: string, message?: string }>}
 */
async function extractZip(filePath, timeoutMs = DEFAULT_TIMEOUT_MS) {
  console.log("[extract_zip][extractZip] ========== 开始解压压缩包 ==========");

  // 第一步：输入校验
  const validation = validateInput(filePath);
  if (!validation.valid) {
    return { code: validation.errorCode, message: validation.error };
  }

  // 第二步：生成临时解压目录
  const dirResult = generateTempDir();
  if (!dirResult.success) {
    return { code: dirResult.errorCode, message: dirResult.error };
  }

  const extractDir = dirResult.dirPath;

  // 第三步：使用 7z 解压
  const extractResult = await executeExtract(validation.resolvedPath, extractDir);
  if (!extractResult.success) {
    // 解压失败，清理已创建的临时目录
    console.log("[extract_zip][extractZip] 解压失败，清理临时目录: " + extractDir);
    removeDirSync(extractDir);
    return { code: extractResult.errorCode, message: extractResult.error };
  }

  // 第四步：在解压目录中查找主文档
  const mainDocPath = findMainDoc(extractDir);

  // 第五步：注册超时自动清理定时器（如果 timeoutMs > 0）
  if (timeoutMs > 0) {
    console.log("[extract_zip][extractZip] 注册超时自动清理定时器，" +
      (timeoutMs / 1000 / 60).toFixed(0) + " 分钟后自动清理: " + extractDir);

    const timerId = setTimeout(() => {
      console.log("[extract_zip][extractZip] 超时清理触发，清理目录: " + extractDir);
      cleanUp(extractDir);
    }, timeoutMs);

    // 注册到映射表中
    timeoutMap.set(extractDir, timerId);
  }

  // 第六步：根据是否找到主文档返回不同结果
  if (mainDocPath) {
    console.log("[extract_zip][extractZip] ========== 解压完成（找到主文档）==========");
    return {
      code: 200,
      extractDir: extractDir,
      mainDocPath: mainDocPath,
      message: "解压成功，已找到主文档（.md）。"
    };
  } else {
    console.log("[extract_zip][extractZip] ========== 解压完成（未找到主文档）==========");
    return {
      code: 201,
      extractDir: extractDir,
      message: "解压成功，但未找到 .md 主文档。"
    };
  }
}

// ==================== 目录清理函数 ====================

/**
 * 递归删除指定目录及其所有内容（同步）
 * @param {string} dirPath - 要删除的目录路径
 */
function removeDirSync(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log("[extract_zip][removeDirSync] 目录已删除: " + dirPath);
    }
  } catch (err) {
    console.error("[extract_zip][removeDirSync] 错误：删除目录失败: " + err.message);
  }
}

/**
 * 清理指定的临时解压目录
 * 安全检查：仅允许删除 /data/temp/ 下的目录，防止误删其他路径
 * @param {string} extractDir - 待清理的解压目录绝对路径
 * @returns {{ code: number, message?: string }}
 */
function cleanUp(extractDir) {
  console.log("[extract_zip][cleanUp] 请求清理目录: " + extractDir);

  // 安全检查：确保待删除的目录在 TEMP_ROOT 路径下
  const normalizedDir = path.resolve(extractDir);
  const normalizedRoot = path.resolve(TEMP_ROOT);

  if (!normalizedDir.startsWith(normalizedRoot + path.sep) && normalizedDir !== normalizedRoot) {
    let errMsg = "[extract_zip][cleanUp] 安全检查拦截：目录不在 " + TEMP_ROOT +
      " 下，拒绝删除。路径: " + normalizedDir;
    console.error(errMsg);
    return { code: 400, message: errMsg };
  }

  // 取消对应的超时定时器
  if (timeoutMap.has(normalizedDir)) {
    clearTimeout(timeoutMap.get(normalizedDir));
    timeoutMap.delete(normalizedDir);
    console.log("[extract_zip][cleanUp] 已取消该目录的超时自动清理定时器。");
  }

  // 执行删除
  removeDirSync(normalizedDir);

  return { code: 200, message: "临时解压目录已清理: " + normalizedDir };
}

// ==================== 模块导出 ====================
module.exports = { extractZip, cleanUp, validateInput };
