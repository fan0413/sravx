<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo"><span>SRAVX</span><small>OPERATION STUDIO</small></div>
      <el-menu :default-active="route.path" :default-openeds="['product','points-product','category','banner','order','refund','user','scissors','inquiry']" router class="menu">
        <el-menu-item :index="workspacePath(channel)">{{ channelLabel(channel) }}入口</el-menu-item>
        <li class="shared-label" role="presentation">共用管理 · 同一数据与接口</li>
        <el-menu-item index="/dashboard">经营看板</el-menu-item>
        <el-sub-menu v-if="!targetMode || catalogMode" index="product">
          <template #title>商品管理</template>
          <el-menu-item index="/product/list">商品列表</el-menu-item>
          <el-menu-item index="/product/create">新建商品</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || catalogMode" index="points-product">
          <template #title>积分商品</template>
          <el-menu-item index="/points-product/list">积分商品列表</el-menu-item>
          <el-menu-item index="/points-product/create">新建积分商品</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || catalogMode" index="category">
          <template #title>分类管理</template>
          <el-menu-item index="/category/list">分类列表</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || catalogMode" index="banner">
          <template #title>内容运营</template>
          <el-menu-item index="/banner/list">轮播图管理</el-menu-item>
          <el-menu-item v-if="!targetMode" index="/coupon/list">优惠券管理</el-menu-item>
          <el-menu-item v-if="!targetMode" index="/gift-card/list">礼品卡管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || operationsMode" index="order">
          <template #title>订单管理</template>
          <el-menu-item index="/order/list">订单列表</el-menu-item>
          <el-menu-item index="/points-order/list">积分订单列表</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="!targetMode || operationsMode" index="refund">
          <template #title>售后管理</template>
          <el-menu-item v-if="!targetMode || operationsMode" index="/refund/list">售后退款</el-menu-item>
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
          <el-radio-group :model-value="channel" aria-label="管理渠道切换" size="small" @change="switchChannel">
            <el-radio-button value="web">网页功能</el-radio-button>
            <el-radio-button value="miniprogram">小程序功能</el-radio-button>
          </el-radio-group>
          <el-tag v-if="!isWorkspacePath(route.path)" type="info" effect="plain">共用管理</el-tag>
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
import { computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter, RouterView } from "vue-router";
import { adminLogout } from "../lib/admin-auth";
import { targetAdminCatalogModeEnabled, targetAdminModeEnabled, targetAdminOperationsModeEnabled } from "../lib/target-admin-auth";
import { useAdminWorkspace } from '../lib/use-admin-workspace';
import { channelLabel, workspacePath, isWorkspacePath, parseAdminChannel, channelSwitchPath } from '../lib/admin-workspace';

const route = useRoute();
const router = useRouter();
const targetMode = targetAdminModeEnabled();
const catalogMode = targetAdminCatalogModeEnabled();
const operationsMode = targetAdminOperationsModeEnabled();
const { channel, setChannel } = useAdminWorkspace();
watch(() => route.params.channel, value => {
  const next = parseAdminChannel(value);
  if (next && isWorkspacePath(route.path)) setChannel(next);
}, { immediate: true });
async function switchChannel(value: unknown) {
  const next = parseAdminChannel(value);
  if (!next) return;
  const path = channelSwitchPath(route.path, next);
  if (path) await router.push(path);
  else setChannel(next);
}

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
  background: var(--sravx-canvas);
}

.sidebar {
  padding: 18px 12px;
  border-right: 1px solid var(--sravx-line);
  background: rgba(255, 255, 255, 0.88);
}

.logo {
  height: 68px;
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  border-bottom: 1px solid var(--sravx-line);
  color: var(--sravx-ink);
  letter-spacing: 0.08em;
  font-size: 20px;
  font-weight: 750;
  line-height: 1;
}

.logo small {
  color: var(--sravx-accent);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.menu {
  margin-top: 14px;
  border-right: none;
  background: transparent;
}
.shared-label { padding: 18px 14px 8px; color: var(--sravx-muted); font-size: 11px; line-height: 1.5; list-style: none; }

.topbar {
  height: 72px;
  padding: 0 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--sravx-line);
  background: rgba(242, 242, 247, 0.86);
  backdrop-filter: blur(16px);
}

.title {
  font-size: 20px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.meta {
  color: var(--sravx-muted);
  font-size: 13px;
}

.right-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.content {
  padding: 28px 32px;
  background: var(--sravx-canvas);
}

:deep(.el-menu-item),
:deep(.el-sub-menu__title) { height: 42px; margin: 2px 0; border-radius: 12px; color: #515156; }
:deep(.el-menu-item:hover),
:deep(.el-sub-menu__title:hover) { background: #f1efeb; color: var(--sravx-ink); }
:deep(.el-menu-item.is-active) { background: var(--sravx-ink); color: #fff; font-weight: 650; }
:deep(.el-sub-menu .el-menu) { background: transparent; }

@media (max-width: 900px) {
  .sidebar { width: 188px !important; }
  .content { padding: 18px; }
  .topbar { padding: 0 20px; }
  .meta { display: none; }
}
</style>
