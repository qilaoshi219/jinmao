<!--
============================================================================
文件名：CourseCard.vue（教材卡片组件）
文件作用：在首页教材列表网格中展示单个教材的信息卡片
        显示教材名称、描述、状态标签、上传时间、章节数量、操作按钮
        遵守设计规范（纯黑纯白文字、10px圆角、500ms过渡、暗黑双轨适配）
============================================================================
-->

<template>
  <!-- 卡片容器：悬停上移 2px + 阴影加深 -->
  <div class="border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800
              rounded-[10px] overflow-hidden
              hover:-translate-y-0.5 hover:shadow-lg
              dark:hover:shadow-gray-900/50
              transition-all duration-500 cursor-pointer"
       @click="$emit('open', course.id)">

    <!-- ========== 封面占位区（渐变背景 + 教材首字） ========== -->
    <div class="h-32 bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-500
                dark:from-blue-600 dark:via-blue-700 dark:to-indigo-700
                flex items-center justify-center relative
                transition-colors duration-500">
      <!-- 教材名称首字符大字 -->
      <span class="text-white text-5xl font-bold opacity-80 select-none">
        {{ courseNameFirstChar }}
      </span>

      <!-- 处理状态标签（右上角悬浮） -->
      <el-tag
        :type="statusTagType"
        :class="statusTagClass"
        size="small"
        class="absolute top-3 right-3"
      >
        {{ statusLabel }}
      </el-tag>
    </div>

    <!-- ========== 卡片内容区 ========== -->
    <div class="p-4">
      <!-- 教材名称 -->
      <h3 class="text-black dark:text-white font-semibold text-base mb-1.5
                 line-clamp-1 transition-colors duration-500"
          :title="course.name">
        {{ course.name || '未命名教材' }}
      </h3>

      <!-- 教材描述（最多2行截断） -->
      <p v-if="course.description"
         class="text-gray-500 dark:text-gray-400 text-xs leading-relaxed mb-3
                line-clamp-2 transition-colors duration-500">
        {{ course.description }}
      </p>

      <!-- 元信息行：章节数 + 上传时间 -->
      <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400
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

      <!-- ========== 底部操作栏 ========== -->
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

        <!-- 删除按钮 -->
        <el-popconfirm
          title="确定要删除这个教材吗？"
          confirm-button-text="删除"
          cancel-button-text="取消"
          @confirm="$emit('delete', course.id)"
        >
          <template #reference>
            <el-button
              text
              size="small"
              class="text-red-500 dark:text-red-400
                     hover:text-red-600 dark:hover:text-red-300
                     transition-colors duration-500"
              @click.stop
            >
              删除
            </el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>
  </div>
</template>

<script setup>
// ==================== CourseCard 逻辑 ====================
// 职责：接收教材数据，格式化展示，向上冒泡操作事件

import { computed } from "vue";

// 日志前缀
const TAG = "[CourseCard]";

// ========== Props ==========
const props = defineProps({
  course: {
    type: Object, // 教材对象 { id, name, description, pipelineStatus, chapterCount, createTime, ... }
    required: true,
  },
});

// ========== Emits ==========
defineEmits(["open", "delete"]);

// ========== 计算属性 ==========

/** 教材名称首字符（用于封面占位大字） */
const courseNameFirstChar = computed(() => {
  const name = props.course?.name || "教";
  return name.charAt(0);
});

/** 处理状态标签文字 */
const statusLabel = computed(() => {
  const status = props.course?.pipelineStatus;
  switch (status) {
    case "completed":
      return "已完成";
    case "processing":
    case "pending":
    case "idle":
      return "处理中";
    case "failed":
    case "error":
      return "失败";
    default:
      return status || "未知";
  }
});

/** 处理状态标签 Element Plus type */
const statusTagType = computed(() => {
  const status = props.course?.pipelineStatus;
  switch (status) {
    case "completed":
      return "success"; // 绿色
    case "processing":
    case "pending":
    case "idle":
      return "primary"; // 蓝色（默认 primary = blue）
    case "failed":
    case "error":
      return "danger"; // 红色
    default:
      return "info"; // 灰色
  }
});

/** 处理中状态的额外样式（旋转动画） */
const statusTagClass = computed(() => {
  const status = props.course?.pipelineStatus;
  if (status === "processing") {
    return "processing-tag";
  }
  return "";
});

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
