<template>
  <div class="refund-detail-page" v-loading="loading">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>退款详情</span>
          <el-button @click="goBack">返回</el-button>
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="退款申请ID">{{ refund?.id || "-" }}</el-descriptions-item>
        <el-descriptions-item label="退款状态">{{ getRefundStatusLabel(refund?.status) }}</el-descriptions-item>
        <el-descriptions-item label="订单号">{{ refund?.order_no || "-" }}</el-descriptions-item>
        <el-descriptions-item label="申请金额">{{ refund?.requested_amount || "-" }}</el-descriptions-item>
        <el-descriptions-item label="退款原因">{{ refund?.reason || "-" }}</el-descriptions-item>
        <el-descriptions-item label="审核备注">{{ refund?.admin_note || "-" }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="mt12">
      <template #header>用户信息</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="用户ID">{{ user?.id || "-" }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ user?.username || "-" }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ user?.phone || "-" }}</el-descriptions-item>
        <el-descriptions-item label="用户状态">{{ user?.status || "-" }}</el-descriptions-item>
        <el-descriptions-item v-if="!targetOperations" label="OpenID">{{ userOpenid }}</el-descriptions-item>
        <el-descriptions-item label="会员等级">{{ user?.member_level ?? "-" }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="mt12">
      <template #header>订单信息</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单ID">{{ order?.id || "-" }}</el-descriptions-item>
        <el-descriptions-item label="订单状态">{{ getOrderStatusLabel(order?.status) }}</el-descriptions-item>
        <el-descriptions-item label="订单总额">{{ order?.total_amount || "-" }}</el-descriptions-item>
        <el-descriptions-item label="实付金额">{{ order?.pay_amount || "-" }}</el-descriptions-item>
        <el-descriptions-item label="支付方式">{{ order?.pay_type || "-" }}</el-descriptions-item>
        <el-descriptions-item v-if="!targetOperations" label="交易单号">{{ order?.pay_transaction_id || "-" }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ order?.created_at || "-" }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ order?.updated_at || "-" }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="mt12">
      <template #header>收货信息</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="收货人">{{ address?.name || "-" }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ address?.phone || "-" }}</el-descriptions-item>
        <el-descriptions-item label="省市区">{{ fullRegion }}</el-descriptions-item>
        <el-descriptions-item label="详细地址">{{ address?.detail || "-" }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="mt12">
      <template #header>商品明细</template>
      <el-table :data="items" border>
        <el-table-column prop="id" label="明细ID" width="90" />
        <el-table-column prop="product_id" label="商品ID" width="90" />
        <el-table-column prop="product_name" label="商品名称" min-width="220" />
        <el-table-column prop="selected_color" label="规格/颜色" min-width="120" />
        <el-table-column prop="price" label="单价" width="110" />
        <el-table-column prop="quantity" label="数量" width="90" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { fetchAdminRefundDetail } from "../../api/admin";
import { targetAdminOperationsModeEnabled } from "../../lib/target-admin-auth";

type AnyRecord = Record<string, any>;

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const targetOperations = targetAdminOperationsModeEnabled();

const refund = ref<AnyRecord | null>(null);
const order = ref<AnyRecord | null>(null);
const user = ref<AnyRecord | null>(null);
const address = ref<AnyRecord | null>(null);
const items = ref<AnyRecord[]>([]);

const REFUND_STATUS_MAP: Record<string, string> = {
  pending_review: "待审核",
  approved: "已通过",
  processing: "处理中",
  rejected: "已拒绝"
};

const ORDER_STATUS_MAP: Record<string, string> = {
  pending_payment: "待付款",
  paid: "已支付",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款"
};

const getRefundStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return REFUND_STATUS_MAP[key] || key || "-";
};

const getOrderStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return ORDER_STATUS_MAP[key] || key || "-";
};

const userOpenid = computed(() => {
  return user.value?.openid || user.value?._openid || order.value?._openid || "-";
});

const fullRegion = computed(() => {
  const parts = [address.value?.province, address.value?.city, address.value?.district].filter(Boolean);
  return parts.length ? parts.join(" ") : "-";
});

const loadDetail = async () => {
  const requestId = Number(route.params.id);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    ElMessage.error("退款申请ID无效");
    return;
  }
  loading.value = true;
  try {
    const data = await fetchAdminRefundDetail(requestId);
    refund.value = data.refund;
    order.value = data.order;
    user.value = data.user;
    address.value = data.address;
    items.value = data.items || [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "获取退款详情失败");
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  router.push("/refund/list");
};

onMounted(async () => {
  await loadDetail();
});
</script>

<style scoped>
.refund-detail-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mt12 {
  margin-top: 0;
}
</style>
