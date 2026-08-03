<!--
============================================================================
文件名：pages/mobile-tools/pdf-splitter/index.vue（手机端 PDF 分割器独立页面）
文件作用：手机端 PDF 分割器工具页面，复用 PdfSplitterView 组件
设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center justify-between px-4 py-4 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <div>
        <h1 class="text-base font-bold text-black dark:text-white transition-colors duration-500">
          PDF 分割器
        </h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 transition-colors duration-500">
          按页码范围拆分 PDF，文件在浏览器本地处理
        </p>
      </div>
      <el-button text class="!text-black dark:!text-white" @click="goBack">返回</el-button>
    </header>

    <!-- 工具主体 -->
    <main class="flex-1 overflow-auto px-4 py-5">
      <PdfSplitterView />
    </main>
  </div>
</template>

<script src="./script.js"></script>
