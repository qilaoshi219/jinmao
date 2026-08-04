<!--
============================================================================
文件名：pages/leaderboard/index.vue（排行榜页面）
文件作用：展示学习时长榜 / 刷题量榜 Top 20（支持 7 天 / 30 天窗口切换）
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
        排行榜
      </h1>
    </header>

    <!-- 内容区 -->
    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[640px] mx-auto">

        <!-- 筛选栏 -->
        <div class="flex items-center justify-between mb-5">
          <div class="flex rounded-[10px] border overflow-hidden transition-colors duration-500"
               :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
            <button
              v-for="t in typeOptions"
              :key="t.value"
              class="px-4 py-2 text-[13px] transition-all duration-500"
              :class="activeType === t.value
                ? 'bg-blue-500 dark:bg-blue-400 text-white font-semibold'
                : 'text-black dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20'"
              @click="switchType(t.value)">
              {{ t.label }}
            </button>
          </div>

          <div class="flex rounded-[10px] border overflow-hidden transition-colors duration-500"
               :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
            <button
              v-for="d in dayOptions"
              :key="d.value"
              class="px-3 py-2 text-[13px] transition-all duration-500"
              :class="activeDays === d.value
                ? 'bg-blue-500 dark:bg-blue-400 text-white font-semibold'
                : 'text-black dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20'"
              @click="switchDays(d.value)">
              {{ d.label }}
            </button>
          </div>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-24 gap-3">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">加载排行中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="list.length === 0"
             class="text-center py-24 border border-dashed rounded-[10px] transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
          <p class="text-sm font-medium text-black dark:text-white mb-1">暂无排行数据</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            大家学习起来，榜单就会热闹起来
          </p>
        </div>

        <!-- 排行榜列表 -->
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="item in list"
            :key="item.rank"
            class="flex items-center gap-3 rounded-[10px] border px-4 py-3 transition-all duration-500"
            :style="{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)'
            }"
            :class="item.rank <= 3 ? 'border-l-[3px] border-l-amber-400 dark:border-l-amber-500' : ''">

            <!-- 名次 -->
            <div class="w-8 text-center">
              <span v-if="item.rank <= 3" class="text-lg">{{ ["🥇", "🥈", "🥉"][item.rank - 1] }}</span>
              <span v-else class="text-sm font-mono font-bold text-gray-400 dark:text-gray-500">{{ item.rank }}</span>
            </div>

            <!-- 头像 -->
            <div class="w-9 h-9 rounded-full bg-blue-500 dark:bg-blue-400 text-white
                        flex items-center justify-center text-sm font-bold flex-shrink-0">
              {{ (item.name || "匿").charAt(0) }}
            </div>

            <!-- 昵称 -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-black dark:text-white truncate transition-colors duration-500">
                {{ item.name }}
              </p>
              <p class="text-[11px] text-gray-400 dark:text-gray-500">
                第 {{ item.rank }} 名
              </p>
            </div>

            <!-- 数值 -->
            <div class="text-right">
              <p class="text-sm font-black text-blue-500 dark:text-blue-400">
                {{ activeType === "study" ? formatDuration(item.value) : item.value + " 题" }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
