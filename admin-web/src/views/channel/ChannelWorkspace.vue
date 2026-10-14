<template>
  <section class="channel-workspace">
    <header class="workspace-heading">
      <p>SRAVX · OPERATION WORKSPACE</p>
      <h1>{{ channelLabel(channel) }}</h1>
      <span>{{ channel === 'common' ? '统一管理两端共用的业务资料与流程，同一功能只维护一处。' : '这里只保留对应渠道的专属入口，共用业务请进入通用管理。' }}</span>
    </header>
    <el-alert title="功能归属不改变数据和权限" type="info" :closable="false" show-icon>
      商品、分类、库存、普通订单、用户和售后统一在通用管理维护，修改可能影响两端。专属入口沿用原页面、接口和放行规则，不拆库，也不会因切换界面而发布内容。
    </el-alert>
    <div class="workspace-tools">
      <article v-for="entry in entries" :key="entry.key">
        <el-tag size="small" type="info" effect="plain">{{ channel === 'common' ? '通用功能 / 共用接口' : '小程序功能 / 原有接口' }}</el-tag>
        <h2>{{ entry.title }}</h2>
        <p>{{ entry.description }}</p>
        <el-button @click="router.push(entry.items[0]!.path)">进入管理</el-button>
      </article>
    </div>
    <el-empty v-if="!entries.length && channel !== 'web'" description="当前后台模式未开放这些功能，请勿绕过既有放行开关。" />
    <el-card class="workspace-scope" shadow="never">
      <template #header>{{ channel === 'common' ? '通用管理范围' : channel === 'web' ? '网页专属功能' : '小程序专属功能' }}</template>
      <dl v-if="channel === 'common'">
        <dt>商品、分类与内容</dt><dd>系列、剪型、图片与商品资料只维护一份。轮播目前没有渠道字段，因此在通用管理统一维护。</dd>
        <dt>普通订单、用户与售后</dt><dd>复用已有处理页面与函数，不复制库存、用户或售后流程；功能可用性仍取决于现有后台放行规则。</dd>
      </dl>
      <dl v-else-if="channel === 'web'">
        <dt>欢迎页、官网首页、顶部导航</dt><dd>目前由前端源码维护，尚无独立的后台编辑接口。</dd>
        <dt>产品目录、购买选配</dt><dd>网页展示由前端维护；商品、分类和型号资料在通用管理维护，不另建商品库。</dd>
      </dl>
      <dl v-else>
        <dt>积分商城、积分订单、工具绑定</dt><dd>通过现有专属入口维护，沿用原函数、数据与放行规则。</dd>
        <dt>商品、轮播与售后</dt><dd>这些功能已归入通用管理；工具 SN 管理在本界面，剪刀售后统一在通用管理。</dd>
      </dl>
      <p class="workspace-note">独立页面编辑、渠道展示开关与独立排序尚未实现。管理界面分区不代表业务数据已按渠道隔离。</p>
      <el-button v-if="channel !== 'common'" @click="router.push(workspacePath('common'))">前往通用管理</el-button>
    </el-card>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminWorkspace } from '../../lib/use-admin-workspace';
import { channelLabel, workspacePath, workspaceMenuGroups } from '../../lib/admin-workspace';
import { targetAdminModeEnabled, targetAdminCatalogModeEnabled, targetAdminOperationsModeEnabled } from '../../lib/target-admin-auth';
const router = useRouter();
const { channel } = useAdminWorkspace();
const features = { targetMode: targetAdminModeEnabled(), catalogMode: targetAdminCatalogModeEnabled(), operationsMode: targetAdminOperationsModeEnabled() };
const entries = computed(() => workspaceMenuGroups(channel.value, features));
</script>
<style scoped>
.workspace-heading { margin: 6px 0 28px; max-width: 820px; }
.workspace-heading p { color: var(--sravx-accent); font-size: 11px; letter-spacing: .12em; font-weight: 650; }
.workspace-heading h1 { margin: 10px 0 14px; font-size: 34px; letter-spacing: -.025em; }
.workspace-heading span, .workspace-note { color: var(--sravx-muted); line-height: 1.7; font-size: 14px; }
.workspace-tools { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 18px; margin: 26px 0; }
.workspace-tools article { background: #fff; border: 1px solid var(--sravx-line); border-radius: 16px; padding: 24px; }
.workspace-tools h2 { font-size: 20px; margin: 18px 0 10px; }
.workspace-tools p { color: var(--sravx-muted); font-size: 14px; line-height: 1.6; min-height: 46px; }
.workspace-scope dt { font-weight: 650; margin-top: 20px; }
.workspace-scope dd { margin: 8px 0 24px; color: var(--sravx-muted); line-height: 1.7; font-size: 14px; }
@media(max-width:700px) { .workspace-heading h1 { font-size: 26px; } .workspace-tools { grid-template-columns: 1fr; } }
</style>
