<!--
============================================================================
文件名：ImportQuizDialog.vue（题库导入弹窗）
文件作用：题库导入弹窗 — PDF 导入 / Markdown 导入 / JSON 直接导入 / 题库格式化 四 Tab
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、防重复点击
============================================================================
-->

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="导入题库"
    width="min(720px, 92vw)"
    :close-on-click-modal="false"
    destroy-on-close
    class="import-quiz-dialog">

    <!-- 导入结果（JSON Tab 成功时显示） -->
    <template v-if="importResult">
      <el-alert
        :title="importResult.title"
        :type="importResult.type"
        :description="importResult.description"
        show-icon
        :closable="false"
      />
    </template>

    <!-- Tab 切换 -->
    <template v-else>
      <el-tabs v-model="activeTab" class="import-dialog__tabs">

        <!-- ==================== 文档导入 Tab ==================== -->
        <el-tab-pane label="文档导入" name="pdf">
          <el-alert
            type="info" :closable="false" show-icon
            title="上传 PDF 文档，系统自动转换为 Markdown 后由 AI 生成题目并入库。"
          />

          <el-form label-position="top" class="import-dialog__form" @submit.prevent>
            <el-form-item label="题库名称" required>
              <el-input v-model="pdfForm.textbookName" maxlength="100" placeholder="请输入题库名称" />
            </el-form-item>

            <el-form-item label="试卷名称" required>
              <el-input v-model="pdfForm.examName" maxlength="100" placeholder="请输入试卷名称" />
            </el-form-item>

            <el-form-item label="题库描述">
              <el-input v-model="pdfForm.description" type="textarea" :rows="2" maxlength="300" show-word-limit placeholder="可选，简要描述题库内容" />
            </el-form-item>

            <el-form-item label="文档文件 (.pdf)" required>
              <input type="file" accept=".pdf" class="import-dialog__file" @change="onPdfFileChange" />
              <div v-if="pdfFile" class="import-dialog__file-meta text-xs text-gray-400 mt-1 transition-colors duration-500">
                已选择：{{ pdfFile.name }}（{{ (pdfFile.size / 1024 / 1024).toFixed(1) }} MB）
              </div>
            </el-form-item>

            <el-form-item label="题型配额预设">
              <el-select :model-value="pdfPreset" @update:model-value="applyPdfPreset">
                <el-option v-for="opt in presetOptions" :key="opt.key" :label="opt.label" :value="opt.key" />
              </el-select>
            </el-form-item>

            <div class="import-dialog__quota-grid">
              <el-form-item label="单选">
                <el-input-number v-model="pdfConfig.single" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="多选">
                <el-input-number v-model="pdfConfig.multiple" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="判断">
                <el-input-number v-model="pdfConfig.judge" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="填空">
                <el-input-number v-model="pdfConfig.fill" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="简答">
                <el-input-number v-model="pdfConfig.shortAnswer" :min="0" :max="200" size="small" />
              </el-form-item>
            </div>
          </el-form>

          <div class="import-dialog__info text-xs text-gray-400 mt-3 transition-colors duration-500">
            <p>PDF 文件将先转换为 Markdown，再由 DeepSeek AI 逐块生成题目并自动入库。</p>
            <p class="mt-1">任务创建成功后弹窗关闭，可在题库列表中查看生成进度。</p>
          </div>
        </el-tab-pane>

        <!-- ==================== Markdown 导入 Tab ==================== -->
        <el-tab-pane label="Markdown 导入" name="markdown">
          <el-alert
            type="info" :closable="false" show-icon
            title="上传 Markdown 文件，系统由 AI 生成题目并自动入库。"
          />

          <el-form label-position="top" class="import-dialog__form" @submit.prevent>
            <el-form-item label="题库名称" required>
              <el-input v-model="mdForm.textbookName" maxlength="100" placeholder="请输入题库名称" />
            </el-form-item>

            <el-form-item label="试卷名称" required>
              <el-input v-model="mdForm.examName" maxlength="100" placeholder="请输入试卷名称" />
            </el-form-item>

            <el-form-item label="题库描述">
              <el-input v-model="mdForm.description" type="textarea" :rows="2" maxlength="300" show-word-limit placeholder="可选，简要描述题库内容" />
            </el-form-item>

            <el-form-item label="Markdown 文件 (.md)" required>
              <input type="file" accept=".md" class="import-dialog__file" @change="onMdFileChange" />
              <div v-if="mdFile" class="import-dialog__file-meta text-xs text-gray-400 mt-1 transition-colors duration-500">
                已选择：{{ mdFile.name }}（{{ mdCharCount }} 字符 / {{ mdLineCount }} 行）
              </div>
            </el-form-item>

            <el-form-item label="题型配额预设">
              <el-select :model-value="mdPreset" @update:model-value="applyMdPreset">
                <el-option v-for="opt in presetOptions" :key="opt.key" :label="opt.label" :value="opt.key" />
              </el-select>
            </el-form-item>

            <div class="import-dialog__quota-grid">
              <el-form-item label="单选">
                <el-input-number v-model="mdConfig.single" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="多选">
                <el-input-number v-model="mdConfig.multiple" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="判断">
                <el-input-number v-model="mdConfig.judge" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="填空">
                <el-input-number v-model="mdConfig.fill" :min="0" :max="200" size="small" />
              </el-form-item>
              <el-form-item label="简答">
                <el-input-number v-model="mdConfig.shortAnswer" :min="0" :max="200" size="small" />
              </el-form-item>
            </div>
          </el-form>

          <div class="import-dialog__info text-xs text-gray-400 mt-3 transition-colors duration-500">
            <p>任务创建成功后弹窗关闭，可在题库列表中查看生成进度。</p>
          </div>
        </el-tab-pane>

        <!-- ==================== JSON 导入 Tab ==================== -->
        <el-tab-pane label="JSON 导入" name="json">
          <el-alert
            type="info" :closable="false" show-icon
            title="直接粘贴 JSON 数组格式的题目数据，立即入库。"
          />

          <el-form label-position="top" class="import-dialog__form" @submit.prevent>
            <el-form-item label="题库名称" required>
              <el-input v-model="jsonForm.textbookName" maxlength="100" placeholder="例如：教师资格证考试题库" show-word-limit />
            </el-form-item>
            <el-form-item label="试卷名称" required>
              <el-input v-model="jsonForm.examName" maxlength="100" placeholder="例如：综合素质" show-word-limit />
            </el-form-item>
            <el-form-item label="题库描述">
              <el-input v-model="jsonForm.description" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可选，简要描述题库内容" />
            </el-form-item>
            <el-form-item label="题目数据（JSON 格式）" required>
              <el-input v-model="jsonForm.questionsJson" type="textarea" :rows="10"
                placeholder='[{"type":"single","question":"题干","options":["A. xx","B. xx"],"answer":"B","explanation":"解析"}]' />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ==================== 题库格式化 Tab ==================== -->
        <el-tab-pane label="题库格式化" name="format">
          <el-alert
            type="info" :closable="false" show-icon
            title="上传已出好题的 PDF 文件（如考试试卷扫描件），系统转换为 MD 后由 DeepSeek 自动解析题目和答案并入库。"
          />

          <el-form label-position="top" class="import-dialog__form" @submit.prevent>
            <el-form-item label="题库名称" required>
              <el-input v-model="formatForm.textbookName" maxlength="100" placeholder="请输入题库名称" />
            </el-form-item>

            <el-form-item label="试卷名称" required>
              <el-input v-model="formatForm.examName" maxlength="100" placeholder="请输入试卷名称" />
            </el-form-item>

            <el-form-item label="题库描述">
              <el-input v-model="formatForm.description" type="textarea" :rows="2" maxlength="300" show-word-limit placeholder="可选，简要描述题库内容" />
            </el-form-item>

            <el-form-item label="PDF 文件（已出好题的试卷，接受 .pdf）" required>
              <input type="file" accept=".pdf" class="import-dialog__file" @change="onFormatFileChange" />
              <div v-if="formatFile" class="import-dialog__file-meta text-xs text-gray-400 mt-1 transition-colors duration-500">
                已选择：{{ formatFile.name }}（{{ (formatFile.size / 1024 / 1024).toFixed(1) }} MB）
              </div>
            </el-form-item>
          </el-form>

          <div class="import-dialog__info text-xs text-gray-400 mt-3 transition-colors duration-500">
            <p>PDF 文件将先转换为 Markdown，再由 DeepSeek AI 自动识别题目结构和匹配答案。</p>
            <p class="mt-1">系统会自动解析全部题目（单选/多选/判断/简答），无需手动设置题型配额。</p>
            <p class="mt-1">任务创建成功后弹窗关闭，可在题库列表中查看生成进度。</p>
          </div>
        </el-tab-pane>

      </el-tabs>
    </template>

    <!-- 底部按钮 -->
    <template #footer>
      <div class="import-dialog__footer">
        <template v-if="importResult">
          <el-button @click="continueImport">继续导入</el-button>
          <el-button type="primary" @click="closeDialog">关闭</el-button>
        </template>
        <template v-else>
          <el-button @click="closeDialog" :disabled="loading">取消</el-button>

          <!-- PDF 按钮 -->
          <el-button v-if="activeTab === 'pdf'" type="primary" :loading="loading" :disabled="!pdfCanSubmit" @click="handlePdfSubmit">
            {{ loading ? '上传转换中...' : '生成并导入' }}
          </el-button>

          <!-- Markdown 按钮 -->
          <el-button v-else-if="activeTab === 'markdown'" type="primary" :loading="loading" :disabled="!mdCanSubmit" @click="handleMdSubmit">
            {{ loading ? '创建任务中...' : '生成并导入' }}
          </el-button>

          <!-- JSON 按钮 -->
          <el-button v-else-if="activeTab === 'json'" type="primary" :loading="loading" :disabled="!jsonCanSubmit" @click="handleJsonSubmit">
            {{ loading ? '导入中...' : '校验并导入' }}
          </el-button>

          <!-- 格式化按钮 -->
          <el-button v-else-if="activeTab === 'format'" type="primary" :loading="loading" :disabled="!formatCanSubmit" @click="handleFormatSubmit">
            {{ loading ? '上传解析中...' : '上传并解析' }}
          </el-button>

        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== ImportQuizDialog 逻辑（四 Tab） ====================
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { importQuiz, createMd2QuizTask, uploadPdfForQuiz } from "../api/quiz";

const TAG = "[ImportQuizDialog]";

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["update:visible", "success"]);

// ==================== Tab 状态 ====================
const activeTab = ref("pdf");

// ==================== 题型预设配置 ====================
const PRESET_MAP = {
  small: { label: "少量", config: { single: 5, multiple: 10, judge: 0, fill: 0, shortAnswer: 0 } },
  standard: { label: "标准", config: { single: 10, multiple: 20, judge: 0, fill: 0, shortAnswer: 0 } },
  large: { label: "大量", config: { single: 20, multiple: 40, judge: 0, fill: 0, shortAnswer: 0 } },
};

const presetOptions = computed(() => {
  return Object.keys(PRESET_MAP).map((key) => ({
    key,
    label: PRESET_MAP[key].label,
  }));
});

// ==================== PDF Tab 表单 ====================
const pdfForm = reactive({ textbookName: "", examName: "", description: "" });
const pdfFile = ref(null);
const pdfPreset = ref("standard");
const pdfConfig = reactive({ ...PRESET_MAP.standard.config });

function applyPdfPreset(key) {
  pdfPreset.value = key;
  Object.assign(pdfConfig, PRESET_MAP[key].config);
}

function onPdfFileChange(event) {
  const file = event.target.files?.[0];
  if (file) pdfFile.value = file;
  event.target.value = "";
}

const pdfCanSubmit = computed(() => {
  if (loading.value) return false;
  return (
    pdfForm.textbookName.trim() &&
    pdfForm.examName.trim() &&
    pdfFile.value &&
    Object.values(pdfConfig).some((v) => v > 0)
  );
});

// ==================== Markdown Tab 表单 ====================
const mdForm = reactive({ textbookName: "", examName: "", description: "" });
const mdFile = ref(null);
const mdContent = ref("");
const mdCharCount = computed(() => mdContent.value.length);
const mdLineCount = computed(() => {
  if (!mdContent.value) return 0;
  return mdContent.value.split(/\r?\n/).length;
});
const mdPreset = ref("standard");
const mdConfig = reactive({ ...PRESET_MAP.standard.config });

function applyMdPreset(key) {
  mdPreset.value = key;
  Object.assign(mdConfig, PRESET_MAP[key].config);
}

async function onMdFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  mdFile.value = file;
  mdContent.value = await file.text();
  console.log(TAG + " 读取 MD 文件: " + file.name + "，字符数: " + mdContent.value.length);
  event.target.value = "";
}

const mdCanSubmit = computed(() => {
  if (loading.value) return false;
  return (
    mdForm.textbookName.trim() &&
    mdForm.examName.trim() &&
    mdFile.value &&
    mdContent.value.trim() &&
    Object.values(mdConfig).some((v) => v > 0)
  );
});

// ==================== JSON Tab 表单 ====================
const jsonForm = reactive({ textbookName: "", examName: "", description: "", questionsJson: "" });

const jsonCanSubmit = computed(() => {
  if (loading.value) return false;
  return (
    jsonForm.textbookName.trim() &&
    jsonForm.examName.trim() &&
    jsonForm.questionsJson.trim()
  );
});

// ==================== 格式化 Tab 表单（PDF 试卷解析） ====================
const formatForm = reactive({ textbookName: "", examName: "", description: "" });
const formatFile = ref(null);

function onFormatFileChange(event) {
  const file = event.target.files?.[0];
  if (file) formatFile.value = file;
  event.target.value = "";
}

const formatCanSubmit = computed(() => {
  if (loading.value) return false;
  return (
    formatForm.textbookName.trim() &&
    formatForm.examName.trim() &&
    formatFile.value
  );
});

// ==================== 共享状态 ====================
const loading = ref(false);
const importResult = ref(null);

// ==================== 弹窗生命周期 ====================
watch(() => props.visible, (val) => {
  if (!val) resetAll();
});

function resetAll() {
  // PDF
  pdfForm.textbookName = ""; pdfForm.examName = ""; pdfForm.description = "";
  pdfFile.value = null; applyPdfPreset("standard");
  // Markdown
  mdForm.textbookName = ""; mdForm.examName = ""; mdForm.description = "";
  mdFile.value = null; mdContent.value = ""; applyMdPreset("standard");
  // JSON
  jsonForm.textbookName = ""; jsonForm.examName = ""; jsonForm.description = ""; jsonForm.questionsJson = "";
  // 格式化
  formatForm.textbookName = ""; formatForm.examName = ""; formatForm.description = "";
  formatFile.value = null;
  // 共享
  importResult.value = null;
}

function closeDialog() {
  emit("update:visible", false);
}

function continueImport() {
  importResult.value = null;
}

// ==================== 提交处理 ====================

/** PDF Tab：上传 + 创建任务 */
async function handlePdfSubmit() {
  if (!pdfCanSubmit.value) return;
  loading.value = true;

  try {
    const formData = new FormData();
    formData.append("file", pdfFile.value);
    formData.append("textbookName", pdfForm.textbookName.trim());
    formData.append("examName", pdfForm.examName.trim());
    if (pdfForm.description.trim()) formData.append("description", pdfForm.description.trim());
    formData.append("singleQty", String(pdfConfig.single));
    formData.append("multipleQty", String(pdfConfig.multiple));
    formData.append("judgeQty", String(pdfConfig.judge));
    formData.append("fillQty", String(pdfConfig.fill));
    formData.append("shortAnswerQty", String(pdfConfig.shortAnswer));

    const result = await uploadPdfForQuiz(formData);

    if (result.code === 0) {
      ElMessage.success("PDF 已上传，后台正在生成题目...");
      emit("success", { textbookId: result.data.textbookId });
    } else {
      ElMessage.error(result.message || "PDF 上传失败");
    }
  } catch (error) {
    console.error(TAG + " PDF 提交异常:", error);
    const errMsg = error?.response?.data?.message || error.message || "上传失败";
    ElMessage.error("PDF 提交失败: " + errMsg);
  } finally {
    loading.value = false;
  }
}

/** 格式化 Tab：上传 PDF 试卷 → 解析已有题目（format 模式，无需题型配额） */
async function handleFormatSubmit() {
  if (!formatCanSubmit.value) return;
  loading.value = true;

  try {
    const formData = new FormData();
    formData.append("file", formatFile.value);
    formData.append("textbookName", formatForm.textbookName.trim());
    formData.append("examName", formatForm.examName.trim());
    if (formatForm.description.trim()) formData.append("description", formatForm.description.trim());
    // format 模式：AI 只解析已有的题目结构和答案，不生成新题
    formData.append("mode", "format");

    const result = await uploadPdfForQuiz(formData);

    if (result.code === 0) {
      ElMessage.success("PDF 试卷已上传，后台正在解析题目...");
      emit("success", { textbookId: result.data.textbookId });
    } else {
      ElMessage.error(result.message || "PDF 上传失败");
    }
  } catch (error) {
    console.error(TAG + " 格式化提交异常:", error);
    const errMsg = error?.response?.data?.message || error.message || "上传失败";
    ElMessage.error("格式化提交失败: " + errMsg);
  } finally {
    loading.value = false;
  }
}

/** Markdown Tab：创建 MD→JSON 任务 */
async function handleMdSubmit() {
  if (!mdCanSubmit.value) return;
  loading.value = true;

  try {
    const result = await createMd2QuizTask({
      fileName: mdFile.value.name,
      markdownContent: mdContent.value,
      textbookName: mdForm.textbookName.trim(),
      examName: mdForm.examName.trim(),
      description: mdForm.description.trim() || "",
      generationConfig: { ...mdConfig },
    });

    if (result.code === 0) {
      ElMessage.success("任务已创建，后台正在生成题目...");
      emit("success", { textbookId: result.data.textbookId });
    } else {
      ElMessage.error(result.message || "任务创建失败");
    }
  } catch (error) {
    console.error(TAG + " Markdown 提交异常:", error);
    const errMsg = error?.response?.data?.message || error.message || "任务创建失败";
    ElMessage.error("任务创建失败: " + errMsg);
  } finally {
    loading.value = false;
  }
}

/** JSON Tab：直接导入 */
async function handleJsonSubmit() {
  if (!jsonCanSubmit.value) return;

  if (!jsonForm.textbookName.trim()) { ElMessage.warning("请输入题库名称"); return; }
  if (!jsonForm.examName.trim()) { ElMessage.warning("请输入试卷名称"); return; }

  let questions;
  try {
    questions = JSON.parse(jsonForm.questionsJson);
    if (!Array.isArray(questions) || questions.length === 0) {
      ElMessage.warning("题目数据必须是有效的 JSON 数组"); return;
    }
  } catch (err) {
    ElMessage.warning("题目数据 JSON 格式错误：" + err.message); return;
  }

  loading.value = true;
  importResult.value = null;

  try {
    const result = await importQuiz({
      textbookName: jsonForm.textbookName.trim(),
      examName: jsonForm.examName.trim(),
      description: jsonForm.description.trim() || undefined,
      questions,
    });

    if (result.code === 0) {
      const data = result.data;
      importResult.value = {
        type: "success",
        title: result.message,
        description: "成功导入 " + data.importedCount + " 题" +
          (data.failedCount > 0 ? "，失败 " + data.failedCount + " 题" : ""),
      };
      ElMessage.success("题库导入成功！共 " + data.importedCount + " 题");
      setTimeout(() => emit("success", data), 1500);
    } else {
      importResult.value = { type: "error", title: "导入失败", description: result.message };
    }
  } catch (error) {
    console.error(TAG + " JSON 导入异常:", error);
    const errMsg = error?.response?.data?.message || error.message || "导入失败";
    importResult.value = { type: "error", title: "导入异常", description: errMsg };
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* El-dialog 10px 圆角 */
.import-quiz-dialog :deep(.el-dialog) {
  border-radius: 10px;
}
.import-quiz-dialog :deep(.el-textarea__inner),
.import-quiz-dialog :deep(.el-input__wrapper) {
  border-radius: 10px;
}

.import-dialog__tabs {
  margin-top: 4px;
}
.import-dialog__form {
  margin-top: 8px;
}
.import-dialog__file {
  display: block;
  width: 100%;
}
.import-dialog__file-meta {
  margin-top: 4px;
}
.import-dialog__quota-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
}
.import-dialog__info {
  padding: 10px 14px;
  border-radius: 10px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  transition: background-color 500ms ease, border-color 500ms ease;
}
.import-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
