<template>
  <section class="channel-workspace">
    <header class="workspace-heading">
      <p>SRAVX · CHANNEL WORKSPACE</p>
      <h1>{{ channelLabel(channel) }}</h1>
      <span>按渠道组织功能入口，共用业务仍使用同一页面、同一接口和同一份数据。</span>
    </header>
    <el-alert title="渠道切换不是数据切换" type="info" :closable="false" show-icon>
      商品、分类、库存、订单、用户和售后不按此开关拆库。共用页面中的修改可能影响两端；本开关不会发布页面或改变价格、库存。
    </el-alert>
    <div class="workspace-tools">
      <article v-for="entry in entries" :key="entry.path">
        <el-tag size="small" type="info" effect="plain">共用页面 / 共用函数</el-tag>
        <h2>{{ entry.title }}</h2>
        <p>{{ entry.description }}</p>
        <el-button @click="router.push(entry.path)">进入管理</el-button>
      </article>
    </div>
    <el-empty v-if="!entries.length" description="当前后台模式未开放这些功能，请勿绕过既有放行开关。" />
    <el-card class="workspace-scope" shadow="never">
      <template #header>{{ channel === 'web' ? '网页页面功能' : '小程序页面功能' }}</template>
      <dl v-if="channel === 'web'">
        <dt>欢迎页、官网首页、顶部导航</dt><dd>目前由前端源码维护，尚无独立的后台编辑接口。</dd>
        <dt>产品目录、购买选配</dt><dd>读取共用商品、分类和型号数据；通过上方入口管理，不另建商品库。</dd>
      </dl>
      <dl v-else>
        <dt>积分商城、工具绑定</dt><dd>通过已有积分商品与剪刀 SN 管理入口维护，沿用原函数和放行规则。</dd>
        <dt>首页内容与轮播</dt><dd>沿用已有轮播管理。当前记录没有独立渠道字段，不代表切换后自动隔离投放。</dd>
      </dl>
      <p class="workspace-note">独立页面编辑、渠道展示开关与独立排序尚未实现。本页不把入口切换当作已有的渠道内容隔离。</p>
    </el-card>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminWorkspace } from '../../lib/use-admin-workspace';
import { channelLabel } from '../../lib/admin-workspace';
import { targetAdminModeEnabled, targetAdminCatalogModeEnabled } from '../../lib/target-admin-auth';
const router = useRouter();
const { channel } = useAdminWorkspace();
const canCatalog = !targetAdminModeEnabled() || targetAdminCatalogModeEnabled();
const entries = computed(() => {
  if (!canCatalog) return [];
  const common = [
    { title: '商品与购买选配', path: '/product/list', description: '管理两端使用的商品、图片、型号与价格资料。' },
    { title: '产品分类', path: '/category/list', description: '维护系列与剪型分类，沿用共用分类管理。' },
    { title: '轮播内容', path: '/banner/list', description: '沿用现有轮播函数；尚未按网页和小程序隔离记录。' }
  ];
  if (channel.value === 'web') return common;
  return [...common,
    { title: '积分商城', path: '/points-product/list', description: '维护现有积分商品，不复制积分或库存函数。' },
    { title: '工具绑定与 SN', path: '/scissors/list', description: '使用现有剪刀工具档案和 SN 码管理。' }
  ];
});
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
