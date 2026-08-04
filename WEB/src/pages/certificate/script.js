// ==================== 结业证书页面业务逻辑 ====================
// 职责：加载结业状态；用 Canvas 绘制证书（金毛教你学风格），支持下载 PNG

import { ref, inject, onMounted, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { getCertificateStatus } from "../../api/books";

// 日志前缀
const TAG = "[CertificatePage]";

export default {
  setup() {
    // ========== 导航与参数 ==========
    const navigate = inject("navigate", () => {});
    const navigateBack = inject("goBack", () => navigate("home"));
    const studyParams = inject("studyParams", ref({}));

    // ========== 状态 ==========
    const loading = ref(true);
    const error = ref("");
    const status = ref(null);
    const canvasRef = ref(null);
    const downloading = ref(false);

    const progressPercent = ref(0);

    // ========== 数据加载 ==========
    async function loadStatus() {
      const courseId = studyParams.value?.courseId;
      if (!courseId) {
        error.value = "缺少课程参数";
        loading.value = false;
        return;
      }
      loading.value = true;
      error.value = "";
      try {
        const result = await getCertificateStatus(courseId);
        if (result.code === 200 && result.data) {
          status.value = result.data;
          progressPercent.value = result.data.totalChapters > 0
            ? Math.round((result.data.finishedChapters / result.data.totalChapters) * 100)
            : 0;
          if (result.data.canIssue) {
            await nextTick();
            drawCertificate(result.data);
          }
        } else {
          error.value = result.message || "结业状态加载失败";
        }
      } catch (e) {
        error.value = e?.response?.data?.message || e?.message || "结业状态加载失败";
      } finally {
        loading.value = false;
      }
    }

    // ========== Canvas 绘制证书 ==========
    function drawCertificate(data) {
      const canvas = canvasRef.value;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width;
      const H = canvas.height;

      // 背景
      ctx.fillStyle = "#fdf8ee";
      ctx.fillRect(0, 0, W, H);

      // 装饰边框（双线：金 + 蓝）
      ctx.strokeStyle = "#d4a94e";
      ctx.lineWidth = 14;
      ctx.strokeRect(28, 28, W - 56, H - 56);
      ctx.strokeStyle = "#409EFF";
      ctx.lineWidth = 3;
      ctx.strokeRect(54, 54, W - 108, H - 108);

      // 四角饰线
      ctx.strokeStyle = "#d4a94e";
      ctx.lineWidth = 4;
      const corners = [
        [60, 60, 120, 60, 60, 120],
        [W - 120, 60, W - 60, 60, W - 60, 120],
        [60, H - 120, 60, H - 60, 120, H - 60],
        [W - 120, H - 60, W - 60, H - 60, W - 60, H - 120],
      ];
      for (const [x1, y1, x2, y2, x3, y3] of corners) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.moveTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.stroke();
      }

      // 标题
      ctx.fillStyle = "#1f2937";
      ctx.textAlign = "center";
      ctx.font = "bold 72px 'Microsoft YaHei', sans-serif";
      ctx.fillText("结 业 证 书", W / 2, 170);

      ctx.font = "24px 'Microsoft YaHei', sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.fillText("C E R T I F I C A T E", W / 2, 210);

      // 分隔线
      ctx.strokeStyle = "#d4a94e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 180, 240);
      ctx.lineTo(W / 2 + 180, 240);
      ctx.stroke();

      // 正文
      ctx.fillStyle = "#374151";
      ctx.font = "30px 'Microsoft YaHei', sans-serif";
      ctx.fillText("兹证明", W / 2, 330);

      ctx.fillStyle = "#409EFF";
      ctx.font = "bold 44px 'Microsoft YaHei', sans-serif";
      ctx.fillText(data.userName || "学员", W / 2, 400);

      ctx.fillStyle = "#374151";
      ctx.font = "28px 'Microsoft YaHei', sans-serif";
      ctx.fillText("已完成课程《" + data.courseName + "》全部内容的学习", W / 2, 470);
      ctx.fillText("特发此证，以资鼓励。", W / 2, 520);

      // 日期
      const dateText = data.completedAt
        ? new Date(data.completedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
        : new Date().toLocaleDateString("zh-CN");
      ctx.fillStyle = "#6b7280";
      ctx.font = "22px 'Microsoft YaHei', sans-serif";
      ctx.fillText("发证日期：" + dateText, W / 2, 620);

      // 落款
      ctx.fillStyle = "#409EFF";
      ctx.font = "bold 26px 'Microsoft YaHei', sans-serif";
      ctx.fillText("金毛教你学 · 自学平台", W / 2, 720);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "18px 'Microsoft YaHei', sans-serif";
      ctx.fillText("www.jinmao-learning.com", W / 2, 755);
    }

    // ========== 下载 ==========
    function downloadCertificate() {
      const canvas = canvasRef.value;
      if (!canvas || downloading.value) return;
      downloading.value = true;
      try {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = "结业证书_" + (status.value?.courseName || "课程") + ".png";
        a.click();
        ElMessage.success("证书已开始下载");
      } catch (e) {
        console.error(TAG + " 证书下载失败: " + e.message);
        ElMessage.error("证书下载失败，请重试");
      } finally {
        downloading.value = false;
      }
    }

    function goBack() {
      navigateBack();
    }

    // ========== 生命周期 ==========
    onMounted(() => {
      console.log(TAG + " 证书页已挂载");
      loadStatus();
    });

    return {
      loading,
      error,
      status,
      canvasRef,
      downloading,
      progressPercent,
      loadStatus,
      downloadCertificate,
      goBack,
    };
  },
};
