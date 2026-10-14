<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo"><span>SRAVX</span><small>OPERATION STUDIO</small></div>
      <el-menu :default-active="route.path" :default-openeds="['product','points-product','category','banner','order','refund','user','scissors','inquiry']" router class="menu">
        <el-menu-item v-for="workspace in workspaces" :key="workspace" :index="workspacePath(workspace)">{{ channelLabel(workspace) }}入口</el-menu-item>
        <li class="shared-label" role="presentation">{{ channelLabel(channel) }} · {{ channel === 'common' ? '共用页面与接口' : '专属功能入口' }}</li>
        <template v-for="group in menuGroups" :key="group.key">
          <el-menu-item v-if="group.items.length === 1" :index="group.items[0]!.path">{{ group.items[0]!.title }}</el-menu-item>
          <el-sub-menu v-else :index="group.key">
            <template #title>{{ group.title }}</template>
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">{{ item.title }}</el-menu-item>
          </el-sub-menu>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div class="title">{{ pageTitle }}</div>
        <div class="right-area">
          <el-radio-group :model-value="switchSelection" aria-label="管理界面切换" size="small" @change="switchChannel">
            <el-radio-button value="common">通用管理</el-radio-button>
            <el-radio-button value="web">网页管理</el-radio-button>
            <el-radio-button value="miniprogram">小程序管理</el-radio-button>
          </el-radio-group>
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
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter, RouterView } from "vue-router";
import { adminLogout } from "../lib/admin-auth";
import { targetAdminCatalogModeEnabled, targetAdminModeEnabled, targetAdminOperationsModeEnabled } from "../lib/target-admin-auth";
import { useAdminWorkspace } from '../lib/use-admin-workspace';
import { channelLabel, workspacePath, isWorkspacePath, parseAdminChannel, channelSwitchPath, workspaceForPath, workspaceMenuGroups, type AdminChannel } from '../lib/admin-workspace';

const route = useRoute();
const router = useRouter();
const targetMode = targetAdminModeEnabled();
const catalogMode = targetAdminCatalogModeEnabled();
const operationsMode = targetAdminOperationsModeEnabled();
const { channel, setChannel } = useAdminWorkspace();
const switchSelection = ref(channel.value);
watch(channel, value => { switchSelection.value = value; });
const workspaces: AdminChannel[] = ['common', 'web', 'miniprogram'];
const menuGroups = computed(() => workspaceMenuGroups(channel.value, { targetMode, catalogMode, operationsMode }));
watch(() => route.path, value => {
  setChannel(workspaceForPath(value));
}, { immediate: true });
async function switchChannel(value: unknown) {
  const next = parseAdminChannel(value);
  if (!next) return;
  switchSelection.value = next;
  const path = channelSwitchPath(route.path, next);
  try {
    if (path) await router.push(path);
  } finally {
    // A canceled navigation must also reset the radio's native checked state.
    switchSelection.value = workspaceForPath(route.path);
  }
}

const pageTitle = computed(() => isWorkspacePath(route.path) ? channelLabel(channel.value) : String(route.meta.title || "电商管理平台"));

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
