// ==================== 课程学习路由模块 — 统一入口 ====================
// 职责：组合课程学习相关的子路由模块（slides / AI 问答 等），统一导出
// 使用 Express Router 合并，挂载到 /api/v1 前缀下
// Node.js require("./API/course") 自动解析到此文件

const express = require("express"); // Express 框架
const router = express.Router(); // 创建合并路由实例

// ==================== 导入各子路由模块 ====================
// 每个子模块各自定义了完整的路由路径
const slidesRouter = require("./slides"); // GET /api/v1/courses/:courseId/chapters/:chapterId/slides — 获取章节幻灯片数据
const chatRouter = require("./chat");     // AI 助教问答：对话列表 / 详情 / SSE 流式问答
const mindmapRouter = require("./mindmap"); // 一键思维导图：POST/GET /courses/:courseId/chapters/:chapterId/mindmap

// ==================== 合并路由 ====================
router.use(slidesRouter);
router.use(chatRouter);
router.use(mindmapRouter);

// 导出统一的路由实例，供 app.js 挂载
module.exports = router;
