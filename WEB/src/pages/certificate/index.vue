<!--
============================================================================
文件名：pages/certificate/index.vue（结业证书页面）
文件作用：检查课程结业状态；学完则用 Canvas 生成结业证书并支持下载 PNG
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button size="small" text class="text-black dark:text-white" @click="goBack">返回学习</el-button>
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">结业证书</h1>
    </header>

    <main class="flex-1 overflow-y-auto p-5">
      <div class="max-w-[680px] mx-auto flex flex-col items-center">

        <!-- 加载中 -->
        <div v-if="loading" class="flex flex-col items-center py-24 gap-3">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="text-sm text-black dark:text-white">检查结业状态中...</span>
        </div>

        <!-- 加载失败 -->
        <div v-else-if="error" class="py-24 text-center">
          <p class="text-sm text-red-500 mb-4">{{ error }}</p>
          <el-button type="primary" @click="loadStatus">重试</el-button>
        </div>

        <!-- 未完成 -->
        <div v-else-if="status && !status.canIssue" class="py-16 text-center">
          <p class="text-4xl mb-4">📖</p>
          <p class="text-sm font-bold text-black dark:text-white mb-2">
            还差一点点就能结业啦
          </p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-6">
            已完成 {{ status.finishedChapters }} / {{ status.totalChapters }} 章，学完全部章节即可生成证书
          </p>
          <div class="w-64 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-6 transition-colors duration-500">
            <div class="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500"
                 :style="{ width: progressPercent + '%' }"></div>
          </div>
          <el-button type="primary" @click="goBack">继续学习</el-button>
        </div>

        <!-- 证书 -->
        <template v-else-if="status">
          <canvas ref="canvasRef" width="1200" height="850"
                  class="w-full rounded-[10px] border shadow-lg mb-5 transition-colors duration-500"
                  :style="{ borderColor: 'var(--color-border)' }"></canvas>
          <div class="flex gap-3">
            <el-button type="primary" :loading="downloading" @click="downloadCertificate">
              {{ downloading ? '生成图片中...' : '下载证书' }}
            </el-button>
            <el-button @click="goBack">返回学习</el-button>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
