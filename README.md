# 面试 AI 助手

基于 DeepSeek-R1 大模型的前端面试练习工具，支持知识点学习和模拟面试两种模式。

![Tech Stack](https://img.shields.io/badge/Vue-3-42b883) ![Tech Stack](https://img.shields.io/badge/Node.js-Express-green) ![Tech Stack](https://img.shields.io/badge/AI-DeepSeek--R1-blue)

## 功能

**学习模式**：输入任意前端知识点，AI 以「核心答案 → 原理解释 → 代码示例」的结构给出详细讲解。

**面试模式**：AI 扮演资深面试官，完整还原真实面试的三轮流程——出题、追问、评分。每轮结束后从准确性、深度、表达三个维度打分，并给出满分答案。

**错题收藏**：把没答好的题目收藏到本地，方便后续针对性复习。

## 技术亮点

- **流式输出**：基于 Server-Sent Events 实现打字机效果，后端逐块转发 AI 响应，前端用 `ReadableStream` 接收，无需额外依赖
- **Prompt Engineering**：针对学习和面试两种场景设计了不同的 System Prompt，控制 AI 的角色、输出格式和评分维度
- **上下文管理**：每次请求携带完整对话历史，保证多轮追问的连贯性
- **可扩展架构**：AI 提供商封装在后端，切换模型只需改一行配置，前端零感知

## 本地运行

**环境要求**：Node.js 18+

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/interview-ai.git
cd interview-ai

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 4. 启动后端（终端 1）
node server.js

# 5. 启动前端（终端 2）
npm run dev
```

浏览器打开 `http://localhost:5173`

## 环境变量

在项目根目录创建 `.env` 文件：

```
GROQ_API_KEY=你的硅基流动APIKey
```

API Key 在 [硅基流动控制台](https://cloud.siliconflow.cn) 申请，注册即送免费额度。

## 项目结构

```
interview-ai/
├── server.js          # Express 后端，负责转发请求和流式响应
├── src/
│   ├── api/
│   │   └── chat.js    # API 调用模块，包含 System Prompt 和流式接收逻辑
│   └── App.vue        # 主界面，聊天 UI + 面试流程控制
└── .env.example       # 环境变量示例
```

## 后续计划

- [ ] 支持自定义题库，按薄弱点专项练习
- [ ] 面试记录导出为 PDF 复习笔记
- [ ] 接入更多 AI 提供商（OpenAI、Anthropic）
