-- ==================== 补全 billing_record 表缺失字段 ====================
-- 日期：2026-07-30
-- 说明：billing_record 表在 Prisma schema 中已定义 page_count 和 page_unit_price 列，
--       但初始建表时未包含这些列（可能是通过 db push 创建的），导致 doc2x 计费写入失败。
--       本迁移补全这两个缺失的列。

-- ========== 1. billing_record 新增 page_count 列 ==========
-- page_count: PDF 页数（doc2x PDF 解析专用），可为 NULL
ALTER TABLE `billing_record`
  ADD COLUMN `page_count` INT NULL;

-- ========== 2. billing_record 新增 page_unit_price 列 ==========
-- page_unit_price: 每页单价（元/页，doc2x 专用），Decimal(18,7) 精确到 7 位小数
ALTER TABLE `billing_record`
  ADD COLUMN `page_unit_price` DECIMAL(18, 7) NULL DEFAULT NULL;
