-- AlterTable: redeem_code 表新增分发时间字段（管理员复制兑换码时自动标记，NULL=未分发）
ALTER TABLE `redeem_code` ADD COLUMN `distributed_at` DATETIME(3) NULL;
