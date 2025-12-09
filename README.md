# ⚡ Typli API Ultimate - AI 聊天与图像生成平台

<div align="center">

![Version](https://img.shields.io/badge/version-5.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-orange)
![License](https://img.shields.io/badge/license-MIT-green)

**一键部署的 AI 聊天和图像生成服务**  
支持 10+ 顶级 AI 模型 | FLUX 2 Pro 图像生成 | OpenAI 兼容接口

[在线演示](#) | [快速部署](#-快速部署) | [API 文档](#-api-接口)

</div>

---

## 🌟 核心特性

### 💬 AI 聊天模块
- **10 个顶级模型**：Grok 4 Fast/Reasoning、Claude Haiku 4.5、GPT-5/5-Mini、GPT-4o/4o-Mini、Gemini 2.5 Flash、DeepSeek Reasoner/Chat
- **流式输出**：实时显示 AI 响应，体验更流畅
- **文件上传**：支持图片、PDF、文档、代码等多种格式（单文件最大 10MB）
- **对话管理**：自动保存历史记录（最多 50 条），支持切换和导出
- **Markdown 渲染**：完整支持代码高亮、表格、图片等富文本

### 🎨 图像生成工作室
- **5 个专业模型**：
  - FLUX 2 / FLUX 2 Pro（标准/专业版）
  - Nano Banana / Nano Banana Pro（快速生成）
  - Stable Diffusion v3.5 Large（经典模型）

- **高级功能**：
  - 🎭 **6 种风格预设**：真实照片、动漫、油画、3D 渲染、赛博朋克、水彩画
  - 📐 **5 种比例选择**：1:1、16:9、4:3、3:4、21:9
  - ⚙️ **精细参数控制**：
    - Steps（生成步数）：20-100
    - CFG Scale（提示词强度）：1-20
    - Seed（随机种子）：支持固定种子复现
  - 🔢 **批量生成**：一次生成 1/2/4 张图像
  - 🚫 **负面提示词**：精确控制不想要的元素

### 📡 API 接口
- **OpenAI 兼容**：完全兼容 OpenAI API 格式
- **统一端点**：`/v1/chat/completions` 和 `/v1/images/generations`
- **Bearer 认证**：支持自定义 API 密钥
- **流式/非流式**：灵活选择响应方式

---

## 🚀 快速部署

### 方法一：Cloudflare Workers（推荐）

1. **创建 Worker**
   ```bash
   # 登录 Cloudflare Dashboard
   # 进入 Workers & Pages > 创建应用程序 > 创建 Worker
   ```

2. **复制代码**
   - 将 `worker.js` 的全部内容复制到 Worker 编辑器
   - 点击"保存并部署"

3. **配置密钥（可选）**
   ```bash
   # 在 Worker 设置 > 变量 > 环境变量中添加
   API_MASTER_KEY = "your-secret-key"
   ```

4. **访问服务**
   ```
   https://your-worker-name.workers.dev/
   ```

### 方法二：本地开发

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 克隆项目
git clone https://github.com/kinai9661/flux2.0api.git
cd flux2.0api

# 本地运行
wrangler dev

# 访问 http://localhost:8787
```

---

## 📖 使用指南

### Web 界面使用

#### 💬 聊天功能
1. 选择 AI 模型（默认 Grok 4 Fast）
2. 输入消息或上传文件（支持拖拽）
3. 按 `Ctrl + Enter` 或点击"发送"按钮
4. 查看流式响应，支持复制、删除、导出

#### 🎨 图像生成
1. 选择图像模型（推荐 FLUX 2 Pro）
2. 输入提示词（中文/英文均可）
3. 选择风格预设和图像比例
4. 调整生成参数（可选）
5. 点击"生成图像"，支持批量生成
6. 下载、预览或重新生成图像

### API 调用示例

#### 聊天接口

```bash
curl https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "xai/grok-4-fast",
    "messages": [
      {"role": "user", "content": "你好，介绍一下自己"}
    ],
    "stream": true
  }'
```

#### 图像生成接口

```bash
curl https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "fal-ai/flux-2-pro",
    "messages": [
      {"role": "user", "content": "a beautiful sunset over the ocean, photorealistic"}
    ]
  }'
```

#### Python 示例

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://your-worker.workers.dev/v1"
)

# 聊天
response = client.chat.completions.create(
    model="xai/grok-4-fast",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

---

## 🎯 支持的模型

### 聊天模型

| 模型 ID | 名称 | 特点 |
|--------|------|------|
| `xai/grok-4-fast` | Grok 4 Fast | 超快推理速度 |
| `xai/grok-4-fast-reasoning` | Grok 4 Fast Reasoning | 高级逻辑推理 |
| `anthropic/claude-haiku-4-5` | Claude Haiku 4.5 | 快速精准对话 |
| `openai/gpt-5` | GPT-5 | OpenAI 旗舰模型 |
| `openai/gpt-5-mini` | GPT-5 Mini | 轻量高效版本 |
| `openai/gpt-4o` | GPT-4o | 优化版 GPT-4 |
| `openai/gpt-4o-mini` | GPT-4o Mini | 迷你版 GPT-4 |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | 快速多模态 |
| `deepseek/deepseek-reasoner` | DeepSeek Reasoner | 深度分析推理 |
| `deepseek/deepseek-chat` | DeepSeek Chat | 自然对话交互 |

### 图像生成模型

| 模型 ID | 名称 | 特点 |
|--------|------|------|
| `fal-ai/flux-2` | FLUX 2 | 标准图像生成 |
| `fal-ai/flux-2-pro` | FLUX 2 Pro | 专业级品质 |
| `fal-ai/nano-banana` | Nano Banana | 快速生成 |
| `fal-ai/nano-banana-pro` | Nano Banana Pro | 增强版快速生成 |
| `fal-ai/stable-diffusion-v35-large` | SD v3.5 Large | 经典大型模型 |

---

## 💡 高级功能

### 固定中间布局
- 聊天区域保持 **800px** 固定宽度，提供最佳阅读体验
- 左右侧边栏自适应宽度，充分利用屏幕空间
- 移动端自动切换为单栏布局

### 主题系统
- 支持亮色/暗色主题切换
- 自动保存用户偏好
- 渐变色设计语言（紫蓝/粉红）

### 数据持久化
- 本地存储聊天历史（最多 50 条）
- 图像历史记录（最多 50 张）
- 一键导出对话为文本文件

### 文件上传
- 支持多种格式：图片（JPG/PNG/GIF）、文档（PDF/TXT/DOC）、代码（JS/PY/HTML/CSS/JSON）
- 拖拽上传，即时预览
- 单文件最大 10MB

---

## 🛠️ 技术栈

- **运行环境**：Cloudflare Workers（边缘计算）
- **前端技术**：原生 HTML/CSS/JavaScript（无框架依赖）
- **Markdown 渲染**：marked.js + highlight.js
- **上游 API**：Typli.ai
- **存储方案**：localStorage（客户端）

---

## 📝 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `API_MASTER_KEY` | `"1"` | API 认证密钥 |

---

## 🔒 安全建议

1. **生产环境**：务必修改默认 API 密钥
2. **访问控制**：可配合 Cloudflare Access 实现企业级认证
3. **速率限制**：建议在 Worker 层面添加速率限制逻辑
4. **HTTPS**：Cloudflare Workers 默认启用 HTTPS

---

## 📊 性能优化

- **边缘部署**：利用 Cloudflare 全球 300+ 节点
- **流式传输**：降低首字节时间（TTFB）
- **代码优化**：单文件架构，冷启动快
- **缓存策略**：静态资源 CDN 加速

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

- [Typli.ai](https://typli.ai) - 提供上游 AI 服务
- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台
- [marked.js](https://marked.js.org/) - Markdown 解析
- [highlight.js](https://highlightjs.org/) - 代码高亮

---

## 📮 联系方式

- **作者**：kinai9661
- **邮箱**：kinai9661@gmail.com
- **GitHub**：[@kinai9661](https://github.com/kinai9661)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

Made with ❤️ by kinai9661

</div>
