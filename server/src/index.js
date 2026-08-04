import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { db } from './db.js'

dotenv.config({ path: new URL('../../.env', import.meta.url) })

const app = express()
const port = Number(process.env.PORT || 3000)
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:8080').split(',')
app.use(cors({ origin: origins }))
app.use(express.json())

const users = new Map([
  [process.env.LESHA_KEY, 'Lesha'],
  [process.env.DENIS_KEY, 'Denis'],
].filter(([key]) => key))

const notFound = (res, label = 'Запись') => res.status(404).json({ error: `${label} не найден` })
const requiredText = (value, message) => {
  if (!value || !String(value).trim()) throw new Error(message)
  return String(value).trim()
}
const read = () => db.read()
const save = (store) => db.write(store)
const byId = (rows, id) => rows.find((item) => Number(item.id) === Number(id))
const removeById = (rows, id) => {
  const index = rows.findIndex((item) => Number(item.id) === Number(id))
  if (index === -1) return false
  rows.splice(index, 1)
  return true
}
const safe = (handler) => (req, res) => {
  try {
    handler(req, res)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

app.post('/api/auth/login', (req, res) => {
  const user = users.get(req.body?.key)
  if (!user) return res.status(401).json({ error: 'Неверный ключ доступа' })
  res.json({ token: req.body.key, user })
})

app.use('/api', (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const user = users.get(token)
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' })
  req.user = user
  next()
})

app.get('/api/me', (req, res) => res.json({ user: req.user }))

app.get('/api/clients', (req, res) => {
  const store = read()
  res.json([...store.clients].sort((a, b) => b.id - a.id))
})

app.get('/api/clients/:id', (req, res) => {
  const store = read()
  const client = byId(store.clients, req.params.id)
  if (!client) return notFound(res, 'Клиент')
  res.json(client)
})

app.post('/api/clients', safe((req, res) => {
  const store = read()
  const client = {
    id: db.nextId(store, 'clients'),
    name: requiredText(req.body.name, 'Укажите имя клиента'),
    contactInfo: req.body.contactInfo || '',
    notes: req.body.notes || '',
  }
  store.clients.push(client)
  save(store)
  res.status(201).json(client)
}))

app.put('/api/clients/:id', safe((req, res) => {
  const store = read()
  const client = byId(store.clients, req.params.id)
  if (!client) return notFound(res, 'Клиент')
  client.name = requiredText(req.body.name ?? client.name, 'Укажите имя клиента')
  client.contactInfo = req.body.contactInfo ?? client.contactInfo
  client.notes = req.body.notes ?? client.notes
  save(store)
  res.json(client)
}))

app.delete('/api/clients/:id', (req, res) => {
  const store = read()
  const ok = removeById(store.clients, req.params.id)
  if (!ok) return notFound(res, 'Клиент')
  store.projects = store.projects.filter((project) => Number(project.clientId) !== Number(req.params.id))
  const projectIds = new Set(store.projects.map((project) => Number(project.id)))
  store.tasks = store.tasks.filter((task) => projectIds.has(Number(task.projectId)))
  const taskIds = new Set(store.tasks.map((task) => Number(task.id)))
  store.todos = store.todos.filter((todo) => taskIds.has(Number(todo.taskId)))
  store.messages = store.messages.filter((message) => taskIds.has(Number(message.taskId)))
  save(store)
  res.status(204).end()
})

app.get('/api/projects', (req, res) => {
  const store = read()
  const rows = req.query.clientId
    ? store.projects.filter((project) => Number(project.clientId) === Number(req.query.clientId))
    : store.projects
  res.json([...rows].sort((a, b) => b.id - a.id))
})

app.get('/api/projects/:id', (req, res) => {
  const store = read()
  const project = byId(store.projects, req.params.id)
  if (!project) return notFound(res, 'Проект')
  res.json(project)
})

app.post('/api/projects', safe((req, res) => {
  const store = read()
  const project = {
    id: db.nextId(store, 'projects'),
    clientId: Number(req.body.clientId),
    title: requiredText(req.body.title, 'Укажите клиента и название'),
    description: req.body.description || '',
    status: ['active', 'paused', 'done'].includes(req.body.status) ? req.body.status : 'active',
    createdAt: new Date().toISOString(),
  }
  if (!project.clientId || !byId(store.clients, project.clientId)) throw new Error('Укажите существующего клиента')
  store.projects.push(project)
  save(store)
  res.status(201).json(project)
}))

app.put('/api/projects/:id', safe((req, res) => {
  const store = read()
  const project = byId(store.projects, req.params.id)
  if (!project) return notFound(res, 'Проект')
  if (req.body.clientId != null) {
    const client = byId(store.clients, req.body.clientId)
    if (!client) throw new Error('Укажите существующего клиента')
    project.clientId = Number(req.body.clientId)
  }
  if (req.body.title != null) project.title = requiredText(req.body.title, 'Укажите название')
  if (req.body.description != null) project.description = req.body.description
  if (req.body.status != null) project.status = ['active', 'paused', 'done'].includes(req.body.status) ? req.body.status : project.status
  save(store)
  res.json(project)
}))

app.delete('/api/projects/:id', (req, res) => {
  const store = read()
  const ok = removeById(store.projects, req.params.id)
  if (!ok) return notFound(res, 'Проект')
  const taskIds = new Set(store.tasks.filter((task) => Number(task.projectId) === Number(req.params.id)).map((task) => Number(task.id)))
  store.tasks = store.tasks.filter((task) => Number(task.projectId) !== Number(req.params.id))
  store.todos = store.todos.filter((todo) => !taskIds.has(Number(todo.taskId)))
  store.messages = store.messages.filter((message) => !taskIds.has(Number(message.taskId)))
  save(store)
  res.status(204).end()
})

app.get('/api/tasks', (req, res) => {
  const store = read()
  const rows = req.query.projectId
    ? store.tasks.filter((task) => Number(task.projectId) === Number(req.query.projectId))
    : store.tasks
  res.json([...rows].sort((a, b) => b.id - a.id))
})

app.get('/api/tasks/:id', (req, res) => {
  const store = read()
  const task = byId(store.tasks, req.params.id)
  if (!task) return notFound(res, 'Задача')
  res.json(task)
})

app.post('/api/tasks', safe((req, res) => {
  const store = read()
  const task = {
    id: db.nextId(store, 'tasks'),
    projectId: Number(req.body.projectId),
    title: requiredText(req.body.title, 'Укажите проект и название'),
    description: req.body.description || '',
    status: ['active', 'paused', 'done'].includes(req.body.status) ? req.body.status : 'active',
    createdAt: new Date().toISOString(),
  }
  if (!task.projectId || !byId(store.projects, task.projectId)) throw new Error('Укажите существующий проект')
  store.tasks.push(task)
  save(store)
  res.status(201).json(task)
}))

app.put('/api/tasks/:id', safe((req, res) => {
  const store = read()
  const task = byId(store.tasks, req.params.id)
  if (!task) return notFound(res, 'Задача')
  if (req.body.projectId != null) {
    const project = byId(store.projects, req.body.projectId)
    if (!project) throw new Error('Укажите существующий проект')
    task.projectId = Number(req.body.projectId)
  }
  if (req.body.title != null) task.title = requiredText(req.body.title, 'Укажите название')
  if (req.body.description != null) task.description = req.body.description
  if (req.body.status != null) task.status = ['active', 'paused', 'done'].includes(req.body.status) ? req.body.status : task.status
  save(store)
  res.json(task)
}))

app.delete('/api/tasks/:id', (req, res) => {
  const store = read()
  const ok = removeById(store.tasks, req.params.id)
  if (!ok) return notFound(res, 'Задача')
  store.todos = store.todos.filter((todo) => Number(todo.taskId) !== Number(req.params.id))
  store.messages = store.messages.filter((message) => Number(message.taskId) !== Number(req.params.id))
  save(store)
  res.status(204).end()
})

app.get('/api/tasks/:id/todos', (req, res) => {
  const store = read()
  res.json(store.todos.filter((todo) => Number(todo.taskId) === Number(req.params.id)))
})

app.post('/api/tasks/:id/todos', safe((req, res) => {
  const store = read()
  if (!byId(store.tasks, req.params.id)) return notFound(res, 'Задача')
  const todo = {
    id: db.nextId(store, 'todos'),
    taskId: Number(req.params.id),
    text: requiredText(req.body.text, 'Введите текст'),
    checked: false,
  }
  store.todos.push(todo)
  save(store)
  res.status(201).json(todo)
}))

app.put('/api/tasks/:taskId/todos/:todoId', safe((req, res) => {
  const store = read()
  const todo = store.todos.find((item) => Number(item.id) === Number(req.params.todoId) && Number(item.taskId) === Number(req.params.taskId))
  if (!todo) return notFound(res, 'Пункт')
  if (req.body.text != null) todo.text = requiredText(req.body.text, 'Введите текст')
  if (req.body.checked != null) todo.checked = Boolean(req.body.checked)
  save(store)
  res.json(todo)
}))

app.delete('/api/tasks/:taskId/todos/:todoId', (req, res) => {
  const store = read()
  const before = store.todos.length
  store.todos = store.todos.filter((todo) => !(Number(todo.id) === Number(req.params.todoId) && Number(todo.taskId) === Number(req.params.taskId)))
  if (store.todos.length === before) return notFound(res, 'Пункт')
  save(store)
  res.status(204).end()
})

app.get('/api/tasks/:id/messages', (req, res) => {
  const store = read()
  res.json(store.messages.filter((message) => Number(message.taskId) === Number(req.params.id)).sort((a, b) => a.id - b.id))
})

app.post('/api/tasks/:id/messages', safe((req, res) => {
  const store = read()
  if (!byId(store.tasks, req.params.id)) return notFound(res, 'Задача')
  const message = {
    id: db.nextId(store, 'messages'),
    taskId: Number(req.params.id),
    author: req.user,
    text: requiredText(req.body.text, 'Введите сообщение'),
    timestamp: new Date().toISOString(),
  }
  store.messages.push(message)
  save(store)
  res.status(201).json(message)
}))

app.delete('/api/tasks/:taskId/messages/:messageId', (req, res) => {
  const store = read()
  const before = store.messages.length
  store.messages = store.messages.filter((message) => !(Number(message.id) === Number(req.params.messageId) && Number(message.taskId) === Number(req.params.taskId) && message.author === req.user))
  if (store.messages.length === before) return notFound(res, 'Сообщение')
  save(store)
  res.status(204).end()
})

app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }))

app.listen(port, () => console.log(`Neon CRM API: http://localhost:${port}`))
