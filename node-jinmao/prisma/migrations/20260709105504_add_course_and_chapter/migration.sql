-- CreateTable：课程表 Course
-- 存储用户上传的教材元数据和流水线状态
CREATE TABLE `Course` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `textbook_filename` VARCHAR(255) NOT NULL,
    `textbook_path` VARCHAR(500) NOT NULL,
    `source_path` VARCHAR(512) NOT NULL,
    `cover_path` VARCHAR(512) NULL,
    `elaboration_enabled` BOOLEAN NOT NULL DEFAULT true,
    `endline` INT UNSIGNED NOT NULL DEFAULT 0,
    `pipeline_status` VARCHAR(30) NOT NULL DEFAULT 'idle',
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Course_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable：章节表 Chapter
-- 存储每章元数据，PPT/语音/字幕文件通过 MinIO 目录结构关联
CREATE TABLE `Chapter` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `sequence` INT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `chapter_root` VARCHAR(500) NOT NULL,
    `startline` INT UNSIGNED NOT NULL,
    `endline` INT UNSIGNED NOT NULL,
    `total_pages` INT UNSIGNED NOT NULL DEFAULT 0,
    `outline_path` VARCHAR(512) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Chapter_course_id_idx`(`course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey：Course.user_id → User.id
ALTER TABLE `Course` ADD CONSTRAINT `Course_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey：Chapter.course_id → Course.id
ALTER TABLE `Chapter` ADD CONSTRAINT `Chapter_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
