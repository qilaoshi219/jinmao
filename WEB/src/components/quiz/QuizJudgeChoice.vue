<!--
============================================================================
文件名：QuizJudgeChoice.vue（判断题组件）
文件作用：判断题的正确/错误二选一按钮
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 判断题双按钮 -->
  <div class="flex gap-3">
    <button
      type="button"
      @click="$emit('update:selected', '正确')"
      :class="[
        'flex-1 px-4 py-3 rounded-[10px] border text-sm font-medium',
        'transition-all duration-500',
        selected === '正确'
          ? 'bg-green-50 border-green-400 text-green-600 dark:bg-green-900/30 dark:border-green-500 dark:text-green-400'
          : 'bg-white text-black hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700/50 border-gray-200 dark:border-gray-600'
      ]">
      正确
    </button>
    <button
      type="button"
      @click="$emit('update:selected', '错误')"
      :class="[
        'flex-1 px-4 py-3 rounded-[10px] border text-sm font-medium',
        'transition-all duration-500',
        selected === '错误'
          ? 'bg-red-50 border-red-400 text-red-600 dark:bg-red-900/30 dark:border-red-500 dark:text-red-400'
          : 'bg-white text-black hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700/50 border-gray-200 dark:border-gray-600'
      ]">
      错误
    </button>
  </div>
</template>

<script setup>
// ==================== QuizJudgeChoice 逻辑 ====================
defineProps({
  /** 当前选中值 */
  selected: { type: String, default: null },
});

defineEmits(["update:selected"]);
</script>
