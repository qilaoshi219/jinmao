// ==================== 头像上传模块 ====================
// 职责：处理用户头像上传，校验文件类型/大小，上传到 MinIO，更新数据库
// 依赖：multer（API 层接收文件）、upload_minio.js（MinIO 上传）、user_repo.js（数据库更新）

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const minioUpload = require("../../utils/upload_minio"); // MinIO 上传工具
const userRepo = require("../../utils/repo/user_repo");   // 用户 Repository

// 日志前缀
const TAG = "[auth_avatar]";

// 允许的图片 MIME 类型
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// 文件大小限制：5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * 处理头像上传
 * 校验文件 → 生成唯一文件名 → 上传 MinIO → 更新数据库 → 清理临时文件 → 返回 URL
 * @param {string} userId - 用户 ID
 * @param {Object} file - Multer 解析后的文件对象 { originalname, mimetype, size, path }
 * @returns {Promise<{ code: number, data?: Object, message?: string }>}
 */
async function uploadAvatar(userId, file) {
  console.log(TAG + "[uploadAvatar] 收到头像上传请求，userId: " + userId);

  // ========== 1. 校验文件存在 ==========
  if (!file) {
    return { code: 400, message: "未检测到上传文件，请选择一张图片。" };
  }

  // ========== 2. 校验文件类型 ==========
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    console.log(TAG + "[uploadAvatar] 不支持的文件类型: " + file.mimetype);
    // 删除临时文件
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    return { code: 400, message: "仅支持 PNG、JPEG、WebP、GIF 格式的图片。" };
  }

  // ========== 3. 校验文件大小 ==========
  if (file.size > MAX_FILE_SIZE) {
    console.log(TAG + "[uploadAvatar] 文件过大: " + file.size + " bytes");
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    return { code: 400, message: "图片大小不能超过 5MB。" };
  }

  // ========== 4. 生成唯一文件名 ==========
  const ext = path.extname(file.originalname).toLowerCase() || ".png";
  const randomStr = crypto.randomBytes(4).toString("hex"); // 8 位随机字符串
  const timestamp = Date.now();
  const filename = userId + "_" + timestamp + "_" + randomStr + ext;

  // ========== 5. 上传到 MinIO ==========
  const minioPath = "/avatars/" + userId + "/" + filename;
  console.log(TAG + "[uploadAvatar] 开始上传到 MinIO: " + minioPath);

  const uploadResult = await minioUpload.upload(file.path, minioPath);
  if (uploadResult.code !== 200) {
    console.log(TAG + "[uploadAvatar] MinIO 上传失败: " + uploadResult.message);
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    return { code: 500, message: "头像上传失败: " + uploadResult.message };
  }

  const avatarUrl = uploadResult.url;
  console.log(TAG + "[uploadAvatar] MinIO 上传成功，URL: " + avatarUrl);

  // ========== 6. 更新用户表的 avatar 字段 ==========
  const updateResult = await userRepo.updateProfile(userId, { avatar: avatarUrl });
  if (updateResult.code !== 200) {
    console.log(TAG + "[uploadAvatar] 数据库更新失败: " + updateResult.message);
    // MinIO 已上传成功但 DB 更新失败，记录日志供后续处理
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    return { code: 500, message: "头像信息保存失败: " + updateResult.message };
  }

  // ========== 7. 清理本地临时文件 ==========
  try {
    fs.unlinkSync(file.path);
    console.log(TAG + "[uploadAvatar] 临时文件已清理: " + file.path);
  } catch (e) {
    console.warn(TAG + "[uploadAvatar] 清理临时文件失败: " + e.message);
  }

  console.log(TAG + "[uploadAvatar] 头像上传完成，userId: " + userId);

  return {
    code: 200,
    message: "头像上传成功。",
    data: { avatar: avatarUrl },
  };
}

module.exports = { uploadAvatar };
