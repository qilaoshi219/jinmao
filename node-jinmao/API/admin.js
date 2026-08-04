// ==================== 管理员 API 路由聚合器 ====================
// 职责：统一应用管理员双重鉴权（URL后缀 + JWT管理员角色），并挂载各功能子路由
// 子路由文件位于 API/admin/ 目录，各文件负责单一功能模块，控制单文件代码行数
// 安全：不在 Swagger/Scalar 文档中暴露，不添加 @openapi 注释

const express = require("express");
const router = express.Router();
const { adminSuffixMiddleware, adminAuthMiddleware } = require("../middleware/admin");

// ==================== 所有管理员路由统一应用双重鉴权 ====================
// 第一层：URL后缀校验
router.use("/:suffix/api", adminSuffixMiddleware);
// 第二层：JWT + 管理员角色验证
router.use("/:suffix/api", adminAuthMiddleware);

// ==================== 挂载功能子路由（子路由各自定义相对路径） ====================
router.use("/:suffix/api/codes", require("./admin/codes"));       // 兑换码管理
router.use("/:suffix/api/users", require("./admin/users"));       // 用户管理
router.use("/:suffix/api/billing", require("./admin/billing"));   // 账单管理
router.use("/:suffix/api/stats", require("./admin/stats"));       // 消费统计
router.use("/:suffix/api/security", require("./admin/security")); // 安全防护
router.use("/:suffix/api/config", require("./admin/config"));     // 系统设置
router.use("/:suffix/api/pricing", require("./admin/pricing"));   // 价格调整

// ==================== 导出路由 ====================
module.exports = router;
