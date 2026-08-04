<script setup>
import { onMounted, ref } from 'vue'; import { api } from '../api'; import ModalForm from '../components/ModalForm.vue'
const items=ref([]), modal=ref(false), error=ref(''), form=ref({name:'',contactInfo:'',notes:''})
async function load(){try{items.value=await api('/clients')}catch(e){error.value=e.message}}
async function save(){try{await api('/clients',{method:'POST',body:JSON.stringify(form.value)}); modal.value=false; form.value={name:'',contactInfo:'',notes:''}; load()}catch(e){error.value=e.message}}
async function remove(id){if(confirm('Удалить клиента и все его проекты?')){await api('/clients/'+id,{method:'DELETE'});load()}}
onMounted(load)
</script>
<template><section><header class="page-head"><div><span class="eyebrow">Рабочее пространство</span><h1>Клиенты</h1><p>Компании и люди, с которыми вы работаете</p></div><button class="primary" @click="modal=true">＋ Новый клиент</button></header><div v-if="error" class="error">{{error}}</div><div class="grid"><article v-for="x in items" :key="x.id" class="card"><router-link :to="`/clients/${x.id}`"><div class="card-icon">{{x.name[0]}}</div><h3>{{x.name}}</h3><p>{{x.contactInfo||'Контакты не указаны'}}</p><small>{{x.notes||'Нет заметок'}}</small></router-link><button class="icon danger" @click="remove(x.id)">×</button></article><button v-if="!items.length" class="empty" @click="modal=true">＋<b>Добавьте первого клиента</b></button></div><ModalForm v-if="modal" title="Новый клиент" @close="modal=false" @submit="save"><label>Название<input v-model="form.name" required></label><label>Телефон или email<input v-model="form.contactInfo"></label><label>Заметки<textarea v-model="form.notes"></textarea></label></ModalForm></section></template>
