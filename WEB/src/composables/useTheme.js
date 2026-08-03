// ==================== 主题切换 Composable ====================
// 职责：封装 VueUse 的 useDark，提供响应式的日间/夜间模式切换
// 依赖：@vueuse/core（成熟的组合式工具库，已由社区维护验证）
//
// 使用方式：
//   import { useTheme } from "@/composables/useTheme";
//   const { isDark, toggleTheme } = useTheme();
//
// 工作原理：
//   useDark 内部会自动：
//   1. 检测系统 prefers-color-scheme 偏好作为初始值
//   2. 给 <html> 元素添加/移除 "dark" class（配合 Tailwind dark: 变体）
//   3. 将状态持久化到 localStorage（刷新不丢失）
//   4. 监听系统主题变化（当用户没有手动设置时跟随系统）

import { useDark, useToggle } from "@vueuse/core";

/**
 * 主题切换 Composable
 * 基于 VueUse 的 useDark（成熟方案，非自研），管理暗黑模式状态
 *
 * @returns {{ isDark: import('vue').Ref<boolean>, toggleTheme: () => boolean }}
 *   - isDark: 响应式布尔值，true 表示暗黑模式
 *   - toggleTheme: 切换函数，调用后反转 isDark 并返回新值
 */
export function useTheme() {
  // ========== 使用 VueUse useDark 管理暗黑模式状态 ==========
  // 配置说明：
  //   selector: 'html'        → 在 <html> 元素上操作 class
  //   valueDark: 'dark'       → 暗黑模式时添加 class="dark"
  //   valueLight: ''          → 亮色模式时移除 class（空字符串表示无 class）
  //   storageKey: 'app-theme' → localStorage 中的键名
  const isDark = useDark({
    selector: "html", // Tailwind 的 dark: 变体检测 html 上的 .dark class
    valueDark: "dark", // 暗黑模式值
    valueLight: "", // 亮色模式值（移除 class）
    storageKey: "app-theme", // 持久化存储键名
    // 首次访问时，读取系统偏好作为默认值
    // useDark 内置了 prefers-color-scheme 检测
  });

  // ========== 使用 VueUse useToggle 创建切换函数 ==========
  // useToggle 接收一个 Ref<boolean>，返回切换函数，调用后反转值
  // 注意：useToggle 返回的函数会把“任何实参”当作显式目标值（arguments.length 分支），
  // 而 DOM 监听器（addEventListener）与 Vue 模板事件都会把事件对象作为第一参传入，
  // 导致点击被误判为“设置为 truthy 值”而不是“反转”。因此包一层无参调用，忽略外部实参。
  const toggle = useToggle(isDark);
  const toggleTheme = () => toggle();

  console.log(
    "[useTheme] 主题系统已初始化，当前模式:",
    isDark.value ? "暗黑模式" : "亮色模式"
  );

  return { isDark, toggleTheme };
}
