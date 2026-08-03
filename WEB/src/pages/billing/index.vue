<!--
============================================================================
文件名：billing/index.vue（账单页面模板）
文件作用：显示用户 VIP 等级、开通计划、余额、已使用金额和扣费记录列表
        遵循设计规范（纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配）
============================================================================
-->
<template>
  <div class="min-h-screen transition-all duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- ===== 顶部导航栏 ===== -->
    <header class="flex items-center justify-between px-6 py-4 border-b
                   transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <!-- 返回首页按钮 -->
      <button @click="goBack"
              class="flex items-center gap-1.5 text-[13px] font-medium
                     text-black dark:text-white
                     hover:text-blue-500 dark:hover:text-blue-400
                     transition-colors duration-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回首页
      </button>
      <!-- 页面标题 -->
      <h1 class="text-lg font-bold text-black dark:text-white
                 transition-colors duration-500">
        账单
      </h1>
      <!-- 占位（保持居中） -->
      <div class="w-20" />
    </header>

    <!-- ===== 主内容区 ===== -->
    <div class="max-w-5xl mx-auto px-6 py-6 transition-all duration-500">

      <!-- 加载中状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <span class="text-sm text-gray-500 dark:text-gray-400">加载中...</span>
      </div>

      <!-- 加载失败 -->
      <div v-else-if="error"
           class="flex flex-col items-center justify-center py-20 gap-3">
        <p class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>
        <el-button size="small" @click="loadData">重新加载</el-button>
      </div>

      <!-- 正常内容 -->
      <template v-else>
        <!-- ===== 账务摘要卡片行 ===== -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 transition-all duration-500">

          <!-- VIP 等级卡片 -->
          <div class="rounded-[10px] p-4 transition-colors duration-500
                      border"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-500">VIP 等级</p>
            <p class="text-lg font-bold text-black dark:text-white transition-colors duration-500">
              {{ vipLevelLabel }}
            </p>
          </div>

          <!-- 开通计划卡片 -->
          <div class="rounded-[10px] p-4 transition-colors duration-500
                      border"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-500">开通计划</p>
            <p class="text-lg font-bold text-black dark:text-white transition-colors duration-500">
              {{ planLabel }}
            </p>
          </div>

          <!-- 余额卡片 + 去充值按钮 -->
          <div class="rounded-[10px] p-4 transition-colors duration-500
                      border flex items-center justify-between"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <p class="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-500">余额</p>
                <!-- 锁定状态标记 -->
                <span v-if="balanceLocked"
                      class="text-[10px] px-1.5 py-0.5 rounded-[4px]
                             bg-red-50 dark:bg-red-900/30
                             text-red-500 dark:text-red-400
                             border border-red-200 dark:border-red-800
                             font-medium">
                  已锁定
                </span>
              </div>
              <p class="text-lg font-bold text-black dark:text-white transition-colors duration-500">
                ¥{{ formattedBalance }}
              </p>
            </div>
            <!-- 去兑换码按钮：点击跳转到兑换码输入页面（充值已迁移到兑换码系统） -->
            <el-button type="warning" size="large" round @click="goRedeem">
              去兑换码
            </el-button>
          </div>

          <!-- 已使用金额卡片 -->
          <div class="rounded-[10px] p-4 transition-colors duration-500
                      border"
               :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-500">已使用金额</p>
            <p class="text-lg font-bold text-red-500 dark:text-red-400 transition-colors duration-500">
              ¥{{ formattedTotalUsed }}
            </p>
          </div>

        </div>

        <!-- ===== 记录明细（消费 / 充值选项卡） ===== -->
        <div class="rounded-[10px] border transition-colors duration-500 overflow-hidden"
             :style="{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }">
          <el-tabs v-model="activeTab" class="billing-page__tabs">

            <!-- ===== 消费记录 Tab ===== -->
            <el-tab-pane label="消费记录" name="consume">
              <el-table
                :data="records"
                stripe
                style="width: 100%"
                :header-cell-style="{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border)',
                }"
                :cell-style="{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border)',
                }">
                <!-- 日期列 -->
                <el-table-column label="日期" width="180">
                  <template #default="{ row }">
                    <span class="text-[13px]">{{ formatDate(row.createdAt) }}</span>
                  </template>
                </el-table-column>

                <!-- 服务列 -->
                <el-table-column label="服务" min-width="140">
                  <template #default="{ row }">
                    <span class="text-[13px]">{{ row.callTagLabel }}</span>
                  </template>
                </el-table-column>

                <!-- 费用列 -->
                <el-table-column label="费用" width="140" align="right">
                  <template #default="{ row }">
                    <span class="text-[13px] font-mono
                                 text-red-500 dark:text-red-400">
                      ¥{{ formatCost(row.totalCost) }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 状态列 -->
                <el-table-column label="状态" width="120" align="center">
                  <template #default="{ row }">
                    <el-tooltip
                      v-if="row.status === 'failed' && row.errorMessage"
                      :content="'失败原因：' + row.errorMessage"
                      placement="top"
                      :show-after="300">
                      <el-tag
                        :type="row.status === 'success' ? 'success' : 'danger'"
                        size="small"
                        effect="plain"
                        class="cursor-help">
                        {{ row.status === 'success' ? '成功' : '失败' }}
                        <span v-if="row.retryCount > 0" class="ml-1 text-[10px] opacity-70">
                          (重试{{ row.retryCount }}次)
                        </span>
                      </el-tag>
                    </el-tooltip>
                    <el-tag
                      v-else
                      :type="row.status === 'success' ? 'success' : 'danger'"
                      size="small"
                      effect="plain">
                      {{ row.status === 'success' ? '成功' : '失败' }}
                      <span v-if="row.retryCount > 0" class="ml-1 text-[10px] opacity-70">
                        (重试{{ row.retryCount }}次)
                      </span>
                    </el-tag>
                  </template>
                </el-table-column>

                <!-- 空状态 -->
                <template #empty>
                  <div class="py-8 text-sm text-gray-500 dark:text-gray-400
                              transition-colors duration-500">
                    暂无消费记录
                  </div>
                </template>
              </el-table>

              <!-- 分页器 -->
              <div v-if="pagination.total > 0"
                   class="flex justify-center py-4 border-t
                          transition-colors duration-500"
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

            <!-- ===== 充值记录 Tab ===== -->
            <el-tab-pane label="充值记录" name="recharge">
              <el-table
                :data="rechargeRecords"
                stripe
                style="width: 100%"
                :header-cell-style="{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border)',
                }"
                :cell-style="{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border)',
                }">
                <!-- 日期列 -->
                <el-table-column label="日期" width="180">
                  <template #default="{ row }">
                    <span class="text-[13px]">{{ formatDate(row.usedAt) }}</span>
                  </template>
                </el-table-column>

                <!-- 兑换码列 -->
                <el-table-column label="兑换码" min-width="200">
                  <template #default="{ row }">
                    <span class="text-[13px] font-mono text-black dark:text-white
                                 transition-colors duration-500">
                      {{ row.code }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 充值方式列 -->
                <el-table-column label="充值方式" width="140">
                  <template #default="{ row }">
                    <span class="text-[13px]">{{ row.sourceLabel }}</span>
                  </template>
                </el-table-column>

                <!-- 金额列 -->
                <el-table-column label="金额" width="140" align="right">
                  <template #default="{ row }">
                    <span class="text-[13px] font-mono
                                 text-green-500 dark:text-green-400">
                      +¥{{ formatCost(row.amount) }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 空状态 -->
                <template #empty>
                  <div class="py-8 text-sm text-gray-500 dark:text-gray-400
                              transition-colors duration-500">
                    暂无充值记录
                  </div>
                </template>
              </el-table>

              <!-- 分页器 -->
              <div v-if="rechargePagination.total > 0"
                   class="flex justify-center py-4 border-t
                          transition-colors duration-500"
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

<style scoped>
/* 选项卡与卡片边缘对齐：标签栏左侧留 16px，表格保持满宽 */
.billing-page__tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.billing-page__tabs :deep(.el-tabs__nav-wrap) {
  padding-left: 16px;
}
.billing-page__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background-color: var(--color-border);
}
</style>

<script src="./script.js"></script>
