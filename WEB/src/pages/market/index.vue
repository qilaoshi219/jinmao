<!--
============================================================================
文件名：index.vue（题库市场页面入口组件）
所属目录：src/pages/market/
文件作用：展示所有共享题库的市场页面，支持搜索、分页、借用/取消借用
设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、Element Plus 优先、暗黑双轨适配
============================================================================
-->

<template>
  <!-- ========== 题库市场主容器 ========== -->
  <div class="flex flex-col h-full">
    <!-- ========== 页面标题区 ========== -->
    <div class="mb-4">
      <h2 class="text-lg font-bold text-black dark:text-white transition-colors duration-500">
        题库市场
      </h2>
      <p class="text-[13px] text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-500">
        浏览其他用户共享的题库，借用后即可在自己的题库列表中使用
      </p>
    </div>

    <!-- ========== 搜索栏 ========== -->
    <div class="mb-4 flex items-center gap-3">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索题库名称..."
        :prefix-icon="Search"
        clearable
        class="max-w-[320px]"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- ========== 题库卡片网格 ========== -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <el-icon class="is-loading" :size="28"><Loading /></el-icon>
      <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">加载中...</span>
    </div>

    <!-- 空态 -->
    <div v-else-if="marketList.length === 0" class="flex flex-col items-center justify-center py-16">
      <svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ searchKeyword ? '没有找到匹配的题库' : '暂无共享题库' }}
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {{ searchKeyword ? '试试其他关键词' : '有用户共享题库后，将在此处显示' }}
      </p>
    </div>

    <!-- 题库卡片列表 -->
    <div v-else class="flex-1 overflow-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        <div
          v-for="tb in marketList"
          :key="tb.id"
          class="rounded-[10px] border border-[var(--color-border)]
                 bg-[var(--color-card)] p-4
                 transition-all duration-500 hover:shadow-md"
        >
          <!-- 题库名称 -->
          <h3 class="text-[15px] font-bold text-black dark:text-white
                     transition-colors duration-500 truncate">
            {{ tb.name }}
          </h3>

          <!-- 题库描述 -->
          <p v-if="tb.description" class="text-[13px] text-gray-500 dark:text-gray-400
                     mt-1.5 line-clamp-2 transition-colors duration-500">
            {{ tb.description }}
          </p>

          <!-- 题库信息 -->
          <div class="flex items-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-400
                      transition-colors duration-500">
            <span>{{ tb.totalQuestions }} 题</span>
            <span>{{ tb.totalExams }} 套试卷</span>
          </div>

          <!-- 创建者信息 -->
          <div class="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500
                      transition-colors duration-500">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span>{{ tb.creatorNickname || '未知用户' }}</span>
          </div>

          <!-- 操作按钮 -->
          <div class="mt-3 pt-3 border-t border-[var(--color-border)]
                      transition-colors duration-500">
            <!-- 自己的共享题库：显示标签 -->
            <el-tag v-if="tb.isOwner" type="info" size="small" class="w-full justify-center">
              自己的题库
            </el-tag>
            <!-- 已借用的题库：显示已借用 -->
            <el-button
              v-else-if="tb.isBorrowed"
              type="info"
              plain
              size="small"
              disabled
              class="w-full"
            >
              已借用
            </el-button>
            <!-- 可借用：显示借用按钮 -->
            <el-button
              v-else
              type="primary"
              size="small"
              class="w-full"
              :loading="borrowingId === tb.id"
              :disabled="borrowingId === tb.id"
              @click="handleBorrow(tb)"
            >
              {{ borrowingId === tb.id ? '借用中...' : '借用' }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 分页 ========== -->
    <div v-if="total > 0" class="flex justify-center mt-4 pt-2">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup>
// 引用同目录下的独立业务逻辑文件
// 注意：script.js 导出的是一个工厂函数，需要调用获取实例
import useMarketScript from './script.js';
const {
  marketList,
  loading,
  searchKeyword,
  currentPage,
  pageSize,
  total,
  borrowingId,
  Search,
  handleBorrow,
  handleSearch,
  handlePageChange,
  loadMarketList,
} = useMarketScript();

// 暴露 loadMarketList 给父组件在菜单切换时调用
defineExpose({ loadMarketList });
</script>
