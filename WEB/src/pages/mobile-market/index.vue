<!--
============================================================================
文件名：pages/mobile-market/index.vue（手机端题库市场页面）
文件作用：展示所有共享题库的市场页面，支持搜索、分页、借用
        业务逻辑复用桌面端 market/script.js 的工厂函数
设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、Element Plus 优先、暗黑双轨适配
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
      <h1 class="text-black dark:text-white text-base font-bold">题库市场</h1>
    </header>

    <!-- 主内容区 -->
    <main class="px-4 py-5">

      <!-- 搜索栏 -->
      <div class="mb-4 flex items-center gap-2">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索题库名称..."
          :prefix-icon="Search"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="flex items-center justify-center py-16">
        <el-icon class="is-loading" :size="28"><Loading /></el-icon>
        <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">加载中...</span>
      </div>

      <!-- 空态 -->
      <div v-else-if="marketList.length === 0" class="flex flex-col items-center justify-center py-16">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ searchKeyword ? '没有找到匹配的题库' : '暂无共享题库' }}
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {{ searchKeyword ? '试试其他关键词' : '有用户共享题库后，将在此处显示' }}
        </p>
      </div>

      <!-- 题库卡片列表 -->
      <div v-else class="space-y-3">
        <div
          v-for="tb in marketList"
          :key="tb.id"
          class="rounded-[10px] border p-4 transition-all duration-500"
          :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">
          <!-- 题库名称 -->
          <h3 class="text-[15px] font-bold text-black dark:text-white truncate transition-colors duration-500">
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
            <span class="ml-auto flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              {{ tb.creatorNickname || '未知用户' }}
            </span>
          </div>

          <!-- 操作按钮 -->
          <div class="mt-3 pt-3 border-t transition-colors duration-500"
               :style="{ borderColor: 'var(--color-border)' }">
            <el-tag v-if="tb.isOwner" type="info" size="small" class="w-full justify-center">
              自己的题库
            </el-tag>
            <el-button
              v-else-if="tb.isBorrowed"
              type="info"
              plain
              size="small"
              disabled
              class="w-full">
              已借用
            </el-button>
            <el-button
              v-else
              type="primary"
              size="small"
              class="w-full"
              :loading="borrowingId === tb.id"
              :disabled="borrowingId === tb.id"
              @click="handleBorrow(tb)">
              {{ borrowingId === tb.id ? '借用中...' : '借用' }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="total > 0" class="flex justify-center mt-4 pt-2">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
// 复用桌面端题库市场业务逻辑（工厂函数，无页面依赖）
import { inject } from "vue";
import useMarketScript from "../market/script.js";

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

// 返回上一页
const navigate = inject("navigate", () => {});
const navigateBack = inject("goBack", () => navigate("mobile-home"));
function goBack() {
  navigateBack();
}

// 首次进入加载列表
loadMarketList();
</script>
