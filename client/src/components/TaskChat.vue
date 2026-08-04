<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { api } from '../api'

const props = defineProps({
  taskId: { type: [String, Number], required: true },
  me: { type: String, required: true },
})

const messages = ref([])
const text = ref('')
const loading = ref(false)
const sending = ref(false)
const error = ref('')
const listRef = ref(null)

async function scrollBottom() {
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
}

async function loadMessages() {
  loading.value = true
  error.value = ''
  try {
    const data = await api(`/tasks/${props.taskId}/messages`)
    messages.value = Array.isArray(data) ? data : []
    await scrollBottom()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function send() {
  const message = text.value.trim()
  if (!message || sending.value) return

  sending.value = true
  error.value = ''

  const draftId = `draft-${Date.now()}`
  messages.value = [
    ...messages.value,
    {
      id: draftId,
      taskId: Number(props.taskId),
      author: props.me,
      text: message,
      timestamp: new Date().toISOString(),
      pending: true,
    },
  ]
  text.value = ''
  await scrollBottom()

  try {
    const created = await api(`/tasks/${props.taskId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text: message }),
    })
    messages.value = messages.value.map((item) => (item.id === draftId ? created : item))
    await scrollBottom()
  } catch (e) {
    messages.value = messages.value.filter((item) => item.id !== draftId)
    text.value = message
    error.value = e.message
  } finally {
    sending.value = false
  }
}

watch(
  () => props.taskId,
  () => {
    loadMessages()
  },
  { immediate: true }
)

onMounted(() => {
  if (!messages.value.length) loadMessages()
})
</script>

<template>
  <div class="panel chat">
    <div class="panel-head">
      <h2>Обсуждение</h2>
      <span class="online">● online</span>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div ref="listRef" class="messages">
      <div v-if="loading && !messages.length" class="chat-empty">Загрузка чата…</div>
      <div v-else-if="!messages.length" class="chat-empty">Здесь начнётся обсуждение задачи</div>

      <article
        v-for="item in messages"
        :key="item.id"
        :class="{ mine: item.author === me, pending: item.pending }"
      >
        <header>
          <b>{{ item.author }}</b>
          <time>{{ new Date(item.timestamp).toLocaleString('ru', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) }}</time>
        </header>
        <p>{{ item.text }}</p>
      </article>
    </div>

    <form class="chat-compose" @submit.prevent="send">
      <div class="chat-composer">
        <textarea
          v-model="text"
          rows="3"
          placeholder="Напишите сообщение…"
          @keydown.meta.enter.prevent="send"
          @keydown.ctrl.enter.prevent="send"
        />
        <button class="chat-send" type="submit" :disabled="sending || !text.trim()" aria-label="Отправить сообщение">
          <span v-if="sending">…</span>
          <span v-else>➤</span>
        </button>
      </div>
    </form>
  </div>
</template>
