<!--
============================================================================
文件名：pages/reviews/index.vue（记忆曲线复习页面）
文件作用：按艾宾浩斯间隔（1/3/7/15 天）展示到期错题，一键进入错题复习
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、蓝色主色
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button size="small" text class="text-black dark:text-white" @click="goBack">返回首页</el-button>
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">记忆曲线复习</h1>
    </header>

    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[680px] mx-auto">

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-24 gap-3">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">加载复习清单中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!data || data.totalWrong === 0"
             class="text-center py-24 border border-dashed rounded-[10px] transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
          <p class="text-4xl mb-3">🧠</p>
          <p class="text-sm font-medium text-black dark:text-white mb-1">太棒了，还没有错题</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">刷题答错后，记忆曲线会自动帮你安排复习</p>
        </div>

        <template v-else>
          <!-- 汇总卡片 -->
          <div class="grid grid-cols-3 gap-3 mb-6">
            <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
              <p class="text-xl font-black text-blue-500 dark:text-blue-400">{{ data.totalWrong }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">错题总数</p>
            </div>
            <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
              <p class="text-xl font-black text-amber-500 dark:text-amber-400">{{ data.dueCount }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">今日到期</p>
            </div>
            <div class="rounded-[10px] border p-4 text-center transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
              <p class="text-xl font-black text-green-500 dark:text-green-400">{{ data.groups.length }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">教材数</p>
            </div>
          </div>

          <!-- 按教材分组 -->
          <div v-for="group in data.groups" :key="group.textbookId"
               class="rounded-[10px] border overflow-hidden mb-4 transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <div class="flex items-center justify-between px-4 py-3 border-b transition-colors duration-500"
                 :style="{ borderColor: 'var(--color-border)' }">
              <h3 class="text-sm font-bold text-black dark:text-white truncate">{{ group.textbookName }}</h3>
              <el-tag size="small" :type="group.dueCount > 0 ? 'warning' : 'info'" effect="light">
                {{ group.dueCount > 0 ? group.dueCount + ' 题待复习' : '暂无到期' }}
              </el-tag>
            </div>

            <div class="px-4 py-2">
              <div v-for="q in group.questions" :key="q.questionId"
                   class="flex items-center gap-2 py-2 border-b last:border-b-0 transition-colors duration-500"
                   :style="{ borderColor: 'var(--color-border)' }">
                <el-tag size="small" effect="plain" class="flex-shrink-0">{{ typeLabel(q.type) }}</el-tag>
                <p class="flex-1 min-w-0 text-xs text-black dark:text-white truncate">{{ q.content }}</p>
                <span class="text-[11px] flex-shrink-0" :class="q.due ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'">
                  {{ q.due ? '今日到期' : '第 ' + q.dueInDays + ' 天' }}
                </span>
                <span class="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">错 {{ q.wrongCount }} 次</span>
              </div>
            </div>

            <div class="px-4 pb-3">
              <el-button type="primary" size="small" class="w-full rounded-[10px]"
                         :loading="startingId === group.textbookId"
                         @click="startReview(group.textbookId)">
                去复习（{{ group.questions.length }} 题）
              </el-button>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
