-- 新增 balance_locked 字段，用于余额锁定机制
-- 当用户余额 < 0 时自动锁定，充值后余额 > 0 时自动解锁
ALTER TABLE `User` ADD COLUMN `balance_locked` TINYINT(1) NOT NULL DEFAULT 0;
