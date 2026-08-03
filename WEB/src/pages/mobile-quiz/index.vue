<!--
============================================================================
文件名：pages/mobile-quiz/index.vue（手机端刷题页面）
文件作用：手机端刷题核心页面 — 题库选择 / 答题区 / 答题卡弹窗 / 底部操作栏
        报告子视图通过 /mobile/quiz/report 渲染（report.vue）
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <!-- 刷题报告子视图（quizParams.mode === "report" 时渲染） -->
  <MobileQuizReport v-if="isReportMode" />

  <!-- 刷题页面全屏布局 -->
  <div v-else class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部信息栏 -->
    <header class="flex items-center justify-between px-4 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <!-- 左侧：返回 + 标题 -->
      <div class="flex items-center gap-2 min-w-0">
        <el-button size="small" text @click="goBack" class="text-black dark:text-white flex-shrink-0">
          返回
        </el-button>
        <h1 class="text-[13px] font-bold text-black dark:text-white truncate transition-colors duration-500">
          {{ hasSession ? textbookName + ' — 智能刷题' : '习题训练' }}
        </h1>
      </div>

      <!-- 右侧：进度 + 题目数 -->
      <div v-if="hasSession" class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
        <span>{{ currentIndex }} / {{ totalCount }}</span>
        <span v-if="elapsedSeconds !== null">{{ formatTime(elapsedSeconds) }}</span>
      </div>
    </header>

    <!-- ===== 题库选择模式（无 sessionId） ===== -->
    <div v-if="!hasSession" class="flex-1 overflow-y-auto px-4 py-5">
      <h2 class="text-black dark:text-white text-base font-bold mb-1 transition-colors duration-500">
        选择题库
      </h2>
      <p class="text-xs text-gray-400 dark:text-gray-500 mb-4 transition-colors duration-500">
        选择一个题库，开始随机或顺序刷题
      </p>

      <!-- 加载骨架 -->
      <div v-if="textbookLoading" class="space-y-3">
        <div v-for="n in 3" :key="'sk-' + n"
             class="rounded-[10px] border p-4 animate-pulse transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <div class="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-2/3 mb-3"/>
          <div class="h-3 bg-gray-100 dark:bg-neutral-800/50 rounded w-1/3"/>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="textbooks.length === 0"
           class="rounded-[10px] border border-dashed p-10 text-center transition-colors duration-500"
           :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
        <p class="text-4xl mb-3">📚</p>
        <p class="text-black dark:text-white font-bold mb-1 transition-colors duration-500">暂无题库</p>
        <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">去题库市场借用或导入题库后即可刷题</p>
        <el-button type="primary" size="small" @click="goToMarket">
          前往题库市场
        </el-button>
      </div>

      <!-- 题库卡片列表 -->
      <div v-else class="space-y-3">
        <div
          v-for="tb in textbooks"
          :key="tb.id"
          class="rounded-[10px] border p-4 transition-colors duration-500"
          :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <!-- 名称 + 标签 -->
          <div class="flex items-center gap-2 mb-2">
            <h3 class="flex-1 min-w-0 text-[14px] font-bold text-black dark:text-white truncate
                       transition-colors duration-500">
              {{ tb.name }}
            </h3>
            <el-tag v-if="tb.ownType === 'borrowed'" type="info" size="small" class="flex-shrink-0">
              借用的
            </el-tag>
            <el-tag v-else-if="tb.isShared" type="success" size="small" class="flex-shrink-0">
              已共享
            </el-tag>
          </div>

          <!-- 题目信息 -->
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-3 transition-colors duration-500">
            {{ tb.totalQuestions || 0 }} 题
            <template v-if="tb.totalExams"> · {{ tb.totalExams }} 套试卷</template>
          </p>

          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <el-button
              type="primary"
              size="small"
              class="flex-1"
              :loading="startingId === 'rnd_' + tb.id"
              :disabled="!!startingId"
              @click="onStartRandom(tb.id)">
              {{ startingId === 'rnd_' + tb.id ? '进入中...' : '随机刷题' }}
            </el-button>
            <el-button
              type="success"
              size="small"
              class="flex-1"
              :loading="startingId === 'seq_' + tb.id"
              :disabled="!!startingId"
              @click="onStartSequential(tb.id)">
              {{ startingId === 'seq_' + tb.id ? '进入中...' : '顺序刷题' }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 答题模式（有 sessionId） ===== -->
    <template v-else>
      <!-- 中间题目区 -->
      <main class="flex-1 overflow-y-auto px-4 py-4 pb-28">
        <!-- 加载中 -->
        <div v-if="loading" class="flex items-center justify-center h-64">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
          <span class="ml-3 text-black dark:text-white">加载题目中...</span>
        </div>

        <!-- 题目卡片 -->
        <div v-else-if="currentQuestion">
          <QuizQuestionCard
            :question="currentQuestion"
            :index="currentIndex"
            :current-answer="currentAnswer"
            @update:answer="onAnswerChange"
          />
        </div>

        <!-- 无题目 -->
        <div v-else class="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
          暂无题目
        </div>
      </main>

      <!-- 底部操作栏（固定） -->
      <footer class="fixed bottom-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-3 border-t
                     transition-colors duration-500"
              :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
        <!-- 上一题 -->
        <el-button
          :disabled="currentIndex <= 1"
          @click="jumpToQuestion(currentIndex - 1)">
          上一题
        </el-button>

        <!-- 答题卡按钮 -->
        <el-button @click="showAnswerSheet = true">
          答题卡
        </el-button>

        <!-- 下一题 / 交卷 -->
        <el-button
          v-if="currentIndex < totalCount"
          type="primary"
          class="flex-1"
          @click="jumpToQuestion(currentIndex + 1)">
          下一题
        </el-button>
        <el-button
          v-else
          type="primary"
          class="flex-1"
          :loading="submitting"
          @click="handleSubmit">
          {{ submitting ? '交卷中...' : '交卷' }}
        </el-button>
      </footer>

      <!-- 答题卡弹窗 -->
      <el-dialog
        v-model="showAnswerSheet"
        title="答题卡"
        width="88%"
        class="mobile-answer-sheet-dialog">
        <QuizAnswerSheet
          :question-statuses="questionStatuses"
          :current-index="currentIndex"
          @jump="(idx) => { jumpToQuestion(idx); showAnswerSheet = false; }"
        />
      </el-dialog>
    </template>
  </div>
</template>

<script src="./script.js"></script>

<style scoped>
/* El-dialog 10px 圆角 */
.mobile-answer-sheet-dialog :deep(.el-dialog) {
  border-radius: 10px;
}
</style>
