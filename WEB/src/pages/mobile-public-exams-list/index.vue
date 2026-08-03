<!--
============================================================================
文件名：pages/mobile-public-exams-list/index.vue（手机端选择考试页）
文件作用：展示当前用户发布的所有公开考试，点击选择进入对应考试数据页
============================================================================
-->

<template>
  <div class="min-h-screen transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部导航栏 -->
    <header class="flex items-center gap-4 px-4 py-4 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button text class="!text-black dark:!text-white" @click="navigateBack">
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回
      </el-button>
      <h1 class="text-black dark:text-white text-base font-bold">选择考试</h1>
    </header>

    <main class="px-4 py-5">
      <!-- 加载中 -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="rounded-[10px] border p-5 animate-pulse transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <div class="h-5 bg-gray-200 dark:bg-neutral-800 rounded w-1/3 mb-3"/>
          <div class="h-4 bg-gray-100 dark:bg-neutral-800/50 rounded w-2/3"/>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="items.length === 0"
           class="rounded-[10px] border border-dashed p-10 text-center transition-colors duration-500"
           :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
        <p class="text-4xl mb-3">📋</p>
        <p class="text-black dark:text-white font-bold mb-1">暂无公开考试</p>
        <p class="text-sm text-gray-400">请先在题库详情页通过试卷行的三点菜单「公开为二维码考试」发布</p>
      </div>

      <!-- 考试列表 -->
      <div v-else class="space-y-3">
        <p class="text-xs text-gray-400 dark:text-gray-500">共 {{ total }} 场考试，点击进入对应考试数据</p>

        <div
          v-for="item in items"
          :key="item.token"
          class="rounded-[10px] border p-5 transition-all duration-500 cursor-pointer
                 active:bg-gray-50 dark:active:bg-neutral-900"
          :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
          @click="enterStats(item)">
          <div class="flex items-center justify-between gap-3 mb-2">
            <div class="flex items-center gap-2 min-w-0">
              <h3 class="text-black dark:text-white text-base font-bold truncate">{{ item.title }}</h3>
              <el-tag :type="item.status === 'published' ? 'success' : 'info'" size="small">
                {{ item.status === 'published' ? '进行中' : '已停止' }}
              </el-tag>
            </div>
            <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
              {{ new Date(item.updateTime).toLocaleString('zh-CN') }}
            </span>
          </div>

          <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
            题库：{{ item.textbookName }} · 试卷：{{ item.examName }} · 限时 {{ item.durationMinutes }} 分钟
          </p>

          <div class="flex items-center gap-4 text-sm">
            <span class="text-gray-400 dark:text-gray-500">
              参与 <span class="text-black dark:text-white font-bold">{{ item.totalParticipants }}</span> 人
            </span>
            <span class="text-gray-400 dark:text-gray-500">
              完成 <span class="text-black dark:text-white font-bold">{{ item.completedCount }}</span> 人
            </span>
            <span class="ml-auto text-blue-500 dark:text-blue-400 text-xs">进入数据 →</span>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="total > pageSize" class="flex justify-center pt-2">
          <el-pagination
            layout="prev, pager, next"
            :total="total"
            :page-size="pageSize"
            :current-page="page"
            @current-change="onPageChange"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
