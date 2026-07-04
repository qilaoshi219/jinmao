# 使用 LLM 进行多级标题层级增强的例子参考 ​

# 使用 LLM 进行多级标题层级增强的例子参考 ​

## 基本思路 ​

使用 LLM 对所有二级标题进行层级的重新判断

## 模型建议 ​

建议使用 R1 或类似的推理模型，其余模型效果未必理想

## 参考代码 ​

python ```
import re
import requests
import json
import time

# model 建议使用R1，或类似的推理模型

api_key = ""
model = ""
url = ""

def request_llm(messages: list[dict]) -> str:
    """
    请求llm，返回处理后的内容
    """
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    data = {
        'model': model,
        'messages': messages
    }
    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 200:
        raise ValueError(f'request llm failed, {response.status_code} {response.text}')
    # print(response.json())
    return response.json()['choices'][0]['message']['content']

def merge_and_fix(markdown_text: str, origin_titles: list[dict], fixed_titles: list[dict]) -> str:
    """
    合并原始文本和输出标题，并进行修正
    """
    if len(origin_titles) != len(fixed_titles):
        raise ValueError(f'origin_titles和output_titles的长度不一致，{len(origin_titles)} != {len(fixed_titles)}')
    for origin_title, fixed_title in zip(origin_titles, fixed_titles):
        markdown_text = markdown_text.replace(origin_title['text'], fixed_title['text'])
    return markdown_text

def get_titles_levels_from_markdown(markdown_text: str) -> list[dict]:
    """
    从markdown文本中提取标题
    return: list[dict] = [{
        'title': str,
        'level': int # 标题的级别(#的个数)
    }]
    """
    res = []
    lines = markdown_text.split('\n')
    for line in lines:
        if line.startswith('#'):
            level = line.count('#')
            title = line.replace('#', '').strip()
            res.append({
                'title': title,
                'level': level,
                'text': line
            })
    return res

def build_messages(title_levels: list[dict]) -> list[dict]:
    """
    构建llm的messages
    """
    messages = [{
        "role": "system",
        "content": "你是一个XML标题层级校正专家，根据语义，将标题层级调整为正确的层级，如果存在，谨慎修改标题的内容错误，如不确定不应该修改。根据情况，可以有多个一级标题。" +
                   "输入格式的<{{id}}>是用于匹配结果的，你绝对不应该修改。" +
                   "不允许添加、删除标题，不允许调整标题顺序。"
    }]
    user_prompt = '输入内容:\n'
    idx = 0
    for title_level in title_levels:
        user_prompt += f"<{idx}><h{title_level['level']}>{title_level['title']}</h{title_level['level']}>\n"
        idx += 1
    user_prompt += '\n保持输出格式一致，输出内容:\n'
    messages.append({
        "role": "user",
        "content": user_prompt
    })
    return messages

def read_output(content: str) -> list[dict]:
    """
    读取输出内容，返回标题和级别
    return: list[dict] = [{
        'title': str, # 标题，无#
        'level': int # 标题的级别(#的个数)
        'text': str # 替换后的文本
    }]
    """
    res = []
    lines = content.split('\n')
    reg = re.compile(r'<(\d+)><h(\d+)>(.*?)</h\d+>')
    idx = 0
    for line in lines:
        if line.strip() == '':
            continue
        match = reg.match(line)
        # check idx
        if int(match.group(1)) != idx:
            raise ValueError(f'idx error, {match.group(1)} != {idx}')
        idx += 1
        if match:
            t = {
                'title': match.group(3),
                'level': int(match.group(2)),
            }
            t['text'] = '#' * t['level'] + ' ' + t['title']
            res.append(t)
    return res

if __name__ == '__main__':
    with open('input.md', 'r', encoding='utf-8') as f:
        content = f.read()
        origin_titles = get_titles_levels_from_markdown(content)
        # with open('origin_titles.txt', 'w', encoding='utf-8') as f2:
        #     c = json.dumps(origin_titles, ensure_ascii=False, indent=4)
        #     f2.write(c)
        messages = build_messages(origin_titles)
        # with open('messages.txt', 'w', encoding='utf-8') as f3:
        #     c = json.dumps(messages, ensure_ascii=False, indent=4)
        #     f3.write(c)
        # start = time.time()
        response = request_llm(messages)
        # with open('llm_response.txt', 'w', encoding='utf-8') as f4:
        #     f4.write(response)
        # end = time.time()
        print(f'llm response time: {end - start}s')
        fixed_titles = read_output(response)
        # with open('fixed_titles.txt', 'w', encoding='utf-8') as f5:
        #     c = json.dumps(fixed_titles, ensure_ascii=False, indent=4)
        #     f5.write(c)
        merged_content = merge_and_fix(content, origin_titles, fixed_titles)
        # with open('output.md', 'w', encoding='utf-8') as f6:
        #     f6.write(merged_content)
```

## 使用说明 ​

1. 配置参数：设置 api_key、model、url 等 LLM 接口参数
2. 运行脚本：执行脚本后会自动处理标题层级并输出结果

## 注意事项 ​

- 推荐使用 R1 等推理能力强的模型
- 脚本会保持标题的顺序不变，只调整层级
- 如果标题内容有明显错误，LLM 会谨慎修正