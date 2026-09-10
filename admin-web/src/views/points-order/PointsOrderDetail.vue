<template>
  <el-card>
    <template #header>积分订单详情</template>

    <el-descriptions v-if="detail" :column="2" border>
      <el-descriptions-item label="订单ID">{{ detail.order.id }}</el-descriptions-item>
      <el-descriptions-item label="订单号">{{ detail.order.order_no }}</el-descriptions-item>
      <el-descriptions-item label="用户ID">{{ detail.order.user_id }}</el-descriptions-item>
      <el-descriptions-item label="OpenID">{{ detail.order._openid }}</el-descriptions-item>
      <el-descriptions-item label="订单状态">
        <el-tag :type="statusTagType(detail.order.status)">{{ statusLabel(detail.order.status) }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="支付状态">{{ paymentStatusLabel(detail.order.payment_status) }}</el-descriptions-item>
      <el-descriptions-item label="商品快照">{{ detail.order.product_name_snapshot }}</el-descriptions-item>
      <el-descriptions-item label="规格">{{ detail.order.selected_spec_snapshot || "-" }}</el-descriptions-item>
      <el-descriptions-item label="数量">{{ detail.order.quantity }}</el-descriptions-item>
      <el-descriptions-item label="单位积分">{{ detail.order.unit_points }}</el-descriptions-item>
      <el-descriptions-item label="总积分">{{ detail.order.total_points }}</el-descriptions-item>
      <el-descriptions-item label="单位现金">￥{{ Number(detail.order.unit_cash || 0).toFixed(2) }}</el-descriptions-item>
      <el-descriptions-item label="总现金">￥{{ Number(detail.order.total_cash || 0).toFixed(2) }}</el-descriptions-item>
      <el-descriptions-item label="应付现金">￥{{ Number(detail.order.payable_cash || 0).toFixed(2) }}</el-descriptions-item>
      <el-descriptions-item label="支付渠道">{{ detail.order.payment_channel || "-" }}</el-descriptions-item>
      <el-descriptions-item label="交易流水号">{{ detail.order.pay_transaction_id || "-" }}</el-descriptions-item>
      <el-descriptions-item label="退款流水号">{{ detail.order.refund_transaction_id || "-" }}</el-descriptions-item>
      <el-descriptions-item label="收货人">{{ detail.order.receiver_name || "-" }}</el-descriptions-item>
      <el-descriptions-item label="手机号">{{ detail.order.receiver_phone || "-" }}</el-descriptions-item>
      <el-descriptions-item label="收货地址" :span="2">{{ detail.order.address_text || "-" }}</el-descriptions-item>
      <el-descriptions-item label="物流公司">{{ detail.order.logistics_company || "-" }}</el-descriptions-item>
      <el-descriptions-item label="快递单号">{{ detail.order.logistics_no || "-" }}</el-descriptions-item>
      <el-descriptions-item label="支付时间">{{ detail.order.pay_time || "-" }}</el-descriptions-item>
      <el-descriptions-item label="发货时间">{{ detail.order.ship_time || "-" }}</el-descriptions-item>
      <el-descriptions-item label="完成时间">{{ detail.order.completed_at || "-" }}</el-descriptions-item>
      <el-descriptions-item label="取消时间">{{ detail.order.cancelled_at || "-" }}</el-descriptions-item>
      <el-descriptions-item label="取消原因">{{ detail.order.cancel_reason || "-" }}</el-descriptions-item>
      <el-descriptions-item label="备注">{{ detail.order.remark || "-" }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ detail.order.created_at }}</el-descriptions-item>
      <el-descriptions-item label="更新时间">{{ detail.order.updated_at }}</el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="left">订单明细</el-divider>
    <el-table v-if="detail" :data="detail.items" border>
      <el-table-column prop="points_product_id" label="积分商品ID" width="120" />
      <el-table-column label="商品图" width="90">
        <template #default="{ row }">
          <el-image v-if="row.product_image" :src="row.product_image" style="width:56px;height:56px;border-radius:6px" />
        </template>
      </el-table-column>
      <el-table-column prop="product_name" label="商品名称" min-width="180" />
      <el-table-column label="规格" width="120">
        <template #default="{ row }">
          {{ row.spec_text || "-" }}
        </template>
      </el-table-column>
      <el-table-column label="SKU" width="140">
        <template #default="{ row }">
          <el-tag type="info" effect="plain">{{ row.sku || "-" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="points_price" label="积分" width="100" />
      <el-table-column prop="quantity" label="数量" width="80" />
    </el-table>

    <div class="action-row">
      <el-button @click="$router.back()">返回</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { fetchPointsOrderDetail, type PointsOrderDetail } from "@/api/admin";

const route = useRoute();
const orderId = computed(() => Number(route.params.id || 0));
const detail = ref<PointsOrderDetail>();

const STATUS_LABEL_MAP: Record<string, string> = {
  pending_payment: "待支付",
  pending_send: "待发送",
  paid: "已支付",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款"
};

const STATUS_TAG_MAP: Record<string, "info" | "primary" | "success" | "warning" | "danger"> = {
  pending_payment: "warning",
  pending_send: "info",
  paid: "primary",
  shipped: "warning",
  completed: "success",
  cancelled: "info",
  refunding: "warning",
  refunded: "danger"
};

const statusLabel = (status: string) => STATUS_LABEL_MAP[status] || status;
const statusTagType = (status: string) => STATUS_TAG_MAP[status] || "info";

const paymentStatusLabel = (ps: string) => {
  const map: Record<string, string> = { pending: "待支付", paid: "已支付", refunded: "已退款" };
  return map[ps] || ps || "-";
};

const loadDetail = async () => {
  try {
    detail.value = await fetchPointsOrderDetail(orderId.value);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "积分订单详情读取失败");
  }
};

onMounted(() => {
  loadDetail();
});
</script>

<style scoped>
.action-row {
  margin-top: 16px;
}
</style>
