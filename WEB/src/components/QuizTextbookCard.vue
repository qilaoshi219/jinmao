<!--
============================================================================
文件名：QuizTextbookCard.vue（题库卡片组件）
文件作用：首页题库列表中每条题库的展示卡片
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 题库卡片容器 -->
  <div class="rounded-[10px] border p-5 transition-all duration-500 hover:shadow-md cursor-pointer"
       :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }"
       @click="$emit('open', textbook.id)">

    <!-- 题库名称 -->
    <h3 class="text-black dark:text-white font-bold text-[15px] mb-2 transition-colors duration-500
               line-clamp-2">
      {{ textbook.name }}
    </h3>

    <!-- 描述 -->
    <p v-if="textbook.description"
       class="text-gray-400 dark:text-gray-500 text-xs mb-3 line-clamp-2
              transition-colors duration-500">
      {{ textbook.description }}
    </p>

    <!-- 统计信息 -->
    <div class="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500
                transition-colors duration-500 mb-4">
      <span>{{ textbook.totalQuestions || 0 }} 题</span>
      <span>{{ textbook.totalExams || 0 }} 张试卷</span>
    </div>

    <!-- 操作按钮 -->
    <div class="flex gap-2" @click.stop>
      <!-- 开始刷题按钮 -->
      <el-button
        type="primary"
        size="small"
        class="flex-1"
        @click="$emit('start', textbook.id)">
        开始刷题
      </el-button>

      <!-- 删除按钮 -->
      <el-button
        type="danger"
        size="small"
        :loading="deleting"
        @click="handleDelete">
        {{ deleting ? '删除中...' : '删除' }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
// ==================== QuizTextbookCard 逻辑 ====================
// 职责：展示题库卡片信息，emit 事件给父组件处理

import { ref } from "vue";
import { ElMessageBox } from "element-plus";

// 日志前缀
const TAG = "[QuizTextbookCard]";

const props = defineProps({
  /** 题库数据 { id, name, description, totalQuestions, totalExams } */
  textbook: { type: Object, required: true },
});

const emit = defineEmits(["open", "start", "delete"]);

// ========== 响应式状态 ==========
const deleting = ref(false);

// ========== 事件处理 ==========

/**
 * 删除确认
 */
async function handleDelete() {
  console.log(TAG + " 删除题库，id: " + props.textbook.id);

  try {
    await ElMessageBox.confirm(
      "确定要删除题库「" + props.textbook.name + "」吗？此操作不可撤销。",
      "确认删除",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    deleting.value = true;
    emit("delete", props.textbook.id);
  } catch (_) {
    // 用户取消
  }
}
</script>
