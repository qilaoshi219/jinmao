<!--
============================================================================
文件名：CourseCard.vue（教材卡片组件）
文件作用：在首页教材列表网格中展示单个教材的信息卡片
        参考老项目布局：16:9封面、遮罩层、状态进度条、三点操作菜单
        遵守设计规范（纯黑纯白文字、10px圆角、500ms过渡、暗黑双轨适配）
============================================================================
-->

<template>
  <!-- 卡片容器：悬停上移 2px + 阴影加深（参考老项目 .home-course-card） -->
  <div class="border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800
              rounded-[10px] overflow-hidden
              hover:-translate-y-0.5 hover:shadow-lg
              dark:hover:shadow-gray-900/50
              transition-all duration-500 cursor-pointer"
       @click="$emit('open', course.id)">

    <!-- ========== 封面区域：16:9 宽高比（参考老项目 aspect-ratio: 16/9） ========== -->
    <div class="aspect-[16/9] relative overflow-hidden transition-colors duration-500">
      <!-- 有封面时显示图片 -->
      <img
        v-if="coverUrl && !coverLoadFailed"
        :src="coverUrl"
        :alt="course.name || '课程封面'"
        class="absolute inset-0 w-full h-full object-cover"
        @error="onCoverError"
      />

      <!-- 无封面或加载失败时显示渐变占位 -->
      <div
        v-else
        class="absolute inset-0 w-full h-full
               bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-500
               dark:from-blue-600 dark:via-blue-700 dark:to-indigo-700
               flex items-center justify-center"
      >
        <span class="text-white text-7xl font-bold opacity-80 select-none">
          {{ courseNameFirstChar }}
        </span>
      </div>

      <!-- 封面光效叠加（参考老项目 .home-course-cover::after 径向渐变） -->
      <div v-if="!coverUrl || coverLoadFailed"
           class="absolute inset-0 pointer-events-none"
           style="background: radial-gradient(700px 220px at 30% 40%, rgba(255,255,255,0.55), transparent 55%),
                          radial-gradient(520px 240px at 70% 25%, rgba(255,255,255,0.35), transparent 55%)" />

      <!-- ===== 处理状态标签（右上角悬浮，参考老项目 .home-course-tag） ===== -->
      <el-tag
        :type="statusTagType"
        :class="statusTagClass"
        size="small"
        class="absolute top-3 right-3 shadow-md"
      >
        {{ statusLabel }}
      </el-tag>

      <!-- ===== 三点操作菜单按钮（左上角，参考老项目 .home-course-actions） ===== -->
      <div class="absolute top-2 left-2 z-[3]">
        <!-- 三点触发按钮 -->
        <button
          class="w-7 h-7 rounded-[6px] bg-white/90 dark:bg-gray-800/90
                 border border-black/10 dark:border-white/10
                 flex items-center justify-center
                 text-gray-700 dark:text-gray-300
                 hover:bg-white dark:hover:bg-gray-700
                 hover:shadow-md hover:-translate-y-px
                 transition-all duration-200"
          @click.stop="showMenu = !showMenu"
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
          <!-- 删除选项 -->
          <button
            class="w-full text-left px-3 py-2 text-sm
                   text-red-500 dark:text-red-400
                   hover:bg-red-50 dark:hover:bg-red-900/20
                   rounded-[6px] transition-colors duration-200"
            @click="handleDelete"
          >
            删除教材
          </button>
        </div>
      </div>

      <!-- ===== 处理中遮罩层（参考老项目 .home-course-cover-overlay） ===== -->
      <div
        v-if="isProcessing"
        class="absolute left-3 right-3 bottom-3 z-[2]
               p-2.5 px-3 rounded-[10px]
               bg-white/90 dark:bg-gray-800/90
               border border-gray-200/50 dark:border-gray-700/50
               shadow-md backdrop-blur-[10px]"
      >
        <p class="text-xs font-bold text-black dark:text-white
                  line-clamp-1 transition-colors duration-500"
           :title="course.name">
          {{ course.name || '未命名教材' }}
        </p>
        <p class="text-[11px] text-gray-600 dark:text-gray-300 mt-1
                  transition-colors duration-500">
          {{ progressLabel || (statusLabel + '...') }}
        </p>
      </div>
    </div>

    <!-- ========== 卡片内容区 ========== -->
    <div class="p-4">
      <!-- 教材名称 -->
      <h3 class="text-black dark:text-white font-bold text-[15px] mb-1.5
                 line-clamp-1 transition-colors duration-500"
          :title="course.name">
        {{ course.name || '未命名教材' }}
      </h3>

      <!-- 副标题 / 元信息区（参考老项目 .home-course-meta） -->
      <div v-if="course.subtitle || course.chapterCount > 0"
           class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400
                  min-h-[18px] mb-1.5 transition-colors duration-500">
        <span v-if="course.subtitle" class="line-clamp-1" :title="course.subtitle">
          {{ course.subtitle }}
        </span>
        <span v-if="course.subtitle && course.chapterCount > 0"
              class="w-[3px] h-[3px] rounded-full bg-gray-400 dark:bg-gray-600 flex-shrink-0" />
        <span v-if="course.chapterCount > 0" class="flex-shrink-0">
          {{ course.chapterCount }} 章节
        </span>
      </div>

      <!-- 教材描述（最多2行截断） -->
      <p v-if="course.description"
         class="text-gray-500 dark:text-gray-400 text-xs leading-relaxed mb-3
                line-clamp-2 transition-colors duration-500">
        {{ course.description }}
      </p>

      <!-- ===== 处理中状态进度区域 ===== -->
      <div
        v-if="isProcessing && progressData"
        class="mt-2 mb-3 p-2.5 px-3 rounded-[10px]
               bg-blue-50/60 dark:bg-blue-900/10
               border border-blue-200/40 dark:border-blue-800/30
               transition-colors duration-500"
      >
        <!-- 阶段描述文字 -->
        <p class="text-xs text-gray-600 dark:text-gray-300 mb-1.5
                  transition-colors duration-500">
          {{ progressLabel }}
        </p>

        <!-- 进度条（大纲阶段显示百分比，扩写和文件生成阶段显示等比例） -->
        <div class="mt-1.5 h-1.5 rounded-full bg-white/85 dark:bg-gray-700/50
                    overflow-hidden transition-colors duration-500">
          <div
            class="h-full rounded-full bg-blue-500 dark:bg-blue-400
                   transition-[width] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            :style="{ width: progressBarWidth }"
          />
        </div>

        <!-- 百分比 / 计数文字 -->
        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1 text-right
                  transition-colors duration-500">
          {{ progressCountText }}
        </p>
      </div>

      <!-- 处理中但没有详细进度数据时，显示旧版进度条 -->
      <div
        v-else-if="isProcessing"
        class="mt-2 mb-3 p-2.5 px-3 rounded-[10px]
               bg-blue-50/60 dark:bg-blue-900/10
               border border-blue-200/40 dark:border-blue-800/30
               transition-colors duration-500"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-gray-600 dark:text-gray-300
                       overflow-hidden text-ellipsis whitespace-nowrap
                       transition-colors duration-500">
            {{ statusLabel }}
          </span>
        </div>
        <div class="mt-2 h-1.5 rounded-full bg-white/85 dark:bg-gray-700/50
                    overflow-hidden transition-colors duration-500">
          <div class="h-full rounded-full bg-blue-500 dark:bg-blue-400
                   animate-pulse w-1/2" />
        </div>
      </div>

      <!-- 元信息行：上传时间 -->
      <div v-if="!isProcessing"
           class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400
                   transition-colors duration-500">
        <!-- 章节数量 -->
        <span v-if="course.chapterCount > 0">
          {{ course.chapterCount }} 个章节
        </span>
        <span v-else class="text-gray-400 dark:text-gray-600">
          暂无章节
        </span>

        <!-- 上传时间 -->
        <span>{{ formattedDate }}</span>
      </div>

      <!-- ========== 底部操作栏（参考老项目 .home-course-action） ========== -->
      <div class="flex items-center justify-between mt-3 pt-3
                  border-t border-gray-100 dark:border-gray-700
                  transition-colors duration-500">
        <!-- 查看详情按钮 -->
        <el-button
          text
          size="small"
          type="primary"
          @click.stop="$emit('open', course.id)"
        >
          查看详情
        </el-button>

        <!-- 状态快捷操作按钮 -->
        <span class="text-xs text-gray-400 dark:text-gray-600
                     transition-colors duration-500">
          {{ formattedDate }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
// ==================== CourseCard 逻辑 ====================
// 职责：接收教材数据，格式化展示，向上冒泡操作事件（参考老项目 HomePage.vue）

import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { onClickOutside } from "@vueuse/core"; // 监听点击外部关闭菜单

// 日志前缀
const TAG = "[CourseCard]";

// ========== Props ==========
const props = defineProps({
  course: {
    type: Object, // 教材对象 { id, name, description, coverUrl, pipelineStatus, chapterCount, createTime, ... }
    required: true,
  },
  /** 进度详情对象（由父组件通过 getCourseProgress API 轮询获取后传入） */
  progress: {
    type: Object,
    default: null, // { progress: { phase, outlineProgress, elaborationProgress, filesProgress }, isTerminal, ... }
  },
});

// ========== Emits ==========
const emit = defineEmits(["open", "delete"]);

// ========== 响应式状态 ==========

/** 封面加载失败标识（用于降级显示渐变占位） */
const coverLoadFailed = ref(false);

/** 三点操作菜单是否展开 */
const showMenu = ref(false);

/** 菜单容器 DOM 引用（用于 onClickOutside 监听） */
const menuRef = ref(null);

// 点击菜单外部区域时自动关闭菜单
onClickOutside(menuRef, () => {
  showMenu.value = false;
});

// ========== 计算属性 ==========

/** 教材名称首字符（用于封面占位大字） */
const courseNameFirstChar = computed(() => {
  const name = props.course?.name || "教";
  return name.charAt(0);
});

/** 封面图片 URL（直接使用后端返回的 coverUrl 字段） */
const coverUrl = computed(() => {
  return props.course?.coverUrl || null;
});

/**
 * 终端状态白名单
 * 凡不在此列表内的 pipelineStatus 值均视为"处理中"，需显示进度和轮询
 * 后端新增中间状态时前端自动适配，无需手动同步
 */
const TERMINAL_STATUSES = ["completed", "partial_completed", "failed", "error"];

/** 是否为处理中状态（需要显示遮罩层和进度条） */
const isProcessing = computed(() => {
  const status = props.course?.pipelineStatus;
  // 有状态值且不在终端白名单中 = 处理中
  return status && !TERMINAL_STATUSES.includes(status);
});

/** 处理状态标签文字（完整映射后端 pipeline 全部 21 种状态值） */
const statusLabel = computed(() => {
  const status = props.course?.pipelineStatus;
  switch (status) {
    // ── 终端状态 ──
    case "completed":           return "已完成";
    case "partial_completed":   return "已完成";
    case "failed":
    case "error":               return "失败";
    // ── 初始状态 ──
    case "uploading":           return "上传中";
    case "pending":             return "排队中";
    case "idle":                return "等待处理";
    // ── 阶段一：数据获取 ──
    case "downloading":         return "下载教材中";
    // ── 阶段二：文本提取与行号识别 ──
    case "extracting":          return "提取文本中";
    case "1000_extracted":      return "文本提取完成";
    case "1000_indexing":       return "行号索引中";
    case "1000_indexed":        return "行号索引完成";
    case "getting_line":        return "识别章节中";
    case "get_line_done":       return "章节识别完成";
    // ── 阶段三：课程大纲生成 ──
    case "course_generating":   return "生成课程大纲";
    case "elaborating":         return "扩写口播稿中";
    case "course_generated":    return "大纲生成完成";
    // ── 阶段四：PPT 生成 ──
    case "ppt_generating":      return "生成PPT中";
    case "ppt_generated":       return "PPT生成完成";
    // ── 阶段五：TTS 语音合成 ──
    case "tts_generating":      return "生成语音中";
    case "tts_generated":       return "语音生成完成";
    // ── 阶段六：数据校验 ──
    case "data_validating":     return "数据校验中";
    // ── 未知状态兜底 ──
    default:
      return status || "未知";
  }
});

/** 处理状态标签 Element Plus type（颜色） */
const statusTagType = computed(() => {
  const status = props.course?.pipelineStatus;
  switch (status) {
    case "completed":
      return "success"; // 绿色
    case "partial_completed":
      return "success"; // 绿色（与 completed 一致，教材已生成完毕）
    case "failed":
    case "error":
      return "danger"; // 红色
    default:
      // 所有中间状态显示蓝色（处理中）
      return "primary";
  }
});

/** 处理中状态的额外样式（呼吸动画） */
const statusTagClass = computed(() => {
  const status = props.course?.pipelineStatus;
  if (status === "processing") {
    return "processing-tag";
  }
  return "";
});

/** 流水线进度百分比文字（如 "45%"） */
const pipelineProgressText = computed(() => {
  const pct = props.course?.pipelineProgress;
  if (typeof pct === "number") {
    return pct + "%";
  }
  return "";
});

/** 流水线进度条宽度 */
const pipelineProgressWidth = computed(() => {
  const pct = props.course?.pipelineProgress;
  if (typeof pct === "number") {
    return Math.min(100, Math.max(0, pct)) + "%";
  }
  return "0%";
});

// ========== 进度详情计算属性（基于 progress prop） ==========

/** 进度详情对象（从 progress prop 提取，避免深层 undefined 访问） */
const progressData = computed(() => {
  return props.progress?.progress || null;
});

/** 进度阶段文字描述 */
const progressLabel = computed(() => {
  const phase = progressData.value?.phase;
  const elaborationProgress = progressData.value?.elaborationProgress || {};
  const filesProgress = progressData.value?.filesProgress || {};

  switch (phase) {
    case "preparing":
      return "正在准备中...";
    case "outline_generating":
      return "正在生成大纲";
    case "elaborating":
      return "正在扩写口播稿，正在进行 " +
        elaborationProgress.current + "/" + elaborationProgress.total;
    case "generating_files":
      return "正在生成课件，已完成 " +
        filesProgress.current + "/" + filesProgress.total;
    case "validating":
      return "正在检查课程完整性";
    default:
      return "";
  }
});

/** 进度条宽度 */
const progressBarWidth = computed(() => {
  const phase = progressData.value?.phase;
  if (!phase) return "0%";

  switch (phase) {
    case "outline_generating": {
      const pct = progressData.value?.outlineProgress?.percentage || 0;
      return Math.min(100, Math.max(0, pct)) + "%";
    }
    case "elaborating": {
      const prog = progressData.value?.elaborationProgress || {};
      if (prog.total > 0) {
        return Math.round((prog.current / prog.total) * 100) + "%";
      }
      return "0%";
    }
    case "generating_files": {
      const prog = progressData.value?.filesProgress || {};
      if (prog.total > 0) {
        return Math.round((prog.current / prog.total) * 100) + "%";
      }
      return "0%";
    }
    case "validating":
      return "80%"; // 校验阶段不确定进度，显示 80%
    default:
      return "0%";
  }
});

/** 进度计数文字（百分比或 X/Y 格式） */
const progressCountText = computed(() => {
  const phase = progressData.value?.phase;
  if (!phase) return "";

  switch (phase) {
    case "outline_generating": {
      const pct = progressData.value?.outlineProgress?.percentage || 0;
      return pct + "%";
    }
    case "elaborating": {
      const prog = progressData.value?.elaborationProgress || {};
      return prog.current + "/" + prog.total;
    }
    case "generating_files": {
      const prog = progressData.value?.filesProgress || {};
      return prog.current + "/" + prog.total;
    }
    case "validating":
      return "";
    default:
      return "";
  }
});

// ========== 方法 ==========

/** 封面加载失败时的处理（隐藏图片，显示渐变占位） */
function onCoverError() {
  console.warn(TAG + " 封面图片加载失败: " + coverUrl.value);
  coverLoadFailed.value = true;
}

/** 通过三点菜单删除教材（带确认弹窗） */
async function handleDelete() {
  showMenu.value = false; // 关闭菜单

  try {
    await ElMessageBox.confirm(
      "确定要删除这个教材吗？",
      "删除确认",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    emit("delete", props.course.id);
  } catch {
    // 用户取消删除，不做任何操作
  }
}

/** 格式化日期 */
const formattedDate = computed(() => {
  const time = props.course?.createTime;
  if (!time) return "";

  try {
    const date = new Date(time);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return month + "/" + day;
  } catch {
    return "";
  }
});
</script>

<style scoped>
/* 处理中状态标签呼吸动画 */
.processing-tag {
  animation: pulse-tag 2s ease-in-out infinite;
}

@keyframes pulse-tag {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>
