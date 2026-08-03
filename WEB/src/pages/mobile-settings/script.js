// ==================== 手机端个人设置页面业务逻辑 ====================
// 职责：加载用户信息、编辑用户名/昵称/签名、上传头像、发送验证码、保存修改

import { ref, computed, onMounted, inject } from "vue";
import { useAuthStore } from "../../stores/auth";
import { sendCode, updateProfile, uploadAvatar } from "../../api/auth";
import { ElMessage } from "element-plus";

// 日志前缀
const TAG = "[mobile_settings_page]";

export default {
  setup() {
    // ========== 依赖注入 ==========
    const navigate = inject("navigate");
    const navigateBack = inject("goBack", () => navigate("mobile-home"));
    const authStore = useAuthStore();

    // ========== 响应式数据 ==========
    const loading = ref(true);
    const saving = ref(false);
    const sendingCode = ref(false);
    const sendCodeCooldown = ref(0);
    const saveError = ref(null);
    const avatarUploading = ref(false);
    const fileInput = ref(null);

    // 用户信息（从 store 读取）
    const user = computed(() => authStore.user || {});

    // 表单数据
    const form = ref({
      username: "",
      nickname: "",
      bio: "",
      code: "",
    });

    // 头像预览 URL（优先用本地预览，其次用服务器 URL）
    const avatarPreview = ref(null);
    // 是否有新头像待上传
    const pendingAvatarFile = ref(null);

    // ========== 计算属性 ==========

    /** 用户头像首字母 */
    const userInitial = computed(() => {
      const name = user.value.nickname || user.value.username || user.value.email || "";
      return name.charAt(0).toUpperCase();
    });

    /** 是否可以保存 */
    const canSave = computed(() => {
      if (saving.value) return false;
      const u = user.value;
      const f = form.value;
      const infoChanged =
        (f.username || "") !== (u.username || "") ||
        (f.nickname || "") !== (u.nickname || "") ||
        (f.bio || "") !== (u.bio || "");
      const avatarChanged = !!pendingAvatarFile.value;
      if (infoChanged && !f.code) return false;
      return infoChanged || avatarChanged;
    });

    // ========== 方法 ==========

    /** 初始化表单 */
    function initForm() {
      const u = user.value;
      form.value.username = u.username || "";
      form.value.nickname = u.nickname || "";
      form.value.bio = u.bio || "";
      form.value.code = "";
      avatarPreview.value = u.avatar || null;
      pendingAvatarFile.value = null;
      saveError.value = null;
    }

    /** 触发文件选择 */
    function triggerFileInput() {
      if (fileInput.value) {
        fileInput.value.click();
      }
    }

    /** 处理文件选择 */
    function handleFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;

      const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        ElMessage.error("仅支持 PNG、JPEG、WebP、GIF 格式的图片。");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        ElMessage.error("图片大小不能超过 5MB。");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        avatarPreview.value = e.target.result;
      };
      reader.readAsDataURL(file);
      pendingAvatarFile.value = file;
    }

    /** 发送验证码 */
    async function sendVerifyCode() {
      if (sendCodeCooldown.value > 0) return;

      sendingCode.value = true;
      const email = user.value.email;
      try {
        const res = await sendCode(email);
        if (res.code === 200) {
          ElMessage.success("验证码已发送，请查收邮件。");
          sendCodeCooldown.value = 60;
          const timer = setInterval(() => {
            sendCodeCooldown.value--;
            if (sendCodeCooldown.value <= 0) {
              clearInterval(timer);
            }
          }, 1000);
        } else {
          ElMessage.error(res.message || "发送验证码失败");
        }
      } catch (err) {
        console.error(TAG + " 发送验证码异常: " + err.message);
        ElMessage.error("网络请求失败，请稍后重试。");
      } finally {
        sendingCode.value = false;
      }
    }

    /** 保存修改 */
    async function handleSave() {
      saving.value = true;
      saveError.value = null;

      const fields = {};
      const u = user.value;
      const f = form.value;
      if ((f.username || "") !== (u.username || "")) fields.username = f.username || null;
      if ((f.nickname || "") !== (u.nickname || "")) fields.nickname = f.nickname || null;
      if ((f.bio || "") !== (u.bio || "")) fields.bio = f.bio || null;

      try {
        // 1. 先上传头像（如果有）
        if (pendingAvatarFile.value) {
          avatarUploading.value = true;
          const avatarRes = await uploadAvatar(pendingAvatarFile.value);
          avatarUploading.value = false;

          if (avatarRes.code === 200) {
            authStore.updateUserField("avatar", avatarRes.data.avatar);
            pendingAvatarFile.value = null;
            ElMessage.success("头像已更新。");
          } else {
            saveError.value = avatarRes.message || "头像上传失败";
            saving.value = false;
            return;
          }
        }

        // 2. 更新用户信息（如果有修改）
        if (Object.keys(fields).length > 0) {
          fields.code = form.value.code;
          const res = await updateProfile(fields);

          if (res.code === 200) {
            if (res.data) {
              Object.keys(res.data).forEach((key) => {
                if (key !== "id" && res.data[key] !== undefined) {
                  authStore.updateUserField(key, res.data[key]);
                }
              });
            }
            form.value.code = "";
            ElMessage.success("个人信息修改成功。");
          } else {
            saveError.value = res.message || "保存失败";
          }
        }
      } catch (err) {
        console.error(TAG + " 保存异常: " + err.message);
        saveError.value = "网络请求失败，请检查网络连接后重试。";
      } finally {
        saving.value = false;
        avatarUploading.value = false;
      }
    }

    /** 返回上一页 */
    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(async () => {
      if (!authStore.user || !authStore.user.email) {
        await authStore.fetchProfile();
      }
      if (authStore.user && authStore.user.email) {
        initForm();
      }
      loading.value = false;
    });

    // ========== 返回给模板 ==========
    return {
      loading,
      saving,
      sendingCode,
      sendCodeCooldown,
      saveError,
      avatarUploading,
      avatarPreview,
      user,
      form,
      fileInput,
      userInitial,
      canSave,
      goBack,
      initForm,
      triggerFileInput,
      handleFileChange,
      sendVerifyCode,
      handleSave,
    };
  },
};
