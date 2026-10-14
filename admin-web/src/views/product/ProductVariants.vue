<template>
  <el-card>
    <p>商品规格已统一在商品编辑页维护。</p>
    <el-button type="primary" @click="router.replace('/product/edit/' + productId)">编辑商品规格</el-button>
  </el-card>
</template>
<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
const router = useRouter();
const productId = Number(useRoute().params.id);
</script>
