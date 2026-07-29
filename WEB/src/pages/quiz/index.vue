<!--
============================================================================
文件名：pages/quiz/index.vue（刷题页面）
文件作用：金毛刷题核心页面 — 答题区 + 答题卡侧边栏 + 底部操作栏
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 刷题页面全屏布局 -->
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部信息栏 -->
    <header class="flex items-center justify-between px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <!-- 左侧：返回 + 标题 -->
      <div class="flex items-center gap-3">
        <el-button size="small" text @click="goBack" class="text-black dark:text-white">
          返回
        </el-button>
        <h1 class="text-sm font-bold text-black dark:text-white transition-colors duration-500">
          {{ textbookName }} — 智能刷题
        </h1>
      </div>

      <!-- 右侧：进度 + 题目数 -->
      <div class="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <span>{{ currentIndex }} / {{ totalCount }}</span>
        <span v-if="elapsedSeconds !== null">{{ formatTime(elapsedSeconds) }}</span>
      </div>
    </header>

    <!-- 主题内容区：flex row -->
    <div class="flex-1 flex overflow-hidden">

      <!-- 左侧答题卡面板（宽屏可见） -->
      <aside class="w-[220px] flex-shrink-0 p-3 overflow-y-auto hidden lg:block border-r transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
        <QuizAnswerSheet
          :question-statuses="questionStatuses"
          :current-index="currentIndex"
          @jump="jumpToQuestion"
        />
      </aside>

      <!-- 中间题目区 -->
      <main class="flex-1 overflow-y-auto p-5">
        <!-- 加载中 -->
        <div v-if="loading" class="flex items-center justify-center h-64">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
          <span class="ml-3 text-black dark:text-white">加载题目中...</span>
        </div>

        <!-- 题目卡片 -->
        <div v-else-if="currentQuestion" class="max-w-[700px] mx-auto">
          <QuizQuestionCard
            :question="currentQuestion"
            :index="currentIndex"
            :current-answer="currentAnswer"
            @update:answer="onAnswerChange"
          />
        </div>

        <!-- 无题目 -->
        <div v-else class="flex items-center justify-center h-64 text-gray-400">
          暂无题目
        </div>
      </main>
    </div>

    <!-- 底部操作栏 -->
    <footer class="flex items-center justify-between px-5 py-3 border-t transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <!-- 上一题 -->
      <el-button
        :disabled="currentIndex <= 1"
        @click="jumpToQuestion(currentIndex - 1)">
        上一题
      </el-button>

      <!-- 答题卡按钮（移动端可见） -->
      <el-button class="lg:hidden" @click="showAnswerSheet = !showAnswerSheet">
        答题卡
      </el-button>

      <!-- 下一题 / 交卷 -->
      <div class="flex gap-2">
        <el-button
          v-if="currentIndex < totalCount"
          type="primary"
          @click="jumpToQuestion(currentIndex + 1)">
          下一题
        </el-button>
        <el-button
          v-else
          type="primary"
          :loading="submitting"
          @click="handleSubmit">
          {{ submitting ? '交卷中...' : '交卷' }}
        </el-button>
      </div>
    </footer>

    <!-- 移动端答题卡弹窗 -->
    <el-dialog
      v-model="showAnswerSheet"
      title="答题卡"
      width="90%"
      class="answer-sheet-dialog lg:hidden">
      <QuizAnswerSheet
        :question-statuses="questionStatuses"
        :current-index="currentIndex"
        @jump="(idx) => { jumpToQuestion(idx); showAnswerSheet = false; }"
      />
    </el-dialog>
  </div>
</template>

<script src="./script.js"></script>

<style scoped>
/* El-dialog 10px 圆角 */
.answer-sheet-dialog :deep(.el-dialog) {
  border-radius: 10px;
}
</style>
