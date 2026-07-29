<!--
============================================================================
文件名：QuizQuestionCard.vue（题目卡片组件）
文件作用：刷题页核心题目卡片容器，显示题号、题型标签、题干内容、答题区域
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 题目卡片容器 -->
  <div class="rounded-[10px] border p-6 transition-all duration-500"
       :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">

    <!-- 题号 + 题型标签 -->
    <div class="flex items-center gap-2 mb-4">
      <span class="text-sm font-bold text-black dark:text-white transition-colors duration-500">
        第 {{ index }} 题
      </span>
      <QuizTypeTag :type="question.type" />
    </div>

    <!-- 题干内容 -->
    <p class="text-black dark:text-white text-[15px] leading-relaxed mb-5
              transition-colors duration-500">
      {{ question.stemText }}
    </p>

    <!-- 答题区域（按题型分发） -->
    <div class="mt-2">
      <!-- 单选题选项 -->
      <QuizChoiceList
        v-if="question.type === 'single'"
        :options="question.options || []"
        :selected="currentAnswer"
        :multiple="false"
        @update:selected="$emit('update:answer', $event)"
      />

      <!-- 多选题选项 -->
      <QuizChoiceList
        v-else-if="question.type === 'multiple'"
        :options="question.options || []"
        :selected="currentAnswer || []"
        :multiple="true"
        @update:selected="$emit('update:answer', $event)"
      />

      <!-- 判断题 -->
      <QuizJudgeChoice
        v-else-if="question.type === 'judge'"
        :selected="currentAnswer"
        @update:selected="$emit('update:answer', $event)"
      />

      <!-- 填空题 -->
      <QuizFillBlank
        v-else-if="question.type === 'fill'"
        :model-value="currentAnswer || ''"
        :placeholder="question.placeholder || '请输入答案...'"
        :tip="question.tip || ''"
        @update:model-value="$emit('update:answer', $event)"
      />

      <!-- 简答题 -->
      <QuizEssay
        v-else-if="question.type === 'essay'"
        :model-value="currentAnswer || ''"
        :placeholder="question.placeholder || '请在此输入答案'"
        :max-length="question.maxLength || 500"
        :tip="question.tip || ''"
        @update:model-value="$emit('update:answer', $event)"
      />
    </div>
  </div>
</template>

<script setup>
// ==================== QuizQuestionCard 逻辑 ====================
// 职责：根据题目类型渲染不同的答题组件，通过 v-model 双向绑定答案

import QuizTypeTag from "./QuizTypeTag.vue";
import QuizChoiceList from "./QuizChoiceList.vue";
import QuizJudgeChoice from "./QuizJudgeChoice.vue";
import QuizFillBlank from "./QuizFillBlank.vue";
import QuizEssay from "./QuizEssay.vue";

// ========== Props ==========
defineProps({
  /** 题目数据 { id, index, type, stemText, options?, placeholder?, maxLength?, tip? } */
  question: { type: Object, required: true },
  /** 题号 */
  index: { type: Number, required: true },
  /** 当前答案值 */
  currentAnswer: { type: [String, Array], default: null },
});

// ========== Emits ==========
defineEmits(["update:answer"]);
</script>
