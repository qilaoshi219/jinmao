<!--
============================================================================
文件名：study/ReviewDialog.vue（课程评价弹窗）
文件作用：查看课程平均分与其他学员评价；提交/更新/删除我的评价
遵守设计规范：Element Plus、10px 圆角、纯黑纯白文字、暗黑双轨、防重复点击
============================================================================
-->

<template>
  <el-dialog
    :model-value="visible"
    :title="'课程评价 · ' + (courseName || '')"
    width="min(560px, 92vw)"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="(v) => $emit('update:visible', v)"
    @open="loadReviews">

    <!-- 平均分 -->
    <div v-if="data" class="flex items-center gap-3 mb-4 rounded-[10px] border p-4 transition-colors duration-500"
         :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <div class="text-center">
        <p class="text-3xl font-black text-amber-500 dark:text-amber-400">{{ data.summary.avgRating.toFixed(1) }}</p>
        <p class="text-[11px] text-gray-400 dark:text-gray-500">{{ data.summary.count }} 条评价</p>
      </div>
      <el-rate :model-value="data.summary.avgRating" disabled allow-half class="ml-2" />
    </div>

    <!-- 我的评价表单 -->
    <div class="rounded-[10px] border p-3 mb-4 transition-colors duration-500"
         :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs text-gray-400 dark:text-gray-500">我的评分：</span>
        <el-rate v-model="form.rating" />
      </div>
      <el-input
        v-model="form.content"
        type="textarea"
        :rows="3"
        maxlength="1000"
        show-word-limit
        placeholder="这门课讲得怎么样？说说你的感受..."
      />
      <div class="flex justify-end gap-2 mt-2">
        <el-button v-if="myReview" size="small" type="danger" plain :loading="deleting" @click="removeMyReview">
          删除评价
        </el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">
          {{ saving ? '提交中...' : '提交评价' }}
        </el-button>
      </div>
    </div>

    <!-- 其他评价 -->
    <div v-if="data && data.reviews.length > 0">
      <p class="text-xs font-semibold text-black dark:text-white mb-2">全部评价</p>
      <div v-for="r in data.reviews" :key="r.id"
           class="rounded-[10px] border p-3 mb-2 transition-colors duration-500"
           :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-medium text-black dark:text-white">{{ r.userName }}</span>
          <el-rate :model-value="r.rating" disabled size="small" />
        </div>
        <p class="text-sm text-black dark:text-white leading-relaxed">{{ r.content || '（无文字评价）' }}</p>
      </div>
    </div>

    <p v-else-if="data" class="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
      还没有其他评价
    </p>
  </el-dialog>
</template>

<script setup>
// ==================== 课程评价弹窗逻辑 ====================
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { getCourseReviews, submitReview, deleteReview } from "../../api/books";

const props = defineProps({
  visible: { type: Boolean, default: false },
  courseId: { type: [String, Number], default: null },
  courseName: { type: String, default: "" },
});

const data = ref(null);
const form = ref({ rating: 5, content: "" });
const saving = ref(false);
const deleting = ref(false);

const myReview = computed(() => data.value?.reviews?.find((r) => r.mine) || null);

async function loadReviews() {
  if (!props.courseId) return;
  try {
    const result = await getCourseReviews(props.courseId);
    if (result.code === 200) {
      data.value = result.data;
      const mine = result.data.reviews.find((r) => r.mine);
      if (mine) form.value = { rating: mine.rating, content: mine.content };
    }
  } catch (error) {
    console.error("评价加载失败:", error);
  }
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const result = await submitReview(props.courseId, {
      rating: form.value.rating,
      content: form.value.content,
    });
    if (result.code === 200) {
      ElMessage.success("评价已提交");
      loadReviews();
    } else {
      ElMessage.error(result.message || "提交失败");
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || "提交失败");
  } finally {
    saving.value = false;
  }
}

async function removeMyReview() {
  deleting.value = true;
  try {
    const result = await deleteReview(props.courseId);
    if (result.code === 200) {
      ElMessage.success("评价已删除");
      form.value = { rating: 5, content: "" };
      loadReviews();
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || "删除失败");
  } finally {
    deleting.value = false;
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) loadReviews();
  }
);
</script>
