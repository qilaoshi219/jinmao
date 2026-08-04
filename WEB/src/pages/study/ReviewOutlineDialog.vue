<!--
============================================================================
文件名：study/ReviewOutlineDialog.vue（复习提纲弹窗）
文件作用：调用后端生成课程复习提纲，Markdown 渲染展示，支持重新生成
遵守设计规范：Element Plus、10px 圆角、纯黑纯白文字、暗黑双轨、防重复点击
============================================================================
-->

<template>
  <el-dialog
    :model-value="visible"
    :title="'复习提纲 · ' + (courseName || '')"
    width="min(680px, 92vw)"
    top="6vh"
    :close-on-click-modal="false"
    class="review-outline-dialog"
    @update:model-value="(v) => $emit('update:visible', v)"
    @open="onOpen">

    <!-- 生成中 -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-16 gap-3">
      <el-icon class="is-loading" :size="30"><Loading /></el-icon>
      <p class="text-sm text-black dark:text-white">正在生成复习提纲（约需 10-30 秒）...</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">按章节提炼核心知识点，消耗少量余额</p>
    </div>

    <!-- 生成失败 -->
    <div v-else-if="error" class="py-10 text-center">
      <p class="text-sm text-red-500 mb-4">{{ error }}</p>
      <el-button type="primary" :loading="loading" @click="loadOutline">重试</el-button>
    </div>

    <!-- 提纲内容 -->
    <div v-else-if="outline"
         class="max-h-[60vh] overflow-y-auto rounded-[10px] border p-4 transition-colors duration-500
                markdown-body text-black dark:text-white"
         :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }"
         v-html="htmlOutline"></div>

    <!-- 空态（防御） -->
    <div v-else class="py-10 text-center text-gray-400">暂无内容</div>

    <template #footer>
      <el-button :disabled="loading" @click="$emit('update:visible', false)">关闭</el-button>
      <el-button type="primary" :loading="loading" :disabled="!outline && !error" @click="loadOutline">
        {{ loading ? '生成中...' : '重新生成' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== 复习提纲弹窗逻辑 ====================
import { ref, computed, watch } from "vue";
import { generateReviewOutline } from "../../api/books";
import { renderMarkdown } from "../../utils/markdown";

const props = defineProps({
  visible: { type: Boolean, default: false },
  courseId: { type: [String, Number], default: null },
  courseName: { type: String, default: "" },
});
const emit = defineEmits(["update:visible"]);

const loading = ref(false);
const outline = ref("");
const error = ref("");

/** 安全渲染后的 HTML */
const htmlOutline = computed(() => renderMarkdown(outline.value));

async function loadOutline() {
  if (!props.courseId || loading.value) return;
  loading.value = true;
  error.value = "";
  outline.value = "";
  try {
    const result = await generateReviewOutline(props.courseId);
    if (result.code === 200 && result.data?.outline) {
      outline.value = result.data.outline;
    } else {
      error.value = result.message || "复习提纲生成失败，请稍后再试";
    }
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || "复习提纲生成失败，请稍后再试";
  } finally {
    loading.value = false;
  }
}

function onOpen() {
  if (!outline.value && !error.value) loadOutline();
}

watch(
  () => props.visible,
  (v) => {
    if (v) onOpen();
  }
);
</script>

<style scoped>
/* 复习提纲 Markdown 排版（文字纯黑纯白，代码/表格保持基础样式） */
.markdown-body :deep(h1) { font-size: 1.25rem; font-weight: 800; margin: 0.6em 0 0.3em; }
.markdown-body :deep(h2) { font-size: 1.05rem; font-weight: 700; margin: 0.8em 0 0.3em; color: #3b82f6; }
.markdown-body :deep(ul) { list-style: disc; padding-left: 1.4em; margin: 0.4em 0; }
.markdown-body :deep(ol) { list-style: decimal; padding-left: 1.4em; margin: 0.4em 0; }
.markdown-body :deep(li) { margin: 0.2em 0; line-height: 1.7; }
.markdown-body :deep(strong) { font-weight: 700; }
</style>
