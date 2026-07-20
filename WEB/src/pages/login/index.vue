<!--
============================================================================
文件名：index.vue（登录注册页面入口）
所属目录：src/pages/login/（login 页面的专属文件夹）
文件作用：登录/注册页面的 Vue SFC 入口组件
         Template 定义页面 HTML 结构（纯视图层，无业务逻辑）
         Script 通过 <script src="./script.js"> 引用同目录下的独立逻辑文件

布局参考：老项目 LoginPage.vue — 左右两栏卡片布局
  - 顶部品牌区（Logo + 品牌名）
  - 主体卡片（左栏 Hero 装饰区 + 右栏登录表单）
  - 底部版权/说明

设计规范遵循：design-spec Skill（纯黑纯白文字、10px圆角、500ms过渡、蓝色主调）
============================================================================
-->

<template>
  <!--
  ============================================================
  页面整体布局
    - 纯白背景（暗黑：纯黑）
    - 全宽容器 + 响应式内边距
    - 垂直居中
    - 主题切换过渡 500ms
  ============================================================
  -->
  <div class="relative min-h-screen bg-white dark:bg-black
              flex flex-col items-center
              overflow-x-hidden
              transition-colors duration-500">

    <!-- 背景装饰光晕 -->
    <div class="fixed -top-40 -right-40 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/20
                rounded-full blur-3xl pointer-events-none" />
    <div class="fixed -bottom-40 -left-40 w-96 h-96 bg-blue-400/10 dark:bg-blue-400/15
                rounded-full blur-3xl pointer-events-none" />

    <!-- ============================================================
    顶部品牌区（参考老项目 .login-topbar）
    ============================================================ -->
    <div class="absolute left-5 top-5 z-[2]">
      <div class="inline-flex items-center gap-2.5 select-none">
        <!-- Logo 圆形 -->
        <div class="w-[34px] h-[34px] rounded-[10px]
                    bg-gradient-to-b from-blue-500 to-blue-600
                    dark:from-blue-400 dark:to-blue-500
                    flex items-center justify-center
                    shadow-[0_10px_22px_rgba(37,99,235,0.18)]
                    dark:shadow-[0_10px_22px_rgba(96,165,250,0.12)]
                    overflow-hidden flex-shrink-0
                    transition-all duration-500">
          <!-- 书本图标 -->
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <!-- 品牌名 -->
        <span class="text-sm font-black text-black/85 dark:text-white/85
                     tracking-wide transition-colors duration-500">
          金毛教你学
        </span>
      </div>
    </div>

    <!--
    ============================================================
    响应式外层容器
    ============================================================
    -->
    <div class="w-full px-4 sm:px-6 lg:px-8 2xl:px-16
                py-[28px] sm:py-8 lg:py-12
                flex items-center justify-center
                flex-1 transition-colors duration-500">

      <!--
      ============================================================
      主体卡片：左右两栏（参考老项目 .login-card）
        max-width: 1080px（老项目值） → max-w-2xl xl:max-w-5xl
      ============================================================
      -->
      <div class="w-full max-w-2xl lg:max-w-5xl
                  bg-white/96 dark:bg-neutral-950
                  border border-gray-200 dark:border-gray-700
                  rounded-[22px] shadow-[0_22px_60px_rgba(20,40,70,0.12)]
                  dark:shadow-[0_22px_60px_rgba(0,0,0,0.3)]
                  overflow-hidden flex
                  animate-fade-in-up
                  transition-all duration-500">

        <!-- ============================================================
        左栏 Hero 区（参考老项目 .login-hero，flex: 1.2）
        ============================================================ -->
        <div class="flex-[1] lg:flex-[1.2] min-w-0
                    bg-gradient-to-b from-blue-50/80 to-blue-50/10
                    dark:from-blue-950/60 dark:to-blue-950/10
                    p-[44px]
                    flex flex-col items-center justify-center gap-[18px]
                    max-lg:hidden
                    transition-colors duration-500">

          <!-- 装饰框（替代老项目的 hero 图片） -->
          <div class="w-full max-w-[420px]
                      aspect-[4/3]
                      rounded-[14px]
                      bg-white/75 dark:bg-gray-800/75
                      border border-gray-200 dark:border-gray-700
                      shadow-[0_16px_40px_rgba(20,40,70,0.08)]
                      dark:shadow-[0_16px_40px_rgba(0,0,0,0.2)]
                      p-7
                      flex items-center justify-center
                      transition-all duration-500">
            <!-- 大书本图标 -->
            <svg class="w-full h-full max-w-[120px] max-h-[120px]
                        text-blue-400 dark:text-blue-500"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>

          <!-- 标语 -->
          <p class="text-xl font-black text-black/80 dark:text-white/80
                    tracking-wide mt-1.5 transition-colors duration-500">
            让学习变得轻松有趣
          </p>

          <!-- 副标题 -->
          <p class="text-[13px] font-semibold text-gray-500 dark:text-gray-400
                    transition-colors duration-500">
            专业的网课生成器，从零基础到实战大神
          </p>
        </div>

        <!-- ============================================================
        右栏 表单区（参考老项目 .login-panel，flex: 0.8）
        ============================================================ -->
        <div class="flex-[1] lg:flex-[0.8] min-w-0
                    bg-white/98 dark:bg-neutral-950
                    p-[30px] lg:p-[46px]
                    max-md:p-[26px]
                    transition-colors duration-500">

          <!-- 标题 -->
          <h1 class="text-2xl font-black text-black dark:text-white
                     tracking-wide transition-colors duration-500">
            欢迎使用金毛教你学
          </h1>
          <p class="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400
                    transition-colors duration-500">
            登录后开始你的学习之旅
          </p>

          <!-- ========== Logo（移动端显示，桌面端 Hero 区已有） ========== -->
          <div class="flex justify-center mb-4 mt-4 md:hidden">
            <div class="w-14 h-14 rounded-full
                        bg-blue-500 dark:bg-blue-400
                        flex items-center justify-center
                        shadow-lg shadow-blue-500/30 dark:shadow-blue-400/30">
              <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
            </div>
          </div>

          <!-- ============================================================
          邮箱输入区域
          ============================================================ -->
          <div class="bg-gray-50 dark:bg-neutral-900 rounded-[10px] p-4 mt-[18px]
                      transition-colors duration-500">
            <label class="block text-sm font-medium text-black dark:text-white mb-2
                          transition-colors duration-500" for="email">
              邮箱地址
            </label>
            <div class="flex flex-col sm:flex-row gap-2">
              <el-input
                id="email"
                v-model="email"
                placeholder="请输入邮箱地址"
                :disabled="isProcessing"
                size="large"
                class="flex-1"
                @keyup.enter="focusCodeInput"
              >
                <template #prefix>
                  <el-icon><Message /></el-icon>
                </template>
              </el-input>

              <el-button
                type="primary"
                :loading="isSending"
                :disabled="countdown > 0 || isProcessing"
                @click="handleSendCode"
                size="large"
                class="sm:flex-shrink-0"
              >
                {{ sendCodeButtonText }}
              </el-button>
            </div>

            <p v-if="emailError" class="text-red-500 dark:text-red-400 text-xs mt-2
                                       transition-colors duration-500">
              {{ emailError }}
            </p>
          </div>

          <!-- ============================================================
          验证码输入区域
          ============================================================ -->
          <div class="bg-gray-50 dark:bg-neutral-900 rounded-[10px] p-4 mt-3.5
                      transition-colors duration-500">
            <label class="block text-sm font-medium text-black dark:text-white mb-2
                          transition-colors duration-500" for="code">
              验证码
            </label>
            <el-input
              id="code"
              ref="codeInputRef"
              v-model="code"
              placeholder="请输入6位验证码"
              maxlength="6"
              :disabled="isProcessing"
              size="large"
              class="verification-code-input"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
            </el-input>

            <p v-if="codeError" class="text-red-500 dark:text-red-400 text-xs mt-2
                                     transition-colors duration-500">
              {{ codeError }}
            </p>
          </div>

          <!-- ============================================================
          登录/注册提交按钮
          ============================================================ -->
          <el-button
            type="primary"
            :loading="isSubmitting"
            :disabled="isProcessing && !isSubmitting"
            @click="handleLogin"
            size="large"
            class="w-full mt-[18px]"
          >
            {{ isSubmitting ? '处理中...' : '登录 / 注册' }}
          </el-button>

          <!-- ============================================================
          状态提示消息区
          ============================================================ -->
          <el-alert
            v-if="message.text"
            :type="message.type || 'info'"
            :title="message.text"
            :closable="true"
            show-icon
            class="mt-4"
            @close="message = { text: '', type: '' }"
          />
        </div>
      </div>
    </div>

    <!-- ========== 底部版权（参考老项目 .login-footer） ========== -->
    <p class="pb-5 text-xs text-gray-400 dark:text-gray-500
              select-none transition-colors duration-500">
      未注册账号将自动创建 · 验证码5分钟内有效 · © 金毛教你学
    </p>
  </div>
</template>

<!--
============================================================
Script 引用：通过 src 属性引入同目录下的独立逻辑文件
============================================================
-->
<script src="./script.js"></script>

<style scoped>
/* 入场动画：淡入 + 上滑（500ms） */
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
