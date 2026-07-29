-- 创建用户每日活动记录表 UserDailyActivity
-- 用于记录用户每天是否有学习/刷题活动，支持计算连续学习天数

-- CreateTable
CREATE TABLE `UserDailyActivity` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `activity_date` DATE NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    -- 联合唯一约束：同一用户同一天仅一条记录
    UNIQUE INDEX `UserDailyActivity_userId_activityDate_key` (`user_id`, `activity_date`),

    -- 主键
    PRIMARY KEY (`id`)

) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加外键约束
ALTER TABLE `UserDailyActivity` ADD CONSTRAINT `UserDailyActivity_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
