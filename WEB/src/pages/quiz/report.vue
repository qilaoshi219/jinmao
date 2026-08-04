<!--
============================================================================
文件名：pages/quiz/report.vue（刷题报告页面）
文件作用：展示刷题成绩报告 — 分数环、统计卡片、题目答题卡、每题解析
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、语义色
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button size="small" text @click="goBack" class="text-black dark:text-white">
        返回题库
      </el-button>
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">
        刷题报告
      </h1>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <span class="ml-3 text-black dark:text-white">加载报告中...</span>
    </div>

    <!-- 报告内容 -->
    <div v-else-if="report" class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[700px] mx-auto">

        <!-- 分数环 + 统计卡片 -->
        <div class="flex flex-col items-center mb-6">
          <!-- 环形分数图 -->
          <div class="relative w-36 h-36 mb-4">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke-width="8"
                      class="stroke-gray-200 dark:stroke-gray-700 transition-colors duration-500" />
              <circle cx="50" cy="50" r="42" fill="none" stroke-width="8"
                      stroke-linecap="round"
                      :class="scoreColorClass"
                      :stroke-dasharray="2 * Math.PI * 42"
                      :stroke-dashoffset="2 * Math.PI * 42 * (1 - scorePercent / 100)"
                      class="transition-all duration-1000" />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl font-extrabold text-black dark:text-white transition-colors duration-500">
                {{ Math.round(report.scoreTotal) }}
              </span>
              <span class="text-xs text-gray-400 dark:text-gray-500">分</span>
            </div>
          </div>

          <!-- 统计卡片 -->
          <div class="grid grid-cols-4 gap-3 w-full">
            <div class="rounded-[10px] border p-3 text-center transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
              <div class="text-lg font-bold text-black dark:text-white">{{ report.totalCount }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500">总题数</div>
            </div>
            <div class="rounded-[10px] border p-3 text-center transition-colors duration-500 text-green-500"
                 :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
              <div class="text-lg font-bold">{{ correctCount }}</div>
              <div class="text-xs">答对</div>
            </div>
            <div class="rounded-[10px] border p-3 text-center transition-colors duration-500 text-red-500"
                 :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
              <div class="text-lg font-bold">{{ wrongCount }}</div>
              <div class="text-xs">答错</div>
            </div>
            <div class="rounded-[10px] border p-3 text-center transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
              <div class="text-sm font-bold text-black dark:text-white">
                {{ report.status === 'GRADING' ? '批改中...' : report.status === 'FAILED' ? '部分失败' : '已完成' }}
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500">状态</div>
            </div>
          </div>
        </div>

        <!-- 答题卡题号 -->
        <div class="mb-6">
          <h3 class="text-sm font-bold text-black dark:text-white mb-3 transition-colors duration-500">
            答题详情
          </h3>
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="(item, idx) in report.items"
              :key="item.questionId"
              @click="expandedIdx = expandedIdx === idx ? -1 : idx"
              :class="[
                'w-full aspect-square rounded-[10px] text-xs font-medium',
                'transition-all duration-500',
                item.isCorrect === true
                  ? 'bg-green-50 text-green-600 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                  : item.isCorrect === false
                    ? 'bg-red-50 text-red-600 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
                    : 'bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
              ]">
              {{ idx + 1 }}
            </button>
          </div>
        </div>

        <!-- 展开的题目解析 -->
        <div v-if="expandedIdx >= 0" class="rounded-[10px] border p-4 mb-4 transition-all duration-500"
             :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-sm font-bold text-black dark:text-white">第 {{ expandedIdx + 1 }} 题</span>
            <span v-if="currentItem?.isCorrect === true" class="text-green-500 text-sm font-medium">正确</span>
            <span v-else-if="currentItem?.isCorrect === false" class="text-red-500 text-sm font-medium">错误</span>
            <span v-else class="text-gray-400 text-sm">批改中</span>
          </div>

          <!-- 题干 -->
          <p class="text-sm text-black dark:text-white mb-3 leading-relaxed">
            {{ currentItem?.questionContent }}
          </p>

          <!-- 用户答案 -->
          <div class="text-xs mb-2">
            <span class="text-gray-400">你的答案：</span>
            <span class="text-black dark:text-white">{{ currentItem?.userAnswer || '未作答' }}</span>
          </div>

          <!-- 参考答案 -->
          <div class="text-xs mb-3">
            <span class="text-gray-400">参考答案：</span>
            <span class="text-black dark:text-white">{{ currentItem?.referenceAnswer }}</span>
          </div>

          <!-- AI 评语（简答题） -->
          <div v-if="currentItem?.questionType === 'ESSAY' && currentItem?.aiCommentary"
               class="rounded-[10px] bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs">
            <span class="font-medium text-blue-600 dark:text-blue-400">AI 评语：</span>
            <span class="text-black dark:text-white">
              {{ currentItem.aiCommentary }}
            </span>
            <span class="text-blue-500 ml-2">
              得分: {{ currentItem.score?.toFixed(1) }} / {{ currentItem.maxScore?.toFixed(1) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无数据 -->
    <div v-else class="flex-1 flex items-center justify-center text-gray-400">
      报告数据不存在
    </div>
  </div>
</template>

<script src="./report-script.js"></script>
