<!--
============================================================================
文件名：UploadBookDialog.vue（上传教材弹窗组件）
文件作用：用户点击"上传教材"后弹出的模态框，支持选择文件、填写名称和描述
        调用 uploadBook API 上传，成功后通知父组件刷新列表
        布局参考老项目：左右两栏（模式选择 + 上传区），宽度扩大至 860px
        遵守设计规范（10px圆角、500ms过渡、暗黑双轨适配、按钮防重复点击）
============================================================================
-->

<template>
  <!-- Element Plus 对话框：宽度参考老项目 min(860px, calc(100vw - 32px)) -->
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :width="dialogWidth"
    :close-on-click-modal="false"
    destroy-on-close
    class="upload-book-dialog"
  >
    <!-- ========== 自定义 Header（参考老项目 .upload-modal-header） ========== -->
    <template #header>
      <div class="flex items-start justify-between gap-4 w-full">
        <div>
          <h2 class="text-black dark:text-white text-xl font-extrabold tracking-wide
                     transition-colors duration-500">
            上传教材
          </h2>
          <p class="text-gray-500 dark:text-gray-400 text-[13px] mt-1.5
                    transition-colors duration-500">
            上传教学资料，AI 自动生成课程内容
          </p>
        </div>
      </div>
    </template>

    <!-- ========== Body：左右两栏（参考老项目 .upload-modal-body） ========== -->
    <div class="flex gap-4 -mt-2 max-md:flex-col">
      <!-- ===== 左栏：模式选择（w-[268px]，参考老项目 .upload-modal-left） ===== -->
      <div class="w-[268px] flex-shrink-0 max-md:w-full">
        <p class="text-[13px] font-extrabold text-gray-600 dark:text-gray-400
                  mb-2.5 transition-colors duration-500">
          选择备课模式
        </p>

        <!-- 模式卡片列表 -->
        <div class="space-y-3">
          <!-- 互动式PPT -->
          <button
            type="button"
            class="upload-mode-card w-full text-left
                   rounded-[10px] p-3.5
                   border transition-all duration-500
                   bg-white dark:bg-gray-800
                   hover:-translate-y-px hover:shadow-md
                   border-blue-400/60 dark:border-blue-500/40
                   shadow-[0_16px_34px_rgba(30,144,255,0.12)]
                   dark:shadow-[0_16px_34px_rgba(96,165,250,0.08)]
                   bg-blue-50/60 dark:bg-blue-900/20"
            @click=""
          >
            <div class="text-sm font-extrabold text-black dark:text-white
                        transition-colors duration-500">
              互动式PPT模式
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400
                        leading-[1.5] transition-colors duration-500">
              更省token，效果更好的ppt讲解
            </div>
          </button>

          <!-- 讲义精讲 -->
          <button
            type="button"
            disabled
            class="upload-mode-card w-full text-left
                   rounded-[10px] p-3.5
                   border border-gray-200 dark:border-gray-700
                   bg-white dark:bg-gray-800
                   transition-all duration-500
                   opacity-60 cursor-not-allowed"
          >
            <div class="text-sm font-extrabold text-black dark:text-white
                        transition-colors duration-500">
              讲义精讲模式
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400
                        leading-[1.5] transition-colors duration-500">
              深入解析知识点，适合理论学习
            </div>
          </button>

          <!-- 习题模式 -->
          <button
            type="button"
            disabled
            class="upload-mode-card w-full text-left
                   rounded-[10px] p-3.5
                   border border-gray-200 dark:border-gray-700
                   bg-white dark:bg-gray-800
                   transition-all duration-500
                   opacity-60 cursor-not-allowed"
          >
            <div class="text-sm font-extrabold text-black dark:text-white
                        transition-colors duration-500">
              习题模式
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400
                        leading-[1.5] transition-colors duration-500">
              自动生成练习题，巩固知识点
            </div>
          </button>
        </div>
      </div>

      <!-- ===== 右栏：上传区域（flex-1，参考老项目 .upload-modal-right） ===== -->
      <div class="flex-1 min-w-0 flex flex-col gap-3">
        <!-- 拖拽上传区（参考老项目 .upload-drop，h-[200px]） -->
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :limit="1"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          :accept="acceptFormats"
          drag
          class="w-full"
        >
          <!-- 拖拽区域内容（高度参考老项目 200px） -->
          <div class="py-8 text-center">
            <!-- 上传图标（+ 号风格，参考老项目 .upload-drop-plus） -->
            <div class="w-[46px] h-[46px] mx-auto mb-3 rounded-full
                        bg-white dark:bg-gray-700
                        border border-gray-200 dark:border-gray-600
                        flex items-center justify-center
                        text-blue-500 dark:text-blue-400 text-[22px]
                        transition-colors duration-500">
              +
            </div>

            <p class="text-black dark:text-white text-sm font-extrabold mb-1
                      transition-colors duration-500">
              选择文件
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-xs
                      transition-colors duration-500">
              支持 PDF、DOCX、DOC、MD、ZIP、RAR、7Z（最大 500MB）
            </p>

            <!-- 文件选择状态 -->
            <p v-if="selectedFile"
               class="mt-3 text-xs font-bold text-green-500 dark:text-green-400
                      transition-colors duration-500">
              {{ selectedFile.name }}
            </p>
          </div>
        </el-upload>

        <!-- 文件选择错误提示 -->
        <p v-if="fileError"
           class="text-red-500 dark:text-red-400 text-xs
                  transition-colors duration-500">
          {{ fileError }}
        </p>

        <!-- 表单区（参考老项目 .upload-form） -->
        <div class="rounded-[10px] border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800
                    p-3.5 transition-colors duration-500">
          <!-- 教材名称 -->
          <div class="flex items-center gap-3 mb-3">
            <label class="text-[13px] font-extrabold text-gray-600 dark:text-gray-400
                         flex items-center gap-2 flex-shrink-0
                         transition-colors duration-500">
              教材名称
              <span class="h-[18px] px-2 rounded-full
                          bg-blue-50 dark:bg-blue-900/20
                          border border-blue-200/40 dark:border-blue-800/30
                          text-[11px] text-gray-500 dark:text-gray-400
                          flex items-center transition-colors duration-500">
                选填
              </span>
            </label>
            <el-input
              v-model="form.name"
              placeholder="请输入教材名称（默认取文件名）"
              maxlength="100"
              show-word-limit
              clearable
              size="default"
              class="flex-1"
            />
          </div>

          <!-- 教材描述 -->
          <div class="flex items-start gap-3 mb-3">
            <label class="text-[13px] font-extrabold text-gray-600 dark:text-gray-400
                         flex items-center gap-2 flex-shrink-0 pt-1
                         transition-colors duration-500">
              教材描述
            </label>
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="3"
              placeholder="请输入教材描述"
              maxlength="500"
              show-word-limit
              class="flex-1"
            />
          </div>

          <!-- AI 模型选择（参考老项目的 model selector） -->
          <div class="flex items-center gap-3 mb-3">
            <label class="text-[13px] font-extrabold text-gray-600 dark:text-gray-400
                         flex-shrink-0 transition-colors duration-500">
              AI 模型
            </label>
            <el-select
              v-model="form.model"
              placeholder="选择 AI 模型"
              size="default"
              class="flex-1"
            >
              <el-option label="DeepSeek V4 Pro" value="deepseek-v4-pro" />
              <el-option label="DeepSeek V4 Flash" value="deepseek-v4-flash" />
            </el-select>
          </div>

          <!-- 文本细化开关 -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-black dark:text-white text-sm font-medium
                        transition-colors duration-500">
                启用文本细化
              </p>
              <p class="text-gray-500 dark:text-gray-400 text-xs
                        transition-colors duration-500">
                AI 自动扩写口播稿，生成更详细的讲解内容
              </p>
            </div>
            <el-switch
              v-model="form.elaboration"
              active-text="开启"
              inactive-text="关闭"
              class="ml-4 flex-shrink-0"
            />
          </div>
        </div>

        <!-- 上传状态提示 -->
        <el-alert
          v-if="uploadStatus"
          :type="uploadStatusType"
          :title="uploadStatus"
          :closable="false"
          show-icon
        />
      </div>
    </div>

    <!-- ========== Footer（参考老项目 .upload-modal-footer） ========== -->
    <template #footer>
      <div class="flex justify-end gap-3">
        <el-button
          @click="handleCancel"
          :disabled="isUploading"
        >
          取消
        </el-button>

        <!-- 上传按钮：使用 :loading 防重复点击（设计规范规则4） -->
        <el-button
          type="primary"
          :loading="isUploading"
          :disabled="!selectedFile || isUploading"
          @click="handleUpload"
        >
          {{ isUploading ? '上传中...' : '上传' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== UploadBookDialog 逻辑 ====================
// 职责：管理文件选择、参数校验、调用 uploadBook API、成功/失败处理
// 布局参考老项目 UploadCourseModal：左右两栏（268px 模式选择 + 上传区）

import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import { uploadBook } from "../api/books";

// 日志前缀
const TAG = "[UploadBookDialog]";

// ========== Props & Emits ==========
defineProps({
  visible: {
    type: Boolean, // 弹窗是否可见（v-model）
    default: false,
  },
});

const emit = defineEmits(["update:visible", "success"]);

// ========== 响应式数据 ==========

/** 弹窗宽度（参考老项目 min(860px, calc(100vw - 32px))） */
const dialogWidth = "min(860px, calc(100vw - 40px))";

/** 允许上传的文件格式 */
const acceptFormats = ".pdf,.md,.zip,.rar,.7z";

/** 选择的文件对象 */
const selectedFile = ref(null);

/** 文件选择错误提示 */
const fileError = ref("");

/** 上传中标识（防重复点击） */
const isUploading = ref(false);

/** 上传状态提示文字 */
const uploadStatus = ref("");

/** 上传状态提示类型 */
const uploadStatusType = computed(() => {
  if (uploadStatus.value.includes("成功")) return "success";
  if (uploadStatus.value.includes("失败")) return "error";
  return "info";
});

/** 表单数据 */
const form = reactive({
  name: "",
  description: "",
  elaboration: true, // 默认启用文本细化（AI 口播稿扩写）
  model: "deepseek-v4-pro", // AI 模型选择（参考老项目）
});

/** el-upload 组件引用 */
const uploadRef = ref(null);

// ========== 方法 ==========

/**
 * 文件选择变化处理
 * 校验文件格式和大小
 */
function handleFileChange(uploadFile) {
  fileError.value = "";

  // 检查是否有文件
  if (!uploadFile || !uploadFile.raw) {
    return;
  }

  const file = uploadFile.raw;

  // 校验文件大小（500MB 上限）
  const maxSize = 500 * 1024 * 1024; // 500MB
  if (file.size > maxSize) {
    fileError.value = "文件大小不能超过 500MB";
    selectedFile.value = null;
    // 清除 el-upload 中的文件
    if (uploadRef.value) {
      uploadRef.value.clearFiles();
    }
    return;
  }

  // 校验文件格式
  const ext = "." + file.name.split(".").pop().toLowerCase();
  const allowedExts = acceptFormats.split(",");
  if (!allowedExts.includes(ext)) {
    fileError.value = "不支持的文件格式，仅支持: " + acceptFormats;
    selectedFile.value = null;
    if (uploadRef.value) {
      uploadRef.value.clearFiles();
    }
    return;
  }

  // 校验通过，保存文件
  selectedFile.value = file;
  uploadStatus.value = "";

  // 自动填充教材名称（取文件名，去掉扩展名）
  if (!form.name) {
    const dotIndex = file.name.lastIndexOf(".");
    form.name = dotIndex > 0 ? file.name.substring(0, dotIndex) : file.name;
  }

  console.log(TAG + " 文件已选择: " + file.name + " (" + (file.size / 1024 / 1024).toFixed(1) + " MB)");
}

/**
 * 文件移除处理
 */
function handleFileRemove() {
  selectedFile.value = null;
  fileError.value = "";
  uploadStatus.value = "";
  console.log(TAG + " 文件已移除");
}

/**
 * 开始上传
 * 调用 uploadBook API，处理成功/失败
 */
async function handleUpload() {
  // 前置校验
  if (!selectedFile.value) {
    fileError.value = "请先选择要上传的文件";
    return;
  }

  isUploading.value = true;
  uploadStatus.value = "正在上传并处理文件...";
  fileError.value = "";

  console.log(TAG + " 开始上传文件: " + selectedFile.value.name);

  try {
    // 构建上传参数
    const options = {};
    if (form.name) options.name = form.name;
    if (form.description) options.description = form.description;
    options.elaboration = form.elaboration; // 是否启用文本细化
    options.model = form.model; // AI 模型选择

    console.log(
      TAG + " 上传参数: name=" + (options.name || "无") +
      ", elaboration=" + options.elaboration +
      ", model=" + options.model
    );

    // 调用 API
    const result = await uploadBook(selectedFile.value, options);

    // 后端教材接口返回 code: 0 表示成功
    if (result.code === 0) {
      uploadStatus.value = "上传成功！后台正在处理中...";
      console.log(TAG + " 上传成功，book_id: " + result.data?.book_id);

      ElMessage.success("教材上传成功，正在后台处理");

      // 延迟关闭弹窗，让用户看到成功提示
      setTimeout(() => {
        emit("success", result.data);
        resetForm();
        emit("update:visible", false);
      }, 1000);
    } else {
      uploadStatus.value = "上传失败: " + (result.message || "未知错误");
      console.warn(TAG + " 上传失败: " + result.message);
      ElMessage.error(result.message || "上传失败，请重试");
    }
  } catch (error) {
    const errMsg = error?.message || error?.response?.data?.message || "网络错误，请重试";
    uploadStatus.value = "上传失败: " + errMsg;
    console.error(TAG + " 上传异常: " + errMsg);
    ElMessage.error("上传失败: " + errMsg);
  } finally {
    isUploading.value = false;
  }
}

/**
 * 取消操作
 */
function handleCancel() {
  if (isUploading.value) {
    // 上传中不允许取消
    console.log(TAG + " 上传中，不允许取消");
    return;
  }

  console.log(TAG + " 取消上传");
  resetForm();
  emit("update:visible", false);
}

/**
 * 重置表单状态
 */
function resetForm() {
  selectedFile.value = null;
  fileError.value = "";
  uploadStatus.value = "";
  isUploading.value = false;
  form.name = "";
  form.description = "";
  form.elaboration = true; // 重置为默认值
  form.model = "deepseek-v4-pro"; // 重置模型选择
  // 清除 el-upload 中的文件列表
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
}
</script>
