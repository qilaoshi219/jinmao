<!--
============================================================================
文件名：AiChatPanel.vue（AI 助教面板组件）
所属目录：src/pages/study/
文件作用：AI 助教聊天面板（头部/历史对话/新对话/消息区/底部输入/模型切换/用量环）
         从学习页 index.vue 原样抽取，供桌面右栏、移动端底部面板、
         移动端全屏右侧面板三处复用
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- 面板头部：章节名 + 历史/新对话操作 -->
    <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border)] flex-shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="text-[11px] font-semibold text-black dark:text-white truncate">{{ currentChapterTitle || 'AI 助教' }}</span>
        <span v-if="activeConversationId" class="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 text-[9px] leading-none">对话中</span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <!-- 历史对话 -->
        <el-popover v-model:visible="historyVisible" placement="bottom-end" :width="historyPopoverWidth" trigger="click">
          <template #reference>
            <button class="flex items-center justify-center w-6 h-6 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
                    title="历史对话">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </button>
          </template>
          <div class="max-h-[300px] overflow-y-auto">
            <div v-if="history.length === 0" class="py-6 text-center text-xs text-[var(--color-text-secondary)]">
              暂无历史对话
            </div>
            <div v-for="c in history" :key="c.id"
                 class="px-2 py-2 rounded-[8px] cursor-pointer hover:bg-[var(--color-card-hover)] transition-colors duration-300"
                 :class="String(c.id) === String(activeConversationId) ? 'bg-[var(--color-card-hover)]' : ''"
                 @click="$emit('open-conversation', c.id)">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-black dark:text-white truncate">{{ c.title || '未命名对话' }}</span>
                <span class="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-[var(--color-card-hover)] text-[var(--color-text-secondary)]">{{ c.model === 'pro' ? 'pro' : 'flash' }}</span>
              </div>
              <div class="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{{ c.chapterName }} · {{ c.messageCount }} 条消息</div>
            </div>
          </div>
        </el-popover>
        <!-- 新对话 -->
        <button @click="$emit('new-conversation')"
                class="flex items-center justify-center w-6 h-6 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
                title="新对话">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 消息区 -->
    <div ref="messagesRef" class="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
      <!-- 空状态引导 -->
      <div v-if="messages.length === 0" class="flex flex-col items-center justify-center pt-12 px-4 text-center">
        <svg class="w-10 h-10 mb-3 text-[var(--color-text-secondary)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
        </svg>
        <p class="text-xs text-[var(--color-text-secondary)]">发送第一条消息开始提问</p>
        <p class="text-[10px] text-[var(--color-text-secondary)] mt-1 opacity-60">将自动带入本章内容与当前页口播稿、助教提示</p>
      </div>

      <template v-for="(msg, i) in messages" :key="i">
        <!-- 思考过程（可折叠，思考中带动效） -->
        <div v-if="msg.role === 'assistant' && !msg.greeting && (msg.thinking || (msg.streaming && msg.thinkingMode && !msg.text))"
             class="flex justify-start pl-1">
          <div class="max-w-[88%] rounded-[10px] border border-[var(--color-border)] overflow-hidden text-xs">
            <button @click="msg.thinkingOpen = !msg.thinkingOpen"
                    class="w-full flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer bg-transparent border-none text-[var(--color-text-secondary)] hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-300">
              <svg class="w-2.5 h-2.5 transition-transform duration-300 flex-shrink-0" :class="msg.thinkingOpen ? 'rotate-90' : ''"
                   fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
              </svg>
              <svg v-if="msg.streaming && !msg.text" class="w-2.5 h-2.5 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 109 9h-2.4A6.6 6.6 0 1112 5.4V3z"/>
              </svg>
              <span class="text-[10px]">
                <span v-if="msg.streaming && !msg.text" class="animate-pulse">思考中...</span>
                <span v-else>思考过程</span>
              </span>
            </button>
            <div v-if="msg.thinkingOpen && msg.thinking"
                 class="px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words border-t border-[var(--color-border)] max-h-40 overflow-y-auto">
              {{ msg.thinking }}
            </div>
          </div>
        </div>

        <!-- 消息气泡 -->
        <div :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
          <div class="max-w-[88%] px-3 py-2 rounded-[10px] text-xs leading-relaxed break-words"
               :class="msg.role === 'user'
                 ? 'bg-blue-500 text-white'
                 : msg.failed
                   ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                   : msg.greeting
                     ? 'bg-blue-500/5 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20'
                     : 'bg-[var(--color-card-hover)] text-black dark:text-white'">
            <!-- 助教提示：以"发送给用户"的问候消息呈现 -->
            <template v-if="msg.greeting">
              <div class="flex items-center gap-1 mb-1">
                <svg class="w-3 h-3 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                </svg>
                <span class="text-[10px] font-medium text-blue-500 dark:text-blue-400">助教提示</span>
              </div>
              <div class="whitespace-pre-wrap text-black dark:text-white">{{ msg.text }}</div>
            </template>
            <!-- 普通助手消息：Markdown 渲染 -->
            <template v-else-if="msg.role === 'assistant'">
              <div class="ai-msg-md" v-html="renderMarkdown(msg.text)"></div>
              <span v-if="msg.streaming" class="inline-block ml-0.5 animate-pulse">▍</span>
            </template>
            <!-- 用户消息：纯文本 -->
            <div v-else class="whitespace-pre-wrap">
              {{ msg.text }}
            </div>
          </div>
        </div>
        <!-- 推荐追问 -->
        <div v-if="msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && !msg.streaming"
             class="flex justify-start flex-wrap gap-1.5 pl-1">
          <button v-for="(s, si) in msg.suggestions" :key="si"
                  @click="$emit('use-suggestion', s)"
                  class="px-2.5 py-1 rounded-full border border-blue-500/40 dark:border-blue-400/40 text-[10px] text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 transition-all duration-300 cursor-pointer bg-transparent">
            {{ s }}
          </button>
        </div>
      </template>
    </div>

    <!-- 底部输入组件（紧凑：两行输入 + 圆环进度 + 微型模型切换） -->
    <div class="flex-shrink-0 border-t border-[var(--color-border)] ai-composer">
      <div class="px-3 pt-2 pb-2.5">
        <!-- 两行输入框（Enter 发送，Shift+Enter 换行） -->
        <div class="bg-[var(--color-card-hover)] rounded-[10px] px-2.5 py-2">
          <el-input :model-value="input" type="textarea" resize="none"
                    :autosize="{ minRows: 2, maxRows: 5 }"
                    :disabled="streaming"
                    placeholder="输入问题...（Enter 发送，Shift+Enter 换行）"
                    @update:model-value="$emit('update:input', $event)"
                    @keydown.enter.exact.prevent="$emit('send')"/>
        </div>

        <!-- 工具行：微型模型切换 + 发送按钮 -->
        <div class="flex items-center justify-between mt-1.5">
          <div class="flex items-center gap-2">
            <!-- 上下文用量：模型切换左侧的小圆环，hover 展开详情 -->
            <el-popover trigger="hover" placement="top" :width="320">
              <template #reference>
                <button class="w-4 h-4 flex items-center justify-center p-0 bg-transparent border-none cursor-pointer group"
                        title="上下文使用情况">
                  <svg viewBox="0 0 36 36" class="w-4 h-4 -rotate-90 transition-transform duration-500 group-hover:scale-110">
                    <circle cx="18" cy="18" r="15.5" fill="none" class="ai-ring-bg" stroke-width="4"/>
                    <circle cx="18" cy="18" r="15.5" fill="none"
                            :stroke="usagePercent >= 90 ? '#ef4444' : '#409EFF'"
                            stroke-width="4" stroke-linecap="round"
                            :stroke-dasharray="ringDash.circumference"
                            :stroke-dashoffset="ringDash.offset"/>
                  </svg>
                </button>
              </template>
              <div class="text-xs text-[var(--color-text-primary)] space-y-1.5 min-w-[280px]">
                <div class="font-semibold text-[11px] mb-1">上下文使用情况</div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次输入 tokens</span><span>{{ formatAiTokens(usage.promptTokens) }}</span></div>
                <div v-if="usage.cacheHitTokens > 0 || usage.cacheMissTokens > 0" class="flex justify-between">
                  <span class="text-[var(--color-text-secondary)]">缓存命中 / 未命中</span>
                  <span>{{ formatAiTokens(usage.cacheHitTokens) }} / {{ formatAiTokens(usage.cacheMissTokens) }}</span>
                </div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次输出 tokens</span><span>{{ formatAiTokens(usage.completionTokens) }}</span></div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次合计 tokens</span><span>{{ formatAiTokens(usage.totalTokens) }}</span></div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次费用</span><span>{{ formatAiCost(usage.cost) }}</span></div>
                <div class="border-t border-[var(--color-border)] my-1.5"></div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">累计 tokens</span><span>{{ formatAiTokens(usage.cumulative.totalTokens) }}</span></div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">累计费用</span><span>{{ formatAiCost(usage.cumulative.cost) }}</span></div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">上下文上限</span><span>{{ formatAiTokens(128000) }} tokens</span></div>
                <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">当前占比</span><span>{{ usagePercentText }}</span></div>
              </div>
            </el-popover>

            <!-- 微型模型切换 -->
            <el-dropdown trigger="click" @command="$emit('model-select', $event)">
              <button class="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-[var(--color-card-hover)] dark:hover:text-blue-400 transition-colors duration-300 cursor-pointer bg-transparent border-none"
                      :disabled="streaming"
                      :class="streaming ? 'opacity-50 cursor-not-allowed' : ''"
                      title="选择回答模型">
                <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                </svg>
                <span>{{ selectedModel === 'pro' ? '专业版 pro' : '经济版 flash' }}</span>
                <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="m in models" :key="m.key" :command="m.key">
                    <span class="flex items-center gap-2">
                      <span class="text-xs">{{ m.label }}</span>
                      <span class="text-[10px] text-[var(--color-text-secondary)]">¥{{ m.inputCacheMiss }}/¥{{ m.output }}</span>
                      <span v-if="selectedModel === m.key" class="text-blue-500 dark:text-blue-400">✓</span>
                    </span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <el-button type="primary" :loading="streaming" @click="$emit('send')" size="small" circle>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from "vue";
import { renderMarkdown } from "../../utils/markdown";

// ==================== Props / Emits ====================
// 纯展示组件：数据与操作全部由父组件（学习页 script.js）通过 props/emits 传入
defineProps({
  /** 当前章节标题（面板头部显示） */
  currentChapterTitle: { type: String, default: "" },
  /** 当前对话 ID（null = 新对话） */
  activeConversationId: { type: [String, Number], default: null },
  /** 历史对话列表 */
  history: { type: Array, default: () => [] },
  /** 当前对话消息列表 */
  messages: { type: Array, default: () => [] },
  /** 输入框内容（v-model:input） */
  input: { type: String, default: "" },
  /** 是否正在流式回答 */
  streaming: { type: Boolean, default: false },
  /** 可选模型列表 */
  models: { type: Array, default: () => [] },
  /** 当前选择模型（v-model:selected-model） */
  selectedModel: { type: String, default: "flash" },
  /** 上下文用量统计 */
  usage: { type: Object, default: () => ({}) },
  /** 上下文用量百分比 */
  usagePercent: { type: Number, default: 0 },
  /** 上下文用量百分比文字 */
  usagePercentText: { type: String, default: "0.0%" },
  /** 用量圆环 dash 参数 */
  ringDash: { type: Object, default: () => ({ circumference: 0, offset: 0 }) },
});

const emit = defineEmits([
  "send",
  "new-conversation",
  "open-conversation",
  "use-suggestion",
  "model-select",
  "update:input",
  "update:selectedModel",
]);

// ==================== 消息区滚动 ====================
/** 消息区 DOM（自动滚动用） */
const messagesRef = ref(null);

/** 历史对话弹层可见性（面板各自独立维护，避免桌面/移动端实例互相联动） */
const historyVisible = ref(false);

/** 滚动到底部（由父组件通过组件 ref 调用，桌面/移动面板各自滚动） */
function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

defineExpose({ scrollToBottom });

// ==================== 工具函数 ====================
/** 格式化 token 数（千分位） */
function formatAiTokens(n) {
  return (n || 0).toLocaleString("zh-CN");
}

/** 格式化费用（元，小额显示 6 位小数） */
function formatAiCost(c) {
  const v = parseFloat(c || 0);
  if (!isFinite(v) || v <= 0) return "¥0";
  return "¥" + (v < 0.0001 ? v.toFixed(6) : v.toFixed(4));
}

/** 历史对话弹层宽度：小屏（移动端 30% 右栏）不超过 78vw 防溢出 */
const historyPopoverWidth = computed(() => Math.min(280, window.innerWidth - 24));
</script>

<style scoped>
  /* AI 输入组件：textarea 去边框，与卡片底色融为一体 */
  .ai-composer :deep(.el-textarea__inner) {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.6;
    resize: none;
  }
  .ai-composer :deep(.el-textarea__inner:focus) {
    box-shadow: none;
  }
  .ai-composer :deep(.el-textarea__inner:disabled) {
    background: transparent;
    cursor: not-allowed;
  }
  .ai-composer :deep(.el-textarea__inner::placeholder) {
    font-size: 12px;
  }
  /* 上下文用量圆环：底色圆（进度圆用内联 stroke 控制颜色） */
  .ai-ring-bg {
    stroke: var(--color-border);
  }
  /* AI 回答 Markdown 排版（v-html 内容，用 :deep 命中子元素） */
  .ai-msg-md :deep(p) { margin: 3px 0; }
  .ai-msg-md :deep(h1), .ai-msg-md :deep(h2), .ai-msg-md :deep(h3), .ai-msg-md :deep(h4) {
    font-size: 13px;
    font-weight: 600;
    margin: 7px 0 3px;
  }
  .ai-msg-md :deep(h1):first-child, .ai-msg-md :deep(h2):first-child, .ai-msg-md :deep(h3):first-child, .ai-msg-md :deep(h4):first-child {
    margin-top: 0;
  }
  .ai-msg-md :deep(ul), .ai-msg-md :deep(ol) {
    margin: 3px 0;
    padding-left: 18px;
  }
  .ai-msg-md :deep(ul) { list-style: disc; }
  .ai-msg-md :deep(ol) { list-style: decimal; }
  .ai-msg-md :deep(li) { margin: 2px 0; }
  .ai-msg-md :deep(code) {
    background: var(--color-card-hover);
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 11px;
    font-family: Consolas, Monaco, "Courier New", monospace;
  }
  .ai-msg-md :deep(pre) {
    background: var(--color-card-hover);
    padding: 8px 10px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 6px 0;
  }
  .ai-msg-md :deep(pre code) {
    background: transparent;
    padding: 0;
  }
  .ai-msg-md :deep(strong) { font-weight: 600; }
  .ai-msg-md :deep(em) { font-style: italic; }
  .ai-msg-md :deep(a) { color: #409EFF; text-decoration: underline; }
  .ai-msg-md :deep(blockquote) {
    border-left: 3px solid var(--color-border);
    padding-left: 8px;
    margin: 4px 0;
    color: var(--color-text-secondary);
  }
  .ai-msg-md :deep(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 6px 0;
  }
  .ai-msg-md :deep(table) { border-collapse: collapse; margin: 6px 0; }
  .ai-msg-md :deep(th), .ai-msg-md :deep(td) {
    border: 1px solid var(--color-border);
    padding: 3px 8px;
  }
</style>
