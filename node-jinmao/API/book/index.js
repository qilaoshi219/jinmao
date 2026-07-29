// ==================== 教材 CRUD 路由模块 — 统一入口 ====================
// 职责：组合各子路由模块（list / detail / update / delete / files），统一导出
// 使用 Express Router 合并，挂载到 /api/v1 前缀下
// Node.js require("./API/book") 自动解析到此文件

const express = require("express"); // Express 框架
const router = express.Router(); // 创建合并路由实例

// ==================== 导入各子路由模块 ====================
// 每个子模块各自定义了完整的路由路径（如 /books、/books/:id）
const listRouter = require("./list"); // GET /api/v1/books — 教材列表
const detailRouter = require("./detail"); // GET /api/v1/books/:id — 教材详情
const updateRouter = require("./update"); // PUT /api/v1/books/:id — 更新教材
const deleteRouter = require("./delete"); // DELETE /api/v1/books/:id — 删除教材
const filesRouter = require("./files"); // GET /api/v1/books/:id/files — 教材文件列表（临时测试功能）
const generateNextRouter = require("./generate-next-chapter"); // POST /courses/:id/generate-next-chapter 等 — 章节生成与进度
const fixMissingRouter = require("./fix-missing"); // POST /courses/:id/chapters/:id/fix-missing 等 — 文件补全

// ==================== 合并路由 ====================
// 使用 router.use 将各子路由模块的端点合并到当前 Router 实例
router.use(listRouter);
router.use(detailRouter);
router.use(updateRouter);
router.use(deleteRouter);
router.use(filesRouter); // 教材文件列表（临时测试，未来会删除）
router.use(generateNextRouter); // 下一章生成 + 章节进度查询
router.use(fixMissingRouter); // 文件补全（检测缺失 + 触发补全 + 查询状态）

// 导出统一的路由实例，供 app.js 挂载
module.exports = router;
