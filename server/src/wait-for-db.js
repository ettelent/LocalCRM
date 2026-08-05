import net from 'node:net'

const host = process.env.MYSQL_HOST || 'mysql'
const port = Number(process.env.MYSQL_PORT || 3306)
const timeoutMs = 1000
const delayMs = 1000

function waitForDb() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const onError = () => {
      socket.destroy()
      reject(new Error('DB not ready'))
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      socket.end()
      resolve()
    })
    socket.once('timeout', onError)
    socket.once('error', onError)
  })
}

for (let i = 1; i <= 60; i++) {
  try {
    await waitForDb()
    process.exit(0)
  } catch {
    await new Promise(r => setTimeout(r, delayMs))
  }
}

console.error(`MySQL ${host}:${port} is still unavailable after 60 attempts`)
process.exit(1)
