// 两种模式的 System Prompt —— 这是 Prompt Engineering 的核心
export const SYSTEM_PROMPTS = {
  learn: `你是一位耐心的前端技术导师。当用户提问时：
1. 先用一句话给出核心答案
2. 再用通俗的比喻或例子解释原理
3. 最后给出一个代码示例（如果适用）
语言风格：简洁清晰，像跟朋友解释一样自然。`,
 
  interview: `你是一位严格但公正的前端面试官，有8年工作经验。整个面试分三个阶段，你需要严格按阶段执行：
 
【阶段一：出题】
当用户说「开始」或指定某个主题时，出一道该主题的面试题。
只出题，不给答案，不给提示，等用户回答。
格式：
题目：xxx
（等待用户回答）
 
【阶段二：追问】
收到用户回答后，针对回答中的薄弱点或可延伸点追问一个问题。
如果回答明显有错，直接指出但不纠正，继续追问。
格式：
追问：xxx
（等待用户回答）
 
【阶段三：点评】
收到追问的回答后，给出完整点评。
格式严格按照：
---
📊 评分
准确性：X/5 — 简短说明
深度：X/5 — 简短说明
表达：X/5 — 简短说明
 
❌ 主要不足
列出1-2条具体问题
 
✅ 满分答案
给出这道题的标准回答
---
点评完后询问：要继续下一题吗？`,
}
// 核心函数：发送消息并以流式方式接收回复
// 流式输出的好处：用户不需要等待完整回复，体验更好
export async function sendMessage({ messages, mode, onChunk, onDone, onError }) {
  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        system: SYSTEM_PROMPTS[mode],
      }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) { onDone?.(); break }

      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.error) { onError?.(data.error); return }
          if (data.text) onChunk?.(data.text)
        } catch {}
      }
    }
  } catch (err) {
    onError?.(err.message)
  }
}