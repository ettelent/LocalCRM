<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import StatusBadge from '../components/StatusBadge.vue'
import ModalForm from '../components/ModalForm.vue'
import TaskChat from '../components/TaskChat.vue'

const route = useRoute()
const router = useRouter()

const task = ref({})
const todos = ref([])
const todoText = ref('')
const editing = ref(false)
const error = ref('')
const form = ref({ title: '', description: '', status: 'active', assignee: '', priority: 'normal', dueDate: '' })
const sendingTodo = ref(false)
const currentUser = computed(() => localStorage.getItem('crm_user') || '')

let timer = null

async function load() {
  error.value = ''
  try {
    const [taskData, todoData] = await Promise.all([
      api(`/tasks/${route.params.id}`),
      api(`/tasks/${route.params.id}/todos`),
    ])
    task.value = taskData
    todos.value = todoData
  } catch (e) {
    error.value = e.message
  }
}

function goBack() {
  if (task.value.projectId) {
    router.push(`/projects/${task.value.projectId}`)
  } else {
    router.push('/')
  }
}

async function addTodo() {
  const text = todoText.value.trim()
  if (!text || sendingTodo.value) return
  try {
    sendingTodo.value = true
    const created = await api(`/tasks/${route.params.id}/todos`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
    todoText.value = ''
    todos.value = [...todos.value, created]
  } catch (e) {
    error.value = e.message
  } finally {
    sendingTodo.value = false
  }
}

async function toggleTodo(item) {
  try {
    const updated = await api(`/tasks/${route.params.id}/todos/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ checked: !item.checked }),
    })
    todos.value = todos.value.map((todo) => (todo.id === updated.id ? updated : todo))
  } catch (e) {
    error.value = e.message
  }
}

async function deleteTodo(id) {
  try {
    await api(`/tasks/${route.params.id}/todos/${id}`, { method: 'DELETE' })
    todos.value = todos.value.filter((todo) => todo.id !== id)
  } catch (e) {
    error.value = e.message
  }
}

function editTask() {
  form.value = {
    title: task.value.title || '',
    description: task.value.description || '',
    status: task.value.status || 'active',
    assignee: task.value.assignee || '',
    priority: task.value.priority || 'normal',
    dueDate: task.value.dueDate ? String(task.value.dueDate).slice(0, 10) : '',
  }
  editing.value = true
}

async function saveTask() {
  try {
    const updated = await api(`/tasks/${route.params.id}`, {
      method: 'PUT',
      body: JSON.stringify(form.value),
    })
    task.value = { ...task.value, ...updated }
    editing.value = false
  } catch (e) {
    error.value = e.message
  }
}

onMounted(() => {
  load()
  timer = setInterval(load, 15000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section>
    <button class="back" type="button" @click="goBack">← К проекту</button>

    <header class="page-head compact">
      <div>
        <span class="eyebrow">Задача #{{ task.id }}</span>
        <div class="title-row">
          <h1>{{ task.title }}</h1>
          <StatusBadge :status="task.status" />
        </div>
        <p>{{ task.description || 'Описание не добавлено' }}</p>
        <div class="task-meta">
          <span>Исполнитель: <b>{{ task.assignee || 'не назначен' }}</b></span>
          <span>Приоритет: <b>{{ {low:'низкий',normal:'обычный',high:'высокий',urgent:'срочный'}[task.priority] || 'обычный' }}</b></span>
          <span>Срок: <b>{{ task.dueDate ? new Date(task.dueDate).toLocaleDateString('ru-RU') : 'не указан' }}</b></span>
        </div>
      </div>
      <button class="ghost" type="button" @click="editTask">Редактировать</button>
    </header>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="task-columns">
      <div class="panel">
        <div class="panel-head">
          <h2>Чек-лист</h2>
          <span>{{ todos.filter((x) => x.checked).length }} / {{ todos.length }}</span>
        </div>

        <div class="progress">
          <i :style="{ width: (todos.length ? todos.filter((x) => x.checked).length / todos.length * 100 : 0) + '%' }"></i>
        </div>

        <div class="todos">
          <label v-for="item in todos" :key="item.id" :class="{ checked: item.checked }">
            <input type="checkbox" :checked="item.checked" @change="toggleTodo(item)">
            <span>{{ item.text }}</span>
            <button class="icon danger" type="button" @click="deleteTodo(item.id)">×</button>
          </label>
        </div>

        <form class="inline" @submit.prevent="addTodo">
          <input v-model="todoText" placeholder="Новый пункт…">
          <button class="primary" type="submit" :disabled="sendingTodo">{{ sendingTodo ? '...' : '＋' }}</button>
        </form>
      </div>

      <TaskChat :task-id="route.params.id" :me="currentUser" />
    </div>

    <ModalForm v-if="editing" title="Редактировать задачу" @close="editing = false" @submit="saveTask">
      <label>Название<input v-model="form.title" required></label>
      <label>Описание<textarea v-model="form.description"></textarea></label>
      <label>Исполнитель<select v-model="form.assignee"><option value="">Не назначен</option><option value="Lesha">Lesha</option><option value="Denis">Denis</option></select></label>
      <label>Приоритет<select v-model="form.priority"><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option></select></label>
      <label>Крайний срок<input v-model="form.dueDate" type="date"></label>
      <label>
        Статус
        <select v-model="form.status">
          <option value="active">Активна</option>
          <option value="paused">Пауза</option>
          <option value="done">Готово</option>
        </select>
      </label>
    </ModalForm>
  </section>
</template>
