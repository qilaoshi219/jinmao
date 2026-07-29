<!--
============================================================================
文件名：QuizEssay.vue（简答题组件）
文件作用：简答题的 el-input textarea 输入框 + 字数统计
遵守设计规范：10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div>
    <!-- 简答输入框（多行） -->
    <el-input
      :model-value="modelValue"
      @update:model-value="handleInput"
      type="textarea"
      :rows="6"
      :placeholder="placeholder"
      :maxlength="maxLength"
      show-word-limit
      class="quiz-essay-input"
    />
    <!-- 提示文字 -->
    <p v-if="tip" class="mt-2 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
      {{ tip }}
    </p>
  </div>
</template>

<script setup>
// ==================== QuizEssay 逻辑 ====================

const props = defineProps({
  /** 当前值 */
  modelValue: { type: String, default: "" },
  /** 占位文字 */
  placeholder: { type: String, default: "请在此输入答案" },
  /** 最大长度 */
  maxLength: { type: Number, default: 500 },
  /** 提示文字 */
  tip: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

/**
 * 处理输入，限制最大长度
 */
function handleInput(val) {
  if (val && val.length > props.maxLength) {
    emit("update:modelValue", val.slice(0, props.maxLength));
  } else {
    emit("update:modelValue", val);
  }
}
</script>

<style scoped>
/* Element Plus textarea 全局样式覆盖：10px 圆角 */
.quiz-essay-input :deep(.el-textarea__inner) {
  border-radius: 10px;
}
</style>
