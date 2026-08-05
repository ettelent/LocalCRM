<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import ModalForm from '../components/ModalForm.vue'

const stages = [
  { key: 'think', title: 'Думают', hint: 'Первичный интерес' },
  { key: 'working', title: 'Работаем', hint: 'В процессе' },
  { key: 'done', title: 'Завершено', hint: 'Сделка закрыта' },
  { key: 'rejected', title: 'Отказано', hint: 'Без продолжения' }
]

const items = ref([])
const modal = ref(false)
const editing = ref(false)
const error = ref('')
const draggingId = ref(null)
const hoveringStage = ref('')
const form = ref({ name: '', contactInfo: '', notes: '', stage: 'think' })

const grouped = computed(() => Object.fromEntries(stages.map(s => [s.key, items.value.filter(x => (x.stage || 'think') === s.key)])))

async function load() {
  try {
    items.value = await api('/clients')
  } catch (e) {
    error.value = e.message
  }
}

function openCreate(stage = 'think') {
  form.value = { name: '', contactInfo: '', notes: '', stage }
  editing.value = false
  modal.value = true
}

function openEdit(item) {
  form.value = {
    id: item.id,
    name: item.name,
    contactInfo: item.contactInfo,
    notes: item.notes,
    stage: item.stage || 'think'
  }
  editing.value = true
  modal.value = true
}

async function save() {
  const payload = {
    name: form.value.name,
    contactInfo: form.value.contactInfo,
    notes: form.value.notes,
    stage: form.value.stage
  }
  if (editing.value) {
    await api(`/clients/${form.value.id}`, { method: 'PUT', body: JSON.stringify(payload) })
  } else {
    await api('/clients', { method: 'POST', body: JSON.stringify(payload) })
  }
  modal.value = false
  editing.value = false
  load()
}

async function remove(id) {
  if (confirm('Удалить клиента и все его проекты?')) {
    await api(`/clients/${id}`, { method: 'DELETE' })
    load()
  }
}

function onDragStart(item) {
  draggingId.value = item.id
}

function onDragEnd() {
  draggingId.value = null
  hoveringStage.value = ''
}

async function dropTo(stage) {
  if (!draggingId.value) return
  const item = items.value.find(x => x.id === draggingId.value)
  if (!item || item.stage === stage) return onDragEnd()
  item.stage = stage
  await api(`/clients/${item.id}/stage`, { method: 'PUT', body: JSON.stringify({ stage }) })
  await load()
  onDragEnd()
}

onMounted(load)
</script>

<template>
  <section class="board-page">
    <header class="page-head board-head">
      <div>
        <span class="eyebrow">Рабочее пространство</span>
        <h1>Канбан клиентов</h1>
        <p>Перетаскивайте карточки между стадиями и ведите клиентов по воронке</p>
      </div>
      <button class="primary" @click="openCreate()">＋ Новый клиент</button>
    </header>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="kanban">
      <section
        v-for="stage in stages"
        :key="stage.key"
        class="kanban-column"
        :class="{ hovering: hoveringStage === stage.key }"
        @dragover.prevent="hoveringStage = stage.key"
        @dragleave="hoveringStage = ''"
        @drop.prevent="dropTo(stage.key)"
      >
        <header class="kanban-column-head">
          <div>
            <h2>{{ stage.title }}</h2>
            <p>{{ stage.hint }}</p>
          </div>
          <span>{{ grouped[stage.key].length }}</span>
        </header>

        <div class="kanban-list">
          <article
            v-for="x in grouped[stage.key]"
            :key="x.id"
            class="kanban-card"
            draggable="true"
            @dragstart="onDragStart(x)"
            @dragend="onDragEnd"
          >
            <div class="kanban-card-top">
              <div class="card-icon">{{ x.name?.[0] || '?' }}</div>
              <button class="icon danger" @click.stop="remove(x.id)">×</button>
            </div>
            <router-link :to="`/clients/${x.id}`" class="kanban-card-body">
              <h3>{{ x.name }}</h3>
              <p>{{ x.contactInfo || 'Контакты не указаны' }}</p>
              <small>{{ x.notes || 'Нет заметок' }}</small>
            </router-link>
            <footer class="kanban-card-footer">
              <button class="ghost small-btn" @click.stop="openEdit(x)">Редактировать</button>
              <span class="stage-pill">{{ stage.title }}</span>
            </footer>
          </article>

          <button class="kanban-add" @click="openCreate(stage.key)">
            ＋<b>Добавить клиента</b>
          </button>
        </div>
      </section>
    </div>

    <ModalForm v-if="modal" :title="editing ? 'Редактировать клиента' : 'Новый клиент'" @close="modal=false" @submit="save">
      <label>Название<input v-model="form.name" required></label>
      <label>Телефон или email<input v-model="form.contactInfo"></label>
      <label>Стадия
        <select v-model="form.stage">
          <option value="think">Думают</option>
          <option value="working">Работаем</option>
          <option value="done">Завершено</option>
          <option value="rejected">Отказано</option>
        </select>
      </label>
      <label>Заметки<textarea v-model="form.notes"></textarea></label>
    </ModalForm>
  </section>
</template>
