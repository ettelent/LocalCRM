<script setup>defineProps({ status: String })</script>
<template><span class="badge" :class="status">{{ {active:'Активен',paused:'Пауза',done:'Готово'}[status] || status }}</span></template>
