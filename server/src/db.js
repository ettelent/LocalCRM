import mysql from 'mysql2/promise'

const {
  MYSQL_HOST = 'mysql',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'crm',
  MYSQL_PASSWORD = 'crm',
  MYSQL_DATABASE = 'crm'
} = process.env

export const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  multipleStatements: true
})

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

export async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params)
  return result
}

export async function initDb() {
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
      CONSTRAINT fk_projects_client
        FOREIGN KEY (clientId) REFERENCES clients(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description VARCHAR(2000) NOT NULL DEFAULT '',
      status ENUM('active','paused','done') NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_tasks_project
        FOREIGN KEY (projectId) REFERENCES projects(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taskId INT NOT NULL,
      text VARCHAR(1000) NOT NULL,
      checked TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_todos_task
        FOREIGN KEY (taskId) REFERENCES tasks(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taskId INT NOT NULL,
      author ENUM('Lesha','Denis') NOT NULL,
      text VARCHAR(2000) NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_task
        FOREIGN KEY (taskId) REFERENCES tasks(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_schedules (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      clientId INT NOT NULL,
      projectIds JSON NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      paymentDate DATE NOT NULL,
      dueInDays INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_project
        FOREIGN KEY (clientId) REFERENCES clients(id)
        ON DELETE CASCADE
    );
  `)

  const columns = await query("SHOW COLUMNS FROM payment_schedules")
  const hasClientId = columns.some(col => col.Field === 'clientId')
  const hasProjectId = columns.some(col => col.Field === 'projectId')
  const hasProjectIds = columns.some(col => col.Field === 'projectIds')

  if (!hasProjectIds) {
    await query('ALTER TABLE payment_schedules ADD COLUMN projectIds JSON NULL AFTER clientId')
  }
  if (!hasClientId && hasProjectId) {
    await query('ALTER TABLE payment_schedules ADD COLUMN clientId INT NULL AFTER id')
    await query(`
      UPDATE payment_schedules ps
      JOIN projects p ON p.id = ps.projectId
      SET ps.clientId = p.clientId
      WHERE ps.clientId IS NULL
    `)
    await query('ALTER TABLE payment_schedules MODIFY clientId INT NOT NULL')
  }

  if (hasProjectId) {
    const fkRows = await query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'payment_schedules'
        AND COLUMN_NAME = 'projectId'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `)
    for (const row of fkRows) {
      await query(`ALTER TABLE payment_schedules DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``)
    }
    await query('ALTER TABLE payment_schedules DROP COLUMN projectId')
  }

  if (!hasProjectIds) {
    await query(`
      UPDATE payment_schedules
      SET projectIds = JSON_ARRAY()
      WHERE projectIds IS NULL
    `)
  }

  await query(`
    UPDATE payment_schedules
    SET dueInDays = GREATEST(
      0,
      DATEDIFF(paymentDate, CURRENT_DATE())
    )
  `)

  const clientColumns = await query("SHOW COLUMNS FROM clients")
  const hasStage = clientColumns.some(col => col.Field === 'stage')
  if (!hasStage) {
    await query("ALTER TABLE clients ADD COLUMN stage ENUM('think','working','done','rejected') NOT NULL DEFAULT 'think' AFTER notes")
  }
}
