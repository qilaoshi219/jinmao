<!--
============================================================================
文件名：pages/mobile-redeem/index.vue（手机端兑换码领取页面）
文件作用：用户输入兑换码领取免费额度
设计规范：纯黑纯白文字、10px圆角、500ms过渡、Element Plus优先、暗黑双轨适配
============================================================================
-->

<template>
  <!-- ===== 全屏居中容器 ===== -->
  <div class="flex items-center justify-center min-h-screen px-4 transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- ===== 兑换码卡片 ===== -->
    <div class="w-full rounded-[10px] p-6 transition-all duration-500"
         :style="{
           backgroundColor: 'var(--color-card)',
           border: '1px solid var(--color-border)',
           boxShadow: 'var(--shadow-card)',
         }">

      <!-- 返回按钮 -->
      <button
        @click="goBack"
        class="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 hover:underline mb-5
               transition-colors duration-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回
      </button>

      <!-- 标题区 -->
      <div class="text-center mb-6">
        <div class="text-4xl mb-3">🎉</div>
        <h1 class="text-xl font-bold text-black dark:text-white transition-colors duration-500 mb-2">
          领取免费额度
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-500">
          输入兑换码，即刻到账 10 元余额
        </p>
      </div>

      <!-- 兑换码输入区 -->
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-black dark:text-white mb-2 transition-colors duration-500">
            兑换码
          </label>
          <el-input
            v-model="codeInput"
            placeholder="请输入24位兑换码"
            size="large"
            :disabled="redeemed"
            @input="onCodeInput"
            clearable
          />
        </div>

        <!-- 提交按钮 -->
        <el-button
          type="primary"
          size="large"
          class="w-full !rounded-[10px]"
          :loading="submitting"
          :disabled="!canSubmit || redeemed"
          @click="submitRedeem">
          {{ submitting ? '兑换中...' : redeemed ? '已兑换成功' : '立即兑换' }}
        </el-button>
      </div>

      <!-- 错误提示 -->
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="true"
        @close="errorMessage = ''"
        class="mt-4"
      />

      <!-- 成功提示 -->
      <div v-if="redeemed"
           class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800
                  rounded-[10px] transition-all duration-500">
        <div class="flex items-start gap-2">
          <span class="text-green-500 text-lg">✅</span>
          <div>
            <p class="text-sm font-semibold text-green-700 dark:text-green-400 transition-colors duration-500">
              兑换成功！
            </p>
            <p class="text-xs text-green-600 dark:text-green-500 mt-1 transition-colors duration-500">
              已到账 <strong>¥{{ redeemedAmount }}</strong> 余额
            </p>
            <p class="text-xs text-green-600 dark:text-green-500 transition-colors duration-500">
              当前余额：<strong>¥{{ newBalance }}</strong>
            </p>
            <p v-if="wasUnlocked" class="text-xs text-green-600 dark:text-green-500 mt-1 transition-colors duration-500">
              🔓 账户已解锁，可以继续使用 AI 功能啦！
            </p>
          </div>
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="mt-6 text-center">
        <p class="text-xs text-gray-400 dark:text-gray-600 transition-colors duration-500">
          兑换码由管理员发放，每个码仅可使用一次
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-600 mt-1 transition-colors duration-500">
          每用户每小时最多兑换 3 次
        </p>
      </div>
    </div>
  </div>
</template>

<script src="./script.js"></script>
