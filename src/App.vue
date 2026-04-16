<template>
  <div class="app">
    <!-- =====================================================
      侧边栏：模式切换 + 快捷主题入口
      ===================================================== -->
    <aside class="sidebar">
      <div class="logo">面试 AI 助手</div>
 
      <!-- 模式切换按钮，active 类由 mode === m.key 控制 -->
      <div class="mode-section">
        <p class="mode-label">模式</p>
        <button
          v-for="m in modes" :key="m.key"
          class="mode-btn" :class="{ active: mode === m.key }"
          @click="switchMode(m.key)"
        >
          <span class="mode-icon">{{ m.icon }}</span>
          <div>
            <div class="mode-name">{{ m.name }}</div>
            <div class="mode-desc">{{ m.desc }}</div>
          </div>
        </button>
      </div>
 
      <!-- 快捷主题：学习模式直接提问，面试模式直接开始该主题的面试 -->
      <div class="topic-section">
        <p class="mode-label">{{ mode === 'learn' ? '快速提问' : '选择考察主题' }}</p>
        <button
          v-for="t in quickTopics" :key="t"
          class="topic-btn"
          @click="quickAsk(t)"
        >{{ t }}</button>
      </div>
 
      <button class="clear-btn" @click="clearChat">清空对话</button>
    </aside>
 
    <!-- =====================================================
      主聊天区
      ===================================================== -->
    <main class="chat-area">
      <div class="messages" ref="messagesEl">
 
        <!-- 学习模式欢迎页：只在没有消息时显示 -->
        <div v-if="messages.length === 0 && mode === 'learn'" class="welcome">
          <div class="welcome-icon">📖</div>
          <div class="welcome-title">学习模式</div>
          <div class="welcome-desc">问我任何前端知识点，我会详细解释给你听</div>
        </div>
 
        <!-- 面试模式引导页：显示主题选择网格，点击直接开始面试 -->
        <div v-if="messages.length === 0 && mode === 'interview'" class="welcome">
          <div class="welcome-icon">🎯</div>
          <div class="welcome-title">面试模式</div>
          <div class="welcome-desc">AI 扮演面试官，出题 → 追问 → 评分，三轮一套题</div>
          <div class="start-grid">
            <button
              v-for="t in quickTopics" :key="t"
              class="start-btn"
              @click="startInterview(t)"
            >{{ t }}</button>
          </div>
          <button class="start-btn-main" @click="startInterview()">随机出题</button>
        </div>
 
        <!-- 消息列表：遍历所有历史消息 -->
        <div
          v-for="(msg, index) in messages" :key="msg.id"
          class="message" :class="msg.role"
        >
          <!-- v-html 渲染 Markdown，注意只用于可信内容 -->
          <div class="bubble" v-html="renderMarkdown(msg.content)"></div>
 
          <!-- AI 消息下方的操作按钮 -->
          <div class="msg-actions" v-if="msg.role === 'assistant'">
            <button class="action-btn" @click="saveMessage(msg)">收藏</button>
          </div>
 
          <!-- 快捷操作按钮：
               - 只在面试模式下显示
               - 只在最后一条 AI 消息下方显示
               - 流式输出期间不显示（等 AI 说完再显示）
               - 根据 quickActionType 计算属性决定显示哪个按钮 -->
          <div
            v-if="mode === 'interview' && msg.role === 'assistant' && index === messages.length - 1 && !streaming"
            class="quick-actions"
          >
            <!-- 查看评分：AI 追问后、用户还没收到评分时显示 -->
            <button
              v-if="quickActionType === 'score'"
              class="quick-btn quick-btn-score"
              @click="requestScore"
            >📊 查看评分</button>
 
            <!-- 继续答题：AI 给完评分后显示 -->
            <button
              v-if="quickActionType === 'next'"
              class="quick-btn quick-btn-next"
              @click="nextQuestion"
            >继续答题 →</button>
          </div>
        </div>
 
        <!-- 流式输出占位：AI 正在生成时显示，完成后替换为正式消息 -->
        <div v-if="streaming" class="message assistant">
          <div class="bubble" v-html="renderMarkdown(streamingText) + '<span class=\'cursor\'></span>'"></div>
        </div>
      </div>
 
      <!-- 输入区 -->
      <div class="input-area">
        <textarea
          v-model="input"
          :placeholder="inputPlaceholder"
          @keydown.ctrl.enter="send"
          rows="3"
        />
        <!-- disabled 条件：正在流式输出 或 输入框为空 -->
        <button class="send-btn" :disabled="streaming || !input.trim()" @click="send">
          {{ streaming ? '回答中...' : '发送' }}
        </button>
      </div>
    </main>
 
    <!-- =====================================================
      收藏面板：从右侧滑入，用 transform 控制显隐
      ===================================================== -->
    <div class="saved-panel" :class="{ open: showSaved }">
      <div class="saved-header">
        <span>收藏夹 ({{ savedList.length }})</span>
        <button @click="showSaved = false">×</button>
      </div>
      <div v-if="savedList.length === 0" class="saved-empty">还没有收藏</div>
      <div v-for="(item, i) in savedList" :key="i" class="saved-item">
        <div class="saved-meta">{{ item.savedAt }}</div>
        <div class="saved-q">{{ item.question }}</div>
        <button class="delete-btn" @click="deleteSaved(i)">删除</button>
      </div>
    </div>
    <!-- 收藏面板的触发按钮，竖排文字显示在右侧边缘 -->
    <button class="saved-toggle" @click="showSaved = !showSaved">
      收藏 {{ savedList.length > 0 ? `(${savedList.length})` : '' }}
    </button>
  </div>
</template>
 
<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { sendMessage } from './api/chat.js'
import { marked } from 'marked'
 
// ============================================================
// 响应式状态
// ============================================================
const mode = ref('learn')           // 当前模式：'learn' | 'interview'
const input = ref('')               // 输入框内容
const messages = ref([])            // 完整对话历史，每条格式：{ id, role, content, question? }
const streaming = ref(false)        // 是否正在流式输出
const streamingText = ref('')       // 流式输出的累积文字（输出完毕后转存进 messages）
const messagesEl = ref(null)        // 消息列表 DOM 引用，用于自动滚动到底部
const showSaved = ref(false)        // 收藏面板是否展开
const savedList = ref([])           // 收藏列表，持久化到 localStorage
 
// 模式配置数据
const modes = [
  { key: 'learn', name: '学习模式', desc: '详细解释，带例子', icon: '📖' },
  { key: 'interview', name: '面试模式', desc: 'AI 出题追问评分', icon: '🎯' },
]
 
// 快捷主题列表
const quickTopics = ['闭包', '事件循环', '原型链', 'Flex 布局', 'Vue 响应式', 'HTTP 缓存', '防抖节流', '虚拟 DOM']
 
// ============================================================
// 计算属性
// ============================================================
 
// 输入框 placeholder 根据模式和状态动态变化
const inputPlaceholder = computed(() => {
  if (mode.value === 'interview' && messages.value.length > 0) return '输入你的回答，按 Ctrl+Enter 发送...'
  return '输入问题，按 Ctrl+Enter 发送...'
})
 
// 检测最后一条 AI 消息的内容，决定显示哪个快捷按钮
// 为什么用关键词检测而不是轮数计数？
// → 更健壮：用户可能中途追问其他问题，轮数会乱，但关键词是 AI 格式化输出的，更可靠
const quickActionType = computed(() => {
  if (mode.value !== 'interview') return null
 
  // 找最后一条 AI 消息
  const lastAssistant = [...messages.value].reverse().find(m => m.role === 'assistant')
  if (!lastAssistant) return null
 
  const text = lastAssistant.content
  // AI 给完评分后，回复里会有"满分答案"或"📊"
  if (text.includes('满分答案') || text.includes('📊')) return 'next'
  // AI 追问时，回复里会有"追问"
  if (text.includes('追问')) return 'score'
  return null
})
 
// ============================================================
// 生命周期
// ============================================================
 
// 组件挂载后，从 localStorage 恢复收藏列表
onMounted(() => {
  const saved = localStorage.getItem('saved-questions')
  if (saved) savedList.value = JSON.parse(saved)
})
 
// ============================================================
// 工具函数
// ============================================================
 
// 将 Markdown 文本转成 HTML，并注入代码块语言标签
// data-lang 属性配合 CSS 的 ::before 伪元素显示语言名称
function renderMarkdown(text) {
  if (!text) return ''
  const html = marked(text)
  return html
    // 有语言标识的代码块，注入 data-lang
    .replace(/<pre><code class="language-(\w+)">/g, (_, lang) => {
      return `<pre data-lang="${lang}"><code class="language-${lang}">`
    })
    // 没有语言标识的代码块，统一标记为 "code"
    .replace(/<pre><code>/g, '<pre data-lang="code"><code>')
}
 
// 切换模式时清空对话，避免不同模式的消息混在一起
function switchMode(newMode) {
  mode.value = newMode
  messages.value = []
  input.value = ''
}
 
// 快捷主题按钮点击：学习模式直接提问，面试模式开始面试
function quickAsk(topic) {
  if (mode.value === 'interview') {
    startInterview(topic)
  } else {
    input.value = `请解释一下「${topic}」`
    send()
  }
}
 
// 开始面试：构造开始指令发送给 AI
// topic 为空时让 AI 随机出题
function startInterview(topic) {
  input.value = topic ? `开始，主题：${topic}` : '开始，随机出一道中级前端面试题'
  send()
}
 
// 快捷按钮：请求评分
function requestScore() {
  input.value = '请给出评分和满分答案'
  send()
}
 
// 快捷按钮：继续下一题
// 尝试从第一条用户消息里提取主题，保持主题连贯性
function nextQuestion() {
  const lastTopic = messages.value
    .find(m => m.role === 'user')?.content
    ?.match(/主题：(.+)/)?.[1] ?? ''
  input.value = lastTopic ? `继续，再出一道关于「${lastTopic}」的题` : '继续下一题'
  send()
}
 
// ============================================================
// 核心发送函数
// ============================================================
async function send() {
  const text = input.value.trim()
  // 防止空消息和重复发送
  if (!text || streaming.value) return
 
  // 1. 把用户消息加入历史
  messages.value.push({ id: Date.now(), role: 'user', content: text })
  input.value = ''
  streaming.value = true
  streamingText.value = ''
 
  // 2. 等 DOM 更新后滚动到底部（nextTick 确保 DOM 已渲染）
  await nextTick()
  scrollToBottom()
 
  // 3. 构造发给 API 的消息数组（只保留 role 和 content，去掉 id 等前端字段）
  const apiMessages = messages.value.map(m => ({
    role: m.role,
    content: m.content,
  }))
 
  // 4. 调用 API，通过回调处理流式数据
  await sendMessage({
    messages: apiMessages,
    mode: mode.value,
    onChunk: (chunk) => {
      // 每收到一段文字，追加到 streamingText，触发界面实时更新
      streamingText.value += chunk
      scrollToBottom()
    },
    onDone: () => {
      // 流结束：把完整回复存入消息历史，清空流式缓冲区
      messages.value.push({
        id: Date.now(),
        role: 'assistant',
        content: streamingText.value,
        // 记录对应的用户问题，收藏时用到
        question: messages.value.filter(m => m.role === 'user').at(-1)?.content,
      })
      streaming.value = false
      streamingText.value = ''
    },
    onError: (err) => {
      streaming.value = false
      messages.value.push({ id: Date.now(), role: 'assistant', content: `出错了：${err}` })
    },
  })
}
 
// 滚动消息列表到底部，nextTick 保证 DOM 已更新
function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}
 
// 收藏一条 AI 消息，存入 localStorage 持久化
function saveMessage(msg) {
  const item = {
    question: msg.question || '未记录',
    answer: msg.content,
    savedAt: new Date().toLocaleDateString(),
  }
  savedList.value.unshift(item) // 最新的放最前面
  localStorage.setItem('saved-questions', JSON.stringify(savedList.value))
}
 
// 删除收藏
function deleteSaved(i) {
  savedList.value.splice(i, 1)
  localStorage.setItem('saved-questions', JSON.stringify(savedList.value))
}
 
// 清空当前对话（不影响收藏）
function clearChat() {
  messages.value = []
  input.value = ''
}
</script>
<style>
@import 'styles/app.css'
</style>