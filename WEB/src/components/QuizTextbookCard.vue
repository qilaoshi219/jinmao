<!--
============================================================================
文件名：QuizTextbookCard.vue（题库卡片组件）
文件作用：首页题库列表中每条题库的展示卡片 — 支持生成中进度条
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、Element Plus优先
============================================================================
-->

<template>
  <!-- 题库卡片容器 -->
  <div class="rounded-[10px] border p-4 transition-all duration-500 hover:shadow-md cursor-pointer flex flex-col gap-3"
       :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }"
       @click="onCardClick">

    <!-- ===== 第一行：题库名称 + 标签 + 三点菜单 ===== -->
    <div class="flex items-start gap-2">
      <!-- 题库名称（flex-1 撑满剩余空间） -->
      <h3 class="text-black dark:text-white font-bold text-[15px] leading-snug line-clamp-2 transition-colors duration-500 flex-1 min-w-0"
          :title="textbook.name">
        {{ textbook.name }}
      </h3>

      <!-- 状态标签 -->
      <el-tag v-if="isGenerating" :type="statusTagType" size="small" class="flex-shrink-0">
        {{ statusLabel }}
      </el-tag>
      <el-tag v-else-if="textbook.ownType === 'borrowed'" type="info" size="small" class="flex-shrink-0">
        借用的
      </el-tag>
      <el-tag v-else-if="textbook.isShared" type="success" size="small" class="flex-shrink-0">
        已共享
      </el-tag>

      <!-- 三点操作菜单（el-dropdown，右上角），外层 div 阻止冒泡 -->
      <div class="flex-shrink-0" @click.stop>
        <el-dropdown trigger="click" @command="handleMenuCommand">
          <button class="w-7 h-7 rounded-[6px] bg-transparent
                         flex items-center justify-center
                         text-gray-400 dark:text-gray-500
                         hover:bg-gray-100 dark:hover:bg-gray-800
                         hover:text-gray-600 dark:hover:text-gray-300
                         transition-all duration-200"
                  title="更多操作">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <!-- 共享切换（仅自有题库） -->
              <el-dropdown-item
                v-if="textbook.ownType !== 'borrowed'"
                command="toggleShare"
                :disabled="sharing">
                {{ sharing ? '处理中...' : (textbook.isShared ? '取消共享' : '共享到市场') }}
              </el-dropdown-item>
              <!-- 删除 -->
              <el-dropdown-item command="delete" class="!text-red-500 dark:!text-red-400">
                删除题库
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- ===== 描述（可选） ===== -->
    <p v-if="textbook.description && !isGenerating"
       class="text-gray-400 dark:text-gray-500 text-xs line-clamp-2 transition-colors duration-500 -mt-1">
      {{ textbook.description }}
    </p>

    <!-- ===== 生成中进度条 ===== -->
    <div v-if="isGenerating && progressData" class="space-y-1.5">
      <div class="flex items-center gap-2">
        <span class="text-xs text-black dark:text-white transition-colors duration-500">
          {{ progressLabel }}
        </span>
        <span v-if="progressCountText" class="text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
          {{ progressCountText }}
        </span>
      </div>
      <div class="h-1.5 rounded-[10px] w-full overflow-hidden" :style="{ backgroundColor: 'var(--color-border)' }">
        <div class="h-full rounded-[10px] transition-all duration-[220ms]"
             :style="{ width: progressBarWidth, backgroundColor: '#409EFF' }">
        </div>
      </div>
    </div>

    <!-- 无详细进度时的脉动进度条 -->
    <div v-else-if="isGenerating" class="space-y-1.5">
      <span class="text-xs text-black dark:text-white transition-colors duration-500">
        {{ statusLabel }}
      </span>
      <div class="h-1.5 rounded-[10px] w-full overflow-hidden" :style="{ backgroundColor: 'var(--color-border)' }">
        <div class="h-full rounded-[10px] animate-pulse w-1/2" :style="{ backgroundColor: '#409EFF' }">
        </div>
      </div>
    </div>

    <!-- ===== 统计信息（非生成中时显示） ===== -->
    <div v-if="!isGenerating"
         class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
      <!-- 题数 -->
      <span class="flex items-center gap-1">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        {{ textbook.totalQuestions || 0 }} 题
      </span>
      <!-- 试卷数 -->
      <span class="flex items-center gap-1">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
        </svg>
        {{ textbook.totalExams || 0 }} 张试卷
      </span>
      <!-- 借用者看到的创建者信息 -->
      <span v-if="textbook.ownType === 'borrowed' && textbook.creatorNickname"
            class="text-blue-400 dark:text-blue-500 ml-auto truncate">
        @{{ textbook.creatorNickname }}
      </span>
    </div>

    <!-- ===== 操作按钮（非生成中时显示） ===== -->
    <div v-if="!isGenerating" class="flex gap-2" @click.stop>
      <el-button type="success" size="small" class="flex-1" @click="$emit('startSequential', textbook.id)">
        顺序刷题
      </el-button>
      <el-button type="primary" size="small" class="flex-1" @click="$emit('start', textbook.id)">
        随机刷题
      </el-button>
    </div>
  </div>
</template>

<script setup>
// ==================== QuizTextbookCard 逻辑 ====================
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { toggleShareTextbook } from "../api/quiz";

const TAG = "[QuizTextbookCard]";

const props = defineProps({
  /** 题库数据 { id, name, description, totalQuestions, totalExams, generatingTaskId, ownType, creatorNickname, isShared } */
  textbook: { type: Object, required: true },
  /** 任务进度数据 { status, isTerminal, progress: { phase, chunkProgress, importProgress, ... } } */
  taskProgress: { type: Object, default: null },
});

const emit = defineEmits(["open", "start", "startSequential", "delete", "shareToggled"]);

const deleting = ref(false);
const sharing = ref(false);

// ==================== 生成中状态 ====================
const isGenerating = computed(() => !!props.textbook.generatingTaskId);

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
  if (progressData.value.chunkProgress) {
    const c = progressData.value.chunkProgress;
    label += ` ${c.current}/${c.total} 块`;
  }
  return label;
});

const progressBarWidth = computed(() => {
  if (!progressData.value) return "50%";
  const phase = progressData.value.phase;
  if (phase === "completed") return "100%";
  if (progressData.value.chunkProgress) {
    const { current, total } = progressData.value.chunkProgress;
    return Math.round((current / total) * 90) + "%";
  }
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
    emit("open", props.textbook.id);
  }
}

/** el-dropdown 菜单命令分发 */
async function handleMenuCommand(command) {
  if (command === "toggleShare") {
    await handleToggleShare();
  } else if (command === "delete") {
    await handleDelete();
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

async function handleToggleShare() {
  sharing.value = true;
  try {
    const res = await toggleShareTextbook(props.textbook.id);
    if (res.code === 0) {
      emit("shareToggled", { id: props.textbook.id, isShared: res.data.isShared });
    } else {
      ElMessageBox.alert(res.message || "操作失败", "提示");
    }
  } catch (error) {
    console.error(TAG + " 共享切换失败:", error);
  } finally {
    sharing.value = false;
  }
}
</script>
