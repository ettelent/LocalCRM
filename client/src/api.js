import { router } from './main.js'
const base = import.meta.env.VITE_API_URL || '/api'
export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = localStorage.getItem('crm_token')
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(base + path, { ...options, headers })
  if (response.status === 401 && path !== '/auth/login') { localStorage.clear(); router.push('/login') }
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Ошибка запроса') }
  return response.status === 204 ? null : response.json()
}
