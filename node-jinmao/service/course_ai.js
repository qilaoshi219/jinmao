// ==================== AI 助教问答服务模块 ====================
// 职责：课程学习页右侧 AI 助教的核心业务逻辑
//   - 上下文构建：本章原文（MinIO MD 行区间）+ 当前页口播稿 + 当前页助教提示
//   - SSE 流式问答：复用 llm_client.chatStream，按所选模型计费
//   - 追问推荐：回答结束后用小模型 flash 生成 3 条建议
//   - 成本控制：章节原文截断、历史条数上限、上下文 token 上限、模型单价展示

const path = require("path");
const Minio = require("minio");
const bookRepo = require("../utils/repo/book_repo");
const chapterRepo = require("../utils/repo/chapter_repo");
const aiRepo = require("../utils/repo/ai_repo");
const llmClient = require("../utils/llm_client");
const { checkCanUseAI } = require("../utils/balance");
const { validateString } = require("../utils/input_validator");
const { loadConfig, getActivePeriodFromConfig, getPriceFromPeriod, ceilTo7Decimals } = require("../utils/billing_config");
const config = require("../config");
const deepseekConfig = config.deepseek;

// 日志前缀
const TAG = "[course_ai]";

// ==================== 成本控制常量（集中可调） ====================
const MAX_QUESTION_CHARS = 2000;        // 单条问题最大字符数
const MAX_CHAPTER_CHARS = 1000000;      // 注入上下文的章节原文最大字符数
const MAX_HISTORY_MESSAGES = 100;       // 单轮携带的历史消息条数上限
const CONTEXT_LIMIT_TOKENS = 1000000;   // 上下文 token 上限（超限拒绝调用，提示新建对话）
const MAX_SUGGESTIONS = 3;              // 每轮推荐追问条数
const MAX_SUGGESTION_CHARS = 30;        // 单条推荐追问最大字符数
const CHAPTER_CACHE_TTL_MS = 10 * 60 * 1000; // 章节素材缓存有效期

// 允许用户选择的模型（key → modelSize 映射，与 billing_pricing.json 联动）
const SUPPORTED_MODELS = {
  flash: { modelSize: "small", label: "经济版 flash" },
  pro: { modelSize: "big", label: "专业版 pro" },
};

// ==================== MinIO 客户端 ====================
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
const BUCKET = process.env.MINIO_BUCKET || "jinmao";

// 章节素材缓存：key = courseId:chapterId，value = { chapterText, outline, ts }
const chapterContextCache = new Map();

// ==================== 错误类型 ====================
/** 业务错误：携带 HTTP 状态码，由路由层转成 JSON 响应或 SSE error 事件 */
class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ==================== 工具函数 ====================

/** 将 MinIO 流转换为字符串 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

/** 估算字符串 token 数（保守按 1 字符 ≈ 1 token，仅用于超限预检） */
function estimateTokens(text) {
  return text ? Math.ceil(String(text).length) : 0;
}

/** 截断字符串到指定字符数 */
function truncate(text, maxChars) {
  if (!text) return "";
  const str = String(text).trim();
  return str.length > maxChars ? str.slice(0, maxChars) : str;
}

/** 数字补零：1 → "01" */
function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * 校验课程归属（与 slides.js 一致的权限模型）
 * @returns {Promise<Object>} { code: 200, course } 或 { code: 404/403/500, message }
 */
async function assertCourseOwnership(courseId, userId) {
  if (!/^\d+$/.test(String(courseId))) {
    return { code: 400, message: "课程 ID 格式无效，必须为纯数字。" };
  }
  const result = await bookRepo.getCourseById(courseId);
  if (result.code === 404) return { code: 404, message: "课程不存在。" };
  if (result.code !== 200) return { code: 500, message: result.message || "课程查询失败。" };
  if (String(result.course.userId) !== String(userId)) {
    return { code: 403, message: "无权访问该课程。" };
  }
  return { code: 200, course: result.course };
}

/**
 * 校验章节属于课程
 * @returns {Promise<{ code: number, chapter?: Object, message?: string }>}
 */
async function assertChapterBelongsToCourse(courseId, chapterId) {
  if (!/^\d+$/.test(String(chapterId))) {
    return { code: 400, message: "章节 ID 格式无效，必须为纯数字。" };
  }
  const result = await chapterRepo.getChapterById(chapterId);
  if (result.code === 404) return { code: 404, message: "章节不存在。" };
  if (result.code !== 200) return { code: 500, message: result.message || "章节查询失败。" };
  if (String(result.chapter.courseId) !== String(courseId)) {
    return { code: 400, message: "该章节不属于指定课程。" };
  }
  return { code: 200, chapter: result.chapter };
}

/**
 * 读取章节素材（本章原文 + 大纲 JSON），带内存缓存
 * @param {Object} course - 课程对象（含 textbookPath）
 * @param {Object} chapter - 章节对象（含 chapterRoot、startline、endline、totalPages）
 * @returns {Promise<{ chapterText: string, outline: Object|null }>}
 */
async function loadChapterContext(course, chapter) {
  const cacheKey = String(course.id) + ":" + String(chapter.id);
  const cached = chapterContextCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CHAPTER_CACHE_TTL_MS) {
    console.log(TAG + "[loadChapterContext] 命中章节素材缓存: " + cacheKey);
    return { chapterText: cached.chapterText, outline: cached.outline };
  }

  // 1. 本章原文：教材 MD 的 [startline, endline] 行区间
  let chapterText = "";
  if (course.textbookPath && course.textbookPath !== "pending") {
    try {
      const stream = await minioClient.getObject(BUCKET, course.textbookPath.replace(/^\/+/, ""));
      const mdText = await streamToString(stream);
      const lines = mdText.split("\n");
      const start = Math.max(0, (chapter.startline || 1) - 1);
      const end = Math.min(lines.length, chapter.endline || lines.length);
      chapterText = truncate(lines.slice(start, end).join("\n"), MAX_CHAPTER_CHARS);
      console.log(TAG + "[loadChapterContext] 章节原文提取完成: " + chapterText.length + " 字符（行 " + (start + 1) + "~" + end + "）");
    } catch (error) {
      console.error(TAG + "[loadChapterContext] 章节原文读取失败: " + error.message);
      throw new ChatError(500, "章节内容读取失败，请稍后再试。");
    }
  } else {
    console.warn(TAG + "[loadChapterContext] 课程教材路径无效（textbookPath=" + course.textbookPath + "），跳过章节原文注入");
  }

  // 2. 大纲 JSON（取当前页口播稿/助教提示），读取失败不阻塞（与 slides.js 一致）
  let outline = null;
  const cleanRoot = String(chapter.chapterRoot || "").replace(/^\/+/, "");
  // chapterRoot 末尾带斜杠，split("/").pop() 会得到空字符串，需过滤空段
  const chapterDirName = cleanRoot.split("/").filter(Boolean).pop() || "chapter_01";
  const outlinePath = cleanRoot + chapterDirName + ".json";
  if (cleanRoot) {
    try {
      const stream = await minioClient.getObject(BUCKET, outlinePath);
      const jsonText = await streamToString(stream);
      outline = JSON.parse(jsonText);
    } catch (error) {
      console.warn(TAG + "[loadChapterContext] 大纲 JSON 读取失败（不影响主流程）: " + error.message);
    }
  }

  chapterContextCache.set(cacheKey, { chapterText, outline, ts: Date.now() });
  return { chapterText, outline };
}

/**
 * 构建 system 提示词：人设 + 课程/章节 + 本章内容
 * 跨轮完全稳定（不含页面素材），最大化 DeepSeek 上下文缓存命中；
 * 当前页素材由 conversation 中的 context 消息承载（翻页时更新），拼接在历史中
 */
function buildSystemContent(course, chapter, chapterText) {
  const sections = [
    "你是「金毛教你学」课程学习页的 AI 助教，负责帮助学员理解当前课程的内容，把知识点讲明白、讲透。",
    "",
    "参考资料：",
    "- 下方【本章内容】为教材原文，另有独立的【当前页素材】（当前页口播稿与助教提示）会随对话提供；",
    "- 这些资料用于帮助你准确理解课程内容，回答时不必逐字照搬原文，允许在教材基础上扩展：补充背景知识、原理解释、生活化例子、易错点辨析等，帮助学员真正理解；",
    "- 学员的问题可以围绕本章延伸，不必死扣原文字面；若问题明显与本章无关，尽量结合课程知识作答，再温和引导回本章重点，不要生硬拒绝。",
    "",
    "回答要求：",
    "1. 使用通俗易懂的中文，先给结论/定义，再解释原理，必要时补充例子与扩展；",
    "2. 计算题或定义类问题给出清晰步骤与结论；",
    "3. 以讲清楚为准，不要因追求简短而省略关键解释。",
    "",
    "课程名称：" + (course.name || "未知课程"),
    "章节名称：" + (chapter.name || "未知章节"),
    "",
    "【本章内容】",
    chapterText || "（本章内容暂不可用）",
  ];
  return sections.join("\n");
}

/**
 * 构建当前页素材 context 文本（随翻页更新，插入对话历史，让 AI 知道用户正在学习哪一页）
 * @param {number} page - 页码
 * @param {string} script - 当前页口播稿
 * @param {string} zjts - 当前页助教提示
 */
function buildPageContext(page, script, zjts) {
  return "【当前页素材】\n页码：第 " + page + " 页\n当前页口播稿：" + (script || "（暂无）")
    + "\n当前页助教提示：" + (zjts || "（暂无）");
}

/**
 * 从 context 消息内容中解析页码（用于翻页去重）
 * @param {string} content - context 消息内容
 * @returns {number|null} 页码或 null
 */
function extractContextPage(content) {
  const match = String(content || "").match(/页码：第\s*(\d+)\s*页/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 组装 LLM 消息：system + 历史最近 N 条（含 context 素材）+ 当前问题
 * context 消息以 user 角色进入上下文（内容为【当前页素材】）
 * @param {string} systemContent - system 提示词
 * @param {Array<{role: string, content: string}>} history - 历史消息（旧→新）
 * @param {string} question - 当前问题
 */
function buildChatMessages(systemContent, history, question) {
  const messages = [{ role: "system", content: systemContent }];
  const tail = history.slice(-MAX_HISTORY_MESSAGES);
  for (const m of tail) {
    if (m.role === "user" || m.role === "assistant" || m.role === "context") {
      // context（当前页素材）以 user 角色进入上下文，保证 AI 感知当前页
      messages.push({ role: m.role === "context" ? "user" : m.role, content: m.content || "" });
    }
  }
  messages.push({ role: "user", content: question });
  return messages;
}

/**
 * 获取可选模型列表（从 billing_pricing.json 读取单价，供前端下拉渲染）
 * @returns {Array<{key: string, label: string, inputCacheMiss: number, output: number}>}
 */
function getAvailableModels() {
  const pricingPath = path.join(__dirname, "..", "config", "billing_pricing.json");
  const config = loadConfig(pricingPath);
  const period = config ? getActivePeriodFromConfig(config) : null;
  const result = [];

  for (const [key, meta] of Object.entries(SUPPORTED_MODELS)) {
    const modelName = key === "pro" ? deepseekConfig.DEEPSEEK_API_BIG.DEEPSEEK_API_MODEL : deepseekConfig.DEEPSEEK_API_SMALL.DEEPSEEK_API_MODEL;
    const price = period ? getPriceFromPeriod(period, "deepseek", modelName) : null;
    result.push({
      key: key,
      label: meta.label,
      inputCacheMiss: price?.input_cache_miss ?? 0,
      inputCacheHit: price?.input_cache_hit ?? 0,
      output: price?.output ?? 0,
    });
  }
  return result;
}

/** 获取模型名称（用于计费/价格查询） */
function getModelName(key) {
  return key === "pro" ? deepseekConfig.DEEPSEEK_API_BIG.DEEPSEEK_API_MODEL : deepseekConfig.DEEPSEEK_API_SMALL.DEEPSEEK_API_MODEL;
}

/**
 * 按配置单价计算费用（兜底：流式接口未返回 cost 时使用）
 * @param {string} modelKey - flash / pro
 * @param {Object} usage - { promptTokens, cacheHitTokens, cacheMissTokens, completionTokens }
 */
function computeCost(modelKey, usage) {
  if (!usage) return 0;
  const pricingPath = path.join(__dirname, "..", "config", "billing_pricing.json");
  const config = loadConfig(pricingPath);
  const period = config ? getActivePeriodFromConfig(config) : null;
  const price = period ? getPriceFromPeriod(period, "deepseek", getModelName(modelKey)) : null;
  if (!price) return 0;

  const hit = usage.cacheHitTokens || 0;
  const miss = usage.cacheMissTokens || 0;
  const out = usage.completionTokens || 0;
  const inputCost = ceilTo7Decimals((hit / 1000000) * (price.input_cache_hit || 0) + (miss / 1000000) * (price.input_cache_miss || 0));
  const outputCost = ceilTo7Decimals((out / 1000000) * (price.output || 0));
  return ceilTo7Decimals(inputCost + outputCost);
}

/**
 * 生成推荐追问（回答结束后调用，固定小模型 flash 控制成本）
 * @param {string} userId - 用户 ID
 * @param {string} question - 用户问题
 * @param {string} answer - AI 回答
 * @returns {Promise<string[]>} 推荐追问数组（失败返回空数组，不阻塞主流程）
 */
async function generateSuggestions(userId, question, answer) {
  try {
    const systemPrompt = "你是学习助教。根据用户的问题和你给出的回答，推荐 3 个学员最可能继续追问的短问题，帮助学员深入理解。"
      + "要求：每个问题不超过 " + MAX_SUGGESTION_CHARS + " 个字，口语化，与教材内容相关。"
      + "只返回 JSON：{\"suggestions\": [\"问题1\", \"问题2\", \"问题3\"]}";
    const userContent = "用户问题：" + truncate(question, 500) + "\n\n助教回答：" + truncate(answer, 2000);

    const result = await llmClient.chat(userId, "course_ai_suggest", {
      modelSize: "small", // 固定 flash，控制成本
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    if (result.code !== 200) {
      console.warn(TAG + "[generateSuggestions] 建议生成失败: " + (result.message || "未知错误"));
      return [];
    }

    let parsed = null;
    try {
      parsed = JSON.parse(result.message.content);
    } catch (_) {
      // 清理可能的 markdown 包裹后重试
      let jsonStr = result.message.content.trim().replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    }

    const suggestions = (parsed?.suggestions || [])
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => truncate(s, MAX_SUGGESTION_CHARS))
      .slice(0, MAX_SUGGESTIONS);
    return suggestions;
  } catch (error) {
    console.warn(TAG + "[generateSuggestions] 建议生成异常（不阻塞主流程）: " + error.message);
    return [];
  }
}

/**
 * 计算对话累计用量/费用（供进度条与历史恢复展示）
 * @param {Array} messages - 对话消息（含 usage/cost 字段）
 */
function computeCumulative(messages) {
  let promptTokens = 0;
  let completionTokens = 0;
  let cost = 0;
  let count = 0;
  for (const m of messages || []) {
    if (m.role !== "assistant") continue;
    count += 1;
    promptTokens += m.promptTokens || 0;
    completionTokens += m.completionTokens || 0;
    cost += m.cost !== null && m.cost !== undefined ? parseFloat(String(m.cost)) : 0;
  }
  return {
    promptTokens: promptTokens,
    completionTokens: completionTokens,
    totalTokens: promptTokens + completionTokens,
    cost: Math.round(cost * 10000000) / 10000000,
    assistantMessageCount: count,
  };
}

/** 发送 SSE 事件（统一 data: JSON 格式） */
function sendSse(res, event, data) {
  res.write("event: " + event + "\n");
  res.write("data: " + JSON.stringify(data) + "\n\n");
}

/**
 * SSE 流式问答主流程
 * @param {Object} res - Express 响应对象
 * @param {string} userId - 用户 ID
 * @param {Object} params - { courseId, chapterId, conversationId?, question, pageNumber, model? }
 */
async function streamChat(res, userId, params) {
  const { courseId, chapterId, conversationId, question, pageNumber, model } = params;

  // ========== 1. 参数校验 ==========
  const trimmedQuestion = String(question || "").trim();
  const questionCheck = validateString(trimmedQuestion, "问题", {
    maxLength: MAX_QUESTION_CHARS,
    moduleTag: TAG,
  });
  if (!questionCheck.valid) {
    throw new ChatError(questionCheck.errorCode || 400, questionCheck.error || "问题不能为空。");
  }
  const page = parseInt(pageNumber, 10);
  if (isNaN(page) || page < 1) {
    throw new ChatError(400, "页码格式无效。");
  }
  if (model && !SUPPORTED_MODELS[model]) {
    throw new ChatError(400, "不支持的模型：" + model + "。");
  }
  const modelKey = model || "flash";

  // ========== 2. 课程/章节权限校验 ==========
  const courseCheck = await assertCourseOwnership(courseId, userId);
  if (courseCheck.code !== 200) throw new ChatError(courseCheck.code, courseCheck.message);
  const chapterCheck = await assertChapterBelongsToCourse(courseId, chapterId);
  if (chapterCheck.code !== 200) throw new ChatError(chapterCheck.code, chapterCheck.message);

  // ========== 3. 余额预检 ==========
  const balanceCheck = await checkCanUseAI(userId);
  if (!balanceCheck.allowed) {
    throw new ChatError(402, balanceCheck.reason || "余额不足，请充值后再试。");
  }

  // ========== 4. 对话：校验已有 / 懒创建 ==========
  let conversation = null;
  if (conversationId) {
    const convResult = await aiRepo.getConversation(userId, conversationId);
    if (convResult.code === 404) throw new ChatError(404, "对话不存在。");
    if (convResult.code !== 200) throw new ChatError(500, convResult.message);
    conversation = convResult.conversation;
    if (String(conversation.courseId) !== String(courseId)) {
      throw new ChatError(400, "该对话不属于当前课程。");
    }
    if (String(conversation.chapterId) !== String(chapterId)) {
      throw new ChatError(400, "该对话不属于当前章节。");
    }
  } else {
    const title = truncate(trimmedQuestion, 30);
    const createResult = await aiRepo.createConversation({
      userId, courseId, chapterId, model: modelKey, title, pageNumber: page,
    });
    if (createResult.code !== 200) throw new ChatError(500, createResult.message);
    conversation = createResult.conversation;
  }
  const convId = String(conversation.id);

  // 更新对话模型（用户切换模型后对下一条消息生效）
  if (String(conversation.model || "flash") !== modelKey) {
    await aiRepo.updateConversationModel(convId, modelKey).catch(() => {});
  }

  // ========== 5. 构建上下文与消息 ==========
  // 当前页素材以 context 消息拼接进对话历史（翻页后自动更新，AI 可感知用户当前学习页码）
  const { chapterText, outline } = await loadChapterContext(courseCheck.course, chapterCheck.chapter);
  const slideOutline = outline?.slides?.[page - 1] || {};
  const script = slideOutline.script || slideOutline.kbg || "";
  const zjts = slideOutline.zjts || "";
  const pageContext = buildPageContext(page, script, zjts);

  // 拼接/更新当前页素材：最后一条是 context 且页码不同 → 原地更新；否则插入新 context
  const historyRows = (conversation.messages || []).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const lastMsg = historyRows[historyRows.length - 1] || null;
  if (lastMsg && lastMsg.role === "context") {
    if (extractContextPage(lastMsg.content) !== page) {
      await aiRepo.updateMessageContent(String(conversation.messages[conversation.messages.length - 1].id), pageContext).catch(() => {});
      lastMsg.content = pageContext;
    }
  } else {
    const ctxMsg = await aiRepo.addMessage(convId, "context", pageContext);
    if (ctxMsg.code === 200) {
      historyRows.push({ role: "context", content: pageContext });
    }
  }

  const systemContent = buildSystemContent(courseCheck.course, chapterCheck.chapter, chapterText);
  const messages = buildChatMessages(systemContent, historyRows, trimmedQuestion);

  // 上下文上限预检（估算值，实际以 API 返回为准）
  const estimatedPrompt = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (estimatedPrompt > CONTEXT_LIMIT_TOKENS) {
    throw new ChatError(400, "当前对话上下文已满（超过 " + CONTEXT_LIMIT_TOKENS + " tokens），请点击「新对话」重新开始。");
  }

  // ========== 6. 建立 SSE 连接并流式输出 ==========
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 客户端断开标记
  let aborted = false;
  res.on("close", () => {
    aborted = true;
  });

  try {
    sendSse(res, "meta", {
      conversationId: convId,
      title: conversation.title || "",
      model: modelKey,
      thinking: true, // 两个模型均返回 reasoning_content，前端据此显示"思考中"动效与折叠思考块
      models: getAvailableModels(),
    });

    // 先落库用户消息（仅助手消息带 usage/cost）
    const userMsg = await aiRepo.addMessage(convId, "user", trimmedQuestion);
    if (userMsg.code !== 200) {
      throw new ChatError(500, "消息保存失败: " + (userMsg.error || ""));
    }

    let answer = "";
    let thinkingText = "";
    let usage = null;
    let cost = 0;
    try {
      const streamResult = await llmClient.chatStream(userId, "course_ai_chat", {
        modelSize: SUPPORTED_MODELS[modelKey].modelSize,
        messages: messages,
        thinking: modelKey === "pro" ? { type: "enabled" } : undefined,
        onDelta: (delta) => {
          if (aborted) {
            throw new Error("客户端已断开连接");
          }
          answer += delta;
          sendSse(res, "delta", { text: delta });
        },
        onThinkingDelta: (t) => {
          if (aborted) {
            throw new Error("客户端已断开连接");
          }
          thinkingText += t;
          sendSse(res, "think_delta", { text: t });
        },
      });

      usage = streamResult.usage || null;
      cost = streamResult.cost || 0;
      thinkingText = streamResult.thinkingContent || thinkingText;

      // usage 缺失时估算并告警（极端兼容情况）
      if (!usage) {
        console.warn(TAG + " 流式响应未返回 usage，使用估算值（可能不准确）");
        usage = {
          prompt_tokens: estimatedPrompt,
          prompt_cache_hit_tokens: 0,
          prompt_cache_miss_tokens: estimatedPrompt,
          completion_tokens: estimateTokens(answer),
          total_tokens: estimatedPrompt + estimateTokens(answer),
        };
        cost = computeCost(modelKey, {
          promptTokens: usage.prompt_tokens,
          cacheHitTokens: 0,
          cacheMissTokens: usage.prompt_cache_miss_tokens,
          completionTokens: usage.completion_tokens,
        });
      }

      // 落库助手消息（含 usage/cost）
      const assistantMsg = await aiRepo.addMessage(convId, "assistant", answer, {
        promptTokens: usage.prompt_tokens || 0,
        cacheHitTokens: 0, // 计费明细保存在 billing_record，此处仅存汇总
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      }, cost, thinkingText);
      if (assistantMsg.code !== 200) {
        console.error(TAG + " 助手消息保存失败: " + (assistantMsg.error || ""));
      }

      // 刷新对话更新时间（模型未变时也要让列表排序正确）
      await aiRepo.updateConversationModel(convId, modelKey).catch(() => {});

      // 发送 done（含本次 usage 与费用）
      const freshConversation = await aiRepo.getConversation(userId, convId);
      const cumulative = computeCumulative(freshConversation.conversation?.messages || []);
      sendSse(res, "done", {
        conversationId: convId,
        messageId: assistantMsg.code === 200 ? String(assistantMsg.message.id) : null,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          cacheHitTokens: usage.prompt_cache_hit_tokens || 0,
          cacheMissTokens: usage.prompt_cache_miss_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        cost: cost,
        cumulative: cumulative,
      });

      // ========== 7. 推荐追问（不阻塞主流程） ==========
      const suggestions = await generateSuggestions(userId, trimmedQuestion, answer);
      if (assistantMsg.code === 200 && suggestions.length > 0) {
        await aiRepo.updateMessageSuggestions(String(assistantMsg.message.id), suggestions).catch(() => {});
      }
      sendSse(res, "suggestions", { suggestions: suggestions });
      sendSse(res, "end", {});
    } catch (streamError) {
      // 流中断/失败：不落库半截回答
      if (aborted) {
        console.log(TAG + " 客户端断开，流已中止");
      } else {
        console.error(TAG + " 流式调用失败: " + streamError.message);
        sendSse(res, "error", { message: "AI 回答失败：" + streamError.message });
      }
      sendSse(res, "end", {});
    }
  } catch (error) {
    console.error(TAG + " 流式处理异常: " + error.message);
    if (aborted) {
      sendSse(res, "end", {});
    } else {
      sendSse(res, "error", { message: "服务器内部错误：" + error.message });
      sendSse(res, "end", {});
    }
  } finally {
    res.end();
  }
}

module.exports = {
  ChatError,
  streamChat,
  assertCourseOwnership,
  assertChapterBelongsToCourse,
  getAvailableModels,
  computeCumulative,
  loadChapterContext,
  buildSystemContent,
  buildPageContext,
  extractContextPage,
  buildChatMessages,
  generateSuggestions,
  SUPPORTED_MODELS,
  CONTEXT_LIMIT_TOKENS,
};
