import fs from 'node:fs'
import path from 'node:path'

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || '../data/crm.json')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const empty = {
  counters: { clients: 0, projects: 0, tasks: 0, todos: 0, messages: 0 },
  clients: [],
  projects: [],
  tasks: [],
  todos: [],
  messages: [],
}

function readStore() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(empty, null, 2))
  }
  const raw = fs.readFileSync(dbPath, 'utf8')
  return { ...empty, ...JSON.parse(raw) }
}

function writeStore(store) {
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2))
}

export const db = {
  read: readStore,
  write: writeStore,
  nextId(store, table) {
    store.counters[table] += 1
    return store.counters[table]
  },
}
