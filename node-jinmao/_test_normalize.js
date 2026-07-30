// 临时测试：验证 task-runner.js 中 normalizeAnswerFromRaw 函数
const fs = require("fs");
const path = require("path");

// 读取 task-runner.js 源码
const code = fs.readFileSync(path.resolve(__dirname, "service/md2quiz/task-runner.js"), "utf-8");

// 提取 normalizeAnswerFromRaw 函数
const fnMatch = code.match(/function normalizeAnswerFromRaw[\s\S]*?^\}/m);
if (!fnMatch) { console.log("[FAIL] 未找到函数"); process.exit(1); }

// 执行函数定义
eval(fnMatch[0]);

let pass = 0, fail = 0;
function test(label, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? "[PASS]" : "[FAIL]") + " " + label + ": " + JSON.stringify(actual) + " (期望: " + JSON.stringify(expected) + ")");
  if (ok) pass++; else fail++;
}

console.log("===== normalizeAnswerFromRaw 函数测试 =====");
test("单选 B", normalizeAnswerFromRaw("B", "single"), "B");
test("单选 b", normalizeAnswerFromRaw("b", "single"), "B");
test("单选 (A)", normalizeAnswerFromRaw("(A)", "single"), "A");
test("多选 ACD", normalizeAnswerFromRaw("ACD", "multiple"), "A,C,D");
test("多选 A, C, D", normalizeAnswerFromRaw("A, C, D", "multiple"), "A,C,D");
test("多选 a.c.d", normalizeAnswerFromRaw("a.c.d", "multiple"), "A,C,D");
test("判断 正确", normalizeAnswerFromRaw("正确", "judge"), "正确");
test("判断 √", normalizeAnswerFromRaw("√", "judge"), "正确");
test("判断 错误", normalizeAnswerFromRaw("错误", "judge"), "错误");
test("判断 ×", normalizeAnswerFromRaw("×", "judge"), "错误");
test("判断 FALSE", normalizeAnswerFromRaw("FALSE", "judge"), "错误");
test("填空 4. H2O", normalizeAnswerFromRaw("4. H2O", "fill"), "H2O");
test("填空 H2O", normalizeAnswerFromRaw("H2O", "fill"), "H2O");
test("简答 5. 人工智能是...", normalizeAnswerFromRaw("5. 人工智能是...", "short_answer"), "人工智能是...");
test("空答案", normalizeAnswerFromRaw("", "single"), "");

console.log("\n===== 结果: " + pass + " 通过, " + fail + " 失败 =====");
process.exit(fail > 0 ? 1 : 0);
