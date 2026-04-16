// ============================================================
// src/api/chat.js — AI 接口调用模块
//
// 职责：
// 1. 定义 System Prompt（决定 AI 的角色和回答风格）
// 2. 封装流式请求逻辑，通过回调把数据传给调用方
// ============================================================

// ============================================================
// System Prompt 是整个项目含金量最高的部分
//
// 它本质上是"给 AI 的工作说明书"，决定了：
// - AI 扮演什么角色
// - 输出什么格式
// - 遇到不同情况怎么处理
//
// 两种模式用完全不同的 prompt，让同一个模型表现出截然不同的行为
// ============================================================
export const SYSTEM_PROMPTS = {
  // 学习模式：像导师一样耐心解释
  learn: `你是一位耐心的前端技术导师。当用户提问时：
1. 先用一句话给出核心答案
2. 再用通俗的比喻或例子解释原理
3. 最后给出一个代码示例（如果适用）
语言风格：简洁清晰，像跟朋友解释一样自然。`,

  // 面试模式：严格还原真实面试的三轮流程
  // 关键设计：用【阶段一/二/三】明确区分每个阶段的行为，
  // 并规定了严格的输出格式，方便前端通过关键词检测当前阶段
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

// ============================================================
// sendMessage — 发送消息并以流式方式接收回复
//
// 参数说明：
// - messages: 完整对话历史，每次都要把历史全部传过去，
//             因为 AI 没有记忆，只能从请求里获得上下文
// - mode: 'learn' 或 'interview'，决定用哪个 System Prompt
// - onChunk: 每收到一小段文字就调用一次，用于实现打字机效果
// - onDone: 流结束时调用
// - onError: 出错时调用
// ============================================================
export async function sendMessage({ messages, mode, onChunk, onDone, onError }) {
  try {
    // 请求自己的后端（相对路径），由后端转发给 AI API
    // 不直接请求 AI API 的原因：CORS 限制 + 保护 API Key
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,                        // 完整对话历史
        system: SYSTEM_PROMPTS[mode],    // 根据模式选对应的 System Prompt
      }),
    })

    // 获取响应体的 ReadableStream 读取器
    // ReadableStream 是浏览器原生 API，不需要任何库
    const reader = response.body.getReader()
    const decoder = new TextDecoder() // 把二进制 Uint8Array 转成字符串

    // 循环读取数据流，直到流结束
    while (true) {
      const { done, value } = await reader.read()

      // done=true 表示服务器关闭了连接，流正常结束
      if (done) { onDone?.(); break }

      // 解码当前数据块，可能包含多行 SSE 数据
      // SSE 格式：每条数据以 "data: " 开头，以 "\n\n" 结尾
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        try {
          // 去掉 "data: " 前缀，解析 JSON
          const data = JSON.parse(line.slice(6))

          // 如果后端传来了 error 字段，说明 AI 接口出错了
          if (data.error) { onError?.(data.error); return }

          // 如果有 text 字段，说明是一段新生成的文字
          // 调用 onChunk 回调，调用方会把它追加到界面上
          if (data.text) onChunk?.(data.text)
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  } catch (err) {
    // 网络错误（断网、后端未启动等）
    onError?.(err.message)
  }
}