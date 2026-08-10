import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

let driver
let mysqlPool
let sqliteDb

function selectedDriver() {
  return (process.env.DB_DRIVER || (process.env.MYSQL_HOST ? 'mysql' : 'sqlite')).toLowerCase()
}

async function connect() {
  if (driver) return
  driver = selectedDriver()

  if (driver === 'mysql') {
    const mysql = (await import('mysql2/promise')).default
    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'crm',
      password: process.env.MYSQL_PASSWORD || 'crm',
      database: process.env.MYSQL_DATABASE || 'crm',
      waitForConnections: true,
      connectionLimit: 10,
      decimalNumbers: true,
      multipleStatements: true
    })
    return
  }

  if (driver !== 'sqlite') throw new Error(`Неизвестный DB_DRIVER: ${driver}`)
  const { DatabaseSync } = await import('node:sqlite')
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
  const configuredPath = process.env.SQLITE_PATH
  const dbPath = configuredPath ? (isAbsolute(configuredPath) ? configuredPath : resolve(projectRoot, configuredPath)) : resolve(projectRoot, 'data/crm.db')
  mkdirSync(dirname(dbPath), { recursive: true })
  sqliteDb = new DatabaseSync(dbPath)
  sqliteDb.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
}

export async function query(sql, params = []) {
  await connect()
  if (driver === 'mysql') {
    const [rows] = await mysqlPool.query(sql, params)
    return rows
  }
  return sqliteDb.prepare(sql).all(...params)
}

export async function execute(sql, params = []) {
  await connect()
  if (driver === 'mysql') {
    const [result] = await mysqlPool.execute(sql, params)
    return result
  }
  const result = sqliteDb.prepare(sql).run(...params)
  return { insertId: Number(result.lastInsertRowid), affectedRows: result.changes }
}

async function sqliteColumns(table) {
  return query(`PRAGMA table_info(${table})`)
}

async function ensureSqliteColumn(table, name, definition) {
  const columns = await sqliteColumns(table)
  if (!columns.some(column => column.name === name)) {
    sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
}

async function initSqlite() {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contactInfo TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'think'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      assignee TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      dueDate TEXT NULL,
      completedAt TEXT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      text TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      projectIds TEXT NOT NULL DEFAULT '[]',
      amount REAL NOT NULL,
      paymentDate TEXT NOT NULL,
      dueInDays INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned',
      paidDate TEXT NULL,
      paymentMethod TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
    );
  `)

  await ensureSqliteColumn('clients', 'stage', "TEXT NOT NULL DEFAULT 'think'")
  await ensureSqliteColumn('tasks', 'assignee', "TEXT NOT NULL DEFAULT ''")
  await ensureSqliteColumn('tasks', 'priority', "TEXT NOT NULL DEFAULT 'normal'")
  await ensureSqliteColumn('tasks', 'dueDate', 'TEXT NULL')
  await ensureSqliteColumn('tasks', 'completedAt', 'TEXT NULL')
  await ensureSqliteColumn('payment_schedules', 'status', "TEXT NOT NULL DEFAULT 'planned'")
  await ensureSqliteColumn('payment_schedules', 'paidDate', 'TEXT NULL')
  await ensureSqliteColumn('payment_schedules', 'paymentMethod', "TEXT NOT NULL DEFAULT ''")
  await ensureSqliteColumn('payment_schedules', 'comment', "TEXT NOT NULL DEFAULT ''")
}

async function ensureMysqlColumn(table, name, definition, after) {
  const columns = await query(`SHOW COLUMNS FROM ${table}`)
  if (!columns.some(column => column.Field === name)) {
    await query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}${after ? ` AFTER ${after}` : ''}`)
  }
}

async function initMysql() {
  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contactInfo VARCHAR(500) NOT NULL DEFAULT '',
      notes VARCHAR(1000) NOT NULL DEFAULT '',
      stage ENUM('think','working','done','rejected') NOT NULL DEFAULT 'think'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      clientId INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description VARCHAR(2000) NOT NULL DEFAULT '',
      status ENUM('active','paused','done') NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_projects_client FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description VARCHAR(2000) NOT NULL DEFAULT '',
      status ENUM('active','paused','done') NOT NULL DEFAULT 'active',
      assignee ENUM('','Lesha','Denis') NOT NULL DEFAULT '',
      priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
      dueDate DATE NULL,
      completedAt DATETIME NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_tasks_project FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taskId INT NOT NULL,
      text VARCHAR(1000) NOT NULL,
      checked TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_todos_task FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taskId INT NOT NULL,
      author ENUM('Lesha','Denis') NOT NULL,
      text VARCHAR(2000) NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_task FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_schedules (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      clientId INT NOT NULL,
      projectIds JSON NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      paymentDate DATE NOT NULL,
      dueInDays INT NOT NULL DEFAULT 0,
      status ENUM('planned','paid','cancelled') NOT NULL DEFAULT 'planned',
      paidDate DATE NULL,
      paymentMethod VARCHAR(100) NOT NULL DEFAULT '',
      comment VARCHAR(1000) NOT NULL DEFAULT '',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_client FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
    );
  `)

  await ensureMysqlColumn('clients', 'stage', "ENUM('think','working','done','rejected') NOT NULL DEFAULT 'think'", 'notes')
  await ensureMysqlColumn('tasks', 'assignee', "ENUM('','Lesha','Denis') NOT NULL DEFAULT ''", 'status')
  await ensureMysqlColumn('tasks', 'priority', "ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal'", 'assignee')
  await ensureMysqlColumn('tasks', 'dueDate', 'DATE NULL', 'priority')
  await ensureMysqlColumn('tasks', 'completedAt', 'DATETIME NULL', 'dueDate')
  await ensureMysqlColumn('payment_schedules', 'status', "ENUM('planned','paid','cancelled') NOT NULL DEFAULT 'planned'", 'dueInDays')
  await ensureMysqlColumn('payment_schedules', 'paidDate', 'DATE NULL', 'status')
  await ensureMysqlColumn('payment_schedules', 'paymentMethod', "VARCHAR(100) NOT NULL DEFAULT ''", 'paidDate')
  await ensureMysqlColumn('payment_schedules', 'comment', "VARCHAR(1000) NOT NULL DEFAULT ''", 'paymentMethod')

  const columns = await query('SHOW COLUMNS FROM payment_schedules')
  const hasProjectId = columns.some(column => column.Field === 'projectId')
  const hasProjectIds = columns.some(column => column.Field === 'projectIds')
  const hasClientId = columns.some(column => column.Field === 'clientId')
  if (!hasProjectIds) await query('ALTER TABLE payment_schedules ADD COLUMN projectIds JSON NULL AFTER clientId')
  if (!hasClientId && hasProjectId) {
    await query('ALTER TABLE payment_schedules ADD COLUMN clientId INT NULL AFTER id')
    await query('UPDATE payment_schedules ps JOIN projects p ON p.id=ps.projectId SET ps.clientId=p.clientId WHERE ps.clientId IS NULL')
    await query('ALTER TABLE payment_schedules MODIFY clientId INT NOT NULL')
  }
  if (hasProjectId) {
    const keys = await query(`SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payment_schedules' AND COLUMN_NAME='projectId' AND REFERENCED_TABLE_NAME IS NOT NULL`)
    for (const row of keys) await query(`ALTER TABLE payment_schedules DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``)
    await query('ALTER TABLE payment_schedules DROP COLUMN projectId')
  }
  if (!hasProjectIds) await query('UPDATE payment_schedules SET projectIds=JSON_ARRAY() WHERE projectIds IS NULL')
}

export async function initDb() {
  await connect()
  if (driver === 'mysql') await initMysql()
  else await initSqlite()
}

export function databaseDriver() {
  return driver || selectedDriver()
}
