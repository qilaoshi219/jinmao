<!--
============================================================================
文件名：CourseFilesDialog.vue（教材文件列表弹窗组件）
文件作用：【临时测试组件】点击教材后弹出弹窗，展示该教材在 MinIO 中存储的文件列表
        未来会删除，代码完全独立不耦合，删除时仅需移除此文件及 script.js/index.vue 中的引用
设计规范：纯黑纯白文字、10px圆角、500ms过渡、暗黑双轨适配、Element Plus优先
============================================================================
-->

<template>
  <!-- Element Plus 对话框 -->
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="min(700px, calc(100vw - 40px))"
    :close-on-click-modal="false"
    destroy-on-close
    class="course-files-dialog"
  >
    <!-- ========== 自定义 Header ========== -->
    <template #header>
      <div class="flex items-start justify-between gap-4 w-full">
        <div>
          <h2 class="text-black dark:text-white text-xl font-extrabold tracking-wide
                     transition-colors duration-500">
            教材文件列表
          </h2>
          <p class="text-gray-500 dark:text-gray-400 text-[13px] mt-1.5
                    transition-colors duration-500">
            {{ courseName }}
          </p>
        </div>
      </div>
    </template>

    <!-- ========== Body：文件列表 ========== -->
    <div
      v-loading="loading"
      class="min-h-[200px]"
    >
      <!-- 加载态 -->
      <div v-if="loading" class="py-8" />

      <!-- 错误态 -->
      <div
        v-else-if="errorMsg"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <div class="w-12 h-12 rounded-full
                    bg-red-50 dark:bg-red-900/20
                    border border-red-200/40 dark:border-red-800/30
                    flex items-center justify-center mb-3
                    transition-colors duration-500">
          <svg class="w-5 h-5 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <p class="text-red-500 dark:text-red-400 text-sm font-medium
                  transition-colors duration-500">
          {{ errorMsg }}
        </p>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="files.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <!-- 空状态图标 -->
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600
                    transition-colors duration-500"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <p class="text-black dark:text-white text-sm font-medium
                  transition-colors duration-500">
          该教材下暂无文件
        </p>
        <p class="text-gray-500 dark:text-gray-400 text-xs mt-1
                  transition-colors duration-500">
          请确认教材已成功处理
        </p>
      </div>

      <!-- 文件列表 -->
      <div v-else class="space-y-1.5">
        <!-- 文件总数提示 -->
        <p class="text-gray-500 dark:text-gray-400 text-xs mb-3
                  transition-colors duration-500">
          共 {{ totalFiles }} 个文件
        </p>

        <!-- 文件列表项 -->
        <div
          v-for="(file, index) in files"
          :key="index"
          class="flex items-center gap-3 px-3 py-2.5
                 rounded-[10px]
                 border border-gray-200 dark:border-gray-700
                 bg-white dark:bg-gray-800
                 transition-colors duration-500"
        >
          <!-- 文件图标（根据扩展名区分） -->
          <div class="w-8 h-8 rounded-[10px] flex-shrink-0
                      bg-blue-50 dark:bg-blue-900/20
                      border border-blue-200/40 dark:border-blue-800/30
                      flex items-center justify-center
                      transition-colors duration-500">
            <!-- 根据文件扩展名显示不同图标 -->
            <svg v-if="getFileExt(file.name) === 'md'" class="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <svg v-else-if="getFileExt(file.name) === 'json'" class="w-4 h-4 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3zM9 17v-4m0 0V9m0 4h6"/>
            </svg>
            <svg v-else-if="getFileExt(file.name) === 'pdf'" class="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            <svg v-else-if="isImageExt(getFileExt(file.name))" class="w-4 h-4 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <!-- 默认文件图标 -->
            <svg v-else class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>

          <!-- 文件信息 -->
          <div class="flex-1 min-w-0">
            <p class="text-black dark:text-white text-sm font-medium truncate
                      transition-colors duration-500"
               :title="file.fullPath">
              {{ file.name }}
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-xs
                      transition-colors duration-500">
              {{ file.sizeFormatted }}
              <span v-if="file.lastModified" class="ml-2">
                {{ formatDate(file.lastModified) }}
              </span>
            </p>
          </div>

          <!-- 文件大小标签 -->
          <el-tag size="small" type="info" class="flex-shrink-0">
            {{ file.sizeFormatted }}
          </el-tag>
        </div>
      </div>
    </div>

    <!-- ========== Footer ========== -->
    <template #footer>
      <div class="flex justify-end gap-3">
        <el-button @click="handleClose">
          关闭
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== CourseFilesDialog 逻辑 ====================
// 职责：打开弹窗时调用 API 获取教材文件列表，展示文件名、大小、修改时间
// 说明：临时测试组件，未来会删除

import { ref, watch } from "vue";
import { getBookFiles } from "../api/books";

// 日志前缀
const TAG = "[CourseFilesDialog]";

// ========== Props & Emits ==========
const props = defineProps({
  visible: {
    type: Boolean, // 弹窗是否可见（v-model）
    default: false,
  },
  courseId: {
    type: [String, Number], // 教材 ID
    default: null,
  },
  courseName: {
    type: String, // 教材名称（用于标题显示）
    default: "",
  },
});

const emit = defineEmits(["update:visible"]);

// ========== 响应式数据 ==========

/** 加载中标识 */
const loading = ref(false);

/** 错误消息 */
const errorMsg = ref("");

/** 文件列表 */
const files = ref([]);

/** 文件总数 */
const totalFiles = ref(0);

// ========== 监听 visible 变化，打开弹窗时自动加载数据 ==========
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      // 弹窗打开 → 重置状态并加载文件列表
      loadFiles();
    } else {
      // 弹窗关闭 → 清空错误（组件使用 destroy-on-close，此处做额外保障）
      errorMsg.value = "";
    }
  }
);

// ========== 方法 ==========

/**
 * 加载教材文件列表
 * 调用 getBookFiles API，处理成功/失败/空数据情况
 */
async function loadFiles() {
  if (!props.courseId) {
    console.warn(TAG + " courseId 为空，无法加载文件列表");
    errorMsg.value = "教材 ID 无效";
    return;
  }

  loading.value = true;
  errorMsg.value = "";
  files.value = [];
  totalFiles.value = 0;

  console.log(TAG + " 开始加载文件列表，courseId: " + props.courseId + "，courseName: " + props.courseName);

  try {
    const result = await getBookFiles(props.courseId);

    if (result.code === 0 && result.data) {
      files.value = result.data.files || [];
      totalFiles.value = result.data.totalFiles || 0;
      console.log(TAG + " 文件列表加载成功，共 " + totalFiles.value + " 个文件");
    } else {
      const msg = result.message || "获取文件列表失败";
      console.warn(TAG + " 文件列表加载失败: " + msg);
      errorMsg.value = msg;
    }
  } catch (error) {
    const errMsg = error?.response?.data?.message || error?.message || "网络错误，请重试";
    console.error(TAG + " 文件列表加载异常: " + errMsg);
    errorMsg.value = "加载失败: " + errMsg;
  } finally {
    loading.value = false;
  }
}

/**
 * 获取文件扩展名（小写）
 * @param {string} fileName - 文件名（含扩展名）
 * @returns {string} 扩展名（不含点号，小写）
 */
function getFileExt(fileName) {
  if (!fileName) return "";
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

/**
 * 判断扩展名是否为图片格式
 * @param {string} ext - 扩展名（小写，不含点号）
 * @returns {boolean}
 */
function isImageExt(ext) {
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
  return imageExts.includes(ext);
}

/**
 * 格式化 ISO 日期字符串为简洁日期
 * @param {string} isoStr - ISO 8601 日期字符串
 * @returns {string} 格式化日期（如 "2026-07-10 14:30"）
 */
function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate()) + " " +
    pad(d.getHours()) + ":" +
    pad(d.getMinutes());
}

/**
 * 关闭弹窗
 */
function handleClose() {
  console.log(TAG + " 关闭弹窗");
  emit("update:visible", false);
}
</script>
