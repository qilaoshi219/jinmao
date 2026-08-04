<!--
============================================================================
文件名：study/ChapterQuizDialog.vue（章节测验弹窗）
文件作用：生成 5 道章节测验题 → 逐题作答 → 本地判题 → 结果与解析
遵守设计规范：Element Plus、10px 圆角、纯黑纯白文字、暗黑双轨、防重复点击
============================================================================
-->

<template>
  <el-dialog
    :model-value="visible"
    :title="'章节测验 · ' + (chapterName || '')"
    width="min(560px, 92vw)"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="(v) => $emit('update:visible', v)"
    @open="startQuiz">

    <!-- 生成中 -->
    <div v-if="step === 'generating'" class="flex flex-col items-center justify-center py-16 gap-3">
      <el-icon class="is-loading" :size="30"><Loading /></el-icon>
      <p class="text-sm text-black dark:text-white">正在生成章节测验（约需 10-30 秒）...</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">消耗少量余额</p>
    </div>

    <!-- 生成失败 -->
    <div v-else-if="error" class="py-10 text-center">
      <p class="text-sm text-red-500 mb-4">{{ error }}</p>
      <el-button type="primary" @click="startQuiz">重试</el-button>
    </div>

    <!-- 答题中 -->
    <div v-else-if="step === 'quiz' && currentQuestion">
      <!-- 进度 -->
      <div class="flex items-center justify-between mb-4">
        <span class="text-xs text-gray-400 dark:text-gray-500">
          第 {{ currentIdx + 1 }} / {{ questions.length }} 题
        </span>
        <el-tag size="small" effect="plain">{{ typeLabel(currentQuestion.type) }}</el-tag>
      </div>

      <!-- 题干 -->
      <p class="text-sm font-medium text-black dark:text-white leading-relaxed mb-4">
        {{ currentQuestion.content }}
      </p>

      <!-- 判断题 -->
      <div v-if="currentQuestion.type === 'JUDGE'" class="flex gap-3">
        <el-button
          v-for="opt in ['正确', '错误']"
          :key="opt"
          :type="answers[currentQuestionIndexKey] === opt ? 'primary' : 'default'"
          plain
          class="flex-1 rounded-[10px]"
          @click="setAnswer(opt)">
          {{ opt }}
        </el-button>
      </div>

      <!-- 单选题 -->
      <el-radio-group v-else-if="currentQuestion.type === 'SINGLE'"
                      :model-value="answers[currentQuestionIndexKey] || ''"
                      class="w-full flex flex-col gap-2"
                      @change="(v) => setAnswer(v)">
        <el-radio v-for="opt in currentQuestion.options" :key="opt.key" :value="opt.key"
                  class="w-full !mr-0 rounded-[10px] border px-3 py-2.5 !h-auto transition-colors duration-500"
                  :class="answers[currentQuestionIndexKey] === opt.key
                    ? 'border-blue-500 dark:border-blue-400'
                    : 'border-[var(--color-border)]'">
          <span class="text-black dark:text-white text-sm">{{ opt.key }}. {{ opt.value }}</span>
        </el-radio>
      </el-radio-group>

      <!-- 多选题 -->
      <div v-else class="flex flex-col gap-2">
        <el-checkbox
          v-for="opt in currentQuestion.options"
          :key="opt.key"
          :model-value="(answers[currentQuestionIndexKey] || []).includes(opt.key)"
          class="w-full !mr-0 rounded-[10px] border px-3 py-2.5 !h-auto transition-colors duration-500"
          :class="(answers[currentQuestionIndexKey] || []).includes(opt.key)
            ? 'border-blue-500 dark:border-blue-400'
            : 'border-[var(--color-border)]'"
          @change="(v) => toggleMultiple(opt.key, v)">
          <span class="text-black dark:text-white text-sm">{{ opt.key }}. {{ opt.value }}</span>
        </el-checkbox>
        <p class="text-xs text-gray-400 dark:text-gray-500">多选题：可多选</p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex justify-between mt-6">
        <el-button :disabled="currentIdx === 0" @click="currentIdx--">上一题</el-button>
        <el-button v-if="currentIdx < questions.length - 1" type="primary"
                   :disabled="!hasAnswer"
                   @click="currentIdx++">下一题</el-button>
        <el-button v-else type="primary" :disabled="!hasAnswer" @click="submitQuiz">
          交卷
        </el-button>
      </div>
    </div>

    <!-- 结果 -->
    <div v-else-if="step === 'result'">
      <div class="flex flex-col items-center py-4">
        <div class="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-black
                    transition-colors duration-500"
             :class="scorePercent >= 60
               ? 'bg-green-50 dark:bg-green-900/30 text-green-500 dark:text-green-400'
               : 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400'">
          {{ correctCount }}/{{ questions.length }}
        </div>
        <p class="mt-3 text-sm font-medium text-black dark:text-white">
          {{ scorePercent >= 80 ? '太棒了！' : scorePercent >= 60 ? '还不错，再巩固一下' : '建议复习本章后再试' }}
        </p>
      </div>

      <!-- 逐题结果 -->
      <div v-for="(q, idx) in questions" :key="idx"
           class="rounded-[10px] border p-3 mb-2 transition-colors duration-500"
           :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
        <div class="flex items-start justify-between gap-2">
          <p class="text-xs text-black dark:text-white leading-relaxed">{{ idx + 1 }}. {{ q.content }}</p>
          <span class="text-xs flex-shrink-0 font-medium"
                :class="resultItems[idx]?.isCorrect ? 'text-green-500' : 'text-red-500'">
            {{ resultItems[idx]?.isCorrect ? '正确' : '错误' }}
          </span>
        </div>
        <p v-if="q.type !== 'JUDGE'" class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          你的答案：{{ formatAnswer(answers[idx]) }}　参考答案：{{ q.answer }}
        </p>
        <p v-else class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          你的答案：{{ answers[idx] || '未作答' }}　参考答案：{{ q.answer }}
        </p>
        <p v-if="q.analysis" class="text-xs text-black dark:text-white mt-1.5 leading-relaxed">
          <span class="text-blue-500 dark:text-blue-400">解析：</span>{{ q.analysis }}
        </p>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="step === 'generating'" @click="$emit('update:visible', false)">关闭</el-button>
      <el-button v-if="step === 'result'" type="primary" :loading="step === 'generating'" @click="startQuiz">
        重新生成
      </el-button>
      <el-button v-if="step === 'result'" @click="resetQuiz">重新作答</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== 章节测验弹窗逻辑 ====================
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { generateChapterQuiz } from "../../api/books";

const props = defineProps({
  visible: { type: Boolean, default: false },
  courseId: { type: [String, Number], default: null },
  chapterId: { type: [String, Number], default: null },
  chapterName: { type: String, default: "" },
});
const emit = defineEmits(["update:visible"]);

// ========== 状态 ==========
const step = ref("generating"); // generating / quiz / result
const loading = ref(false);
const error = ref("");
const questions = ref([]);
const currentIdx = ref(0);
const answers = ref({});
const resultItems = ref([]);

// ========== 计算属性 ==========
const currentQuestion = computed(() => questions.value[currentIdx.value] || null);
const currentQuestionIndexKey = computed(() => currentIdx.value);
const hasAnswer = computed(() => {
  const v = answers.value[currentIdx.value];
  return Array.isArray(v) ? v.length > 0 : !!v;
});
const correctCount = computed(() => resultItems.value.filter((r) => r.isCorrect).length);
const scorePercent = computed(() =>
  questions.value.length ? Math.round((correctCount.value / questions.value.length) * 100) : 0
);

// ========== 类型标签 ==========
function typeLabel(type) {
  return { SINGLE: "单选题", MULTIPLE: "多选题", JUDGE: "判断题" }[type] || type;
}

// ========== 作答交互 ==========
function setAnswer(value) {
  answers.value[currentIdx.value] = value;
}

function toggleMultiple(key, checked) {
  const current = Array.isArray(answers.value[currentIdx.value]) ? [...answers.value[currentIdx.value]] : [];
  const idx = current.indexOf(key);
  if (checked && idx === -1) current.push(key);
  if (!checked && idx >= 0) current.splice(idx, 1);
  answers.value[currentIdx.value] = current;
}

function formatAnswer(v) {
  if (Array.isArray(v)) return v.join(",");
  return v || "未作答";
}

// ========== 判题 ==========
function normalizeAnswer(v) {
  return Array.isArray(v) ? [...v].sort().join(",") : String(v || "").trim();
}

function submitQuiz() {
  const items = questions.value.map((q, idx) => {
    const user = answers.value[idx];
    const isCorrect = normalizeAnswer(user) === normalizeAnswer(q.answer);
    return { isCorrect };
  });
  resultItems.value = items;
  step.value = "result";
  ElMessage.success("交卷成功，共答对 " + items.filter((i) => i.isCorrect).length + " 题");
}

// ========== 生成与重置 ==========
async function startQuiz() {
  if (!props.courseId || !props.chapterId || loading.value) return;
  step.value = "generating";
  loading.value = true;
  error.value = "";
  try {
    const result = await generateChapterQuiz(props.courseId, props.chapterId);
    if (result.code === 200 && Array.isArray(result.data?.questions) && result.data.questions.length > 0) {
      questions.value = result.data.questions;
      resetQuiz();
      step.value = "quiz";
    } else {
      error.value = result.message || "章节测验生成失败，请稍后再试";
      step.value = "generating";
    }
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || "章节测验生成失败，请稍后再试";
    step.value = "generating";
  } finally {
    loading.value = false;
  }
}

function resetQuiz() {
  currentIdx.value = 0;
  answers.value = {};
  resultItems.value = [];
  step.value = "quiz";
}

watch(
  () => props.visible,
  (v) => {
    if (v) startQuiz();
  }
);
</script>
