// ==================== HTML PPT 生成结果污染检测模块 ====================
// 职责：在 generateHtmlPpt 生成 HTML 之后，检测"设计说明/设计复盘"类文字是否被
//       LLM 混入幻灯片可见正文（例如：``` ### 视觉亮点与设计意图 ... ```），
//       以及正文中是否出现不应存在的 Markdown 语法。
// 背景：生成 HTML 的 LLM 偶发会在幻灯片正文末尾自创追加一段"设计说明"，
//       复述自身设计规范（如"色彩与氛围""字体与可读性"等），
//       前端 iframe 原样渲染后用户就会看到这段设计说明文字。
// 本模块为纯函数、无副作用、不依赖任何外部服务，便于单元测试。
//
// 导出：
//   extractVisibleText(html) -> string
//   detectDesignGuideContamination(html) -> { contaminated: boolean, reasons: string[] }
//
// 上次修改：2026-08-02

// ==================== 常量定义 ====================

// 设计说明/设计复盘类高置信度关键词（保守集合，避免误伤正常教学内容）
const DESIGN_GUIDE_KEYWORDS = [
    "视觉亮点",       // "### 视觉亮点与设计意图" 这类标题
    "设计意图",       // 同上标题的后半部分
    "设计说明",       // 直接的设计说明标题
    "设计理念",       // 设计理念描述
    "设计巧思",       // 卡片设计巧思等描述
    "色彩与氛围",     // 用户案例中出现的设计小节标题
    "叙事性布局",     // 用户案例中出现的设计小节标题
    "字体与可读性",   // 用户案例中出现的设计小节标题
    "沉稳的领航员",   // 用户案例中出现的开场叙事句
];

// markdown 代码围栏标记（纯 HTML 幻灯片正文绝不允许出现）
const MD_CODE_FENCE = "```";

// markdown 标题正则：匹配行首或空白后的 #~###### + 空格
const MD_HEADING_REGEX = /(^|\s)#{1,6}\s/;

// markdown 加粗正则：匹配 ** 非换行内容 **
const MD_BOLD_REGEX = /\*\*[^*\n]+\*\*/;

// 需要整体剔除其内容、不参与可见文本检测的标签（含其内部任何文本）
const STRIP_BLOCK_TAGS = [
    [/<script[\s>][\s\S]*?<\/script>/gi, ""],   // 脚本块
    [/<style[\s>][\s\S]*?<\/style>/gi, ""],     // 样式块
    // 代码示例块：内部的 ``` 或 ** 属于合法代码，不得触发污染判定
    [/<pre[\s>][\s\S]*?<\/pre>/gi, ""],
    [/<code[\s>][\s\S]*?<\/code>/gi, ""],
];

// ==================== 核心函数 ====================

/**
 * 从 HTML 中提取"可见文本"（去除脚本、样式、代码块、所有标签后的纯文本）
 * 说明：
 *   - <pre>/<code> 中的内容属于代码示例，其内的 ```、** 等是合法代码，直接剔除，
 *     避免把正常代码示例误判为设计说明污染。
 *   - 标签之间的文本（含被标签分割的文本）会拼接输出。
 * @param {string} html - 待分析的 HTML 字符串
 * @returns {string} 压缩空白后的纯可见文本
 */
function extractVisibleText(html) {
    if (typeof html !== "string" || html.length === 0) return "";

    let text = html;

    // 1. 剔除脚本/样式/代码块（含内部内容）
    for (const [pattern, replacement] of STRIP_BLOCK_TAGS) {
        text = text.replace(pattern, replacement);
    }

    // 2. 删除其余所有标签（保留标签间文本）
    text = text.replace(/<[^>]+>/g, "");

    // 3. 常见 HTML 实体转义为可读字符
    text = text.replace(/&nbsp;/gi, " ");
    text = text.replace(/&amp;/gi, "&");
    text = text.replace(/&lt;/gi, "<");
    text = text.replace(/&gt;/gi, ">");
    text = text.replace(/&quot;/gi, "\"");
    text = text.replace(/&#39;/gi, "'");

    // 4. 压缩连续空白，去除首尾空白
    text = text.replace(/\s+/g, " ").trim();

    return text;
}

/**
 * 检测 HTML 可见正文中是否混入了"设计说明/设计复盘"类文字或非法 Markdown 语法
 * 判定规则（满足任一即判为污染，reasons 记录全部命中原因）：
 *   1. 可见文本包含 markdown 代码围栏 ```（纯 HTML 幻灯片正文绝不允许出现）
 *   2. 可见文本包含 markdown 标题语法（# 开头）或加粗语法（**...**）
 *   3. 可见文本包含设计说明类高置信度关键词
 * @param {string} html - 待检测的 HTML 字符串
 * @returns {{ contaminated: boolean, reasons: string[] }}
 *   contaminated — 是否判定为污染；reasons — 命中的原因描述数组（无污染时为空数组）
 */
function detectDesignGuideContamination(html) {
    const reasons = [];

    // 空内容/非字符串：视为无污染（交由上层其他校验处理）
    if (typeof html !== "string" || html.trim() === "") {
        return { contaminated: false, reasons };
    }

    // 提取可见文本（自动豁免 <pre>/<code> 内的代码内容）
    const visibleText = extractVisibleText(html);
    if (visibleText === "") {
        return { contaminated: false, reasons };
    }

    // 规则 1：markdown 代码围栏
    if (visibleText.includes(MD_CODE_FENCE)) {
        reasons.push("可见正文包含 Markdown 代码围栏 ```");
    }

    // 规则 2a：markdown 标题语法
    if (MD_HEADING_REGEX.test(visibleText)) {
        reasons.push("可见正文包含 Markdown 标题语法（# 开头）");
    }

    // 规则 2b：markdown 加粗语法
    if (MD_BOLD_REGEX.test(visibleText)) {
        reasons.push("可见正文包含 Markdown 加粗语法（**...**）");
    }

    // 规则 3：设计说明类关键词
    for (const keyword of DESIGN_GUIDE_KEYWORDS) {
        if (visibleText.includes(keyword)) {
            reasons.push("可见正文包含设计说明关键词「" + keyword + "」");
        }
    }

    return {
        contaminated: reasons.length > 0,
        reasons: reasons,
    };
}

// ==================== 导出 ====================
module.exports = {
    extractVisibleText,
    detectDesignGuideContamination,
};
