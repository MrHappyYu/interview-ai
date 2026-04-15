<template>
  <div class="app">
    <aside class="sidebar">
      <div class="logo">面试 AI 助手</div>

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

    <main class="chat-area">
      <div class="messages" ref="messagesEl">

        <!-- 学习模式欢迎页 -->
        <div v-if="messages.length === 0 && mode === 'learn'" class="welcome">
          <div class="welcome-icon">📖</div>
          <div class="welcome-title">学习模式</div>
          <div class="welcome-desc">问我任何前端知识点，我会详细解释给你听</div>
        </div>

        <!-- 面试模式引导页 -->
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

        <!-- 消息列表 -->
        <div
          v-for="msg in messages" :key="msg.id"
          class="message" :class="msg.role"
        >
          <div class="bubble" v-html="renderMarkdown(msg.content)"></div>
          <div class="msg-actions" v-if="msg.role === 'assistant'">
            <button class="action-btn" @click="saveMessage(msg)">收藏</button>
          </div>
        </div>

        <!-- 流式输出中 -->
        <div v-if="streaming" class="message assistant">
          <div class="bubble" v-html="renderMarkdown(streamingText) + '<span class=\'cursor\'></span>'"></div>
        </div>
      </div>

      <!-- 面试模式底部提示 -->
      <div v-if="mode === 'interview' && messages.length > 0" class="interview-hint">
        {{ interviewHint }}
      </div>

      <div class="input-area">
        <textarea
          v-model="input"
          :placeholder="inputPlaceholder"
          @keydown.ctrl.enter="send"
          rows="3"
        />
        <button class="send-btn" :disabled="streaming || !input.trim()" @click="send">
          {{ streaming ? '回答中...' : '发送' }}
        </button>
      </div>
    </main>

    <!-- 收藏面板 -->
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
    <button class="saved-toggle" @click="showSaved = !showSaved">
      收藏 {{ savedList.length > 0 ? `(${savedList.length})` : '' }}
    </button>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { sendMessage } from './api/chat.js'
import { marked } from 'marked'

const mode = ref('learn')
const input = ref('')
const messages = ref([])
const streaming = ref(false)
const streamingText = ref('')
const messagesEl = ref(null)
const showSaved = ref(false)
const savedList = ref([])

const modes = [
  { key: 'learn', name: '学习模式', desc: '详细解释，带例子', icon: '📖' },
  { key: 'interview', name: '面试模式', desc: 'AI 出题追问评分', icon: '🎯' },
]

const quickTopics = ['闭包', '事件循环', '原型链', 'Flex 布局', 'Vue 响应式', 'HTTP 缓存', '防抖节流', '虚拟 DOM']

const inputPlaceholder = computed(() => {
  if (mode.value === 'interview' && messages.value.length > 0) return '输入你的回答，按 Ctrl+Enter 发送...'
  return '输入问题，按 Ctrl+Enter 发送...'
})

// 检测最后一条 AI 消息的内容关键词来决定显示哪个按钮
// "追问：" 出现 → 用户需要回答追问 → 答完后显示「查看评分」
// "满分答案" 出现 → AI 已给出评分 → 显示「继续答题」
const quickActionType = computed(() => {
  if (mode.value !== 'interview') return null
  const lastAssistant = [...messages.value].reverse().find(m => m.role === 'assistant')
  if (!lastAssistant) return null
  const text = lastAssistant.content
  if (text.includes('满分答案') || text.includes('📊')) return 'next'
  if (text.includes('追问')) return 'score'
  return null
})

function requestScore() {
  input.value = '请给出评分和满分答案'
  send()
}

function nextQuestion() {
  const lastTopic = messages.value
    .find(m => m.role === 'user')?.content
    ?.match(/主题：(.+)/)?.[1] ?? ''
  input.value = lastTopic ? `继续，再出一道关于「${lastTopic}」的题` : '继续下一题'
  send()
}

onMounted(() => {
  const saved = localStorage.getItem('saved-questions')
  if (saved) savedList.value = JSON.parse(saved)
})

function renderMarkdown(text) {
  if (!text) return ''
  const html = marked(text)
  // 给每个 pre 块注入 data-lang 属性，用于显示语言标签
  return html.replace(/<pre><code class="language-(\w+)">/g, (_, lang) => {
    return `<pre data-lang="${lang}"><code class="language-${lang}">`
  }).replace(/<pre><code>/g, '<pre data-lang="code"><code>')
}

function switchMode(newMode) {
  mode.value = newMode
  messages.value = []
  input.value = ''
}

function quickAsk(topic) {
  if (mode.value === 'interview') {
    startInterview(topic)
  } else {
    input.value = `请解释一下「${topic}」`
    send()
  }
}

function startInterview(topic) {
  input.value = topic ? `开始，主题：${topic}` : '开始，随机出一道中级前端面试题'
  send()
}

async function send() {
  const text = input.value.trim()
  if (!text || streaming.value) return

  messages.value.push({ id: Date.now(), role: 'user', content: text })
  input.value = ''
  streaming.value = true
  streamingText.value = ''

  await nextTick()
  scrollToBottom()

  const apiMessages = messages.value.map(m => ({
    role: m.role,
    content: m.content,
  }))

  await sendMessage({
    messages: apiMessages,
    mode: mode.value,
    onChunk: (chunk) => {
      streamingText.value += chunk
      scrollToBottom()
    },
    onDone: () => {
      messages.value.push({
        id: Date.now(),
        role: 'assistant',
        content: streamingText.value,
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

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

function saveMessage(msg) {
  const item = {
    question: msg.question || '未记录',
    answer: msg.content,
    savedAt: new Date().toLocaleDateString(),
  }
  savedList.value.unshift(item)
  localStorage.setItem('saved-questions', JSON.stringify(savedList.value))
}

function deleteSaved(i) {
  savedList.value.splice(i, 1)
  localStorage.setItem('saved-questions', JSON.stringify(savedList.value))
}

function clearChat() {
  messages.value = []
  input.value = ''
}
</script>

<style>
@import 'styles/app.css'
</style>