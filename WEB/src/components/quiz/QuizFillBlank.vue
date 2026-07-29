<!--
============================================================================
文件名：QuizFillBlank.vue（填空题组件）
文件作用：填空题的 el-input 输入框
遵守设计规范：10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div>
    <!-- 填空输入框 -->
    <el-input
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
      :placeholder="placeholder"
      class="quiz-fill-input"
    />
    <!-- 提示文字 -->
    <p v-if="tip" class="mt-2 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
      {{ tip }}
    </p>
  </div>
</template>

<script setup>
// ==================== QuizFillBlank 逻辑 ====================
defineProps({
  /** 当前值 */
  modelValue: { type: String, default: "" },
  /** 占位文字 */
  placeholder: { type: String, default: "请输入答案..." },
  /** 提示文字 */
  tip: { type: String, default: "" },
});

defineEmits(["update:modelValue"]);
</script>

<style scoped>
/* Element Plus el-input 全局样式覆盖：10px 圆角 */
.quiz-fill-input :deep(.el-input__wrapper) {
  border-radius: 10px;
}
</style>
