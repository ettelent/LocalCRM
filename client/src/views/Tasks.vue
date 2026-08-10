<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'

const items = ref([])
const error = ref('')
const search = ref('')
const status = ref('')
const assignee = ref('')
const priority = ref('')

const priorities = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный'
}

const filtered = computed(() => items.value.filter(item => {
  const term = search.value.trim().toLowerCase()
  const matchesTerm = !term || [item.title, item.description, item.projectTitle, item.clientName].some(value => String(value || '').toLowerCase().includes(term))
  return matchesTerm && (!status.value || item.status === status.value) && (!assignee.value || item.assignee === assignee.value) && (!priority.value || item.priority === priority.value)
}))

async function load() {
  try {
    error.value = ''
    items.value = await api('/tasks')
  } catch (e) {
    error.value = e.message
  }
}

async function update(item, changes) {
  const previous = { ...item }
  Object.assign(item, changes)
  try {
    const updated = await api(`/tasks/${item.id}`, { method: 'PUT', body: JSON.stringify(changes) })
    Object.assign(item, updated)
  } catch (e) {
    Object.assign(item, previous)
    error.value = e.message
  }
}

function isOverdue(item) {
  return item.dueDate && item.status !== 'done' && String(item.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10)
}

onMounted(load)
</script>

<template>
  <section>
    <header class="page-head">
      <div>
        <span class="eyebrow">Рабочее пространство</span>
        <h1>Все задачи</h1>
        <p>Задачи всех клиентов и проектов в одном месте</p>
      </div>
      <div class="task-total"><b>{{ filtered.length }}</b><span>задач найдено</span></div>
    </header>

    <div class="filters">
      <input v-model="search" placeholder="Название, клиент или проект">
      <select v-model="status"><option value="">Все статусы</option><option value="active">Активные</option><option value="paused">Пауза</option><option value="done">Готовые</option></select>
      <select v-model="assignee"><option value="">Все исполнители</option><option value="Lesha">Lesha</option><option value="Denis">Denis</option></select>
      <select v-model="priority"><option value="">Все приоритеты</option><option v-for="(label,key) in priorities" :key="key" :value="key">{{ label }}</option></select>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="data-table task-table">
      <div class="data-row data-head"><span>Задача</span><span>Клиент / проект</span><span>Приоритет</span><span>Исполнитель</span><span>Срок</span><span>Статус</span></div>
      <article v-for="item in filtered" :key="item.id" class="data-row" :class="{ overdue: isOverdue(item) }">
        <router-link :to="`/tasks/${item.id}`"><b>{{ item.title }}</b><small>{{ item.description || 'Без описания' }}</small></router-link>
        <span><b>{{ item.clientName }}</b><small>{{ item.projectTitle }}</small></span>
        <span class="priority" :class="item.priority">{{ priorities[item.priority] || priorities.normal }}</span>
        <select :value="item.assignee" @change="update(item, { assignee: $event.target.value })"><option value="">Не назначен</option><option value="Lesha">Lesha</option><option value="Denis">Denis</option></select>
        <time :class="{ 'danger-text': isOverdue(item) }">{{ item.dueDate ? new Date(item.dueDate).toLocaleDateString('ru-RU') : 'Без срока' }}</time>
        <select :value="item.status" @change="update(item, { status: $event.target.value })"><option value="active">Активна</option><option value="paused">Пауза</option><option value="done">Готово</option></select>
      </article>
      <div v-if="!filtered.length" class="table-empty">Задач по выбранным условиям нет</div>
    </div>
  </section>
</template>
