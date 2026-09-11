<template>
  <div class="dashboard" v-loading="loading">
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
      <el-col :span="6">
        <el-card>
          <el-statistic title="订单总数" :value="stats.orders.total" />
          <div class="card-tip">已完成：{{ stats.orders.fulfilled }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <el-statistic title="已支付订单" :value="stats.orders.paid" />
          <div class="card-tip">待付款：{{ stats.orders.pending }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" class="mt12">
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
      <el-col :span="8">
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
import { fetchOverview } from "../../api/admin";
import type { OverviewStats } from "../../api/types";
import { targetAdminModeEnabled } from "../../lib/target-admin-auth";

const router = useRouter();
const loading = ref(false);

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
  if (stats.refunds.pending > 0) {
    return `当前有 ${stats.refunds.pending} 笔退款待审核，建议优先处理。`;
  }
  if (stats.products.lowStock > 0) {
    return `有 ${stats.products.lowStock} 款商品库存低于 10，请尽快补货。`;
  }
  return targetAdminModeEnabled()
    ? "目录数据已来自目标数据库；交易、用户、优惠券和剪刀指标将在对应模块迁移并核验后接入。"
    : "一切运行正常，继续保持。所有业务数据实时来自 CloudBase 云端。";
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
    const overview = await fetchOverview();
    Object.assign(stats, overview);
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

.clickable-card {
  cursor: pointer;
}

.card-tip {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
