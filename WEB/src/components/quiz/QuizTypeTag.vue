<!--
============================================================================
文件名：QuizTypeTag.vue（题型标签组件）
文件作用：显示题目类型的彩色标签（单选/多选/判断/填空/简答）
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 题型标签：根据 type 属性显示不同的颜色和文字 -->
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-[10px] text-[11px] font-medium
           transition-colors duration-500 select-none"
    :class="tagClass">
    {{ label }}
  </span>
</template>

<script setup>
// ==================== QuizTypeTag 逻辑 ====================
// 职责：接收 type 属性，映射为对应颜色和中文标签

import { computed } from "vue";

// ========== Props ==========
const props = defineProps({
  /** 题型标识：single / multiple / judge / fill / essay */
  type: {
    type: String,
    required: true,
    validator: (v) => ["single", "multiple", "judge", "fill", "essay"].includes(v),
  },
});

// ========== 题型配置映射 ==========
const configMap = {
  single: { label: "单选", light: "bg-blue-50 text-blue-600 border-blue-200", dark: "dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" },
  multiple: { label: "多选", light: "bg-purple-50 text-purple-600 border-purple-200", dark: "dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800" },
  judge: { label: "判断", light: "bg-amber-50 text-amber-600 border-amber-200", dark: "dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" },
  fill: { label: "填空", light: "bg-green-50 text-green-600 border-green-200", dark: "dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" },
  essay: { label: "简答", light: "bg-pink-50 text-pink-600 border-pink-200", dark: "dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800" },
};

// ========== 计算属性 ==========
const label = computed(() => configMap[props.type]?.label || "未知");

const tagClass = computed(() => {
  const cfg = configMap[props.type] || configMap.single;
  return `border ${cfg.light} ${cfg.dark}`;
});
</script>
