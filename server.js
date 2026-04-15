require('dotenv').config()
console.log('Key 前8位:', process.env.GROQ_API_KEY?.slice(0, 8)) 
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages, system } = req.body
  const reqId = Date.now()
  const lastUserMsg = messages.at(-1)?.content?.slice(0, 60) ?? ''

  console.log(`\n[${reqId}] >>> 请求进来了`)
  console.log(`[${reqId}] 模式: ${system?.slice(0, 40)}...`)
  console.log(`[${reqId}] 用户说: ${lastUserMsg}${lastUserMsg.length === 60 ? '...' : ''}`)
  console.log(`[${reqId}] 消息轮数: ${messages.length}`)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-R1',
        max_tokens: 1024,
        stream: true,
        messages: [
          { role: 'system', content: system },
          ...messages,
        ],
      }),
    })

    console.log(`[${reqId}] API 响应状态: ${response.status} ${response.statusText}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) { res.end(); break }

      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') {
          console.log(`[${reqId}] <<< 回复完成，共 ${fullText.length} 字符`)
          console.log(`[${reqId}] 回复预览: ${fullText.slice(0, 80)}${fullText.length > 80 ? '...' : ''}`)
          res.end()
          return
        }
        try {
          const parsed = JSON.parse(data)
          const text = parsed.choices?.[0]?.delta?.content
          if (text) {
            fullText += text
            res.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error(`[${reqId}] !!! 出错了: ${err.message}`)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

app.listen(3000, () => console.log('后端运行在 http://localhost:3000'))