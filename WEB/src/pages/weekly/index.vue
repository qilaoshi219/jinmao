<!--
============================================================================
文件名：pages/weekly/index.vue（学习周报页面）
文件作用：展示最近 7 天学习周报 — 本周汇总卡片 + 每日学习/刷题柱状图
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、蓝色主色
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button size="small" text class="text-black dark:text-white" @click="goBack">
        返回首页
      </el-button>
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">
        学习周报
      </h1>
    </header>

    <!-- 内容区 -->
    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[640px] mx-auto">

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-24 gap-3">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">加载周报中...</span>
        </div>

        <template v-else-if="report">
          <!-- 本周汇总卡片 -->
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <div v-for="card in summaryCards" :key="card.label"
                 class="rounded-[10px] border border-l-[3px] border-l-blue-500 dark:border-l-blue-400 p-4
                        transition-colors duration-500"
                 :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
              <p class="text-[11px] font-semibold text-gray-400 dark:text-gray-500">{{ card.label }}</p>
              <p class="mt-1.5 text-lg font-black text-blue-500 dark:text-blue-400">{{ card.value }}</p>
            </div>
          </div>

          <!-- 每日柱状图 -->
          <div class="rounded-[10px] border p-5 mb-6 transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <h2 class="text-sm font-bold text-black dark:text-white mb-1 transition-colors duration-500">
              每日学习时长（分钟）
            </h2>
            <p class="text-[11px] text-gray-400 dark:text-gray-500 mb-4">
              柱高按 7 天最大值归一化，蓝色柱子下方的数字为当天答题数
            </p>

            <div class="flex items-end justify-between gap-2 h-40">
              <div v-for="d in report.days" :key="d.date"
                   class="flex-1 flex flex-col items-center gap-1.5">
                <span class="text-[10px] text-gray-400 dark:text-gray-500">{{ d.quizCount > 0 ? d.quizCount + "题" : "" }}</span>
                <div class="w-full rounded-[10px] bg-blue-500/80 dark:bg-blue-400/80 transition-all duration-500"
                     :style="{ height: barHeight(d.studySeconds) + 'px' }"
                     :class="d.active ? 'bg-blue-500 dark:bg-blue-400' : 'bg-blue-500/20 dark:bg-blue-400/20'"
                     :title="d.label + ' 学习 ' + Math.round(d.studySeconds / 60) + ' 分钟'"></div>
                <span class="text-[10px] text-black dark:text-white"
                      :class="d.isToday ? 'font-bold text-blue-500 dark:text-blue-400' : ''">
                  {{ d.weekLabel }}
                </span>
              </div>
            </div>
          </div>

          <!-- 每日明细 -->
          <div class="rounded-[10px] border overflow-hidden transition-colors duration-500"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <div class="px-4 py-3 border-b transition-colors duration-500"
                 :style="{ borderColor: 'var(--color-border)' }">
              <h2 class="text-sm font-bold text-black dark:text-white">每日明细</h2>
            </div>
            <div v-for="d in [...report.days].reverse()" :key="d.date"
                 class="flex items-center justify-between px-4 py-3 border-b last:border-b-0 transition-colors duration-500"
                 :style="{ borderColor: 'var(--color-border)' }">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-black dark:text-white">{{ d.label }}</span>
                <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ d.weekLabel }}</span>
                <el-tag v-if="d.isToday" size="small" type="primary" effect="light">今天</el-tag>
                <el-tag v-else-if="!d.active" size="small" effect="plain">未学习</el-tag>
              </div>
              <div class="text-right text-xs text-black dark:text-white space-x-3">
                <span>学习 {{ formatMin(d.studySeconds) }}</span>
                <span>刷题 {{ d.quizCount }} 题</span>
                <span :class="d.quizCount > 0 ? 'text-green-500 dark:text-green-400' : 'text-gray-400'">
                  对 {{ d.correctCount }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 无数据兜底（正常不会出现，防御） -->
        <div v-else class="text-center py-24 text-gray-400">暂无周报数据</div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
