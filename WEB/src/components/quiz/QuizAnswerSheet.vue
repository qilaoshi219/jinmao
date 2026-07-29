<!--
============================================================================
文件名：QuizAnswerSheet.vue（答题卡组件）
文件作用：弹出式答题卡面板，显示题号网格、已答/未答状态、当前题高亮
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 答题卡面板 -->
  <div class="rounded-[10px] border p-4 transition-all duration-500"
       :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">

    <!-- 标题 -->
    <h3 class="text-sm font-bold text-black dark:text-white mb-3 transition-colors duration-500">
      答题卡
    </h3>

    <!-- 题号网格 -->
    <div class="grid grid-cols-5 gap-2">
      <button
        v-for="(status, idx) in questionStatuses"
        :key="idx"
        @click="$emit('jump', idx + 1)"
        :class="[
          'w-full aspect-square rounded-[10px] text-xs font-medium',
          'transition-all duration-500',
          idx + 1 === currentIndex
            ? 'bg-blue-500 text-white dark:bg-blue-400 dark:text-white ring-2 ring-blue-300 dark:ring-blue-500'
            : status === 'answered'
              ? 'bg-green-50 text-green-600 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
              : 'bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
        ]">
        {{ idx + 1 }}
      </button>
    </div>

    <!-- 图例 -->
    <div class="flex items-center gap-4 mt-3 pt-3 border-t text-xs transition-colors duration-500"
         :style="{ borderColor: 'var(--color-border)' }">
      <span class="flex items-center gap-1 text-black dark:text-white">
        <span class="w-3 h-3 rounded-[4px] bg-blue-500 dark:bg-blue-400 inline-block"></span>
        当前
      </span>
      <span class="flex items-center gap-1 text-black dark:text-white">
        <span class="w-3 h-3 rounded-[4px] bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 inline-block"></span>
        已答
      </span>
      <span class="flex items-center gap-1 text-black dark:text-white">
        <span class="w-3 h-3 rounded-[4px] bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 inline-block"></span>
        未答
      </span>
    </div>
  </div>
</template>

<script setup>
// ==================== QuizAnswerSheet 逻辑 ====================
// 职责：接收题目状态数组和当前题号，显示答题卡面板

defineProps({
  /** 题目状态数组：索引对应题号-1，值为 'answered' 或 null */
  questionStatuses: { type: Array, required: true },
  /** 当前题号 (1-based) */
  currentIndex: { type: Number, required: true },
});

defineEmits(["jump"]);
</script>
