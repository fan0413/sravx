<template>
  <div class="dashboard" v-loading="loading">
    <section class="catalog-hero">
      <div>
        <p class="eyebrow">SRAVX PRODUCT CATALOG</p>
        <h1>首页目录</h1>
        <p class="hero-copy">这里的分类卡片对应用户端首页入口。调整显示状态、排序和封面后，用户端将按目录配置读取内容。</p>
      </div>
      <el-button type="primary" @click="router.push('/category/list')">管理分类</el-button>
    </section>

    <section class="catalog-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">FRONT STORE</p>
          <h2>用户端分类预览</h2>
        </div>
        <span>{{ visibleCategories.length }} 个展示分类</span>
      </div>
      <div v-if="visibleCategories.length" class="category-preview-grid">
        <button v-for="category in visibleCategories" :key="category.id" class="category-preview-card" type="button" @click="router.push('/category/list')">
          <div class="category-preview-image" :class="{ 'has-image': category.image }">
            <img v-if="category.image" :src="category.image" :alt="category.name" />
            <span v-else>{{ category.name.slice(0, 1) }}</span>
          </div>
          <div class="category-preview-copy">
            <small>分类 · {{ category.sort_order || 0 }}</small>
            <strong>{{ category.name }}</strong>
            <p>{{ category.description || '请补充分类说明，帮助用户理解入口用途。' }}</p>
          </div>
          <span class="category-arrow">›</span>
        </button>
      </div>
      <el-empty v-else description="暂未配置用户端展示分类">
        <el-button type="primary" @click="router.push('/category/list')">创建第一个分类</el-button>
      </el-empty>
    </section>

    <el-row :gutter="12">
      <el-col :span="6">
        <el-card>
          <el-statistic title="活跃用户" :value="stats.users.active" />
          <div class="card-tip">总注册：{{ stats.users.total }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <el-statistic title="在售商品" :value="stats.products.onSale" />
          <div class="card-tip">商品总数：{{ stats.products.total }}</div>
        </el-card>
      </el-col>
      <el-col v-if="targetMode" :span="6">
        <el-card>
          <el-statistic title="新建剪刀 SN" :value="stats.scissors.total" />
          <div class="card-tip">未使用：{{ stats.scissors.unused }}</div>
        </el-card>
      </el-col>
      <el-col v-if="!targetMode" :span="6">
        <el-card>
          <el-statistic title="订单总数" :value="stats.orders.total" />
          <div class="card-tip">已完成：{{ stats.orders.fulfilled }}</div>
        </el-card>
      </el-col>
      <el-col v-if="!targetMode" :span="6">
        <el-card>
          <el-statistic title="已支付订单" :value="stats.orders.paid" />
          <div class="card-tip">待付款：{{ stats.orders.pending }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="!targetMode" :gutter="12" class="mt12">
      <el-col :span="8">
        <el-card>
          <el-statistic title="累计 GMV (元)" :value="stats.gmv.total" :precision="2" />
          <div class="card-tip">近 7 日：¥{{ stats.gmv.week.toFixed(2) }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <el-statistic title="剪刀 SN" :value="stats.scissors.total" />
          <div class="card-tip">
            未绑定 {{ stats.scissors.unused }} / 已绑定 {{ stats.scissors.bound }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <el-statistic title="生效优惠券" :value="stats.coupons.active" />
          <div class="card-tip">在线轮播图：{{ stats.banners.online }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" class="mt12">
      <el-col :span="8">
        <el-card class="clickable-card" @click="goLowStockProducts">
          <el-statistic title="库存警报（<10）" :value="stats.products.lowStock" />
          <div class="card-tip">点击查看低库存商品</div>
        </el-card>
      </el-col>
      <el-col v-if="!targetMode" :span="8">
        <el-card class="clickable-card" @click="goPendingRefunds">
          <el-statistic title="退款待审核" :value="stats.refunds.pending" />
          <div class="card-tip">仅统计未审批（待审核）退款单</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="clickable-card" @click="goBanners">
          <el-statistic title="轮播图" :value="stats.banners.online" />
          <div class="card-tip">上线中的首页轮播</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="mt12">
      <template #header>运营建议</template>
      <el-alert
        :title="alertText"
        :type="alertType"
        :closable="false"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { fetchAdminCategories, fetchOverview } from "../../api/admin";
import type { CategoryRow, OverviewStats } from "../../api/types";
import { targetAdminCatalogModeEnabled } from "../../lib/target-admin-auth";

const router = useRouter();
const loading = ref(false);
const targetMode = targetAdminCatalogModeEnabled();
const categories = ref<CategoryRow[]>([]);
const visibleCategories = computed(() => categories.value.filter((item) => item.is_show === 1).sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)).slice(0, 6));

const stats = reactive<OverviewStats>({
  users: { total: 0, active: 0 },
  products: { total: 0, onSale: 0, lowStock: 0 },
  orders: { total: 0, paid: 0, pending: 0, fulfilled: 0 },
  gmv: { total: 0, week: 0 },
  refunds: { pending: 0 },
  coupons: { active: 0 },
  scissors: { total: 0, unused: 0, bound: 0 },
  banners: { online: 0 }
});

const alertText = computed(() => {
  if (targetMode) {
    if (stats.products.lowStock > 0) return `有 ${stats.products.lowStock} 款目标商品库存低于 10，请尽快补货。`;
    return "当前看板展示目标库中的用户基础资料、目录和新建剪刀编号；交易、积分、优惠券及历史工具数据尚未迁移。";
  }
  if (stats.refunds.pending > 0) {
    return `当前有 ${stats.refunds.pending} 笔退款待审核，建议优先处理。`;
  }
  if (stats.products.lowStock > 0) {
    return `有 ${stats.products.lowStock} 款商品库存低于 10，请尽快补货。`;
  }
  return "目录模块可在试运行配置下使用目标数据库；交易、用户、优惠券和剪刀数据仍来自 CloudBase 云端。";
});

const alertType = computed<"success" | "warning">(() =>
  stats.refunds.pending > 0 || stats.products.lowStock > 0 ? "warning" : "success"
);

const goLowStockProducts = () => {
  router.push({ path: "/product/list", query: { lowStock: "1" } });
};
const goPendingRefunds = () => {
  router.push({ path: "/refund/list", query: { status: "pending_review" } });
};
const goBanners = () => router.push("/banner/list");

onMounted(async () => {
  try {
    loading.value = true;
    const [overview, categoryResult] = await Promise.all([fetchOverview(), fetchAdminCategories({ is_show: 1 })]);
    Object.assign(stats, overview);
    categories.value = categoryResult.list;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "看板数据加载失败");
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.mt12 {
  margin-top: 12px;
}

.catalog-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 26px;
  padding: 30px 32px;
  border: 1px solid var(--sravx-line);
  border-radius: 24px;
  background: linear-gradient(135deg, #fff 0%, #faf6f2 100%);
}

.eyebrow { margin: 0 0 8px; color: var(--sravx-accent); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.catalog-hero h1, .catalog-section h2 { margin: 0; color: var(--sravx-ink); letter-spacing: -.035em; }
.catalog-hero h1 { font-size: 32px; }
.hero-copy { max-width: 680px; margin: 10px 0 0; color: var(--sravx-muted); font-size: 14px; line-height: 1.6; }
.catalog-section { margin-bottom: 26px; padding: 26px; border-radius: 24px; background: #fff; box-shadow: 0 8px 28px rgba(29,29,31,.05); }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.section-heading span { color: var(--sravx-muted); font-size: 13px; }
.category-preview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.category-preview-card { position: relative; min-height: 190px; overflow: hidden; padding: 0; border: 1px solid var(--sravx-line); border-radius: 18px; background: #fff; text-align: left; cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
.category-preview-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(29,29,31,.09); }
.category-preview-image { height: 92px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f7eee8, #eee5dc); color: var(--sravx-accent); font-size: 34px; font-weight: 700; }
.category-preview-image img { width: 100%; height: 100%; object-fit: cover; }
.category-preview-copy { padding: 14px 34px 16px 16px; }
.category-preview-copy small { display: block; color: var(--sravx-accent); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.category-preview-copy strong { display: block; margin-top: 6px; color: var(--sravx-ink); font-size: 17px; }
.category-preview-copy p { display: -webkit-box; margin: 7px 0 0; overflow: hidden; color: var(--sravx-muted); font-size: 12px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.category-arrow { position: absolute; right: 15px; bottom: 15px; color: var(--sravx-accent); font-size: 24px; line-height: 1; }

@media (max-width: 980px) { .category-preview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .catalog-hero { display: block; padding: 24px; } .catalog-hero .el-button { margin-top: 18px; } .category-preview-grid { grid-template-columns: 1fr; } }

.clickable-card {
  cursor: pointer;
}

.card-tip {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
