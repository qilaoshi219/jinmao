#!/bin/bash
# =============================================================================
#  JinMao 首次部署建库脚本（跳过迁移链，直接按 schema.prisma 建全数据库）
#
#  适用场景：全新空数据库的首次部署（如生产环境 jinmao_prod 首次建库）
#  使用前提：代码已上传、node-jinmao/.env 已配置好 DATABASE_URL
#  执行位置：宝塔面板 → 网站终端 → cd /www/wwwroot/xxx/node-jinmao → bash setup_first_deploy.sh
#
#  为什么不用迁移链（prisma migrate deploy）：
#    迁移链用于"已有数据库的增量升级"；全新空库没有任何数据，
#    schema.prisma 本身就是完整结构定义，prisma db push 直接建成
#    与代码完全一致的表结构，更快且不受历史迁移缺陷影响。
#
#  建库完成后会将所有历史迁移标记为"已应用"，确保：
#    - app.js 启动时的自动 migrate deploy 不会把历史迁移当新迁移重复执行
#    - 后续版本升级时只执行新增的增量迁移
# =============================================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

cd "$(dirname "$0")"   # 进入 node-jinmao 目录（无论从哪里调用，都切到脚本所在目录）

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  JinMao 首次部署建库脚本${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "  工作目录: $(pwd)"

# ---- [1/4] 检查 .env ----
echo ""
echo -e "${YELLOW}[1/4] 检查 .env...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 未找到 .env 文件！${NC}"
    echo -e "${YELLOW}  请先执行：cp .env.example .env，并填写 DATABASE_URL 等配置${NC}"
    exit 1
fi
echo -e "${GREEN}  ✅ .env 已存在${NC}"

# ---- [2/4] 安装后端依赖 ----
echo ""
echo -e "${YELLOW}[2/4] 安装后端依赖（npm install）...${NC}"
npm install
echo -e "${GREEN}  ✅ 依赖安装完成${NC}"

# ---- [3/4] 直接按 schema.prisma 建全数据库 ----
echo ""
echo -e "${YELLOW}[3/4] 按 schema.prisma 直接创建全部数据表（prisma db push）...${NC}"
npx prisma db push
echo -e "${GREEN}  ✅ 全部数据表创建完成${NC}"

# ---- [4/4] 将历史迁移标记为已应用 ----
echo ""
echo -e "${YELLOW}[4/4] 将现有迁移标记为已应用（避免下次 migrate deploy 重复执行）...${NC}"
MIGRATION_COUNT=0
for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    if [ -f "prisma/migrations/$name/migration.sql" ]; then
        echo "  → $name"
        npx prisma migrate resolve --applied "$name"
        MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    fi
done
echo -e "${GREEN}  ✅ 已标记 ${MIGRATION_COUNT} 个迁移为已应用${NC}"

# ---- 完成 ----
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  ✅ 数据库创建完成！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  验证迁移状态（应显示 up to date）:"
echo -e "    npx prisma migrate status"
echo ""
echo -e "  下一步："
echo -e "  1. 构建前端：cd ../WEB && npm install && npm run build"
echo -e "  2. 宝塔 → 网站 → Node 项目 → 添加（jinmao-backend-prod，端口 8889）"
echo -e "  3. 宝塔 → 网站 → 添加站点（监听 30081，反代 /api → 127.0.0.1:8889）"
echo ""
