<!--
============================================================================
文件名：QuizChoiceList.vue（选项列表组件）
文件作用：单选/多选题的选项列表，支持点击选中/取消
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 选项列表 -->
  <div class="flex flex-col gap-2.5">
    <button
      v-for="opt in options"
      :key="opt.key"
      type="button"
      @click="toggleOption(opt.key)"
      :class="[
        'w-full text-left px-4 py-3 rounded-[10px] border text-sm leading-relaxed',
        'transition-all duration-500',
        isSelected(opt.key)
          ? 'bg-blue-50 border-blue-400 text-blue-600 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-400'
          : 'bg-white text-black hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700/50',
        'border-gray-200 dark:border-gray-600'
      ]">
      <span class="font-semibold mr-2">{{ opt.key }}.</span>
      <span>{{ opt.text }}</span>
    </button>
  </div>
</template>

<script setup>
// ==================== QuizChoiceList 逻辑 ====================
// 职责：管理选项选中状态，单选/多选两种模式

const props = defineProps({
  /** 选项数组 [{key, text}] */
  options: { type: Array, required: true },
  /** 当前选中值：单选为字符串，多选为数组 */
  selected: { type: [String, Array], default: null },
  /** 是否为多选模式 */
  multiple: { type: Boolean, default: false },
});

const emit = defineEmits(["update:selected"]);

/**
 * 判断某个选项是否被选中
 */
function isSelected(key) {
  if (props.multiple) {
    return Array.isArray(props.selected) && props.selected.includes(key);
  }
  return props.selected === key;
}

/**
 * 切换选项选中状态
 */
function toggleOption(key) {
  if (props.multiple) {
    // 多选模式：追加/移除
    const current = Array.isArray(props.selected) ? [...props.selected] : [];
    const idx = current.indexOf(key);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(key);
    }
    emit("update:selected", current);
  } else {
    // 单选模式：直接替换
    emit("update:selected", props.selected === key ? "" : key);
  }
}
</script>
