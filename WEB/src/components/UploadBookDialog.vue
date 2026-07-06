<!--
============================================================================
文件名：UploadBookDialog.vue（上传教材弹窗组件）
文件作用：用户点击"上传教材"后弹出的模态框，支持选择文件、填写名称和描述
        调用 uploadBook API 上传，成功后通知父组件刷新列表
        遵守设计规范（10px圆角、500ms过渡、暗黑双轨适配、按钮防重复点击）
============================================================================
-->

<template>
  <!-- Element Plus 对话框 -->
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="上传教材"
    width="520px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <!-- ========== 表单区域 ========== -->
    <el-form
      ref="formRef"
      :model="form"
      label-position="top"
      class="transition-colors duration-500"
    >
      <!-- 文件上传区域 -->
      <el-form-item label="选择文件" required>
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
          <!-- 拖拽区域内容 -->
          <div class="py-6 text-center">
            <!-- 上传图标 -->
            <svg class="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-500
                        transition-colors duration-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>

            <p class="text-black dark:text-white text-sm font-medium mb-1
                      transition-colors duration-500">
              点击或拖拽文件到此处
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-xs
                      transition-colors duration-500">
              支持 PDF、DOCX、DOC、MD、ZIP、RAR、7Z（最大 500MB）
            </p>
          </div>
        </el-upload>

        <!-- 文件选择错误提示 -->
        <p v-if="fileError" class="text-red-500 dark:text-red-400 text-xs mt-2
                                   transition-colors duration-500">
          {{ fileError }}
        </p>
      </el-form-item>

      <!-- 教材名称（选填） -->
      <el-form-item label="教材名称（选填，默认取文件名）">
        <el-input
          v-model="form.name"
          placeholder="请输入教材名称"
          maxlength="100"
          show-word-limit
          clearable
        />
      </el-form-item>

      <!-- 教材描述（选填） -->
      <el-form-item label="教材描述（选填）">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入教材描述"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <!-- 启用文本细化开关 -->
      <el-form-item label="文本细化">
        <div class="flex items-center justify-between w-full">
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
      </el-form-item>

      <!-- 上传状态提示 -->
      <el-alert
        v-if="uploadStatus"
        :type="uploadStatusType"
        :title="uploadStatus"
        :closable="false"
        show-icon
        class="mt-2"
      />
    </el-form>

    <!-- ========== 底部按钮 ========== -->
    <template #footer>
      <div class="flex justify-end gap-3">
        <el-button
          @click="handleCancel"
          :disabled="isUploading"
        >
          取消
        </el-button>

        <!-- 上传按钮：使用 :loading 防重复点击 -->
        <el-button
          type="primary"
          :loading="isUploading"
          :disabled="!selectedFile || isUploading"
          @click="handleUpload"
        >
          {{ isUploading ? '上传中...' : '开始上传' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== UploadBookDialog 逻辑 ====================
// 职责：管理文件选择、参数校验、调用 uploadBook API、成功/失败处理

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

/** 允许上传的文件格式 */
const acceptFormats = ".pdf,.docx,.doc,.md,.zip,.rar,.7z";

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
});

/** el-upload 组件引用 */
const uploadRef = ref(null);

/** el-form 组件引用 */
const formRef = ref(null);

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

    console.log(
      TAG + " 上传参数: name=" + (options.name || "无") +
      ", elaboration=" + options.elaboration
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
  // 清除 el-upload 中的文件列表
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
}
</script>
