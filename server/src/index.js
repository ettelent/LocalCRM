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

const users = () => new Map([[process.env.LESHA_KEY, 'Lesha'], [process.env.DENIS_KEY, 'Denis']].filter(([key]) => key))
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

const one = (sql, value) => db.prepare(sql).get(value)
const required = (res, value, label = 'Запись') => value || (res.status(404).json({ error: `${label} не найден` }), null)
const safe = fn => (req, res) => { try { fn(req, res) } catch (e) { res.status(400).json({ error: e.message }) } }

app.get('/api/me', (req, res) => res.json({ user: req.user }))
app.get('/api/clients', (req, res) => res.json(db.prepare('SELECT * FROM clients ORDER BY id DESC').all()))
app.get('/api/clients/:id', safe((req, res) => { const row = required(res, one('SELECT * FROM clients WHERE id=?', req.params.id), 'Клиент'); if (row) res.json(row) }))
app.post('/api/clients', safe((req, res) => {
  if (!req.body.name?.trim()) throw new Error('Укажите имя клиента')
  const info = db.prepare('INSERT INTO clients(name,contactInfo,notes) VALUES(?,?,?)').run(req.body.name.trim(), req.body.contactInfo || '', req.body.notes || '')
  res.status(201).json(one('SELECT * FROM clients WHERE id=?', info.lastInsertRowid))
}))
app.put('/api/clients/:id', safe((req, res) => {
  if (!req.body.name?.trim()) throw new Error('Укажите имя клиента')
  const info = db.prepare('UPDATE clients SET name=?,contactInfo=?,notes=? WHERE id=?').run(req.body.name.trim(), req.body.contactInfo || '', req.body.notes || '', req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Клиент не найден' })
  res.json(one('SELECT * FROM clients WHERE id=?', req.params.id))
}))
app.delete('/api/clients/:id', (req, res) => { const x = db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id); res.status(x.changes ? 204 : 404).end() })

app.get('/api/projects', (req, res) => {
  const rows = req.query.clientId ? db.prepare('SELECT * FROM projects WHERE clientId=? ORDER BY id DESC').all(req.query.clientId) : db.prepare('SELECT * FROM projects ORDER BY id DESC').all()
  res.json(rows)
})
app.get('/api/projects/:id', safe((req, res) => { const row = required(res, one('SELECT * FROM projects WHERE id=?', req.params.id), 'Проект'); if (row) res.json(row) }))
app.post('/api/projects', safe((req, res) => {
  if (!req.body.title?.trim() || !req.body.clientId) throw new Error('Укажите клиента и название')
  const info = db.prepare('INSERT INTO projects(clientId,title,description,status) VALUES(?,?,?,?)').run(req.body.clientId, req.body.title.trim(), req.body.description || '', req.body.status || 'active')
  res.status(201).json(one('SELECT * FROM projects WHERE id=?', info.lastInsertRowid))
}))
app.put('/api/projects/:id', safe((req, res) => {
  const old = required(res, one('SELECT * FROM projects WHERE id=?', req.params.id), 'Проект'); if (!old) return
  db.prepare('UPDATE projects SET clientId=?,title=?,description=?,status=? WHERE id=?').run(req.body.clientId ?? old.clientId, req.body.title ?? old.title, req.body.description ?? old.description, req.body.status ?? old.status, req.params.id)
  res.json(one('SELECT * FROM projects WHERE id=?', req.params.id))
}))
app.delete('/api/projects/:id', (req, res) => { const x = db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id); res.status(x.changes ? 204 : 404).end() })

app.get('/api/tasks', (req, res) => {
  const rows = req.query.projectId ? db.prepare('SELECT * FROM tasks WHERE projectId=? ORDER BY id DESC').all(req.query.projectId) : db.prepare('SELECT * FROM tasks ORDER BY id DESC').all()
  res.json(rows)
})
app.get('/api/tasks/:id', safe((req, res) => { const row = required(res, one('SELECT * FROM tasks WHERE id=?', req.params.id), 'Задача'); if (row) res.json(row) }))
app.post('/api/tasks', safe((req, res) => {
  if (!req.body.title?.trim() || !req.body.projectId) throw new Error('Укажите проект и название')
  const info = db.prepare('INSERT INTO tasks(projectId,title,description,status) VALUES(?,?,?,?)').run(req.body.projectId, req.body.title.trim(), req.body.description || '', req.body.status || 'active')
  res.status(201).json(one('SELECT * FROM tasks WHERE id=?', info.lastInsertRowid))
}))
app.put('/api/tasks/:id', safe((req, res) => {
  const old = required(res, one('SELECT * FROM tasks WHERE id=?', req.params.id), 'Задача'); if (!old) return
  db.prepare('UPDATE tasks SET projectId=?,title=?,description=?,status=? WHERE id=?').run(req.body.projectId ?? old.projectId, req.body.title ?? old.title, req.body.description ?? old.description, req.body.status ?? old.status, req.params.id)
  res.json(one('SELECT * FROM tasks WHERE id=?', req.params.id))
}))
app.delete('/api/tasks/:id', (req, res) => { const x = db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id); res.status(x.changes ? 204 : 404).end() })

app.get('/api/tasks/:id/todos', (req, res) => res.json(db.prepare('SELECT id,taskId,text,checked FROM todos WHERE taskId=? ORDER BY id').all(req.params.id).map(x => ({ ...x, checked: !!x.checked }))))
app.post('/api/tasks/:id/todos', safe((req, res) => { if (!req.body.text?.trim()) throw new Error('Введите текст'); const x = db.prepare('INSERT INTO todos(taskId,text) VALUES(?,?)').run(req.params.id, req.body.text.trim()); res.status(201).json({ ...one('SELECT * FROM todos WHERE id=?', x.lastInsertRowid), checked: false }) }))
app.put('/api/tasks/:taskId/todos/:todoId', safe((req, res) => { const x = db.prepare('UPDATE todos SET text=COALESCE(?,text),checked=COALESCE(?,checked) WHERE id=? AND taskId=?').run(req.body.text ?? null, req.body.checked == null ? null : Number(req.body.checked), req.params.todoId, req.params.taskId); if (!x.changes) return res.status(404).json({ error: 'Пункт не найден' }); const row=one('SELECT * FROM todos WHERE id=?', req.params.todoId); res.json({...row,checked:!!row.checked}) }))
app.delete('/api/tasks/:taskId/todos/:todoId', (req, res) => { const x=db.prepare('DELETE FROM todos WHERE id=? AND taskId=?').run(req.params.todoId,req.params.taskId); res.status(x.changes?204:404).end() })
app.get('/api/tasks/:id/messages', (req, res) => res.json(db.prepare('SELECT * FROM messages WHERE taskId=? ORDER BY id').all(req.params.id)))
app.post('/api/tasks/:id/messages', safe((req, res) => { if (!req.body.text?.trim()) throw new Error('Введите сообщение'); const x=db.prepare('INSERT INTO messages(taskId,author,text) VALUES(?,?,?)').run(req.params.id,req.user,req.body.text.trim()); res.status(201).json(one('SELECT * FROM messages WHERE id=?',x.lastInsertRowid)) }))
app.delete('/api/tasks/:taskId/messages/:messageId', (req,res)=>{ const x=db.prepare('DELETE FROM messages WHERE id=? AND taskId=? AND author=?').run(req.params.messageId,req.params.taskId,req.user); res.status(x.changes?204:404).end() })

app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }))
app.listen(port, () => console.log(`Neon CRM API: http://localhost:${port}`))
