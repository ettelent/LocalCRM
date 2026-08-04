<script setup>
defineProps({ title:String }); defineEmits(['close','submit'])
</script>
<template><div class="overlay" @mousedown.self="$emit('close')"><form class="modal" @submit.prevent="$emit('submit')"><header><h2>{{ title }}</h2><button type="button" class="icon" @click="$emit('close')">×</button></header><slot/><footer><button type="button" class="ghost" @click="$emit('close')">Отмена</button><button class="primary">Сохранить</button></footer></form></div></template>
