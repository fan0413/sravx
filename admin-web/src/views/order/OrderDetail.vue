<template>
  <el-card>
    <template #header>订单详情</template>

    <el-descriptions v-if="data" :column="2" border>
      <el-descriptions-item label="订单ID">{{ data.order.id }}</el-descriptions-item>
      <el-descriptions-item label="订单号">{{ data.order.order_no }}</el-descriptions-item>
      <el-descriptions-item label="用户ID">{{ data.order.user_id }}</el-descriptions-item>
      <el-descriptions-item label="用户名">{{ data.user?.username || "-" }}</el-descriptions-item>
      <el-descriptions-item label="会员等级">
        <el-tag v-if="data.user?.member_level" size="small" type="warning">LV{{ data.user.member_level }}</el-tag>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="订单状态">
        <el-tag :type="statusTagType(data.order.status)">{{ getOrderStatusLabel(data.order.status) }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="支付方式">{{ data.order.pay_type || "-" }}</el-descriptions-item>
      <el-descriptions-item label="支付流水号">{{ data.order.pay_transaction_id || "-" }}</el-descriptions-item>
      <el-descriptions-item label="商品总额">¥{{ toFixed(data.order.total_amount) }}</el-descriptions-item>
      <el-descriptions-item label="运费">¥{{ toFixed(data.order.freight) }}</el-descriptions-item>
      <el-descriptions-item label="优惠金额">-¥{{ toFixed(data.order.discount_amount) }}</el-descriptions-item>
      <el-descriptions-item label="优惠券">
        <template v-if="data.coupon">
          {{ data.coupon.name }}
          <span class="amount-minus">-¥{{ toFixed(data.order.coupon_amount) }}</span>
        </template>
        <template v-else-if="Number(data.order.coupon_amount) > 0">
          <span class="amount-minus">-¥{{ toFixed(data.order.coupon_amount) }}</span>
        </template>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="积分抵扣">
        <template v-if="Number(data.order.points_amount) > 0">
          {{ data.order.used_points }}积分
          <span class="amount-minus">-¥{{ toFixed(data.order.points_amount) }}</span>
        </template>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="实付金额">
        <strong class="amount-final">¥{{ toFixed(data.order.pay_amount) }}</strong>
      </el-descriptions-item>
      <el-descriptions-item label="收货人">{{ data.address?.name || "-" }}</el-descriptions-item>
      <el-descriptions-item label="手机号">{{ data.address?.phone || "-" }}</el-descriptions-item>
      <el-descriptions-item label="收货地址" :span="2">
        <template v-if="data.address">
          {{ data.address.province }}{{ data.address.city }}{{ data.address.district }} {{ data.address.detail }}
        </template>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="物流公司">{{ data.order.logistics_company || "-" }}</el-descriptions-item>
      <el-descriptions-item label="快递单号">
        {{ data.order.logistics_no || "-" }}
        <el-button
          v-if="!targetMode && isSfWaybill"
          link
          type="primary"
          size="small"
          style="margin-left: 8px"
          :loading="routeLoading"
          @click="handleQueryRoute"
        >
          查看物流
        </el-button>
        <el-button
          v-if="!targetMode && canCancelWaybill"
          link
          type="warning"
          size="small"
          :loading="waybillActionLoading === 'cancel'"
          @click="handleCancelWaybill"
        >
          取消运单
        </el-button>
        <el-button
          v-if="!targetMode && canInterceptWaybill"
          link
          type="danger"
          size="small"
          :loading="waybillActionLoading === 'intercept'"
          @click="handleInterceptWaybill"
        >
          拦截运单
        </el-button>
      </el-descriptions-item>
      <el-descriptions-item label="发货类型">
        <el-tag :type="shippingTagType(data.order.shipping_type)" size="small">
          {{ getShippingTypeLabel(data.order.shipping_type) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="发货承诺">{{ getShippingPromise(data.order) }}</el-descriptions-item>
      <el-descriptions-item label="预计发货">
        {{ data.order.expected_ship_time || "-" }}
        <el-tag v-if="isShippingOverdue" size="small" type="danger" style="margin-left: 8px">已超时</el-tag>
        <el-button
          v-if="!targetMode && canDelay"
          link
          type="warning"
          size="small"
          style="margin-left: 8px"
          @click="openDelayDialog"
        >
          调整
        </el-button>
      </el-descriptions-item>
      <el-descriptions-item label="延期原因">{{ data.order.delay_shipping_reason || "-" }}</el-descriptions-item>
      <el-descriptions-item v-if="data.order.delay_shipping_note" label="延期备注" :span="2">
        {{ data.order.delay_shipping_note }}
      </el-descriptions-item>
      <el-descriptions-item label="支付时间">{{ data.order.pay_time || "-" }}</el-descriptions-item>
      <el-descriptions-item label="发货时间">{{ data.order.ship_time || "-" }}</el-descriptions-item>
      <el-descriptions-item label="收货时间">{{ data.order.receive_time || "-" }}</el-descriptions-item>
      <el-descriptions-item label="完成时间">{{ data.order.complete_time || "-" }}</el-descriptions-item>
      <el-descriptions-item label="取消时间">{{ data.order.cancel_time || "-" }}</el-descriptions-item>
      <el-descriptions-item v-if="data.order.need_invoice" label="发票抬头">{{ data.order.invoice_title || "-" }}</el-descriptions-item>
      <el-descriptions-item v-if="data.order.buyer_message" label="买家留言">{{ data.order.buyer_message }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ data.order.created_at }}</el-descriptions-item>
      <el-descriptions-item label="更新时间">{{ data.order.updated_at }}</el-descriptions-item>
    </el-descriptions>

    <el-empty v-if="!data" description="暂无订单数据" class="empty" />

    <el-divider content-position="left">订单明细</el-divider>
    <el-table v-if="data" :data="data.items" border>
      <el-table-column prop="product_id" label="商品ID" width="100" />
      <el-table-column label="商品图" width="90">
        <template #default="{ row }">
          <el-image v-if="row.product_image" :src="row.product_image" style="width:56px;height:56px;border-radius:6px" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="product_name" label="商品名称" min-width="200" />
      <el-table-column label="规格" min-width="120">
        <template #default="{ row }">{{ row.spec_text || row.selected_spec || row.selected_color || "-" }}</template>
      </el-table-column>
      <el-table-column label="单价" width="100">
        <template #default="{ row }">¥{{ toFixed(row.price) }}</template>
      </el-table-column>
      <el-table-column prop="quantity" label="数量" width="80" />
      <el-table-column label="小计" width="120">
        <template #default="{ row }">
          ¥{{ toFixed(String(Number(row.price) * row.quantity)) }}
        </template>
      </el-table-column>
    </el-table>

    <div class="action-row">
      <el-button v-if="canManualShip" type="primary" @click="openManualShipDialog">填写物流并发货</el-button>
      <el-button @click="$router.back()">返回</el-button>
    </div>

    <el-dialog v-model="manualShipDialogVisible" title="手动发货" width="480px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="物流公司" required><el-input v-model="manualShipForm.logisticsCompany" maxlength="50" /></el-form-item>
        <el-form-item label="快递单号" required><el-input v-model="manualShipForm.logisticsNo" maxlength="100" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="manualShipDialogVisible = false">取消</el-button><el-button type="primary" :loading="manualShipSaving" @click="handleManualShip">确认发货</el-button></template>
    </el-dialog>

    <el-dialog v-model="routeDialogVisible" title="物流轨迹" width="600px" destroy-on-close>
      <el-timeline v-if="routeList.length > 0">
        <el-timeline-item
          v-for="(item, idx) in routeList"
          :key="idx"
          :timestamp="item.acceptTime"
          placement="top"
          :type="idx === 0 ? 'success' : 'primary'"
        >
          {{ item.remark || item.opCode }}
          <br />
          <small style="color: #909399">{{ item.acceptAddress }}</small>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无物流信息" />
    </el-dialog>

    <el-dialog v-model="delayDialogVisible" title="调整发货时间" width="520px" destroy-on-close>
      <el-form label-width="96px">
        <el-form-item label="订单号">
          <span>{{ data?.order.order_no || "-" }}</span>
        </el-form-item>
        <el-form-item label="预计发货" required>
          <el-date-picker
            v-model="delayForm.expected_ship_time"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            placeholder="选择预计发货时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="延期原因" required>
          <el-select v-model="delayForm.reason" placeholder="请选择" style="width: 100%">
            <el-option label="特殊商品延迟发货" value="特殊商品延迟发货" />
            <el-option label="预售备货" value="预售备货" />
            <el-option label="定制生产" value="定制生产" />
            <el-option label="用户约定延期" value="用户约定延期" />
            <el-option label="物流停运" value="物流停运" />
            <el-option label="不可抗力" value="不可抗力" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="delayForm.note"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="填写协商记录、报备说明或预计履约安排"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="delayDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="delaySaving" @click="handleDelaySave">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  delayOrderShipping,
  fetchOrderById,
  sfCancelWaybill,
  sfInterceptWaybill,
  sfRoute,
  shipOrders,
  type OrderDetailResult
} from "@/api/admin";
import { targetAdminOperationsModeEnabled } from "@/lib/target-admin-auth";

const route = useRoute();
const orderId = computed(() => String(route.params.id || ""));
const data = ref<OrderDetailResult>();
const targetMode = targetAdminOperationsModeEnabled();
let timer: number | undefined;

const toFixed = (v?: string | number) => Number(v || 0).toFixed(2);

const ORDER_STATUS_LABEL_MAP: Record<string, string> = {
  pending_payment: "待付款",
  paid: "已支付",
  shipped: "已发货",
  received: "已收货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款"
};

const getOrderStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return ORDER_STATUS_LABEL_MAP[key] || key || "-";
};

const statusTagType = (status?: string) => {
  const key = String(status || "").trim();
  const map: Record<string, string> = {
    pending_payment: "warning", paid: "primary", shipped: "warning",
    received: "warning", completed: "success", cancelled: "info",
    refunding: "warning", refunded: "danger"
  };
  return map[key] || "info";
};

const getShippingTypeLabel = (type?: string) => {
  const map: Record<string, string> = {
    normal: "普通现货",
    presale: "预售",
    custom: "定制",
    delayed: "特殊延迟"
  };
  return map[String(type || "normal")] || "普通现货";
};

const shippingTagType = (type?: string) => {
  const map: Record<string, string> = {
    normal: "success",
    presale: "warning",
    custom: "warning",
    delayed: "info"
  };
  return map[String(type || "normal")] || "info";
};

const getShippingPromise = (order: { shipping_type?: string; ship_deadline_days?: number; shipping_promise?: string | null }) => {
  const promise = String(order.shipping_promise || "").trim();
  if (promise) return promise;
  const type = String(order.shipping_type || "normal");
  const days = Math.max(1, Number(order.ship_deadline_days || (type === "normal" ? 2 : 7)));
  if (type === "normal" && days <= 2) return "付款后48小时内发货";
  return `${getShippingTypeLabel(type)}，付款后${days}天内发货`;
};

const parseDateTime = (value?: string | null) => {
  if (!value) return NaN;
  return Date.parse(String(value).replace(/-/g, "/"));
};

const isShippingOverdue = computed(() => {
  const order = data.value?.order;
  if (!order || order.status !== "paid" || !order.expected_ship_time) return false;
  const time = parseDateTime(order.expected_ship_time);
  return Number.isFinite(time) && time < Date.now();
});

const canDelay = computed(() => {
  if (targetMode) return false;
  const status = String(data.value?.order?.status || "");
  return ["pending_payment", "paid"].includes(status);
});

const canManualShip = computed(() => targetMode && data.value?.order.status === "paid");
const manualShipDialogVisible = ref(false);
const manualShipSaving = ref(false);
const manualShipForm = reactive({ logisticsCompany: "", logisticsNo: "" });

const openManualShipDialog = () => {
  manualShipForm.logisticsCompany = "";
  manualShipForm.logisticsNo = "";
  manualShipDialogVisible.value = true;
};

const handleManualShip = async () => {
  const order = data.value?.order;
  if (!order?.id || !manualShipForm.logisticsCompany.trim() || !manualShipForm.logisticsNo.trim()) {
    ElMessage.warning("请填写物流公司和快递单号");
    return;
  }
  manualShipSaving.value = true;
  try {
    await shipOrders([Number(order.id)], manualShipForm.logisticsCompany.trim(), manualShipForm.logisticsNo.trim());
    ElMessage.success("订单已发货");
    manualShipDialogVisible.value = false;
    await loadDetail();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "订单发货失败");
  } finally {
    manualShipSaving.value = false;
  }
};

const isSfWaybill = computed(() => {
  const company = String(data.value?.order?.logistics_company || "");
  return !!data.value?.order?.logistics_no && company.includes("顺丰");
});

const canCancelWaybill = computed(() => {
  return isSfWaybill.value && data.value?.order?.status === "shipped";
});

const canInterceptWaybill = computed(() => {
  const status = String(data.value?.order?.status || "");
  return isSfWaybill.value && ["shipped", "refunding"].includes(status);
});

const loadDetail = async () => {
  try {
    data.value = await fetchOrderById(orderId.value);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "订单详情读取失败");
  }
};

onMounted(async () => {
  await loadDetail();
  timer = window.setInterval(() => void loadDetail(), 900000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});

const routeDialogVisible = ref(false);
const routeLoading = ref(false);
const waybillActionLoading = ref<"" | "cancel" | "intercept">("");
const routeList = ref<Array<{ acceptTime: string; acceptAddress: string; remark: string; opCode: string }>>([]);

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatDateTime = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;
};

const delayDialogVisible = ref(false);
const delaySaving = ref(false);
const delayForm = reactive({
  expected_ship_time: "",
  reason: "特殊商品延迟发货",
  note: ""
});

const openDelayDialog = () => {
  const order = data.value?.order;
  if (!order) return;
  const fallbackDays = Math.max(1, Number(order.ship_deadline_days || 7));
  const fallbackDate = new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000);
  delayForm.expected_ship_time = order.expected_ship_time || formatDateTime(fallbackDate);
  delayForm.reason = order.delay_shipping_reason || "特殊商品延迟发货";
  delayForm.note = order.delay_shipping_note || "";
  delayDialogVisible.value = true;
};

const handleDelaySave = async () => {
  const order = data.value?.order;
  if (!order?.id) {
    ElMessage.warning("未找到订单");
    return;
  }
  if (!delayForm.expected_ship_time) {
    ElMessage.warning("请选择预计发货时间");
    return;
  }
  if (!delayForm.reason.trim()) {
    ElMessage.warning("请选择延期原因");
    return;
  }
  delaySaving.value = true;
  try {
    await delayOrderShipping({
      id: Number(order.id),
      expected_ship_time: delayForm.expected_ship_time,
      delay_shipping_reason: delayForm.reason.trim(),
      delay_shipping_note: delayForm.note.trim()
    });
    ElMessage.success("发货时间已更新");
    delayDialogVisible.value = false;
    await loadDetail();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "调整发货时间失败");
  } finally {
    delaySaving.value = false;
  }
};

const handleQueryRoute = async () => {
  routeLoading.value = true;
  try {
    const trackingNo = data.value?.order?.logistics_no || "";
    if (!trackingNo) { ElMessage.warning("未找到运单号"); routeLoading.value = false; return; }
    const result = await sfRoute(trackingNo);
    routeList.value = result.routes || [];
    routeDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "物流查询失败");
  } finally {
    routeLoading.value = false;
  }
};

const getWaybillPayload = () => {
  const order = data.value?.order;
  return {
    orderId: Number(order?.id || orderId.value),
    orderNo: String(order?.order_no || ""),
    waybillNo: String(order?.logistics_no || "")
  };
};

const handleCancelWaybill = async () => {
  const payload = getWaybillPayload();
  if (!payload.waybillNo) { ElMessage.warning("未找到运单号"); return; }
  try {
    await ElMessageBox.confirm(
      `确认取消顺丰运单 ${payload.waybillNo}？取消成功后订单会恢复为待发货。`,
      "取消运单",
      { confirmButtonText: "确认取消", cancelButtonText: "返回", type: "warning" }
    );
  } catch {
    return;
  }

  waybillActionLoading.value = "cancel";
  try {
    const result = await sfCancelWaybill(payload);
    ElMessage.success(result.restoredToPaid ? "运单已取消，订单已恢复为待发货" : "运单取消请求已提交");
    await loadDetail();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "运单取消失败");
  } finally {
    waybillActionLoading.value = "";
  }
};

const handleInterceptWaybill = async () => {
  const payload = getWaybillPayload();
  if (!payload.waybillNo) { ElMessage.warning("未找到运单号"); return; }
  try {
    await ElMessageBox.confirm(
      `确认向顺丰发起运单 ${payload.waybillNo} 的拦截请求？在途拦截结果以顺丰最终处理为准。`,
      "拦截运单",
      { confirmButtonText: "确认拦截", cancelButtonText: "返回", type: "warning" }
    );
  } catch {
    return;
  }

  waybillActionLoading.value = "intercept";
  try {
    const result = await sfInterceptWaybill(payload);
    ElMessage.success(result.message || "运单拦截请求已提交");
    await loadDetail();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "运单拦截失败");
  } finally {
    waybillActionLoading.value = "";
  }
};
</script>

<style scoped>
.empty { margin-top: 16px; }
.action-row { margin-top: 16px; }
.amount-minus { color: #67c23a; }
.amount-final { color: #e6a23c; font-size: 15px; }
</style>
