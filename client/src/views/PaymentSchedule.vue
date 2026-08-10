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
const statusFilter = ref('')
const clientFilter = ref('')
const form = ref(emptyForm())

const statusLabels = { planned: 'Запланировано', paid: 'Оплачено', overdue: 'Просрочено', cancelled: 'Отменено' }

function emptyForm() {
  return { clientId: '', projectIds: [], amount: '', paymentDate: '', status: 'planned', paidDate: '', paymentMethod: '', comment: '' }
}

async function load() {
  try {
    error.value = ''
    const [schedule, clientList, projectList] = await Promise.all([api('/payment-schedules'), api('/clients'), api('/projects')])
    items.value = schedule
    clients.value = clientList
    projects.value = projectList
  } catch (e) {
    error.value = e.message
  }
}

function openCreate() {
  form.value = emptyForm()
  modal.value = true
  editing.value = false
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : ''
}

function openEdit(item) {
  form.value = {
    id: item.id,
    clientId: String(item.clientId),
    projectIds: (item.projectIds || []).map(String),
    amount: String(item.amount),
    paymentDate: dateValue(item.paymentDate),
    status: item.status,
    paidDate: dateValue(item.paidDate),
    paymentMethod: item.paymentMethod || '',
    comment: item.comment || ''
  }
  editing.value = true
  modal.value = true
}

async function save() {
  try {
    error.value = ''
    const payload = { ...form.value, clientId: Number(form.value.clientId), projectIds: form.value.projectIds.map(Number), amount: Number(form.value.amount) }
    if (editing.value) await api(`/payment-schedules/${form.value.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await api('/payment-schedules', { method: 'POST', body: JSON.stringify(payload) })
    modal.value = false
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function markPaid(item) {
  try {
    await api(`/payment-schedules/${item.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function remove(id) {
  if (!confirm('Удалить запись из графика оплат?')) return
  try {
    await api(`/payment-schedules/${id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

const filteredProjects = computed(() => projects.value.filter(x => Number(x.clientId) === Number(form.value.clientId)))
const filteredItems = computed(() => items.value.filter(item => (!statusFilter.value || item.displayStatus === statusFilter.value) && (!clientFilter.value || Number(item.clientId) === Number(clientFilter.value))))
const plannedTotal = computed(() => items.value.filter(x => ['planned', 'overdue'].includes(x.displayStatus)).reduce((sum, x) => sum + Number(x.amount), 0))
const paidTotal = computed(() => items.value.filter(x => x.displayStatus === 'paid').reduce((sum, x) => sum + Number(x.amount), 0))
const overdueTotal = computed(() => items.value.filter(x => x.displayStatus === 'overdue').reduce((sum, x) => sum + Number(x.amount), 0))
const dueInDays = computed(() => {
  if (!form.value.paymentDate) return 0
  const payment = new Date(`${form.value.paymentDate}T00:00:00Z`)
  const now = new Date()
  return Math.max(0, Math.round((payment.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000))
})

function projectTitle(id) {
  return projects.value.find(x => Number(x.id) === Number(id))?.title || `Проект #${id}`
}

function money(value) {
  return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
}

onMounted(load)
</script>

<template>
  <section>
    <header class="page-head">
      <div><span class="eyebrow">Финансы</span><h1>График оплат</h1><p>Плановые, полученные и просроченные платежи</p></div>
      <button class="primary" @click="openCreate">＋ Новая оплата</button>
    </header>

    <div class="payment-summary">
      <article><span>Ожидается</span><b>{{ money(plannedTotal) }}</b></article>
      <article class="paid"><span>Получено</span><b>{{ money(paidTotal) }}</b></article>
      <article class="overdue"><span>Просрочено</span><b>{{ money(overdueTotal) }}</b></article>
    </div>

    <div class="filters payment-filters">
      <select v-model="statusFilter"><option value="">Все статусы</option><option value="planned">Запланировано</option><option value="paid">Оплачено</option><option value="overdue">Просрочено</option><option value="cancelled">Отменено</option></select>
      <select v-model="clientFilter"><option value="">Все клиенты</option><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="payments">
      <article v-for="item in filteredItems" :key="item.id" class="payment-card" :class="item.displayStatus">
        <div class="payment-main">
          <div><span class="payment-label">Сумма</span><h3>{{ money(item.amount) }}</h3></div>
          <div><span class="payment-label">Клиент</span><p>{{ item.clientName }}</p></div>
          <div class="payment-projects"><span class="payment-label">Проекты</span><div class="chips"><span v-for="pid in item.projectIds" :key="pid" class="chip">{{ projectTitle(pid) }}</span></div></div>
          <div><span class="payment-label">Дата</span><p>{{ new Date(item.paymentDate).toLocaleDateString('ru-RU') }}</p><small v-if="item.displayStatus === 'planned'">через {{ item.dueInDays }} дн.</small></div>
          <div><span class="payment-label">Статус</span><span class="payment-status" :class="item.displayStatus">{{ statusLabels[item.displayStatus] }}</span><small v-if="item.paidDate">{{ new Date(item.paidDate).toLocaleDateString('ru-RU') }}</small></div>
          <div v-if="item.paymentMethod || item.comment"><span class="payment-label">Детали</span><p>{{ item.paymentMethod || 'Способ не указан' }}</p><small>{{ item.comment }}</small></div>
        </div>
        <div class="payment-actions"><button v-if="item.status === 'planned'" class="primary" @click="markPaid(item)">Оплачено</button><button class="ghost" @click="openEdit(item)">Изменить</button><button class="icon danger" @click="remove(item.id)">×</button></div>
      </article>
      <button v-if="!filteredItems.length" class="empty wide" @click="openCreate">＋<b>Записей по выбранным условиям нет</b></button>
    </div>

    <ModalForm v-if="modal" :title="editing ? 'Редактировать оплату' : 'Новая оплата'" @close="modal=false" @submit="save">
      <label>Клиент<select v-model="form.clientId" required @change="form.projectIds=[]"><option value="" disabled>Выберите клиента</option><option v-for="c in clients" :key="c.id" :value="String(c.id)">{{ c.name }}</option></select></label>
      <label>Проекты<div class="multi-select"><label v-for="p in filteredProjects" :key="p.id" class="check-row"><input v-model="form.projectIds" type="checkbox" :value="String(p.id)"><span>{{ p.title }}</span></label><small v-if="!form.clientId">Сначала выберите клиента</small><small v-else-if="!filteredProjects.length">У этого клиента нет проектов</small></div></label>
      <label>Сумма<input v-model="form.amount" type="number" min="0.01" step="0.01" required></label>
      <label>Плановая дата<input v-model="form.paymentDate" type="date" required></label>
      <label>Статус<select v-model="form.status"><option value="planned">Запланировано</option><option value="paid">Оплачено</option><option value="cancelled">Отменено</option></select></label>
      <label v-if="form.status === 'paid'">Фактическая дата<input v-model="form.paidDate" type="date"></label>
      <label>Способ оплаты<input v-model="form.paymentMethod" placeholder="Перевод, наличные…"></label>
      <label>Комментарий<textarea v-model="form.comment"></textarea></label>
      <label>До плановой даты<input :value="dueInDays" type="number" readonly></label>
    </ModalForm>
  </section>
</template>
