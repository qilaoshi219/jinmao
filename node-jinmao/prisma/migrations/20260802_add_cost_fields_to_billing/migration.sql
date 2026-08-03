-- AlterTable: billing_record 表新增成本价字段（成本单价/成本分项/成本总额），利润 = total_cost - cost_total
ALTER TABLE `billing_record` 
  ADD COLUMN `cost_input_unit_price` DECIMAL(18, 7) NULL COMMENT '成本-输入单价（元/百万tokens，缓存未命中）',
  ADD COLUMN `cost_input_cache_hit_price` DECIMAL(18, 7) NULL COMMENT '成本-输入单价（元/百万tokens，缓存命中，LLM 专用）',
  ADD COLUMN `cost_output_unit_price` DECIMAL(18, 7) NULL COMMENT '成本-输出单价（元/百万tokens，LLM 专用）',
  ADD COLUMN `cost_image_unit_price` DECIMAL(18, 7) NULL COMMENT '成本-图片单价（元/张，文生图专用）',
  ADD COLUMN `cost_tts_unit_price` DECIMAL(18, 7) NULL COMMENT '成本-TTS 单价（元/字符，TTS 专用）',
  ADD COLUMN `cost_page_unit_price` DECIMAL(18, 7) NULL COMMENT '成本-每页单价（元/页，doc2x 专用）',
  ADD COLUMN `cost_input_cost` DECIMAL(18, 7) NULL COMMENT '成本-输入费用（元）',
  ADD COLUMN `cost_output_cost` DECIMAL(18, 7) NULL COMMENT '成本-输出费用（元）',
  ADD COLUMN `cost_total` DECIMAL(18, 7) NOT NULL DEFAULT 0 COMMENT '成本-总费用（元，利润 = total_cost - cost_total）';
