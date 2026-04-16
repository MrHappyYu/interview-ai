// ============================================================
// server.js — 后端代理服务器
//
// 为什么需要后端？
// 1. 浏览器直接调用第三方 AI API 会被 CORS 策略拦截
// 2. API Key 不能暴露在前端代码里，否则任何人都能看到
// 3. 后端统一处理流式响应，前端只需接收简单格式的数据
// ============================================================

// 加载 .env 文件里的环境变量（如 GROQ_API_KEY）到 process.env
require('dotenv').config()

const express = require('express')
const cors = require('cors')

const app = express()

// 允许跨域请求——开发时前端跑在 5173 端口，后端在 3000 端口，端口不同就算跨域
app.use(cors())

// 解析请求体中的 JSON 数据，否则 req.body 会是 undefined
app.use(express.json())

// ============================================================
// POST /api/chat — 核心接口
//
// 接收前端发来的对话消息，转发给 AI API，
// 再把 AI 的流式响应实时传回前端（Server-Sent Events 格式）
// ============================================================
app.post('/api/chat', async (req, res) => {
  // 从请求体中解构出消息历史和系统提示
  // messages: 完整的对话历史数组，格式 [{role: 'user'|'assistant', content: '...'}]
  // system: System Prompt，告诉 AI 扮演什么角色、按什么格式回答
  const { messages, system } = req.body

  // 生成请求 ID，用于日志追踪（同一次请求的日志都有相同 ID，方便排查问题）
  const reqId = Date.now()

  // 取最后一条用户消息的前60个字符用于日志显示
  const lastUserMsg = messages.at(-1)?.content?.slice(0, 60) ?? ''
  console.log(`\n[${reqId}] >>> 请求进来了`)
  console.log(`[${reqId}] 模式: ${system?.slice(0, 40)}...`)
  console.log(`[${reqId}] 用户说: ${lastUserMsg}${lastUserMsg.length === 60 ? '...' : ''}`)
  console.log(`[${reqId}] 消息轮数: ${messages.length}`)

  // 设置响应头，告诉浏览器这是一个 SSE（Server-Sent Events）流式响应
  // SSE 是 HTTP 长连接，服务器可以持续往客户端推数据
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')   // 禁止缓存，每次都要实时数据
  res.setHeader('Connection', 'keep-alive')     // 保持连接不断开

  try {
    // 调用硅基流动的 AI 接口
    // 硅基流动兼容 OpenAI 的 API 格式，所以接口路径是 /openai/v1/...
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Bearer Token 认证——API Key 从环境变量读取，不硬编码在代码里
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-R1', // 使用 DeepSeek-R1 推理模型
        max_tokens: 1024,                  // 限制单次回复最大 token 数
        stream: true,                      // 开启流式输出，AI 生成一段发一段，不等全部生成完
        messages: [
          // OpenAI 格式把 system prompt 放在 messages 数组第一条
          { role: 'system', content: system },
          // 展开完整的对话历史，让 AI 能理解上下文
          ...messages,
        ],
      }),
    })

    console.log(`[${reqId}] API 响应状态: ${response.status} ${response.statusText}`)

    // 如果 API 返回错误状态码（4xx/5xx），读取错误信息并返回给前端
    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[${reqId}] API 报错 ${response.status}: ${errBody}`)
      res.write(`data: ${JSON.stringify({ error: errBody })}\n\n`)
      res.end()
      return
    }

    // 用 ReadableStream 的 reader 逐块读取响应数据
    // AI 会不断生成 token，每生成一小段就发送一个数据块（chunk）
    const reader = response.body.getReader()
    const decoder = new TextDecoder() // 把二进制数据转成字符串
    let fullText = ''                  // 累积完整回复，用于日志

    while (true) {
      // read() 返回 { done, value }
      // done=true 表示流结束，value 是这次读到的二进制数据
      const { done, value } = await reader.read()
      if (done) { res.end(); break }

      // 解码二进制数据，得到类似这样的字符串：
      // "data: {"id":"...","choices":[{"delta":{"content":"你好"}}]}\n\n"
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6) // 去掉开头的 "data: "

        // "[DONE]" 是 OpenAI 格式约定的流结束标志
        if (data === '[DONE]') {
          console.log(`[${reqId}] <<< 回复完成，共 ${fullText.length} 字符`)
          console.log(`[${reqId}] 回复预览: ${fullText.slice(0, 80)}${fullText.length > 80 ? '...' : ''}`)
          res.end()
          return
        }

        try {
          const parsed = JSON.parse(data)
          // choices[0].delta.content 是这次新生成的文字片段
          const text = parsed.choices?.[0]?.delta?.content
          if (text) {
            fullText += text
            // 用 SSE 格式转发给前端：data: {"text":"..."}\n\n
            // 前端监听这个格式就能实时拿到每一段文字
            res.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
        } catch {
          // 忽略解析失败的行（比如空行、心跳包等）
        }
      }
    }
  } catch (err) {
    // 网络错误、超时等异常
    console.error(`[${reqId}] !!! 出错了: ${err.message}`)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

// 启动服务器，监听 3000 端口
app.listen(3000, () => console.log('后端运行在 http://localhost:3000'))