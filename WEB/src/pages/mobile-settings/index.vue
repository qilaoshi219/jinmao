<!--
============================================================================
文件名：pages/mobile-settings/index.vue（手机端个人设置页面）
文件作用：显示和编辑用户个人信息（用户名/昵称/个性签名/头像/邮箱只读）
设计规范：纯黑纯白文字、10px圆角、500ms过渡、Element Plus优先、暗黑双轨适配
============================================================================
-->

<template>
  <div class="min-h-screen transition-all duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部导航栏 -->
    <header class="flex items-center justify-between px-4 py-4 border-b transition-colors duration-500"
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
        个人设置
      </h1>
      <div class="w-12" />
    </header>

    <!-- 主内容区 -->
    <div class="px-4 py-6">

      <!-- 加载中状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <span class="text-sm text-gray-500 dark:text-gray-400">加载中...</span>
      </div>

      <!-- 正常内容 -->
      <template v-else>
        <!-- 头像区域 -->
        <div class="flex flex-col items-center mb-8">
          <div class="relative" @click="triggerFileInput">
            <el-avatar
              :size="80"
              :src="avatarPreview || undefined"
              class="bg-blue-500 dark:bg-blue-400 text-white text-2xl
                     ring-2 ring-offset-2 ring-blue-500/20 dark:ring-blue-400/20
                     transition-all duration-500">
              {{ avatarPreview ? '' : userInitial }}
            </el-avatar>
          </div>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400 transition-colors duration-500">
            点击头像更换
          </p>
          <p v-if="avatarUploading" class="mt-1 text-xs text-blue-500 dark:text-blue-400">
            上传中...
          </p>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="hidden"
            @change="handleFileChange"
          />
        </div>

        <!-- 表单卡片 -->
        <div class="rounded-[10px] border p-5 space-y-5 transition-colors duration-500"
             :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }">

          <!-- 邮箱（只读） -->
          <div>
            <label class="block text-sm font-medium text-black dark:text-white mb-2 transition-colors duration-500">
              邮箱
            </label>
            <el-input :model-value="user.email || ''" disabled />
          </div>

          <!-- 用户名 -->
          <div>
            <label class="block text-sm font-medium text-black dark:text-white mb-2 transition-colors duration-500">
              用户名
            </label>
            <el-input v-model="form.username" placeholder="请输入用户名" maxlength="30" show-word-limit />
          </div>

          <!-- 昵称 -->
          <div>
            <label class="block text-sm font-medium text-black dark:text-white mb-2 transition-colors duration-500">
              昵称
            </label>
            <el-input v-model="form.nickname" placeholder="请输入昵称" maxlength="20" show-word-limit />
          </div>

          <!-- 个性签名 -->
          <div>
            <label class="block text-sm font-medium text-black dark:text-white mb-2 transition-colors duration-500">
              个性签名
            </label>
            <el-input
              v-model="form.bio"
              type="textarea"
              :rows="3"
              placeholder="介绍一下自己吧"
              maxlength="100"
              show-word-limit
            />
          </div>

          <!-- 验证码（修改资料需要） -->
          <div>
            <label class="block text-sm font-medium text-black dark:text-white mb-2 transition-colors duration-500">
              验证码
            </label>
            <div class="flex gap-2">
              <el-input
                v-model="form.code"
                placeholder="6位邮箱验证码"
                maxlength="6"
                class="flex-1"
              />
              <el-button
                :loading="sendingCode"
                :disabled="sendCodeCooldown > 0"
                @click="sendVerifyCode">
                {{ sendCodeCooldown > 0 ? sendCodeCooldown + 's' : '发送验证码' }}
              </el-button>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              修改用户名、昵称或签名时需要验证码
            </p>
          </div>

          <!-- 错误提示 -->
          <el-alert
            v-if="saveError"
            :title="saveError"
            type="error"
            show-icon
            :closable="true"
            @close="saveError = null"
          />

          <!-- 保存按钮 -->
          <el-button
            type="primary"
            size="large"
            class="w-full !rounded-[10px]"
            :loading="saving"
            :disabled="!canSave"
            @click="handleSave">
            {{ saving ? '保存中...' : '保存修改' }}
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script src="./script.js"></script>
