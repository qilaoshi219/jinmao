// ==================== Auth 服务统一导出入口 ====================
// 聚合所有子模块的导出，保持与拆分前完全一致的对外接口
// 外部调用方（API/auth.js）通过 require("../service/auth") 引入，Node.js 自动解析到此 index.js
// 拆分详情：
//   - otp.js    : 验证码核心模块（sendCode、verifyAndConsumeOtp）
//   - login.js  : 登录/注册模块（login）
//   - profile.js: 用户资料模块（getProfile、updateProfile）

const otp = require("./otp"); // 验证码模块
const loginModule = require("./login"); // 登录模块
const profileModule = require("./profile"); // 用户资料模块

// 导出与拆分前完全一致的 4 个核心函数
module.exports = {
  sendCode: otp.sendCode,
  login: loginModule.login,
  getProfile: profileModule.getProfile,
  updateProfile: profileModule.updateProfile,
};
