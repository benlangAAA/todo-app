
import assert from "node:assert/strict";
import "../date-parser.js";

const { resolveDueDate, parseDueDate, stripDateExpressions } = globalThis.TodoDateParser;
const baseDate = new Date(2026, 5, 5);

const cases = [
  ["五天后交作业", "2026-06-10"],
  ["两周后开会", "2026-06-19"],
  ["三天前提交过", "2026-06-02"],
  ["上周三复盘", "2026-05-27"],
  ["下周三开会", "2026-06-10"],
  ["一个半月后验收", "2026-07-20"],
  ["6.23 提交", "2026-06-23"],
  ["12.5 截止", "2026-12-05"],
  ["06-23 提交", "2026-06-23"],
  ["6/23 提交", "2026-06-23"],
  ["6 月 23 日完成", "2026-06-23"],
  ["3 月 1 日之前", "2026-03-01"],
  ["6 月23 日完成", "2026-06-23"],
  ["6月 23日完成", "2026-06-23"],
  ["6月23日完成", "2026-06-23"],
  ["后天面试", "2026-06-07"]
];

for (const [input, expected] of cases) {
  assert.equal(resolveDueDate(input, baseDate), expected, input);
}

assert.equal(resolveDueDate("13.5 不应解析", baseDate), "");
assert.equal(resolveDueDate("6.35 不应解析", baseDate), "");
assert.equal(resolveDueDate("2.31 不应解析", baseDate), "");

assert.deepEqual(
  Object.fromEntries(["五天后交作业", "6.23 提交", "6 月 23 日完成"].map(input => {
    const result = parseDueDate(input, baseDate);
    return [input, result && result.matched];
  })),
  {
    "五天后交作业": "五天后",
    "6.23 提交": "6.23",
    "6 月 23 日完成": "6 月 23 日"
  }
);

assert.equal(stripDateExpressions("五天后交作业").trim(), "交作业");
assert.equal(stripDateExpressions("6 月 23 日完成").trim(), "完成");

console.log("date parser tests passed");
