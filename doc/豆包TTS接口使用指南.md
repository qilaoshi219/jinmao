# 豆包 TTS 语音合成接口使用指南

> 最后更新: 2026-07-04  
> 对应脚本: `daemon/storage/doubao_tts_batch.py` / `daemon/storage/doubao_tts_stream.py`

---

## 1. 使用的接口

### 接口地址

```
POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
```

- **协议**: HTTP Chunked 单向流式传输（一次性输入全部文本，流式输出音频）
- **官方文档**: [火山引擎 V3 HTTP Chunked 单向流式文档](https://www.volcengine.com/docs/6561/1598757?lang=zh#_2-http-chunked%E6%A0%BC%E5%BC%8F%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E)
- **模型版本**: `seed-tts-2.0`（豆包语音合成模型 2.0）

### 项目中两种使用模式

| 模式 | 脚本 | 场景 | 配置 |
|------|------|------|------|
| **Stream（流式）** | `doubao_tts_stream.py` | 学习页实时播放（兜底方案） | `doubao_tts_stream_config.json` |
| **Batch（批量）** | `doubao_tts_batch.py` | 课程生成时批量合成（主力方案） | `doubao_tts_batch_config.json` |

两个脚本共用同一 API 端点，区别仅在于输出方式。

---

## 2. 请求参数（请求头 + 请求体）

### 2.1 Request Headers

| 头名称 | 说明 | 必须 | 示例 |
|--------|------|------|------|
| `Content-Type` | 固定值 | 是 | `application/json` |
| `X-Api-App-Id` | 火山引擎 APP ID | 是 | `8536880292` |
| `X-Api-Access-Key` | 火山引擎 Access Token | 是 | `jSRAd_AA9sLq1ha8k2Z-X5TUYaJWTr46` |
| `X-Api-Resource-Id` | 服务资源 ID | 是 | `seed-tts-2.0` |
| `X-Api-Request-Id` | 请求标识（UUID） | 否 | `67ee89ba-7050-4c04-a3d7-ac61a63499b3` |

> 获取方式：火山引擎控制台 → 语音技术 → 服务管理 → 获取 APP ID / Access Token

### 2.2 Request Body (JSON)

```json
{
  "user": {
    "uid": "tts_batch"
  },
  "req_params": {
    "text": "需要合成的文本内容",
    "speaker": "zh_female_yingyujiaoxue_uranus_bigtts",
    "model": "",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000,
      "enable_subtitle": true
    }
  }
}
```

#### 核心字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `user.uid` | string | 用户标识，用于区分调用方（batch 模式用 `tts_batch`，stream 模式用 `tts_demo`） |
| `req_params.text` | string | **要合成的文本**（必填），最大长度见火山引擎文档限制 |
| `req_params.speaker` | string | **发音人**（必填），详见[发音人列表](https://www.volcengine.com/docs/6561/1257544) |
| `req_params.model` | string | 模型版本，为空则使用默认 `seed-tts-2.0-expressive`。可选 `seed-tts-2.0-standard` |
| `audio_params.format` | string | 音频格式：`mp3` / `ogg_opus` / `pcm`。**本项目固定用 `mp3`** |
| `audio_params.sample_rate` | number | 采样率：8000~48000。**本项目固定用 `24000`** |
| `audio_params.enable_subtitle` | boolean | **是否启用字幕**。设为 `true` 后 API 返回字/词级时间戳。默认 `false` |

#### 其他可选 audio_params 参数

| 字段 | 说明 |
|------|------|
| `bit_rate` | MP3 比特率，默认 64k~160k |
| `speech_rate` | 语速，范围 [-50, 100]，100=2倍速，-50=0.5倍速，默认 0 |
| `loudness_rate` | 音量，范围 [-50, 100]，默认 0 |
| `emotion` + `emotion_scale` | 情感设置（部分音色支持） |

---

## 3. API 响应（流式 JSON 逐对象返回）

API 以 HTTP Chunked 方式逐条返回 JSON 对象。响应中包含以下几种事件类型：

### 3.1 音频数据 chunk

```json
{
  "data": "//uQxAAAAAANIAAAAAE...（Base64编码的MP3音频数据）"
}
```

`data` 字段为 Base64 编码的音频二进制数据，解码后即为 MP3 片段。

### 3.2 字幕事件（TTSSubtitle）

当 `enable_subtitle: true` 时，API 返回句子级别的词级时间戳：

```json
{
  "sentence": {
    "text": "你好世界",
    "words": [
      { "word": "你好", "startTime": 1.2, "endTime": 1.8 },
      { "word": "世界", "startTime": 1.8, "endTime": 2.3 }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `sentence.text` | string | 该句完整文本 |
| `words[].word` | string | 单个字/词原文 |
| `words[].startTime` | number | 该字/词开始时间（**单位: 秒**） |
| `words[].endTime` | number | 该字/词结束时间（**单位: 秒**） |

> **注意**: API 返回的时间戳单位是**秒**，项目中会 ×1000 转换为毫秒后再使用。

### 3.3 附加信息（addition）

```json
{
  "addition": {
    "duration": 15.5
  }
}
```

`addition.duration` 为音频总时长（**单位: 秒**）。但该字段并非每次都有，代码中会优先使用 API 返回的时长，其次用字幕最后一个词的 `endTime`，最后用音频文件大小估算。

### 3.4 正常结束

当 `code=20000000` 且 `message="OK"` 时表示合成正常结束。

---

## 4. 返回值（项目内部封装后）

### 4.1 Batch 模式（doubao_tts_batch.py）

stdout 输出**单行 JSON**：

```json
{
  "success": true,
  "output": "oss/linshiaudio/000.mp3",
  "duration_ms": 15230,
  "subtitle_srt": "1\n00:00:00,000 --> 00:00:01,200\n你好世界\n\n2\n00:00:01,200 --> 00:00:02,300\n欢迎学习\n",
  "error": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 合成是否成功 |
| `output` | string | 输出的 MP3 文件路径（相对于项目根目录） |
| `duration_ms` | number | 音频时长（**单位: 毫秒**） |
| `subtitle_srt` | string | SRT 格式的字幕文本（仅当 enable_subtitle=true 时有值） |
| `error` | string/null | 失败时的错误信息 |

失败时：
```json
{
  "success": false,
  "output": null,
  "duration_ms": 0,
  "error": "EMPTY_TEXT"
}
```

### 4.2 Stream 模式（doubao_tts_stream.py）

stdout 流式输出**多行 NDJSON**（每行一个 JSON 对象）：

```json
{"type":"audio","b64":"//uQxAAAAA...","seq":1}
{"type":"audio","b64":"//uQxAAAAA...","seq":2}
{"type":"subtitle","sentenceText":"你好世界","words":[{"start":1.2,"end":1.8,"text":"你好"},{"start":1.8,"end":2.3,"text":"世界"}]}
{"type":"done"}
```

| type | 说明 |
|------|------|
| `audio` | 一个音频 chunk，`b64` 为 Base64，`seq` 为序号 |
| `subtitle` | 一个字幕段，含字/词级时间戳（单位: 秒） |
| `error` | 出错时返回 |
| `done` | 合成完成 |

---

## 5. 如何生成 MP3

### Batch 模式（推荐，课程生成时使用）

`doubao_tts_batch.py` 内部已经自动完成，流程如下：

1. 从 stdin 读取合成文本
2. 构建请求并发送到火山 API
3. 逐 chunk 接收 Base64 音频数据 → `base64.b64decode()` 解码 → 累积到 `audio_chunks` 数组
4. 全部接收完后：`full_audio = b"".join(audio_chunks)` 拼接为完整二进制
5. 写入文件：`open(output_file_path, "wb").write(full_audio)`
6. 通过 FileStore 获取最终的相对路径作为 `output` 返回

**手动使用示例：**

```bash
# 从项目根目录执行
echo "欢迎学习闸门运行工教程，今天我们来了解水工闸门的基本结构。" | \
  python daemon/storage/doubao_tts_batch.py \
    --config daemon/config/doubao_tts_batch_config.json \
    --output-dir oss/linshiaudio \
    --output-name test.mp3 \
    --store-config daemon/config/file_store.json
```

输出（stdout 一行 JSON）：
```json
{"success":true,"output":"oss/linshiaudio/test.mp3","duration_ms":8500,"subtitle_srt":"1\n...","error":null}
```

### Stream 模式

流式模式不自动落盘。前端（`web/src/lib/tts.js`）负责：
1. 通过 `/api/tts/stream` 端点获取流式 NDJSON
2. 每收到 `{"type":"audio","b64":"..."}` 就 `atob(b64)` 解码为二进制
3. 使用 Web Audio API 或 `Audio` 元素实时播放

如需保存为 MP3，可在前端或中间层累积所有 audio chunk 的 Base64 数据后一并拼接写入。

---

## 6. 如何获取 SRT 字幕

### Batch 模式（自动生成）

`doubao_tts_batch.py` 内部自动完成 SRT 生成，流程如下：

1. API 返回 `enable_subtitle: true` 后，从响应流中提取每个 `sentence` 事件
2. 遍历 `words[]` 获取每个字的 `startTime` 和 `endTime`（API 返回秒，代码 ×1000 转为毫秒）
3. 将同一句的所有字合并为一个句子，取最早 `startTime` 和最晚 `endTime`
4. 累积到 `all_sentences` 数组（格式：`[{text, start_ms, end_ms}, ...]`）
5. 全部合成完成后调用 `_generate_srt(all_sentences)` 生成标准 SRT 文本
6. SRT 文本通过 `subtitle_srt` 字段在返回值中返回

**生成的 SRT 格式示例：**

```
1
00:00:00,000 --> 00:00:01,200
你好世界

2
00:00:01,200 --> 00:00:02,300
欢迎学习闸门运行工教程
```

### Node.js 侧写入 SRT 文件

在 `daemon/server/src/services/assets.js` 的 `runDoubaoTtsBatch()` 中：

- 如果调用时传入了 `srtAbsPath`（SRT 文件绝对路径）
- 且 Python 返回的 `subtitle_srt` 非空
- 则自动将 SRT 内容写入磁盘文件

### Stream 模式

流式模式返回 `{"type":"subtitle","words":[...]}` 事件，前端可直接按字粒度显示实时字幕，不生成完整 SRT 文件。

---

## 7. 使用的配置文件

### 7.1 Batch 模式配置: `daemon/config/doubao_tts_batch_config.json`

Batch 模式默认使用自己的配置文件：

```json
{
  "base_url": "https://openspeech.bytedance.com",
  "api_path": "/api/v3/tts/unidirectional",
  "app_id": "8536880292",
  "access_key": "jSRAd_AA9sLq1ha8k2Z-X5TUYaJWTr46",
  "resource_id": "seed-tts-2.0",
  "uid": "tts_batch",
  "speaker": "zh_female_yingyujiaoxue_uranus_bigtts",
  "model": "",
  "audio_params": {
    "format": "mp3",
    "sample_rate": 24000,
    "enable_subtitle": true
  },
  "timeout_seconds": 300,
  "retry_count": 3
}
```

### 7.2 Stream 模式配置: `daemon/config/doubao_tts_stream_config.json`

```json
{
  "base_url": "https://openspeech.bytedance.com",
  "api_path": "/api/v3/tts/unidirectional",
  "app_id": "8536880292",
  "access_key": "jSRAd_AA9sLq1ha8k2Z-X5TUYaJWTr46",
  "resource_id": "seed-tts-2.0",
  "uid": "tts_demo",
  "speaker": "zh_female_yingyujiaoxue_uranus_bigtts",
  "model": "",
  "audio_params": {
    "format": "mp3",
    "sample_rate": 24000,
    "enable_subtitle": true
  },
  "timeout_seconds": 120
}
```

### 7.3 配置项说明

| 配置项 | 说明 | 必填 |
|--------|------|------|
| `base_url` | 火山引擎服务地址 | 是 |
| `api_path` | API 路径，默认 `/api/v3/tts/unidirectional` | 是 |
| `app_id` | 火山引擎 APP ID | 是 |
| `access_key` | 火山引擎 Access Token | 是 |
| `resource_id` | 服务资源 ID，目前为 `seed-tts-2.0` | 是 |
| `uid` | 用户标识，stream 用 `tts_demo`，batch 用 `tts_batch` | 否 |
| `speaker` | 发音人音色 ID | 是 |
| `model` | 模型版本，为空则默认 `seed-tts-2.0-expressive` | 否 |
| `audio_params.format` | 音频格式，固定 `mp3` | 否（默认 mp3） |
| `audio_params.sample_rate` | 采样率，固定 `24000` | 否（默认 24000） |
| `audio_params.enable_subtitle` | 是否启用字幕（必须为 `true` 才能获取 SRT） | 否（默认 false） |
| `timeout_seconds` | HTTP 请求超时时间（秒），batch 模式至少 180 秒 | 否 |
| `retry_count` | 重试次数（仅 batch 模式配置中有，代码未实现） | 否 |

### 7.4 两个配置的区别

| 差异项 | batch 配置 | stream 配置 |
|--------|-----------|-------------|
| `uid` | `tts_batch` | `tts_demo` |
| `timeout_seconds` | 300（最少 180） | 120 |
| `retry_count` | 3 | 无（未配置） |

> 其余配置（`app_id`、`access_key`、`resource_id`、`speaker`、`audio_params`）完全相同。

---

## 8. 项目中的调用链路

### 8.1 Batch 模式（课程生成）

```
用户上传课程 → courseRoutes.js
  → ensure-chapter-audio 端点
  → assets.runDoubaoTtsBatch()
  → spawn doubao_tts_batch.py
    → stdin: 合成文本
    → stdout: {"success":true, "output":"...", "duration_ms":..., "subtitle_srt":"..."}
  → assets.js 解析 JSON
    → 写入 MP3 文件（Python 已完成）
    → 写入 SRT 文件（Node.js 侧完成）
    → 更新 manifest.json 的 audio_url / subtitle_url / audio_duration_ms
```

### 8.2 Stream 模式（实时播放，兜底）

```
StudyPage.vue 前端
  → POST /api/tts/stream (learningRoutes.js)
  → spawn doubao_tts_stream.py
    → stdin: 合成文本
    → stdout: NDJSON 流（逐行 type:audio / type:subtitle / type:done）
  → 前端 tts.js 实时解码播放 + 显示字幕
```

---

## 9. 注意事项

1. **enable_subtitle 必须为 true**：如需获取 SRT 字幕或音频时长（从字幕 endTime 推断），必须启用此参数，否则无法获得时间信息。

2. **时间戳单位注意转换**：API 返回的字幕 `startTime`/`endTime` 单位是**秒**，doubao_tts_batch.py 内部已自动 ×1000 转为毫秒再生成 SRT。如果直接从 API 获取原始数据需自行转换。

3. **Batch 模式超时设置**：因为需要累积全部音频数据后才拼接写入，超时时间至少设置为 180 秒。代码会自动将小于 180 的超时值提升到 180。

4. **容错机制**：即使 API 返回 HTTP 错误或异常，如果已收到部分音频数据，batch 模式仍会输出已有数据并标记为成功（部分合成结果可用）。

5. **文本长度限制**：API 对单次合成文本长度有限制（具体见火山引擎文档），过长的文本需要分段调用。

6. **SSML 与字幕互斥**：使用 SSML 格式文本时，`enable_subtitle` 不生效，不会返回字幕。

7. **LaTeX 公式与字幕互斥**：启用 `enable_latex_tn` 时字幕功能不生效。

8. **Model 参数**：不传或传空字符串时默认使用 `seed-tts-2.0-expressive`（表现力较强但可能不稳定），可传 `seed-tts-2.0-standard` 获得更稳定的表现力。

9. **连接复用**：火山服务端 keep-alive 为 1 分钟，频繁调用建议使用连接池复用 TCP 连接。

---

## 10. 常见错误码

| 错误 | 说明 |
|------|------|
| `EMPTY_TEXT` | stdin 传入的文本为空 |
| `MISSING_CONFIG` | app_id / access_key / resource_id / speaker 有一项未配置 |
| `NO_AUDIO_DATA` | API 返回了响应但没有任何音频数据 |
| `TTS_FAILED` | API 返回了非零 code 和错误消息 |
| `HTTP_ERROR_{code}` | HTTP 请求失败 |
| `EXCEPTION: ...` | 其他未预期的异常 |
