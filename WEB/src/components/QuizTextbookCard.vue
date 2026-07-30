<!--
============================================================================
文件名：QuizTextbookCard.vue（题库卡片组件）
文件作用：首页题库列表中每条题库的展示卡片 — 支持生成中进度条
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 题库卡片容器 -->
  <div class="rounded-[10px] border p-5 transition-all duration-500 hover:shadow-md cursor-pointer relative"
       :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }"
       @click="onCardClick">

    <!-- ===== 三点操作菜单按钮（左上角，参考 CourseCard 样式） ===== -->
    <div class="absolute top-3 left-3 z-[3]" @click.stop>
      <!-- 三点触发按钮 -->
      <button
        class="w-7 h-7 rounded-[6px] bg-white/90 dark:bg-gray-800/90
               border border-black/10 dark:border-white/10
               flex items-center justify-center
               text-gray-700 dark:text-gray-300
               hover:bg-white dark:hover:bg-gray-700
               hover:shadow-md hover:-translate-y-px
               transition-all duration-200"
        @click="showMenu = !showMenu"
        title="更多操作"
      >
        <!-- 三点图标 -->
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>

      <!-- 下拉操作菜单 -->
      <div
        v-if="showMenu"
        ref="menuRef"
        class="absolute left-0 top-full mt-1.5
               bg-white dark:bg-gray-800
               rounded-[10px] shadow-lg
               border border-gray-200 dark:border-gray-700
               min-w-[120px] py-1 z-20"
        @click.stop
      >
        <!-- 共享切换（仅自有题库） -->
        <button
          v-if="textbook.ownType !== 'borrowed'"
          class="w-full text-left px-3 py-2 text-sm
                 text-blue-500 dark:text-blue-400
                 hover:bg-blue-50 dark:hover:bg-blue-900/20
                 rounded-[6px] transition-colors duration-200
                 flex items-center gap-2"
          :disabled="sharing"
          @click="handleToggleShare"
        >
          <span v-if="sharing">处理中...</span>
          <span v-else>{{ textbook.isShared ? '取消共享' : '共享到市场' }}</span>
        </button>
        <!-- 删除选项 -->
        <button
          class="w-full text-left px-3 py-2 text-sm
                 text-red-500 dark:text-red-400
                 hover:bg-red-50 dark:hover:bg-red-900/20
                 rounded-[6px] transition-colors duration-200"
          @click="handleDelete"
        >
          删除题库
        </button>
      </div>
    </div>

    <!-- 状态标签（生成中时显示） -->
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-black dark:text-white font-bold text-[15px] line-clamp-2 transition-colors duration-500 flex-1 mr-2">
        {{ textbook.name }}
      </h3>
      <el-tag v-if="isGenerating" :type="statusTagType" size="small" class="shadow-md">
        {{ statusLabel }}
      </el-tag>
      <!-- 借用标签 -->
      <el-tag v-else-if="textbook.ownType === 'borrowed'" type="info" size="small" class="shadow-md">
        借用的
      </el-tag>
      <!-- 共享标签 -->
      <el-tag v-else-if="textbook.isShared" type="success" size="small" class="shadow-md">
        已共享
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
         class="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500 mb-1">
      <span>{{ textbook.totalQuestions || 0 }} 题</span>
      <span>{{ textbook.totalExams || 0 }} 张试卷</span>
      <!-- 借用者看到的创建者信息 -->
      <span v-if="textbook.ownType === 'borrowed' && textbook.creatorNickname" class="text-blue-400 dark:text-blue-500">
        @{{ textbook.creatorNickname }}
      </span>
    </div>

    <!-- 操作按钮 -->
    <div class="flex gap-2" @click.stop>
      <!-- 顺序刷题按钮（新增） -->
      <el-button
        type="success"
        size="small"
        class="flex-1"
        :disabled="isGenerating"
        @click="$emit('startSequential', textbook.id)">
        顺序刷题
      </el-button>
      <!-- 随机刷题按钮（原"开始刷题"改名） -->
      <el-button
        type="primary"
        size="small"
        class="flex-1"
        :disabled="isGenerating"
        @click="$emit('start', textbook.id)">
        随机刷题
      </el-button>
    </div>
  </div>
</template>

<script setup>
// ==================== QuizTextbookCard 逻辑 ====================
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { onClickOutside } from "@vueuse/core"; // 监听点击外部关闭菜单
import { toggleShareTextbook } from "../api/quiz"; // 共享切换 API

const TAG = "[QuizTextbookCard]";

const props = defineProps({
  /** 题库数据 { id, name, description, totalQuestions, totalExams, generatingTaskId, ownType, creatorNickname, isShared } */
  textbook: { type: Object, required: true },
  /** 任务进度数据 { status, isTerminal, progress: { phase, chunkProgress, importProgress, ... } } */
  taskProgress: { type: Object, default: null },
});

const emit = defineEmits(["open", "start", "startSequential", "delete", "shareToggled"]);

const deleting = ref(false);
const sharing = ref(false); // 共享切换 loading 状态

// ==================== 三点菜单状态 ====================
const showMenu = ref(false);
/** 菜单容器 DOM 引用（用于 onClickOutside 监听） */
const menuRef = ref(null);

// 点击菜单外部时关闭菜单
onClickOutside(menuRef, () => {
  showMenu.value = false;
});

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
  showMenu.value = false; // 关闭菜单
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

/**
 * 切换题库共享状态
 */
async function handleToggleShare() {
  showMenu.value = false; // 关闭菜单
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
