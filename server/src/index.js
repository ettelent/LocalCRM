import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { databaseDriver, execute, initDb, query } from './db.js'

dotenv.config({ path: new URL('../../.env', import.meta.url) })

const app = express()
const port = Number(process.env.PORT || 3000)
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:8080').split(',')

app.use(cors({ origin: origins }))
app.use(express.json())

const users = () => new Map([[process.env.LESHA_KEY, 'Lesha'], [process.env.DENIS_KEY, 'Denis']].filter(([key]) => key))
const safe = fn => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ error: e.message })) }
const required = (res, value, label = 'Запись') => value || (res.status(404).json({ error: `${label} не найден` }), null)
const one = async (sql, params = []) => (await query(sql, params))[0] || null

await initDb()

app.post('/api/auth/login', (req, res) => {
  const name = users().get(req.body?.key)
  if (!name) return res.status(401).json({ error: 'Неверный ключ доступа' })
  res.json({ token: req.body.key, user: name })
})

app.use('/api', (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const user = users().get(token)
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' })
  req.user = user
  next()
})

app.get('/api/me', (req, res) => res.json({ user: req.user }))

app.get('/api/search', safe(async (req, res) => {
  const term = String(req.query.q || '').trim()
  if (term.length < 2) return res.json([])
  const like = `%${term}%`
  const [clients, projects, tasks, messages] = await Promise.all([
    query('SELECT id,name,contactInfo FROM clients WHERE name LIKE ? OR contactInfo LIKE ? OR notes LIKE ? ORDER BY id DESC LIMIT 6', [like, like, like]),
    query('SELECT p.id,p.title,c.name AS clientName FROM projects p JOIN clients c ON c.id=p.clientId WHERE p.title LIKE ? OR p.description LIKE ? ORDER BY p.id DESC LIMIT 6', [like, like]),
    query('SELECT t.id,t.title,p.title AS projectTitle FROM tasks t JOIN projects p ON p.id=t.projectId WHERE t.title LIKE ? OR t.description LIKE ? ORDER BY t.id DESC LIMIT 6', [like, like]),
    query('SELECT m.id,m.taskId,m.text,t.title AS taskTitle FROM messages m JOIN tasks t ON t.id=m.taskId WHERE m.text LIKE ? ORDER BY m.id DESC LIMIT 6', [like])
  ])
  res.json([
    ...clients.map(x => ({ type: 'client', id: x.id, title: x.name, subtitle: x.contactInfo, path: `/clients/${x.id}` })),
    ...projects.map(x => ({ type: 'project', id: x.id, title: x.title, subtitle: x.clientName, path: `/projects/${x.id}` })),
    ...tasks.map(x => ({ type: 'task', id: x.id, title: x.title, subtitle: x.projectTitle, path: `/tasks/${x.id}` })),
    ...messages.map(x => ({ type: 'message', id: x.id, title: x.text, subtitle: x.taskTitle, path: `/tasks/${x.taskId}` }))
  ])
}))

app.get('/api/clients', safe(async (req, res) => res.json(await query('SELECT * FROM clients ORDER BY id DESC'))))
app.get('/api/clients/:id', safe(async (req, res) => { const row = await one('SELECT * FROM clients WHERE id=?', [req.params.id]); if (row) res.json(row); else required(res, row, 'Клиент') }))
app.post('/api/clients', safe(async (req, res) => {
  if (!req.body.name?.trim()) throw new Error('Укажите имя клиента')
  const result = await execute('INSERT INTO clients(name,contactInfo,notes,stage) VALUES(?,?,?,?)', [req.body.name.trim(), req.body.contactInfo || '', req.body.notes || '', req.body.stage || 'think'])
  res.status(201).json(await one('SELECT * FROM clients WHERE id=?', [result.insertId]))
}))
app.put('/api/clients/:id', safe(async (req, res) => {
  if (!req.body.name?.trim()) throw new Error('Укажите имя клиента')
  const result = await execute('UPDATE clients SET name=?,contactInfo=?,notes=?,stage=? WHERE id=?', [req.body.name.trim(), req.body.contactInfo || '', req.body.notes || '', req.body.stage || 'think', req.params.id])
  if (!result.affectedRows) return res.status(404).json({ error: 'Клиент не найден' })
  res.json(await one('SELECT * FROM clients WHERE id=?', [req.params.id]))
}))
app.put('/api/clients/:id/stage', safe(async (req, res) => {
  const stage = ['think', 'working', 'done', 'rejected'].includes(req.body.stage) ? req.body.stage : null
  if (!stage) throw new Error('Укажите стадию')
  const result = await execute('UPDATE clients SET stage=? WHERE id=?', [stage, req.params.id])
  if (!result.affectedRows) return res.status(404).json({ error: 'Клиент не найден' })
  res.json(await one('SELECT * FROM clients WHERE id=?', [req.params.id]))
}))
app.delete('/api/clients/:id', safe(async (req, res) => { const result = await execute('DELETE FROM clients WHERE id=?', [req.params.id]); res.status(result.affectedRows ? 204 : 404).end() }))

app.get('/api/projects', safe(async (req, res) => {
  const rows = req.query.clientId
    ? await query('SELECT * FROM projects WHERE clientId=? ORDER BY id DESC', [req.query.clientId])
    : await query('SELECT * FROM projects ORDER BY id DESC')
  res.json(rows)
}))
app.get('/api/projects/:id', safe(async (req, res) => { const row = await one('SELECT * FROM projects WHERE id=?', [req.params.id]); if (row) res.json(row); else required(res, row, 'Проект') }))
app.post('/api/projects', safe(async (req, res) => {
  if (!req.body.title?.trim() || !req.body.clientId) throw new Error('Укажите клиента и название')
  const result = await execute('INSERT INTO projects(clientId,title,description,status) VALUES(?,?,?,?)', [req.body.clientId, req.body.title.trim(), req.body.description || '', req.body.status || 'active'])
  res.status(201).json(await one('SELECT * FROM projects WHERE id=?', [result.insertId]))
}))
app.put('/api/projects/:id', safe(async (req, res) => {
  const old = await one('SELECT * FROM projects WHERE id=?', [req.params.id])
  if (!old) return required(res, old, 'Проект')
  await execute('UPDATE projects SET clientId=?,title=?,description=?,status=? WHERE id=?', [req.body.clientId ?? old.clientId, req.body.title ?? old.title, req.body.description ?? old.description, req.body.status ?? old.status, req.params.id])
  res.json(await one('SELECT * FROM projects WHERE id=?', [req.params.id]))
}))
app.delete('/api/projects/:id', safe(async (req, res) => { const result = await execute('DELETE FROM projects WHERE id=?', [req.params.id]); res.status(result.affectedRows ? 204 : 404).end() }))

app.get('/api/tasks', safe(async (req, res) => {
  const sql = `SELECT t.*,p.title AS projectTitle,c.id AS clientId,c.name AS clientName
    FROM tasks t JOIN projects p ON p.id=t.projectId JOIN clients c ON c.id=p.clientId`
  const rows = req.query.projectId
    ? await query(`${sql} WHERE t.projectId=? ORDER BY t.id DESC`, [req.query.projectId])
    : await query(`${sql} ORDER BY t.id DESC`)
  res.json(rows)
}))
app.get('/api/tasks/:id', safe(async (req, res) => { const row = await one('SELECT t.*,p.title AS projectTitle,c.id AS clientId,c.name AS clientName FROM tasks t JOIN projects p ON p.id=t.projectId JOIN clients c ON c.id=p.clientId WHERE t.id=?', [req.params.id]); if (row) res.json(row); else required(res, row, 'Задача') }))
app.post('/api/tasks', safe(async (req, res) => {
  if (!req.body.title?.trim() || !req.body.projectId) throw new Error('Укажите проект и название')
  const status = taskStatus(req.body.status)
  const assignee = taskAssignee(req.body.assignee)
  const priority = taskPriority(req.body.priority)
  const result = await execute('INSERT INTO tasks(projectId,title,description,status,assignee,priority,dueDate,completedAt) VALUES(?,?,?,?,?,?,?,?)', [req.body.projectId, req.body.title.trim(), req.body.description || '', status, assignee, priority, req.body.dueDate || null, status === 'done' ? sqlNow() : null])
  res.status(201).json(await one('SELECT * FROM tasks WHERE id=?', [result.insertId]))
}))
app.put('/api/tasks/:id', safe(async (req, res) => {
  const old = await one('SELECT * FROM tasks WHERE id=?', [req.params.id])
  if (!old) return required(res, old, 'Задача')
  const status = taskStatus(req.body.status ?? old.status)
  const completedAt = status === 'done' ? (old.completedAt || sqlNow()) : null
  await execute('UPDATE tasks SET projectId=?,title=?,description=?,status=?,assignee=?,priority=?,dueDate=?,completedAt=? WHERE id=?', [req.body.projectId ?? old.projectId, req.body.title ?? old.title, req.body.description ?? old.description, status, taskAssignee(req.body.assignee ?? old.assignee), taskPriority(req.body.priority ?? old.priority), req.body.dueDate === undefined ? old.dueDate : (req.body.dueDate || null), completedAt, req.params.id])
  res.json(await one('SELECT * FROM tasks WHERE id=?', [req.params.id]))
}))
app.delete('/api/tasks/:id', safe(async (req, res) => { const result = await execute('DELETE FROM tasks WHERE id=?', [req.params.id]); res.status(result.affectedRows ? 204 : 404).end() }))

app.get('/api/tasks/:id/todos', safe(async (req, res) => {
  const rows = await query('SELECT id,taskId,text,checked FROM todos WHERE taskId=? ORDER BY id', [req.params.id])
  res.json(rows.map(x => ({ ...x, checked: !!x.checked })))
}))
app.post('/api/tasks/:id/todos', safe(async (req, res) => {
  if (!req.body.text?.trim()) throw new Error('Введите текст')
  const result = await execute('INSERT INTO todos(taskId,text) VALUES(?,?)', [req.params.id, req.body.text.trim()])
  res.status(201).json({ ...(await one('SELECT * FROM todos WHERE id=?', [result.insertId])), checked: false })
}))
app.put('/api/tasks/:taskId/todos/:todoId', safe(async (req, res) => {
  const result = await execute('UPDATE todos SET text=COALESCE(?,text),checked=COALESCE(?,checked) WHERE id=? AND taskId=?', [req.body.text ?? null, req.body.checked == null ? null : Number(req.body.checked), req.params.todoId, req.params.taskId])
  if (!result.affectedRows) return res.status(404).json({ error: 'Пункт не найден' })
  const row = await one('SELECT * FROM todos WHERE id=?', [req.params.todoId])
  res.json({ ...row, checked: !!row.checked })
}))
app.delete('/api/tasks/:taskId/todos/:todoId', safe(async (req, res) => { const result = await execute('DELETE FROM todos WHERE id=? AND taskId=?', [req.params.todoId, req.params.taskId]); res.status(result.affectedRows ? 204 : 404).end() }))
app.get('/api/tasks/:id/messages', safe(async (req, res) => res.json(await query('SELECT * FROM messages WHERE taskId=? ORDER BY id', [req.params.id]))))
app.post('/api/tasks/:id/messages', safe(async (req, res) => {
  if (!req.body.text?.trim()) throw new Error('Введите сообщение')
  const result = await execute('INSERT INTO messages(taskId,author,text) VALUES(?,?,?)', [req.params.id, req.user, req.body.text.trim()])
  res.status(201).json(await one('SELECT * FROM messages WHERE id=?', [result.insertId]))
}))
app.delete('/api/tasks/:taskId/messages/:messageId', safe(async (req, res) => { const result = await execute('DELETE FROM messages WHERE id=? AND taskId=? AND author=?', [req.params.messageId, req.params.taskId, req.user]); res.status(result.affectedRows ? 204 : 404).end() }))

app.get('/api/payment-schedules', safe(async (req, res) => {
  const rows = await query(`
    SELECT ps.*, c.name AS clientName
    FROM payment_schedules ps
    JOIN clients c ON c.id = ps.clientId
    ORDER BY ps.paymentDate DESC, ps.id DESC
  `)
  res.json(rows.map(paymentDto))
}))
app.get('/api/payment-schedules/:id', safe(async (req, res) => {
  const row = await one(`
    SELECT ps.*, c.name AS clientName
    FROM payment_schedules ps
    JOIN clients c ON c.id = ps.clientId
    WHERE ps.id=?
  `, [req.params.id])
  if (row) res.json(paymentDto(row))
  else required(res, row, 'Запись оплаты')
}))
app.post('/api/payment-schedules', safe(async (req, res) => {
  const amount = Number(req.body.amount)
  if (!req.body.clientId) throw new Error('Укажите клиента')
  if (!Array.isArray(req.body.projectIds) || !req.body.projectIds.length) throw new Error('Выберите хотя бы один проект')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Укажите сумму')
  if (!req.body.paymentDate) throw new Error('Укажите дату оплаты')
  await validatePaymentProjects(req.body.clientId, req.body.projectIds)
  const dueInDays = calcDueInDays(req.body.paymentDate)
  const status = paymentStatus(req.body.status)
  const result = await execute(
    'INSERT INTO payment_schedules(clientId,projectIds,amount,paymentDate,dueInDays,status,paidDate,paymentMethod,comment) VALUES(?,?,?,?,?,?,?,?,?)',
    [req.body.clientId, JSON.stringify(req.body.projectIds.map(Number)), amount, req.body.paymentDate, dueInDays, status, status === 'paid' ? (req.body.paidDate || dateToday()) : null, req.body.paymentMethod || '', req.body.comment || '']
  )
  const row = await one(`
    SELECT ps.*, c.name AS clientName
    FROM payment_schedules ps
    JOIN clients c ON c.id = ps.clientId
    WHERE ps.id=?
  `, [result.insertId])
  res.status(201).json(paymentDto(row))
}))
app.put('/api/payment-schedules/:id', safe(async (req, res) => {
  const old = await one('SELECT * FROM payment_schedules WHERE id=?', [req.params.id])
  if (!old) return required(res, old, 'Запись оплаты')
  const amount = req.body.amount == null ? old.amount : Number(req.body.amount)
  const projectIds = req.body.projectIds == null ? safeParseIds(old.projectIds) : req.body.projectIds
  if (!Array.isArray(projectIds) || !projectIds.length) throw new Error('Выберите хотя бы один проект')
  const paymentDate = req.body.paymentDate ?? old.paymentDate
  const dueInDays = calcDueInDays(paymentDate)
  const clientId = req.body.clientId ?? old.clientId
  const status = paymentStatus(req.body.status ?? old.status)
  await validatePaymentProjects(clientId, projectIds)
  const paidDate = status === 'paid' ? (req.body.paidDate || old.paidDate || dateToday()) : null
  await execute(
    'UPDATE payment_schedules SET clientId=?,projectIds=?,amount=?,paymentDate=?,dueInDays=?,status=?,paidDate=?,paymentMethod=?,comment=? WHERE id=?',
    [clientId, JSON.stringify(projectIds.map(Number)), amount, paymentDate, dueInDays, status, paidDate, req.body.paymentMethod ?? old.paymentMethod, req.body.comment ?? old.comment, req.params.id]
  )
  const row = await one(`
    SELECT ps.*, c.name AS clientName
    FROM payment_schedules ps
    JOIN clients c ON c.id = ps.clientId
    WHERE ps.id=?
  `, [req.params.id])
  res.json(paymentDto(row))
}))
app.delete('/api/payment-schedules/:id', safe(async (req, res) => { const result = await execute('DELETE FROM payment_schedules WHERE id=?', [req.params.id]); res.status(result.affectedRows ? 204 : 404).end() }))

function safeParseIds(value) {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(Number) : []
    } catch {
      return []
    }
  }
  return []
}

function calcDueInDays(paymentDate) {
  const payment = new Date(`${paymentDate}T00:00:00Z`)
  const today = new Date()
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.round((payment.getTime() - utcToday) / 86400000))
}

function dateToday() {
  return new Date().toISOString().slice(0, 10)
}

function sqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function taskStatus(value) {
  if (!['active', 'paused', 'done'].includes(value)) throw new Error('Некорректный статус задачи')
  return value
}

function taskAssignee(value = '') {
  if (!['', 'Lesha', 'Denis'].includes(value)) throw new Error('Некорректный исполнитель')
  return value
}

function taskPriority(value = 'normal') {
  if (!['low', 'normal', 'high', 'urgent'].includes(value)) throw new Error('Некорректный приоритет')
  return value
}

function paymentStatus(value = 'planned') {
  if (!['planned', 'paid', 'cancelled'].includes(value)) throw new Error('Некорректный статус оплаты')
  return value
}

async function validatePaymentProjects(clientId, projectIds) {
  const normalized = [...new Set(projectIds.map(Number).filter(Number.isInteger))]
  if (!normalized.length || normalized.length !== projectIds.length) throw new Error('Некорректный список проектов')
  const placeholders = normalized.map(() => '?').join(',')
  const rows = await query(`SELECT id FROM projects WHERE clientId=? AND id IN (${placeholders})`, [clientId, ...normalized])
  if (rows.length !== normalized.length) throw new Error('Проекты должны принадлежать выбранному клиенту')
}

function paymentDto(row) {
  const dueInDays = calcDueInDays(row.paymentDate)
  const overdue = row.status === 'planned' && dueInDays === 0 && String(row.paymentDate).slice(0, 10) < dateToday()
  return {
    ...row,
    projectIds: safeParseIds(row.projectIds),
    dueInDays,
    displayStatus: overdue ? 'overdue' : row.status
  }
}

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url))
if (process.env.SERVE_CLIENT === 'true' && existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(`${clientDist}/index.html`))
}

app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }))
app.listen(port, () => console.log(`Neon CRM API: http://localhost:${port} (${databaseDriver()})`))
