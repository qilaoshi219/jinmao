// ==================== Vite 配置文件 ====================
// 职责：配置开发服务器端口、API 代理、构建输出、插件
// 前端 dev server 使用 30000 端口（30000+ 范围）
// /api/* 请求自动代理到后端 Express（localhost:8888）

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue"; // Vue 3 SFC 编译插件
import tailwindcss from "@tailwindcss/vite"; // Tailwind CSS v4 插件

// Element Plus 按需自动导入插件
// unplugin-vue-components：自动按需导入 Element Plus 组件（无需手动 import）
// unplugin-auto-import：自动导入 Element Plus API（ElMessage 等，无需手动 import）
import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

// https://vite.dev/config/
export default defineConfig({
  // ========== 插件配置 ==========
  plugins: [
    vue(), // Vue 3 单文件组件支持
    tailwindcss(), // Tailwind CSS 集成
    // Element Plus 组件按需自动导入：使用 <el-button> 即可，无需 import
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    // Element Plus API 自动导入：使用 ElMessage() 即可，无需 import
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
  ],

  // ========== 开发服务器配置 ==========
  server: {
    port: 30000, // 端口 30000（符合 30000+ 要求）
    strictPort: true, // 端口被占用时直接报错，不自动换端口
    proxy: {
      // 所有 /api 开头的请求转发到后端 Express 服务器
      "/api": {
        target: "http://localhost:8888", // 后端地址
        changeOrigin: true, // 修改请求头中的 origin 为目标地址
      },
    },
  },

  // ========== 构建配置 ==========
  build: {
    outDir: "dist", // 构建输出目录
    assetsDir: "assets", // 静态资源子目录
  },
});
