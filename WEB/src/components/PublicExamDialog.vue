<!--
============================================================================
文件名：PublicExamDialog.vue（公开考试发布弹窗）
文件作用：发布/管理二维码考试 — 限时、简答判题模式、关键词、乱序、二维码与链接
============================================================================
-->

<template>
  <el-dialog
    :model-value="modelValue"
    title="公开为二维码考试"
    width="min(92vw, 560px)"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="handleOpen"
  >
    <!-- 加载中 -->
    <div v-if="loading" class="py-8 text-center text-gray-400">加载中...</div>

    <!-- 表单阶段 -->
    <template v-else-if="!published">
      <div class="mb-4">
        <p class="text-sm font-bold text-black dark:text-white mb-1">{{ form.name }}</p>
        <p class="text-xs text-gray-400">{{ form.essayQuestions.length }} 道简答题 · 发布后锁定题目</p>
      </div>

      <!-- 限时时长 -->
      <div class="mb-4">
        <label class="block text-sm text-black dark:text-white mb-1">单场限时（分钟）</label>
        <el-input-number v-model="durationMinutes" :min="1" :max="600" :step="5" />
        <p class="text-xs text-gray-400 mt-1">时间到将自动交卷，进入考试后开始倒计时</p>
      </div>

      <!-- 简答题判题模式 -->
      <div class="mb-4">
        <label class="block text-sm text-black dark:text-white mb-2">简答题判题模式</label>
        <el-radio-group v-model="essayMode" class="flex flex-col items-start gap-2">
          <el-radio value="ai" :disabled="!aiGradingAvailable">
            AI 智能判分
            <span class="text-xs text-gray-400 ml-2">（判分更灵活，有 API 费用和延迟）</span>
            <span v-if="!aiGradingAvailable" class="text-xs text-red-500 dark:text-red-400 ml-2">
              余额不足，暂不启用
            </span>
          </el-radio>
          <el-radio value="strict">严格模式（关键词判分）<span class="text-xs text-gray-400 ml-2">（需为每道简答题填写关键词）</span></el-radio>
          <el-radio value="full">默认满分<span class="text-xs text-gray-400 ml-2">（简答题不判分，直接给满分）</span></el-radio>
        </el-radio-group>
        <p v-if="!aiGradingAvailable" class="mt-2 text-xs text-red-500 dark:text-red-400">
          当前余额不足（¥{{ Number(balance || 0).toFixed(2) }}），AI 判题暂不可用，请先充值后重试；可先使用「严格模式」或「默认满分」。
        </p>
      </div>

      <!-- 严格模式关键词 -->
      <div v-if="essayMode === 'strict'" class="mb-4 rounded-[10px] border p-3"
           :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
        <p class="text-xs text-gray-400 mb-2">为每道简答题填写关键词（用顿号分隔），考生答案须包含全部关键词才得分</p>
        <div v-if="form.essayQuestions.length === 0" class="text-sm text-gray-400">该试卷没有简答题</div>
        <div v-for="(q, idx) in form.essayQuestions" :key="q.id" class="mb-3 last:mb-0">
          <p class="text-xs text-black dark:text-white mb-1 truncate">{{ idx + 1 }}. {{ q.content }}</p>
          <el-input v-model="keywordMap[q.id]" placeholder="如：关键词甲、关键词乙" size="small" />
        </div>
      </div>

      <!-- 乱序 -->
      <div class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-sm text-black dark:text-white">题目乱序</p>
          <p class="text-xs text-gray-400">每位考生题目顺序不同，防邻座抄袭</p>
        </div>
        <el-switch v-model="shuffle" />
      </div>
    </template>

    <!-- 发布成功：二维码 + 链接 -->
    <template v-else>
      <div class="flex flex-col items-center py-2">
        <div class="rounded-[10px] border p-3 mb-3"
             :style="{ borderColor: 'var(--color-border)', backgroundColor: '#fff' }">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="考试二维码" class="w-48 h-48 block" />
        </div>
        <p class="text-sm font-bold text-black dark:text-white mb-1">扫码即可开始考试</p>
        <p class="text-xs text-gray-400 mb-3">请将二维码或链接发送给考生</p>

        <div class="w-full flex items-center gap-2 rounded-[10px] border px-3 py-2 mb-4"
             :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
          <span class="text-xs text-gray-400 flex-1 truncate">{{ examLink }}</span>
          <el-button size="small" @click="copyLink">复制</el-button>
        </div>

        <div class="w-full flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <el-tag :type="publicExam.status === 'published' ? 'success' : 'info'" size="small">
              {{ publicExam.status === 'published' ? '考试进行中' : '已停止' }}
            </el-tag>
          </div>
          <div class="flex gap-2">
            <el-button size="small" @click="published = false">修改配置</el-button>
            <el-button size="small" @click="goStats">查看数据</el-button>
            <el-button size="small" :type="publicExam.status === 'published' ? 'danger' : 'success'"
                       :loading="statusLoading" @click="toggleStatus">
              {{ publicExam.status === 'published' ? '停止考试' : '恢复考试' }}
            </el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- 弹窗底部按钮 -->
    <template #footer>
      <div v-if="!published" class="flex justify-end gap-2">
        <el-button @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="handlePublish">
          {{ publishing ? '发布中...' : '发布考试' }}
        </el-button>
      </div>
      <div v-else class="flex justify-end">
        <el-button type="primary" @click="$emit('update:modelValue', false)">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== 公开考试发布弹窗逻辑 ====================

import { ref, reactive, computed, watch } from "vue";
import QRCode from "qrcode";
import { ElMessage } from "element-plus";
import { getPublishForm, publishExam, setExamStatus } from "../api/public-exam";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  examId: { type: String, required: true },
});

const emit = defineEmits(["update:modelValue", "published"]);

// ========== 状态 ==========
const loading = ref(false);
const publishing = ref(false);
const statusLoading = ref(false);
const published = ref(false);

const form = reactive({
  name: "",
  essayQuestions: [],
});

const durationMinutes = ref(60);
const essayMode = ref("full");
const keywordMap = reactive({});
const shuffle = ref(false);
const aiGradingAvailable = ref(true);
const balance = ref("0");

const publicExam = reactive({
  token: "",
  status: "published",
});
const qrDataUrl = ref("");

// ========== 计算属性 ==========
const examLink = computed(() => {
  if (!publicExam.token) return "";
  return window.location.origin + "/p/" + publicExam.token;
});

// ========== 数据加载 ==========

function parseKeywords(raw) {
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

async function handleOpen() {
  loading.value = true;
  published.value = false;
  try {
    const result = await getPublishForm(props.examId);
    if (result.code === 0 && result.data) {
      form.name = result.data.name;
      form.essayQuestions = result.data.essayQuestions || [];
      aiGradingAvailable.value = result.data.aiGradingAvailable !== false;
      balance.value = result.data.balance || "0";

      const existing = result.data.publicExam;
      if (existing) {
        durationMinutes.value = existing.durationMinutes || 60;
        essayMode.value = existing.essayMode || "full";
        shuffle.value = !!existing.shuffle;
        Object.keys(keywordMap).forEach((k) => delete keywordMap[k]);
        Object.entries(parseKeywords(existing.essayKeywords)).forEach(([qid, kws]) => {
          keywordMap[qid] = Array.isArray(kws) ? kws.join("、") : String(kws || "");
        });
        // 余额不足时若原本选的是 AI 判题，自动切回默认满分，避免发布被拒
        if (!aiGradingAvailable.value && essayMode.value === "ai") {
          essayMode.value = "full";
          ElMessage.warning("余额不足，AI 判题暂不可用，已切换为默认满分");
        }
        // 已发布 → 直接展示二维码（关闭弹窗后可再次打开，无需重新发布）
        publicExam.token = existing.token;
        publicExam.status = existing.status;
        qrDataUrl.value = await QRCode.toDataURL(window.location.origin + "/p/" + existing.token, {
          width: 360,
          margin: 1,
        });
        published.value = true;
      } else {
        published.value = false;
        durationMinutes.value = 60;
        essayMode.value = "full";
        shuffle.value = false;
        Object.keys(keywordMap).forEach((k) => delete keywordMap[k]);
      }
    } else {
      ElMessage.error(result.message || "加载发布信息失败");
    }
  } catch (error) {
    ElMessage.error("加载发布信息失败: " + (error.message || "未知错误"));
  } finally {
    loading.value = false;
  }
}

// ========== 发布 ==========

async function handlePublish() {
  if (publishing.value) return;
  publishing.value = true;

  const essayKeywords = {};
  for (const q of form.essayQuestions) {
    const text = (keywordMap[q.id] || "").trim();
    if (essayMode.value === "strict" && text) {
      essayKeywords[q.id] = text.split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean);
    }
  }

  try {
    const result = await publishExam({
      examId: props.examId,
      durationMinutes: durationMinutes.value,
      essayMode: essayMode.value,
      essayKeywords,
      shuffle: shuffle.value,
    });
    if (result.code === 0 && result.data) {
      publicExam.token = result.data.token;
      publicExam.status = result.data.status;
      qrDataUrl.value = await QRCode.toDataURL(examLink.value, { width: 360, margin: 1 });
      published.value = true;
      emit("published");
      ElMessage.success(result.message || "发布成功");
    } else {
      ElMessage.error(result.message || "发布失败");
    }
  } catch (error) {
    console.error("[PublicExamDialog] 发布失败:", error);
    ElMessage.error("发布失败: " + (error.message || "未知错误"));
  } finally {
    publishing.value = false;
  }
}

// ========== 管理操作 ==========

async function copyLink() {
  try {
    await navigator.clipboard.writeText(examLink.value);
    ElMessage.success("链接已复制");
  } catch (_) {
    ElMessage.warning("复制失败，请手动复制");
  }
}

async function toggleStatus() {
  if (statusLoading.value) return;
  statusLoading.value = true;
  try {
    const next = publicExam.status === "published" ? "closed" : "published";
    const result = await setExamStatus(publicExam.token, next);
    if (result.code === 0) {
      publicExam.status = result.data.status;
      ElMessage.success(result.data.status === "closed" ? "考试已停止" : "考试已恢复");
    } else {
      ElMessage.error(result.message || "操作失败");
    }
  } catch (error) {
    ElMessage.error("操作失败: " + (error.message || "未知错误"));
  } finally {
    statusLoading.value = false;
  }
}

function goStats() {
  emit("update:modelValue", false);
  // 跳转到考试数据页（由父组件通过事件处理导航）
  emit("viewStats", publicExam.token);
}

// 关闭时重置二维码显示
watch(
  () => props.modelValue,
  (val) => {
    if (!val) {
      published.value = false;
      qrDataUrl.value = "";
    }
  }
);
</script>
