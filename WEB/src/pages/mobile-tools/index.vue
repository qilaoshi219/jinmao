<!--
============================================================================
文件名：pages/mobile-tools/index.vue（手机端小工具列表页）
文件作用：手机端小工具卡片列表，点击进入对应工具的独立页面
设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="min-h-screen transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部导航栏 -->
    <header class="flex items-center gap-4 px-4 py-4 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button text class="!text-black dark:!text-white" @click="goBack">
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回
      </el-button>
      <h1 class="text-black dark:text-white text-base font-bold">小工具</h1>
    </header>

    <!-- 工具卡片列表 -->
    <main class="px-4 py-5 space-y-3">
      <!-- PDF 分割器 -->
      <div
        class="rounded-[10px] border p-5 cursor-pointer flex flex-col
               active:bg-gray-50 dark:active:bg-neutral-900
               transition-all duration-500"
        :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
        @click="openPdfSplitter">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 rounded-[10px] bg-red-50 dark:bg-red-900/20
                      flex items-center justify-center transition-colors duration-500">
            <svg class="w-5 h-5 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
          </div>
          <el-tag size="small" type="info" effect="plain">本地处理</el-tag>
        </div>
        <h3 class="mt-3 text-[15px] font-bold text-black dark:text-white transition-colors duration-500">
          PDF 分割器
        </h3>
        <p class="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed transition-colors duration-500">
          上传大 PDF，按页码范围一次拆分成多个小 PDF，文件不离开你的手机浏览器。
        </p>
        <div class="mt-3 text-[13px] font-medium text-blue-500 dark:text-blue-400
                    transition-colors duration-500">
          立即使用 →
        </div>
      </div>
    </main>
  </div>
</template>

<script src="./script.js"></script>
