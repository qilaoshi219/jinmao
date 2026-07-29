<!--
============================================================================
文件名：QuizTextbookCard.vue（题库卡片组件）
文件作用：首页题库列表中每条题库的展示卡片 — 支持生成中进度条
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 题库卡片容器 -->
  <div class="rounded-[10px] border p-5 transition-all duration-500 hover:shadow-md cursor-pointer"
       :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }"
       @click="onCardClick">

    <!-- 状态标签（生成中时显示） -->
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-black dark:text-white font-bold text-[15px] line-clamp-2 transition-colors duration-500 flex-1 mr-2">
        {{ textbook.name }}
      </h3>
      <el-tag v-if="isGenerating" :type="statusTagType" size="small" class="shadow-md">
        {{ statusLabel }}
      </el-tag>
    </div>

    <!-- 描述 -->
    <p v-if="textbook.description && !isGenerating"
       class="text-gray-400 dark:text-gray-500 text-xs mb-3 line-clamp-2 transition-colors duration-500">
      {{ textbook.description }}
    </p>

    <!-- 生成中进度条 -->
    <div v-if="isGenerating && progressData" class="mb-3 space-y-1.5">
      <!-- 阶段描述 -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-black dark:text-white transition-colors duration-500">
          {{ progressLabel }}
        </span>
        <span v-if="progressCountText" class="text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
          {{ progressCountText }}
        </span>
      </div>
      <!-- 进度条 -->
      <div class="h-1.5 rounded-[10px] w-full overflow-hidden" :style="{ backgroundColor: 'var(--color-border)' }">
        <div class="h-full rounded-[10px] transition-all duration-[220ms]"
             :style="{ width: progressBarWidth, backgroundColor: '#409EFF' }">
        </div>
      </div>
    </div>

    <!-- 无详细进度时的脉动进度条 -->
    <div v-else-if="isGenerating" class="mb-3 space-y-1.5">
      <span class="text-xs text-black dark:text-white transition-colors duration-500">
        {{ statusLabel }}
      </span>
      <div class="h-1.5 rounded-[10px] w-full overflow-hidden" :style="{ backgroundColor: 'var(--color-border)' }">
        <div class="h-full rounded-[10px] animate-pulse w-1/2" :style="{ backgroundColor: '#409EFF' }">
        </div>
      </div>
    </div>

    <!-- 统计信息（非生成中时显示） -->
    <div v-if="!isGenerating"
         class="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500 mb-4">
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
        :disabled="isGenerating"
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
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";

const TAG = "[QuizTextbookCard]";

const props = defineProps({
  /** 题库数据 { id, name, description, totalQuestions, totalExams, generatingTaskId } */
  textbook: { type: Object, required: true },
  /** 任务进度数据 { status, isTerminal, progress: { phase, chunkProgress, importProgress, ... } } */
  taskProgress: { type: Object, default: null },
});

const emit = defineEmits(["open", "start", "delete"]);

const deleting = ref(false);

// ==================== 生成中状态 ====================
const isGenerating = computed(() => {
  return !!props.textbook.generatingTaskId;
});

// ==================== 状态标签 ====================
const STATUS_MAP = {
  pending: { label: "排队中", type: "primary" },
  running: { label: "AI 生成中", type: "primary" },
  completed: { label: "已完成", type: "success" },
  failed: { label: "失败", type: "danger" },
};

const statusLabel = computed(() => {
  if (!props.taskProgress) return "等待中";
  return STATUS_MAP[props.taskProgress.status]?.label || "处理中";
});

const statusTagType = computed(() => {
  if (!props.taskProgress) return "primary";
  return STATUS_MAP[props.taskProgress.status]?.type || "primary";
});

// ==================== 进度数据 ====================
const progressData = computed(() => {
  if (!props.taskProgress || !props.taskProgress.progress) return null;
  return props.taskProgress.progress;
});

const progressLabel = computed(() => {
  if (!progressData.value) return "";
  const phase = progressData.value.phase;

  const LABELS = {
    pending: "排队中...",
    loading_prompt: "加载提示词中...",
    processing_chunks: "正在生成题目",
    calling_model: "AI 正在生成中...",
    retrying_chunk: "重新生成中...",
    validating_result: "校验结果中...",
    importing_questions: "正在入库",
    completed: "已完成",
    failed: "失败",
  };

  let label = LABELS[phase] || "处理中...";

  // 附加分块进度
  if (progressData.value.chunkProgress) {
    const c = progressData.value.chunkProgress;
    label += ` ${c.current}/${c.total} 块`;
  }

  return label;
});

const progressBarWidth = computed(() => {
  if (!progressData.value) return "50%";
  const phase = progressData.value.phase;

  // 终端状态
  if (phase === "completed") return "100%";

  // 分块进度
  if (progressData.value.chunkProgress) {
    const { current, total } = progressData.value.chunkProgress;
    return Math.round((current / total) * 90) + "%"; // 最多 90%，留 10% 给导入
  }

  // 导入进度
  if (progressData.value.importProgress) {
    const { current, total } = progressData.value.importProgress;
    return Math.round(90 + (current / total) * 10) + "%";
  }

  return "10%";
});

const progressCountText = computed(() => {
  if (!progressData.value) return "";

  if (progressData.value.chunkProgress) {
    const { current, total } = progressData.value.chunkProgress;
    return `${current}/${total}`;
  }

  if (progressData.value.importProgress) {
    const { current, total } = progressData.value.importProgress;
    return `${current}/${total}`;
  }

  return "";
});

// ==================== 事件处理 ====================
function onCardClick() {
  if (!isGenerating.value) {
    // 非生成中时可点击进入查看详情
    emit("open", props.textbook.id);
  }
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      "确定要删除题库「" + props.textbook.name + "」吗？此操作不可撤销。",
      "确认删除",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }
    );
    deleting.value = true;
    emit("delete", props.textbook.id);
  } catch (_) {
    // 用户取消
  }
}
</script>
