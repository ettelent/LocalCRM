<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const query = ref('')
const results = ref([])
const open = ref(false)
const loading = ref(false)
let timer

watch(query, value => {
  clearTimeout(timer)
  if (value.trim().length < 2) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    loading.value = true
    try {
      results.value = await api(`/search?q=${encodeURIComponent(value.trim())}`)
      open.value = true
    } finally {
      loading.value = false
    }
  }, 250)
})

function select(item) {
  router.push(item.path)
  query.value = ''
  results.value = []
  open.value = false
}

const labels = { client: 'Клиент', project: 'Проект', task: 'Задача', message: 'Сообщение' }
</script>

<template>
  <div class="global-search">
    <span>⌕</span>
    <input v-model="query" placeholder="Поиск…" @focus="open = true" @blur="setTimeout(() => open = false, 150)">
    <div v-if="open && query.trim().length >= 2" class="search-results">
      <small v-if="loading">Ищем…</small>
      <button v-for="item in results" v-else :key="`${item.type}-${item.id}`" type="button" @mousedown.prevent="select(item)">
        <i>{{ labels[item.type] }}</i>
        <b>{{ item.title }}</b>
        <span>{{ item.subtitle || 'Без дополнительной информации' }}</span>
      </button>
      <small v-if="!loading && !results.length">Ничего не найдено</small>
    </div>
  </div>
</template>
