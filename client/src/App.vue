<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
const route = useRoute(), router = useRouter()
const logged = computed(() => route.path !== '/login')
const user = computed(() => localStorage.getItem('crm_user'))
function logout(){ localStorage.removeItem('crm_token'); localStorage.removeItem('crm_user'); router.push('/login') }
</script>
<template>
  <div v-if="logged" class="shell">
    <aside><router-link class="brand" to="/"><i>◆</i> NEXUS<span>CRM</span></router-link><nav><router-link to="/">▦ Клиенты</router-link><router-link to="/payment-schedule">▤ График оплат</router-link></nav><div class="profile"><span class="avatar">{{ user?.[0] }}</span><div><small>В системе</small><b>{{ user }}</b></div><button class="icon" @click="logout" title="Выйти">↪</button></div></aside>
    <main><router-view /></main>
  </div>
  <router-view v-else />
</template>
