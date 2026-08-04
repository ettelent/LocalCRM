<script setup>
import { ref } from 'vue'; import { useRouter } from 'vue-router'; import { api } from '../api'
const key=ref(''), error=ref(''), loading=ref(false), router=useRouter()
async function login(){ try{ loading.value=true; error.value=''; const x=await api('/auth/login',{method:'POST',body:JSON.stringify({key:key.value})}); localStorage.setItem('crm_token',x.token); localStorage.setItem('crm_user',x.user); router.push('/') }catch(e){error.value=e.message}finally{loading.value=false} }
</script>
<template><div class="login"><div class="login-card"><div class="brand big"><i>◆</i> NEXUS<span>CRM</span></div><p>Локальное пространство проектов</p><form @submit.prevent="login"><label>Ключ доступа</label><input v-model="key" type="password" placeholder="Введите персональный ключ" autofocus><div v-if="error" class="error">{{ error }}</div><button class="primary wide" :disabled="loading">{{ loading?'Проверяем…':'Войти в систему →' }}</button></form><small>Доступ только для Lesha и Denis</small></div></div></template>
