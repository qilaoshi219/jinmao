-- CreateTable: SecurityEvent 安全事件表
-- 记录被安全防护中间件检测到的可疑攻击请求，供管理员后台分析研究
CREATE TABLE `SecurityEvent` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '事件ID，主键自增',
  `ip` VARCHAR(45) NOT NULL COMMENT '攻击者IP（IPv6 地址最长 45 字符）',
  `method` VARCHAR(10) NOT NULL COMMENT '请求方法（GET/POST/...）',
  `path` TEXT NOT NULL COMMENT '完整请求路径（攻击载荷可能超长，使用 Text 类型）',
  `query` TEXT NULL COMMENT '完整 query 参数（原始字符串，可能超长）',
  `userAgent` VARCHAR(500) NULL COMMENT 'User-Agent 请求头',
  `attackType` VARCHAR(50) NOT NULL COMMENT '攻击类型：sql_injection/xss/path_traversal/oversized_url/path_param_abuse/sensitive_file/scanner_path/malicious_ua',
  `severity` VARCHAR(20) NOT NULL COMMENT '严重程度：low / medium / high',
  `reason` VARCHAR(500) NOT NULL COMMENT '触发原因描述（命中的检测规则）',
  `blocked` BOOLEAN NOT NULL DEFAULT true COMMENT '是否被防护中间件阻断',
  `handled` BOOLEAN NOT NULL DEFAULT false COMMENT '管理员是否已标记处理',
  `count` INT NOT NULL DEFAULT 1 COMMENT '同IP同类型5分钟窗口内的触发次数（去重合并计数）',
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '首次触发时间',

  INDEX `SecurityEvent_ip_idx` (`ip`),
  INDEX `SecurityEvent_attackType_idx` (`attackType`),
  INDEX `SecurityEvent_createTime_idx` (`create_time`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT = '安全事件表：记录可疑攻击请求，供管理员后台分析研究';
