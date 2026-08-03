// ==================== 管理员：系统配置路由 ====================
// 职责：获取系统配置（安全后缀脱敏显示）、修改安全后缀
// 安全：由父路由（API/admin.js）统一双重鉴权，不添加 @openapi 注释
// 挂载点：/admin/:suffix/api/config/*，本文件内使用相对路径

const express = require("express");
const router = express.Router();
const { getSecuritySuffix, updateSecuritySuffix } = require("../../middleware/admin");

const TAG = "[API_admin_config]";

// ==================== 1. 获取系统配置 ====================
// GET /admin/:suffix/api/config
// 返回安全后缀（脱敏显示：仅显示前2位+后2位）
router.get("/", async (req, res) => {
  console.log(TAG + " 获取系统配置");

  const suffix = getSecuritySuffix();
  if (!suffix) {
    return res.status(500).json({ code: 500, message: "无法读取配置。", data: null });
  }

  // 后缀脱敏显示：前2位 + *** + 后2位
  let maskedSuffix = suffix;
  if (suffix.length > 4) {
    maskedSuffix = suffix.substring(0, 2) + "***" + suffix.substring(suffix.length - 2);
  } else if (suffix.length > 2) {
    maskedSuffix = suffix.substring(0, 1) + "***" + suffix.substring(suffix.length - 1);
  }

  return res.json({
    code: 0,
    message: "ok",
    data: {
      securitySuffix: maskedSuffix, // 脱敏后的后缀
      suffixLength: suffix.length,  // 后缀长度（不暴露实际值）
    },
  });
});

// ==================== 2. 更新系统配置 ====================
// PUT /admin/:suffix/api/config
// 请求体：{ newSuffix: string }
// 修改安全后缀
router.put("/", async (req, res) => {
  console.log(TAG + " ======== 收到修改安全后缀请求 ========");
  console.log(TAG + " 操作者 userId: " + req.userId);

  try {
    const { newSuffix } = req.body;

    // 校验 newSuffix 参数
    if (!newSuffix || typeof newSuffix !== "string") {
      return res.status(400).json({
        code: 400,
        message: "请提供新的安全后缀（newSuffix）。",
        data: null,
      });
    }

    // 调用中间件中的更新函数
    const result = updateSecuritySuffix(newSuffix);

    if (!result.success) {
      console.log(TAG + " 修改失败: " + result.message);
      return res.status(400).json({
        code: 400,
        message: result.message,
        data: null,
      });
    }

    console.log(TAG + " ✅ 安全后缀已由 userId=" + req.userId + " 修改为: " + newSuffix);
    console.log(TAG + " ================================");

    return res.json({
      code: 0,
      message: result.message,
      data: {
        oldSuffix: req.params.suffix, // 旧后缀（从URL中获取）
        newSuffix: newSuffix,
      },
    });
  } catch (err) {
    console.error(TAG + " ❌ 修改安全后缀异常: " + err.message);
    console.error(TAG + " 错误堆栈: " + err.stack);

    return res.status(500).json({
      code: 500,
      message: "服务器内部错误，请稍后再试。",
      data: null,
    });
  }
});

// ==================== 导出路由 ====================
module.exports = router;
