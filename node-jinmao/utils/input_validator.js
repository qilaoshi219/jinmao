/**
 * 统一输入验证模块
 * 提供可复用的输入验证功能，支持多种验证规则的可配置组合。
 * 集中管理所有模块的输入安全检查，消除重复代码，统一安全策略。
 */

// ==================== 注入攻击检测模式 ====================
const INJECTION_PATTERNS = [
    /忽略.*(?:以上|之前|所有|全部).*(?:指令|提示|规则|要求)/i,   // "忽略以上指令"（中文）
    /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|instructions|prompts|rules)/i,  // 英文版
    /你(?:现在|将|必须|应该).*?(?:扮演|充当|作为)/i,            // "你现在扮演..."（角色劫持）
    /system:\s*[\s\S]*?new\s+instructions/i,                       // 尝试注入 system 级指令
    /\[system\].*?\[\/system\]/i,                                  // system 标记注入
    /<\|im_start\|>/i,                                             // ChatML token 注入
    /<\|im_end\|>/i,                                               // ChatML token 注入
    /DAN\s*(?:mode|模式)/i,                                        // DAN 越狱模式
    /越狱|jailbreak/i,                                             // 越狱关键词
];

// ==================== 危险 Unicode 控制字符 ====================
const DANGEROUS_UNICODE_PATTERN = /[\u202A-\u202E\u2066-\u2069]/;

/**
 * 验证单个字符串输入
 * @param {string} input - 待验证的输入字符串
 * @param {string} fieldName - 字段名称（用于错误信息和日志）
 * @param {Object} [options] - 验证选项
 * @param {number} [options.maxLength=Infinity] - 最大长度限制
 * @param {boolean} [options.required=true] - 是否必填
 * @param {boolean} [options.checkInjection=true] - 是否检查注入攻击
 * @param {boolean} [options.checkDangerousChars=true] - 是否检查危险控制字符
 * @param {string} [options.moduleTag] - 模块标签，用于日志前缀（如 "[elaboration]"）
 * @returns {{ valid: boolean, errorCode?: number, error?: string }}
 */
function validateString(input, fieldName, options = {}) {
    const {
        maxLength = Infinity,
        required = true,
        checkInjection = true,
        checkDangerousChars = true,
        moduleTag = ""
    } = options;

    const tag = moduleTag ? moduleTag + "[validateString]" : "[validateString]";

    // ==================== 1. 空值检查 ====================
    if (required && (input === null || input === undefined || input === "")) {
        console.error(`${tag} 拦截：${fieldName} 为空，拒绝执行。`);
        return {
            valid: false,
            errorCode: 400,
            error: `${fieldName}不能为空，请提供有效的${fieldName}内容。`
        };
    }

    // 如果允许为空且确实为空，直接通过
    if (!required && (input === null || input === undefined || input === "")) {
        return { valid: true };
    }

    // ==================== 2. 类型检查 ====================
    if (typeof input !== "string") {
        console.error(`${tag} 拦截：${fieldName} 类型不正确，期望 string，实际为 ${typeof input}。`);
        return {
            valid: false,
            errorCode: 400,
            error: `${fieldName}必须为字符串类型。`
        };
    }

    // ==================== 3. 危险控制字符检查 ====================
    if (checkDangerousChars && input.indexOf("\x00") !== -1) {
        console.error(`${tag} 拦截：${fieldName} 包含 null 字节（\\x00），存在安全风险。`);
        return {
            valid: false,
            errorCode: 400,
            error: "输入包含非法控制字符（null 字节），已被拒绝。"
        };
    }

    // ==================== 4. 注入攻击检查 ====================
    if (checkInjection) {
        for (const pattern of INJECTION_PATTERNS) {
            if (pattern.test(input)) {
                console.error(`${tag} 拦截：${fieldName} 匹配到注入模式：${pattern.toString()}。`);
                return {
                    valid: false,
                    errorCode: 400,
                    error: "检测到可能的注入攻击行为，输入已被拦截。"
                };
            }
        }

        // 检查 Unicode 控制字符
        if (DANGEROUS_UNICODE_PATTERN.test(input)) {
            console.error(`${tag} 拦截：${fieldName} 包含 Unicode 方向控制字符。`);
            return {
                valid: false,
                errorCode: 400,
                error: "输入包含危险的 Unicode 控制字符，已被拒绝。"
            };
        }
    }

    // ==================== 5. 长度限制检查 ====================
    if (input.length > maxLength) {
        console.error(`${tag} 拦截：${fieldName} 长度 ${input.length} 超过上限 ${maxLength}。`);
        return {
            valid: false,
            errorCode: 400,
            error: `${fieldName}长度超过限制（最大 ${maxLength} 字符）。`
        };
    }

    // ==================== 全部检查通过 ====================
    console.log(`${tag} ${fieldName} 验证通过。长度: ${input.length} 字符。`);
    return { valid: true };
}

/**
 * 验证数字输入（支持 number 和可解析的字符串类型）
 * @param {number|string} input - 待验证的数字
 * @param {string} fieldName - 字段名称
 * @param {Object} [options] - 验证选项
 * @param {number} [options.min=1] - 最小值
 * @param {number} [options.max=Infinity] - 最大值
 * @param {boolean} [options.required=true] - 是否必填
 * @param {string} [options.moduleTag] - 模块标签
 * @returns {{ valid: boolean, errorCode?: number, error?: string, parsedValue?: number }}
 */
function validateNumber(input, fieldName, options = {}) {
    const {
        min = 1,
        max = Infinity,
        required = true,
        moduleTag = ""
    } = options;

    const tag = moduleTag ? moduleTag + "[validateNumber]" : "[validateNumber]";

    // ==================== 1. 空值检查 ====================
    if (required && (input === null || input === undefined)) {
        console.error(`${tag} 拦截：${fieldName} 为空，拒绝执行。`);
        return {
            valid: false,
            errorCode: 400,
            error: `${fieldName}不能为空，请提供有效的${fieldName}。`
        };
    }

    // ==================== 2. 类型转换和验证 ====================
    let parsedValue;
    if (typeof input === "number") {
        if (!Number.isFinite(input) || !Number.isInteger(input)) {
            console.error(`${tag} 拦截：${fieldName} 必须为整数，实际为 ${input}。`);
            return {
                valid: false,
                errorCode: 400,
                error: `${fieldName}必须为整数。`
            };
        }
        parsedValue = input;
    } else if (typeof input === "string") {
        const trimmed = input.trim();
        if (trimmed === "") {
            console.error(`${tag} 拦截：${fieldName} 为空字符串。`);
            return {
                valid: false,
                errorCode: 400,
                error: `${fieldName}不能为空字符串。`
            };
        }
        const numVal = Number(trimmed);
        if (!Number.isFinite(numVal) || !Number.isInteger(numVal)) {
            console.error(`${tag} 拦截：${fieldName} 无法解析为整数，实际为：${trimmed}。`);
            return {
                valid: false,
                errorCode: 400,
                error: `${fieldName}必须为可解析为整数的字符串。`
            };
        }
        parsedValue = numVal;
    } else {
        console.error(`${tag} 拦截：${fieldName} 类型不正确，期望 number 或 string，实际为 ${typeof input}。`);
        return {
            valid: false,
            errorCode: 400,
            error: `${fieldName}必须为 number 或数字字符串类型。`
        };
    }

    // ==================== 3. 范围检查 ====================
    if (parsedValue < min || parsedValue > max) {
        console.error(`${tag} 拦截：${fieldName} 超出范围，实际为 ${parsedValue}（允许范围：${min} ~ ${max}）。`);
        return {
            valid: false,
            errorCode: 400,
            error: `${fieldName}超出合理范围，允许 ${min} ~ ${max}。`
        };
    }

    // ==================== 全部检查通过 ====================
    console.log(`${tag} ${fieldName} 验证通过。值: ${parsedValue}。`);
    return { valid: true, parsedValue: parsedValue };
}

/**
 * 批量验证多个字段
 * @param {Object} fields - 字段配置对象，key为字段名，value为 { value, type, options }
 * @param {string} [moduleTag] - 模块标签
 * @returns {{ valid: boolean, errorCode?: number, error?: string, parsedValues?: Object }}
 */
function validateFields(fields, moduleTag = "") {
    const parsedValues = {};

    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
        const { value, type, options } = fieldConfig;
        const mergedOptions = { ...options, moduleTag };

        let result;
        if (type === "string") {
            result = validateString(value, fieldName, mergedOptions);
        } else if (type === "number") {
            result = validateNumber(value, fieldName, mergedOptions);
        } else {
            return {
                valid: false,
                errorCode: 400,
                error: `不支持的字段类型：${type}`
            };
        }

        if (!result.valid) {
            return result;
        }

        if (result.parsedValue !== undefined) {
            parsedValues[fieldName] = result.parsedValue;
        }
    }

    return { valid: true, parsedValues };
}

module.exports = {
    validateString,
    validateNumber,
    validateFields,
    INJECTION_PATTERNS,
    DANGEROUS_UNICODE_PATTERN
};
