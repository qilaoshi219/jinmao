请将以下题库内容转换为标准JSON格式。要求如下：

1. **JSON结构**：必须是数组形式，每个题目为一个对象。  
2. **字段说明**：
   - `id`：题目编号（从1递增）
   - `type`：题型，取值为 `single`（单选）、`multiple`（多选）、`judge`（判断）、`fill`（填空）、`short_answer`（简答）
   - `question`：题干（字符串）
   - `options`：选项（仅单选/多选有，为数组，如 `["A. 选项1", "B. 选项2", ...]`）
   - `answer`：答案（格式见下方说明）
   - `explanation`：解析（可选，字符串，没有可省略或为空字符串）

3. **答案格式规范**：
   - **单选**：如 `"A"`
   - **多选**：数组，如 `["A", "C"]`
   - **判断**：`"正确"` 或 `"错误"`
   - **填空**：字符串或数组（如有多个空），如 `"答案内容"` 或 `["空1", "空2"]`
   - **简答**：字符串，如 `"参考答案内容"`

4. **示例格式**：
```json
[
  {
    "id": 1,
    "type": "single",
    "question": "中国的首都是？",
    "options": ["A. 上海", "B. 北京", "C. 广州", "D. 深圳"],
    "answer": "B",
    "explanation": "北京是中国的首都。"
  },
  {
    "id": 2,
    "type": "multiple",
    "question": "下列哪些是编程语言？",
    "options": ["A. Python", "B. Java", "C. HTML", "D. C++"],
    "answer": ["A", "B", "D"],
    "explanation": "HTML是标记语言，不是编程语言。"
  },
  {
    "id": 3,
    "type": "judge",
    "question": "地球是圆的。",
    "answer": true,
    "explanation": ""
  },
  {
    "id": 4,
    "type": "fill",
    "question": "水的化学式是____。",
    "answer": "H2O",
    "explanation": "水的化学式是H2O，表示水分子由氢原子和氧原子组成。"
  },
  {
    "id": 5,
    "type": "short_answer",
    "question": "简述什么是AI？",
    "answer": "人工智能（AI）是模拟人类智能的计算机系统。",
    "explanation": ""
  }
]
```

---

**下面是要转换的原始题库内容：**