<!--
============================================================================
文件名：pages/mobile-billing/index.vue（手机端账单页面模板）
文件作用：显示用户 VIP 等级、开通计划、余额、已使用金额和扣费/充值记录列表
        记录以卡片式列表展示，适配小屏
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="min-h-screen transition-all duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部导航栏 -->
    <header class="flex items-center justify-between px-4 py-4 border-b
                   transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <button @click="goBack"
              class="flex items-center gap-1.5 text-[13px] font-medium
                     text-black dark:text-white
                     hover:text-blue-500 dark:hover:text-blue-400
                     transition-colors duration-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回
      </button>
      <h1 class="text-base font-bold text-black dark:text-white transition-colors duration-500">
        账单
      </h1>
      <div class="w-12" />
    </header>

    <!-- 主内容区 -->
    <div class="px-4 py-5">

      <!-- 加载中状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <span class="text-sm text-gray-500 dark:text-gray-400">加载中...</span>
      </div>

      <!-- 加载失败 -->
      <div v-else-if="error"
           class="flex flex-col items-center justify-center py-20 gap-3">
        <p class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>
        <el-button size="small" @click="loadData(1)">重新加载</el-button>
      </div>

      <!-- 正常内容 -->
      <template v-else>
        <!-- 账务摘要卡片 -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="rounded-[10px] p-4 transition-colors duration-500 border"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">VIP 等级</p>
            <p class="text-lg font-bold text-black dark:text-white">{{ vipLevelLabel }}</p>
          </div>
          <div class="rounded-[10px] p-4 transition-colors duration-500 border"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">开通计划</p>
            <p class="text-lg font-bold text-black dark:text-white">{{ planLabel }}</p>
          </div>
        </div>

        <!-- 余额卡片 -->
        <div class="rounded-[10px] p-4 mb-3 transition-colors duration-500 border
                    flex items-center justify-between"
             :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <p class="text-xs text-gray-500 dark:text-gray-400">余额</p>
              <span v-if="balanceLocked"
                    class="text-[10px] px-1.5 py-0.5 rounded-[4px]
                           bg-red-50 dark:bg-red-900/30
                           text-red-500 dark:text-red-400
                           border border-red-200 dark:border-red-800
                           font-medium">
                已锁定
              </span>
            </div>
            <p class="text-lg font-bold text-black dark:text-white">¥{{ formattedBalance }}</p>
          </div>
          <el-button type="warning" size="default" @click="goRedeem">
            去兑换码
          </el-button>
        </div>

        <!-- 已使用金额卡片 -->
        <div class="rounded-[10px] p-4 mb-4 transition-colors duration-500 border"
             :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">已使用金额</p>
          <p class="text-lg font-bold text-red-500 dark:text-red-400">¥{{ formattedTotalUsed }}</p>
        </div>

        <!-- 记录明细（消费 / 充值选项卡） -->
        <div class="rounded-[10px] border overflow-hidden transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
          <el-tabs v-model="activeTab">

            <!-- 消费记录 Tab -->
            <el-tab-pane label="消费记录" name="consume">
              <!-- 空状态 -->
              <div v-if="records.length === 0" class="py-10 text-center">
                <p class="text-sm text-gray-400 dark:text-gray-500">暂无消费记录</p>
              </div>

              <!-- 记录列表 -->
              <div v-else class="divide-y divide-gray-100 dark:divide-neutral-800">
                <div v-for="row in records" :key="row.id"
                     class="flex items-center justify-between gap-3 px-4 py-3">
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium text-black dark:text-white truncate
                              transition-colors duration-500">
                      {{ row.callTagLabel }}
                    </p>
                    <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {{ formatDate(row.createdAt) }}
                      <el-tag
                        :type="row.status === 'success' ? 'success' : 'danger'"
                        size="small"
                        effect="plain"
                        class="ml-1">
                        {{ row.status === 'success' ? '成功' : '失败' }}
                        <span v-if="row.retryCount > 0" class="text-[10px] opacity-70">
                          (重试{{ row.retryCount }}次)
                        </span>
                      </el-tag>
                    </p>
                  </div>
                  <span class="text-[13px] font-mono text-red-500 dark:text-red-400 flex-shrink-0">
                    ¥{{ formatCost(row.totalCost) }}
                  </span>
                </div>
              </div>

              <!-- 分页器 -->
              <div v-if="pagination.total > 0" class="flex justify-center py-4 border-t"
                   :style="{ borderColor: 'var(--color-border)' }">
                <el-pagination
                  v-model:current-page="currentPage"
                  :page-size="pagination.pageSize"
                  :total="pagination.total"
                  :pager-count="5"
                  layout="prev, pager, next"
                  background
                  @current-change="handlePageChange"
                />
              </div>
            </el-tab-pane>

            <!-- 充值记录 Tab -->
            <el-tab-pane label="充值记录" name="recharge">
              <!-- 空状态 -->
              <div v-if="rechargeRecords.length === 0" class="py-10 text-center">
                <p class="text-sm text-gray-400 dark:text-gray-500">暂无充值记录</p>
              </div>

              <!-- 记录列表 -->
              <div v-else class="divide-y divide-gray-100 dark:divide-neutral-800">
                <div v-for="row in rechargeRecords" :key="row.id"
                     class="flex items-center justify-between gap-3 px-4 py-3">
                  <div class="min-w-0">
                    <p class="text-[13px] font-mono text-black dark:text-white truncate
                              transition-colors duration-500">
                      {{ row.code }}
                    </p>
                    <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {{ formatDate(row.usedAt) }} · {{ row.sourceLabel }}
                    </p>
                  </div>
                  <span class="text-[13px] font-mono text-green-500 dark:text-green-400 flex-shrink-0">
                    +¥{{ formatCost(row.amount) }}
                  </span>
                </div>
              </div>

              <!-- 分页器 -->
              <div v-if="rechargePagination.total > 0" class="flex justify-center py-4 border-t"
                   :style="{ borderColor: 'var(--color-border)' }">
                <el-pagination
                  v-model:current-page="rechargePage"
                  :page-size="rechargePagination.pageSize"
                  :total="rechargePagination.total"
                  :pager-count="5"
                  layout="prev, pager, next"
                  background
                  @current-change="handleRechargePageChange"
                />
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </template>
    </div>
  </div>
</template>

<script src="./script.js"></script>
