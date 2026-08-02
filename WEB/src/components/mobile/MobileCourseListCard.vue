<!--
============================================================================
文件名：MobileCourseListCard.vue（手机端课程列表卡片组件）
文件作用：手机端首页"我的课程"区域每条课程的展示卡片
        展示：封面占位、教材名、章节名、页码进度、进度条、操作按钮
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、Element Plus优先
============================================================================
-->

<template>
  <!-- 课程卡片容器：整卡 10px 圆角，边框跟随主题 -->
  <div class="flex gap-3 rounded-[10px] border
              bg-white dark:bg-neutral-950
              border-gray-200 dark:border-neutral-700
              p-3 transition-all duration-500
              active:bg-gray-50 dark:active:bg-neutral-900
              cursor-pointer select-none"
       @click="handleCardClick">

    <!-- ===== 左侧：封面区域（封面图 / 首字母占位） ===== -->
    <div class="w-[72px] h-[72px] rounded-[10px] flex-shrink-0
                bg-blue-50 dark:bg-blue-900/20
                border border-blue-200/40 dark:border-blue-800/30
                flex items-center justify-center
                overflow-hidden
                transition-colors duration-500
                relative">
      <!-- 有封面且未加载失败时显示封面图 -->
      <img
        v-if="coverUrl && !coverLoadFailed"
        :src="coverUrl"
        :alt="course.name || '课程封面'"
        class="absolute inset-0 w-full h-full object-cover rounded-[10px]"
        @error="onCoverError"
      />
      <!-- 无封面或加载失败时显示首字母占位 -->
      <span
        v-else
        class="text-2xl font-black text-blue-500 dark:text-blue-400
               transition-colors duration-500 select-none">
        {{ courseInitial }}
      </span>
    </div>

    <!-- ===== 右侧：信息堆叠区 ===== -->
    <div class="flex-1 min-w-0 flex flex-col justify-between">

      <!-- 第一行：教材名 + 状态标签 -->
      <div class="flex items-start gap-2">
        <h3 class="flex-1 min-w-0 text-[14px] font-bold
                   text-black dark:text-white
                   line-clamp-1 leading-snug
                   transition-colors duration-500"
            :title="course.name">
          {{ course.name || "未命名教材" }}
        </h3>

        <!-- 课程状态标签 -->
        <el-tag
          v-if="statusLabel"
          :type="statusTagType"
          size="small"
          class="flex-shrink-0">
          {{ statusLabel }}
        </el-tag>
      </div>

      <!-- 第二行：章节名（有进度时显示） -->
      <p v-if="progressData && progressData.chapterName"
         class="text-[12px] text-gray-500 dark:text-gray-400
                line-clamp-1 mt-0.5
                transition-colors duration-500">
        {{ progressData.chapterName }}
      </p>

      <!-- 进度条区域 -->
      <div v-if="isTerminal && progressPercent > 0" class="flex items-center gap-2 mt-1.5">
        <!-- 进度条 -->
        <div class="flex-1 h-1.5 rounded-[10px] overflow-hidden
                    bg-gray-200 dark:bg-neutral-700
                    transition-colors duration-500">
          <div class="h-full rounded-[10px] transition-all duration-500"
               :style="{ width: progressPercent + '%', backgroundColor: '#409EFF' }">
          </div>
        </div>
        <!-- 百分比文字 -->
        <span class="text-[11px] font-bold text-blue-500 dark:text-blue-400
                     flex-shrink-0">
          {{ progressPercent }}%
        </span>
      </div>

      <!-- 页码进度文字（有进度时显示） -->
      <p v-if="isTerminal && progressData && progressData.progress"
         class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5
                transition-colors duration-500">
        上次学到：第 {{ progressData.progress }} / {{ progressData.totalPages || "--" }} 页
      </p>

      <!-- 底部操作按钮 -->
      <div class="flex items-center justify-between mt-1.5">
        <el-button
          :type="buttonType"
          :disabled="!isClickable"
          size="small"
          class="!text-[12px] !px-3 !py-1 !h-auto"
          @click.stop="handleButtonClick">
          {{ buttonLabel }}
        </el-button>

        <!-- 章节数统计 -->
        <span v-if="course.chapterCount > 0"
              class="text-[11px] text-gray-400 dark:text-gray-500
                     transition-colors duration-500">
          {{ course.chapterCount }} 章节
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
// ==================== MobileCourseListCard 逻辑 ====================
// 职责：接收教材 + 进度数据，格式化展示，向父组件派发操作事件

import { ref, computed } from "vue";

// 日志前缀
const TAG = "[MobileCourseListCard]";

// ==================== Props ====================
const props = defineProps({
  /** 教材数据 { id, name, coverUrl, pipelineStatus, chapterCount, ... } */
  course: { type: Object, required: true },
  /** 学习进度数据 { courseId, chapterName, progress, totalPages, updateTime }，无记录时为 null */
  progressData: { type: Object, default: null },
});

// ==================== Emits ====================
const emit = defineEmits(["open"]);

// ==================== 封面图加载状态 ====================
/** 封面图是否加载失败（失败后回退首字母占位） */
const coverLoadFailed = ref(false);

/** 封面图片 URL（直接使用后端返回的 coverUrl 字段） */
const coverUrl = computed(() => {
  return props.course?.coverUrl || null;
});

/** 封面图加载失败回调 */
function onCoverError() {
  console.warn(TAG + " 封面图片加载失败: " + coverUrl.value);
  coverLoadFailed.value = true;
}

// ==================== 终端状态白名单 ====================
// 只有这些状态的教材才允许进入学习页
const TERMINAL = ["completed", "partial_completed", "failed", "error"];

// ==================== 计算属性 ====================

/** 教材封面首字母（从名称提取） */
const courseInitial = computed(() => {
  const name = props.course?.name || "教";
  return name.charAt(0).toUpperCase();
});

/** 是否为终端状态（可点击进入学习页） */
const isTerminal = computed(() => {
  return TERMINAL.includes(props.course?.pipelineStatus);
});

/** 是否可点击进入 */
const isClickable = computed(() => {
  return isTerminal.value;
});

/** 课程状态标签文字 */
const statusLabel = computed(() => {
  const status = props.course?.pipelineStatus;
  const MAP = {
    completed: "已完成",
    partial_completed: "部分完成",
    failed: "生成失败",
    error: "出错",
  };
  if (MAP[status]) return MAP[status];

  // 非终态视为处理中
  if (status) return "生成中";
  return "";
});

/** 状态标签 Element Plus type */
const statusTagType = computed(() => {
  const status = props.course?.pipelineStatus;
  if (status === "completed") return "success";
  if (status === "partial_completed") return "warning";
  if (status === "failed" || status === "error") return "danger";
  return "primary"; // 处理中为蓝色
});

/** 学习进度百分比（取整） */
const progressPercent = computed(() => {
  const pd = props.progressData;
  if (!pd || !pd.totalPages || pd.totalPages <= 0) return 0;
  return Math.round((pd.progress / pd.totalPages) * 100);
});

/** 按钮文案：根据是否有进度和是否可进入决定 */
const buttonLabel = computed(() => {
  if (!isTerminal.value) return "生成中";
  if (props.progressData && props.progressData.progress > 0) return "继续学习";
  return "开始学习";
});

/** 按钮类型：有进度用 primary，无进度用 success */
const buttonType = computed(() => {
  if (!isTerminal.value) return "info";
  if (props.progressData && props.progressData.progress > 0) return "primary";
  return "success";
});

// ==================== 事件处理 ====================

/** 整卡点击（与按钮行为相同） */
function handleCardClick() {
  if (isClickable.value) {
    console.log(TAG + " 卡片点击，courseId: " + props.course.id);
    emit("open", props.course.id);
  }
}

/** 按钮点击 */
function handleButtonClick() {
  if (isClickable.value) {
    console.log(TAG + " 按钮点击，courseId: " + props.course.id);
    emit("open", props.course.id);
  }
}

console.log(TAG + " 课程卡片组件已创建，courseId: " + props.course.id);
</script>
