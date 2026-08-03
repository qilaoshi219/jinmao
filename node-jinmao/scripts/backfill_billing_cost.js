// ==================== 历史账单成本回填脚本（一次性） ====================
// 职责：为 billing_record 中尚未记录成本的旧账单回填成本字段
// 历史事实：成本配置引入前，售价 == 成本（按成本价出售），因此成本字段回填为对应的售价字段
// 仅更新 cost_total = 0 的记录，已回填或新产生的记录不受影响
// 用法：node scripts/backfill_billing_cost.js

const prisma = require("../utils/prisma");

const TAG = "[backfill_billing_cost]";

async function main() {
  console.log(TAG + " ======== 开始回填历史账单成本 ========");

  // 待回填记录数（成本总额仍为 0 的旧记录）
  const pending = await prisma.billing_record.count({ where: { cost_total: 0 } });
  console.log(TAG + " 待回填记录数: " + pending);

  if (pending === 0) {
    console.log(TAG + " 无需回填，结束。");
    await prisma.$disconnect();
    return;
  }

  // updateMany 不支持字段间拷贝，改用原始 SQL 完成（一次性脚本，参数固定无注入风险）
  const raw = await prisma.$executeRaw`
    UPDATE billing_record
    SET
      cost_input_unit_price = input_unit_price,
      cost_input_cache_hit_price = input_cache_hit_price,
      cost_output_unit_price = output_unit_price,
      cost_image_unit_price = image_unit_price,
      cost_tts_unit_price = tts_unit_price,
      cost_page_unit_price = page_unit_price,
      cost_input_cost = input_cost,
      cost_output_cost = output_cost,
      cost_total = total_cost
    WHERE cost_total = 0
  `;

  console.log(TAG + " 已回填 " + raw + " 条记录");

  // 校验：成本总额仍为 0 的记录数（应全部回填完毕）
  const remaining = await prisma.billing_record.count({ where: { cost_total: 0 } });
  const sample = await prisma.billing_record.findFirst({
    where: { cost_total: { gt: 0 } },
    select: { id: true, total_cost: true, cost_total: true, cost_input_cost: true },
  });
  console.log(TAG + " 抽查: " + JSON.stringify(sample));
  console.log(TAG + " 剩余未回填: " + remaining);

  await prisma.$disconnect();
  console.log(TAG + " ======== 回填完成 ========");
}

main().catch((err) => {
  console.error(TAG + " 回填异常: " + err.message);
  console.error(err.stack);
  process.exit(1);
});
