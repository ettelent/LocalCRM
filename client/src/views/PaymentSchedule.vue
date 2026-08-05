<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import ModalForm from '../components/ModalForm.vue'

const items = ref([])
const clients = ref([])
const projects = ref([])
const error = ref('')
const modal = ref(false)
const editing = ref(false)
const form = ref({ clientId: '', projectIds: [], amount: '', paymentDate: '' })

async function load() {
  try {
    const [schedule, clientList, projectList] = await Promise.all([api('/payment-schedules'), api('/clients'), api('/projects')])
    items.value = schedule
    clients.value = clientList
    projects.value = projectList
  } catch (e) {
    error.value = e.message
  }
}

function resetForm(next = { clientId: '', projectIds: [], amount: '', paymentDate: '' }) {
  form.value = next
}

function openCreate() {
  resetForm()
  modal.value = true
  editing.value = false
}

function openEdit(item) {
  form.value = {
    id: item.id,
    clientId: String(item.clientId),
    projectIds: Array.isArray(item.projectIds) ? item.projectIds.map(String) : [],
    amount: String(item.amount),
    paymentDate: item.paymentDate.slice(0, 10)
  }
  editing.value = true
  modal.value = true
}

async function save() {
  const payload = {
    clientId: Number(form.value.clientId),
    projectIds: form.value.projectIds.map(Number),
    amount: Number(form.value.amount),
    paymentDate: form.value.paymentDate
  }
  if (editing.value) {
    await api(`/payment-schedules/${form.value.id}`, { method: 'PUT', body: JSON.stringify(payload) })
  } else {
    await api('/payment-schedules', { method: 'POST', body: JSON.stringify(payload) })
  }
  modal.value = false
  editing.value = false
  resetForm()
  load()
}

async function remove(id) {
  if (confirm('Удалить запись из графика оплат?')) {
    await api(`/payment-schedules/${id}`, { method: 'DELETE' })
    load()
  }
}

function clientName(id) {
  return clients.value.find(x => Number(x.id) === Number(id))?.name || 'Клиент не найден'
}

function projectTitle(id) {
  return projects.value.find(x => Number(x.id) === Number(id))?.title || `Проект #${id}`
}

function calcDays(paymentDate) {
  if (!paymentDate) return 0
  const payment = new Date(`${paymentDate.slice(0, 10)}T00:00:00Z`)
  const today = new Date()
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.round((payment.getTime() - utcToday) / 86400000))
}

const filteredProjects = computed(() => {
  if (!form.value.clientId) return []
  return projects.value.filter(x => Number(x.clientId) === Number(form.value.clientId))
})

const dueInDays = computed(() => {
  return calcDays(form.value.paymentDate)
})

onMounted(load)
</script>

<template>
  <section>
    <header class="page-head">
      <div>
        <span class="eyebrow">CRM</span>
        <h1>График оплат</h1>
        <p>Карточки оплат на всю ширину экрана с CRUD через API</p>
      </div>
      <button class="primary" @click="openCreate">＋ Новая оплата</button>
    </header>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="payments">
      <article v-for="item in items" :key="item.id" class="payment-card">
        <div class="payment-main">
          <div>
            <span class="payment-label">Сумма</span>
            <h3>{{ Number(item.amount).toLocaleString('ru-RU') }} ₽</h3>
          </div>
          <div>
            <span class="payment-label">Клиент</span>
            <p>{{ item.clientName || clientName(item.clientId) }}</p>
          </div>
          <div class="payment-projects">
            <span class="payment-label">Проекты</span>
            <div class="chips">
              <span v-for="pid in (item.projectIds || [])" :key="pid" class="chip">{{ projectTitle(pid) }}</span>
            </div>
          </div>
          <div>
            <span class="payment-label">Дата оплаты</span>
            <p>{{ new Date(item.paymentDate).toLocaleDateString('ru-RU') }}</p>
          </div>
          <div>
            <span class="payment-label">Через сколько заплатят</span>
            <p>{{ calcDays(item.paymentDate) }} дн.</p>
          </div>
        </div>
        <div class="payment-actions">
          <button class="ghost" @click="openEdit(item)">Редактировать</button>
          <button class="icon danger" @click="remove(item.id)">×</button>
        </div>
      </article>
      <button v-if="!items.length" class="empty wide" @click="openCreate">
        ＋<b>Добавьте первую запись оплаты</b>
      </button>
    </div>

      <ModalForm v-if="modal" :title="editing ? 'Редактировать оплату' : 'Новая оплата'" @close="modal=false" @submit="save">
      <label>
        Клиент
        <select v-model="form.clientId" required>
          <option value="" disabled>Выберите клиента</option>
          <option v-for="c in clients" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        </select>
      </label>
      <label>
        Проекты
        <div class="multi-select">
          <label v-for="p in filteredProjects" :key="p.id" class="check-row">
            <input v-model="form.projectIds" type="checkbox" :value="String(p.id)">
            <span>{{ p.title }}</span>
          </label>
          <small v-if="!form.clientId">Сначала выберите клиента</small>
          <small v-else-if="!filteredProjects.length">У этого клиента нет проектов</small>
        </div>
      </label>
      <label>
        Сумма
        <input v-model="form.amount" type="number" min="0" step="0.01" required>
      </label>
      <label>
        Дата оплаты
        <input v-model="form.paymentDate" type="date" required>
      </label>
      <label>
        Через сколько заплатят
        <input :value="dueInDays" type="number" readonly>
      </label>
    </ModalForm>
  </section>
</template>
