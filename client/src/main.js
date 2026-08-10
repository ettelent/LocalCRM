import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Login from './views/Login.vue'
import Clients from './views/Clients.vue'
import ClientPage from './views/ClientPage.vue'
import ProjectPage from './views/ProjectPage.vue'
import TaskPage from './views/TaskPage.vue'
import PaymentSchedule from './views/PaymentSchedule.vue'
import Tasks from './views/Tasks.vue'
import './style.css'

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/', component: Clients },
  { path: '/clients/:id', component: ClientPage },
  { path: '/projects/:id', component: ProjectPage },
  { path: '/tasks', component: Tasks },
  { path: '/tasks/:id', component: TaskPage },
  { path: '/payment-schedule', component: PaymentSchedule }
]
export const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach(to => !to.meta.public && !localStorage.getItem('crm_token') ? '/login' : true)
createApp(App).use(router).mount('#app')
