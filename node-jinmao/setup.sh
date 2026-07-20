#!/bin/bash
# =============================================================================
#  JinMao 宝塔部署 — 一键初始化脚本
#  功能：自动完成所有部署初始化工作（检查环境、安装依赖、初始化数据库、构建前端）
#
#  使用方法：解压项目到服务器后，SSH 进入服务器运行本脚本一次即可
#    cd /www/wwwroot/jinmao/node-jinmao
#    bash setup.sh
#
#  最后修改：2026-07-09
# =============================================================================

# 遇到错误立即退出（.env 不存在除外，脚本会主动处理）
set -e

# ==================== 颜色定义 ====================
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color，重置颜色

# ==================== 路径计算 ====================
# 获取脚本所在目录的绝对路径（即 node-jinmao/）
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# WEB 目录在 node-jinmao 的同级目录下
WEB_DIR="$(dirname "$PROJECT_DIR")/WEB"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  JinMao 宝塔部署 — 一键初始化${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "  后端目录: ${PROJECT_DIR}"
echo -e "  前端目录: ${WEB_DIR}"
echo ""

# ==================== [1/6] 检查 Node.js 版本 ====================
echo -e "${YELLOW}[1/6] 检查 Node.js 版本...${NC}"

# 获取 Node.js 主版本号（去除 v 前缀，取第一个点号前的数字）
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)

# 版本为空或小于 18 则报错退出
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}  错误：需要 Node.js 18+，当前版本: $(node -v 2>/dev/null || echo '未安装')${NC}"
    echo -e "${YELLOW}  请在宝塔面板 → 软件商店 → Node.js版本管理器 中安装 Node.js 18 LTS 或更高版本${NC}"
    exit 1
fi
echo -e "${GREEN}  Node.js $(node -v) ✓${NC}"

# ==================== [2/6] 检查系统依赖工具 ====================
echo ""
echo -e "${YELLOW}[2/6] 检查系统依赖...${NC}"

# --- 检查 LibreOffice（Word 转 PDF 功能依赖） ---
if command -v libreoffice &>/dev/null || command -v soffice &>/dev/null; then
    echo -e "${GREEN}  LibreOffice 已安装 ✓${NC}"
else
    # 检查项目自带的 AppImage 便携版（通配符展开，无文件时为空字符串）
    APPIMAGE_FOUND=false
    for f in "${PROJECT_DIR}/libreoffice-portable/"*.AppImage; do
        if [ -f "$f" ]; then
            APPIMAGE_FOUND=true
            break
        fi
    done

    if [ "$APPIMAGE_FOUND" = true ]; then
        echo -e "${GREEN}  LibreOffice AppImage 便携版已就绪 ✓${NC}"
    else
        echo -e "${YELLOW}  ⚠ LibreOffice 未安装（Word转PDF功能将不可用）${NC}"
        echo -e "${YELLOW}    安装方法：${NC}"
        echo -e "${YELLOW}    CentOS/OpenCloudOS: yum install -y libreoffice-core libreoffice-writer${NC}"
        echo -e "${YELLOW}    Ubuntu/Debian:      apt install -y libreoffice-core libreoffice-writer${NC}"
        echo -e "${YELLOW}    或将 LibreOffice.AppImage 放入 libreoffice-portable/ 目录${NC}"
    fi
fi

# --- 检查 7z/p7zip（压缩包解压功能依赖） ---
if command -v 7z &>/dev/null || command -v 7za &>/dev/null; then
    echo -e "${GREEN}  7z/p7zip 已安装 ✓${NC}"
elif [ -f "${PROJECT_DIR}/tools/7z/7za.exe" ]; then
    # 项目内置了 Windows 版 7za.exe，但在纯 Linux 上无法运行
    echo -e "${YELLOW}  ⚠ 系统 7z 未安装，项目内置的 7za.exe 在 Linux 上不可用${NC}"
    echo -e "${YELLOW}    建议安装: apt install -y p7zip-full unrar 或 yum install -y p7zip p7zip-plugins unrar${NC}"
else
    echo -e "${YELLOW}  ⚠ 7z 未安装（ZIP/RAR/7z解压功能将不可用）${NC}"
    echo -e "${YELLOW}    安装: apt install -y p7zip-full unrar 或 yum install -y p7zip p7zip-plugins unrar${NC}"
fi

# ==================== [3/6] 检查环境变量配置 ====================
echo ""
echo -e "${YELLOW}[3/6] 检查环境配置（.env）...${NC}"

if [ ! -f "${PROJECT_DIR}/.env" ]; then
    # .env 文件不存在，尝试从 .env.example 复制
    echo -e "${YELLOW}  .env 文件不存在，正在从 .env.example 复制模板...${NC}"

    if [ -f "${PROJECT_DIR}/.env.example" ]; then
        cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
        echo ""
        echo -e "${YELLOW}  ⚠ .env 模板已创建，请编辑以下文件填写真实的 API Key 和数据库密码后，重新运行本脚本：${NC}"
        echo -e "${YELLOW}    vim ${PROJECT_DIR}/.env${NC}"
        echo ""
        echo -e "${YELLOW}  或通过宝塔面板文件管理器编辑该文件。${NC}"
        echo -e "${YELLOW}  必填字段：${NC}"
        echo -e "${YELLOW}    DATABASE_URL          — MySQL 连接字符串${NC}"
        echo -e "${YELLOW}    JWT_SECRET            — JWT 签名密钥（随机字符串至少32位）${NC}"
        echo -e "${YELLOW}    SMTP_HOST/PORT/USER/PASS/FROM — 邮箱服务配置${NC}"
        echo -e "${YELLOW}    DEEPSEEK_API_KEY      — AI 接口密钥${NC}"
        echo -e "${YELLOW}    DOC2X_API_KEY         — PDF 转换接口密钥${NC}"
        echo ""
        exit 1
    else
        echo -e "${RED}  错误：.env.example 模板文件也不存在，请确认项目文件完整！${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}  .env 文件已存在 ✓${NC}"
fi

# ==================== [4/6] 安装后端依赖 & 初始化数据库 ====================
echo ""
echo -e "${YELLOW}[4/6] 安装后端依赖 & 初始化数据库...${NC}"
cd "${PROJECT_DIR}"

# 安装 npm 依赖（package.json 中的 dependencies + devDependencies）
echo -e "  运行 npm install（安装后端依赖）..."
npm install

# 生成 Prisma Client（类型安全的数据库查询客户端）
echo -e "  运行 prisma generate（生成数据库客户端）..."
npx prisma generate

# 执行数据库迁移（创建 User/Course/Chapter 表结构）
echo -e "  运行 prisma migrate deploy（执行数据库迁移）..."
npx prisma migrate deploy

echo -e "${GREEN}  后端初始化完成 ✓${NC}"

# ==================== [5/6] 安装前端依赖 & 构建 ====================
echo ""
echo -e "${YELLOW}[5/6] 构建前端...${NC}"

# 验证 WEB 目录和 package.json 存在
if [ ! -f "${WEB_DIR}/package.json" ]; then
    echo -e "${RED}  错误：WEB 目录下未找到 package.json，请确认前端项目文件完整！${NC}"
    echo -e "${RED}  预期路径: ${WEB_DIR}/package.json${NC}"
    exit 1
fi

cd "${WEB_DIR}"

# 安装前端依赖
echo -e "  运行 npm install（安装前端依赖）..."
npm install

# 生产构建（输出到 dist/ 目录）
echo -e "  运行 npm run build（Vite 生产构建）..."
npm run build

echo -e "${GREEN}  前端构建完成（dist/ 目录已生成） ✓${NC}"

# ==================== [6/6] 输出宝塔配置参数 ====================
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  ✓ 初始化全部完成！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  接下来在宝塔面板中操作："
echo ""
echo -e "📌 ${GREEN}宝塔 → 网站 → Node项目 → 添加Node项目${NC}"
echo ""
echo -e "  填写以下参数："
echo -e "  ┌─────────────────────────────────────────────┐"
echo -e "  │  项目名称:    ${GREEN}jinmao-backend${NC}"
echo -e "  │  启动文件:    ${GREEN}${PROJECT_DIR}/app.js${NC}"
echo -e "  │  运行目录:    ${GREEN}${PROJECT_DIR}${NC}"
echo -e "  │  Node版本:    自动                        "
echo -e "  │  项目类型:    默认                        "
echo -e "  └─────────────────────────────────────────────┘"
echo ""
echo -e "  添加后点击「启动」即可运行。"
echo ""
echo -e "📌 前端已构建到: ${GREEN}${WEB_DIR}/dist/${NC}"
echo -e "   如需通过域名访问前端页面："
echo -e "   宝塔 → 网站 → 添加站点 → 根目录设为上述 dist/ 路径"
echo -e "   并配置反向代理：/api/ → http://127.0.0.1:8888"
echo ""
echo -e "${CYAN}========================================${NC}"
