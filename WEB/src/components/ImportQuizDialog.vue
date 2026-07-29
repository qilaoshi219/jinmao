<!--
============================================================================
文件名：ImportQuizDialog.vue（题库导入弹窗）
文件作用：JSON 题库导入弹窗 — 输入题库名、试卷名、粘贴 JSON 题目数据
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、防重复点击
============================================================================
-->

<template>
  <!-- 导入弹窗 -->
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="导入题库"
    width="650px"
    :close-on-click-modal="false"
    class="import-quiz-dialog">

    <!-- 表单内容 -->
    <el-form :model="form" label-position="top" @submit.prevent="handleImport">

      <!-- 题库名称 -->
      <el-form-item label="题库名称" required>
        <el-input
          v-model="form.textbookName"
          placeholder="例如：教师资格证考试题库"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>

      <!-- 试卷名称 -->
      <el-form-item label="试卷名称" required>
        <el-input
          v-model="form.examName"
          placeholder="例如：综合素质"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>

      <!-- 题库描述（可选） -->
      <el-form-item label="题库描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="可选，简要描述题库内容"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>

      <!-- 题目 JSON 数据 -->
      <el-form-item label="题目数据（JSON 格式）" required>
        <el-input
          v-model="form.questionsJson"
          type="textarea"
          :rows="10"
          placeholder='每道题目格式：
{
  "type": "single",
  "question": "题干内容",
  "options": ["A. 选项1", "B. 选项2"],
  "answer": "B",
  "explanation": "解析（可选）"
}

支持的题型：single(单选)、multiple(多选)、judge(判断)、fill(填空)、short_answer/essay(简答题)'
        />
        <template #extra>
          <div class="mt-1 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
            请粘贴 JSON 数组格式的题目数据，每道题必须包含 type、question、answer 字段
          </div>
        </template>
      </el-form-item>
    </el-form>

    <!-- 底部按钮 -->
    <template #footer>
      <el-button @click="$emit('update:visible', false)" :disabled="importing">
        取消
      </el-button>
      <el-button type="primary" @click="handleImport" :loading="importing">
        {{ importing ? '导入中...' : '开始导入' }}
      </el-button>
    </template>

    <!-- 导入结果 -->
    <div v-if="importResult" class="mt-4">
      <el-alert
        :title="importResult.title"
        :type="importResult.type"
        :description="importResult.description"
        show-icon
        :closable="false"
      />
    </div>
  </el-dialog>
</template>

<script setup>
// ==================== ImportQuizDialog 逻辑 ====================
// 职责：收集导入参数 → 校验 JSON → 调用 API 导入

import { ref, reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import { importQuiz } from "../api/quiz";

// 日志前缀
const TAG = "[ImportQuizDialog]";

const props = defineProps({
  /** 弹窗可见性 */
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(["update:visible", "success"]);

// ========== 表单数据 ==========
const form = reactive({
  textbookName: "",
  examName: "",
  description: "",
  questionsJson: "",
});

// ========== 响应式状态 ==========
const importing = ref(false);
const importResult = ref(null);

// ========== 弹窗关闭时清空表单 ==========
watch(
  () => props.visible,
  (val) => {
    if (!val) {
      form.textbookName = "";
      form.examName = "";
      form.description = "";
      form.questionsJson = "";
      importResult.value = null;
    }
  }
);

// ========== 事件处理 ==========

/**
 * 执行导入
 */
async function handleImport() {
  console.log(TAG + " 开始导入题库");

  // 校验表单
  if (!form.textbookName.trim()) {
    ElMessage.warning("请输入题库名称");
    return;
  }
  if (!form.examName.trim()) {
    ElMessage.warning("请输入试卷名称");
    return;
  }
  if (!form.questionsJson.trim()) {
    ElMessage.warning("请输入题目数据");
    return;
  }

  // 解析 JSON
  let questions;
  try {
    questions = JSON.parse(form.questionsJson);
    if (!Array.isArray(questions) || questions.length === 0) {
      ElMessage.warning("题目数据必须是有效的 JSON 数组");
      return;
    }
  } catch (err) {
    ElMessage.warning("题目数据 JSON 格式错误：" + err.message);
    return;
  }

  // 调用导入 API
  importing.value = true;
  importResult.value = null;

  try {
    const result = await importQuiz({
      textbookName: form.textbookName.trim(),
      examName: form.examName.trim(),
      description: form.description.trim() || undefined,
      questions,
    });

    console.log(TAG + " 导入结果:", result);

    if (result.code === 0) {
      const data = result.data;
      importResult.value = {
        type: "success",
        title: result.message,
        description: "成功导入 " + data.importedCount + " 题" +
          (data.failedCount > 0 ? "，失败 " + data.failedCount + " 题" : ""),
      };

      ElMessage.success("题库导入成功！共 " + data.importedCount + " 题");

      // 延迟关闭弹窗，让用户看到结果
      setTimeout(() => {
        emit("success", data);
      }, 1500);
    } else {
      importResult.value = {
        type: "error",
        title: "导入失败",
        description: result.message,
      };
    }
  } catch (error) {
    console.error(TAG + " 导入异常:", error);
    const errMsg = error?.response?.data?.message || error.message || "导入失败";
    importResult.value = {
      type: "error",
      title: "导入异常",
      description: errMsg,
    };
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
/* El-dialog 样式覆盖：10px 圆角 */
.import-quiz-dialog :deep(.el-dialog) {
  border-radius: 10px;
}
.import-quiz-dialog :deep(.el-textarea__inner),
.import-quiz-dialog :deep(.el-input__wrapper) {
  border-radius: 10px;
}
</style>
