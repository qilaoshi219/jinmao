-- ==================== 账单功能数据库迁移 ====================
-- 日期：2026-07-29
-- 说明：User 表新增账务字段 + billing_record 表金额字段 Float → Decimal 精度升级
-- 注意：执行前请先清理 _prisma_migrations 表中可能存在的失败记录：
--   DELETE FROM _prisma_migrations WHERE migration_name = '20260729_add_user_billing_fields';

-- ========== 1. User 表新增字段 ==========
-- vip_level: VIP 等级，默认 "free"（免费用户），老用户自动填充
-- balance: 用户余额，默认 0，Decimal(18,7) 精确到小数点后 7 位
-- plan: 开通计划，默认 NULL（未开通）
ALTER TABLE `User`
  ADD COLUMN `vip_level` VARCHAR(20) NOT NULL DEFAULT 'free',
  ADD COLUMN `balance` DECIMAL(18, 7) NOT NULL DEFAULT 0,
  ADD COLUMN `plan` VARCHAR(50) NULL DEFAULT NULL;

-- ========== 2. billing_record 表金额字段精度升级 ==========
-- 将所有 Float 金额字段改为 Decimal(18,7)，确保 7 位小数精度
-- 注意：如果数据量很大，此操作可能需要数秒
ALTER TABLE `billing_record`
  MODIFY COLUMN `input_unit_price` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `input_cache_hit_price` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `output_unit_price` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `image_unit_price` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `tts_unit_price` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `input_cost` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `output_cost` DECIMAL(18, 7) NULL DEFAULT NULL,
  MODIFY COLUMN `total_cost` DECIMAL(18, 7) NOT NULL;
