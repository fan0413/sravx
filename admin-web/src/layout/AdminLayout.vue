<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo">Mall Admin</div>
      <el-menu :default-active="route.path" :default-openeds="['product','points-product','category','banner','order','refund','user','scissors','inquiry']" router class="menu">
        <el-menu-item index="/dashboard">经营看板</el-menu-item>
        <el-sub-menu index="product">
          <template #title>商品管理</template>
          <el-menu-item index="/product/list">商品列表</el-menu-item>
          <el-menu-item index="/product/create">新建商品</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode" index="points-product">
          <template #title>积分商品</template>
          <el-menu-item index="/points-product/list">积分商品列表</el-menu-item>
          <el-menu-item index="/points-product/create">新建积分商品</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="category">
          <template #title>分类管理</template>
          <el-menu-item index="/category/list">分类列表</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="banner">
          <template #title>内容运营</template>
          <el-menu-item index="/banner/list">轮播图管理</el-menu-item>
          <el-menu-item v-if="!targetMode" index="/coupon/list">优惠券管理</el-menu-item>
          <el-menu-item v-if="!targetMode" index="/gift-card/list">礼品卡管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode" index="order">
          <template #title>订单管理</template>
          <el-menu-item index="/order/list">订单列表</el-menu-item>
          <el-menu-item index="/points-order/list">积分订单列表</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || operationsMode" index="refund">
          <template #title>售后管理</template>
          <el-menu-item v-if="!targetMode" index="/refund/list">售后退款</el-menu-item>
          <el-menu-item index="/scissors/after-sale">剪刀售后</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="operationsMode" index="user">
          <template #title>用户管理</template>
          <el-menu-item index="/user/list">用户列表</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || catalogMode" index="scissors">
          <template #title>剪刀 SN</template>
          <el-menu-item index="/scissors/list">SN 码管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="operationsMode" index="inquiry">
          <template #title>合作咨询</template>
          <el-menu-item index="/inquiry/list">咨询列表</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div class="title">{{ pageTitle }}</div>
        <div class="right-area">
          <div class="meta">宠物美容剪刀电商管理后台</div>
          <el-button link type="primary" @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>
      <el-main class="content">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter, RouterView } from "vue-router";
import { adminLogout } from "../lib/admin-auth";
import { targetAdminCatalogModeEnabled, targetAdminModeEnabled, targetAdminOperationsModeEnabled } from "../lib/target-admin-auth";

const route = useRoute();
const router = useRouter();
const targetMode = targetAdminModeEnabled();
const catalogMode = targetAdminCatalogModeEnabled();
const operationsMode = targetAdminOperationsModeEnabled();

const pageTitle = computed(() => String(route.meta.title || "电商管理平台"));

const handleLogout = async () => {
  try {
    await adminLogout();
    ElMessage.success("已退出登录");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "退出失败");
  } finally {
    await router.replace("/login");
  }
};
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid #f0f0f0;
  background: #fff;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  border-bottom: 1px solid #f0f0f0;
}

.menu {
  border-right: none;
}

.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f0f0f0;
  background: #fff;
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.meta {
  color: #909399;
  font-size: 13px;
}

.right-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.content {
  background: #f6f8fa;
}
</style>

