<template>
  <el-card>
    <template #header>售后退款</template>
    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="订单号">
        <el-input v-model="query.orderNo" placeholder="请输入订单号" clearable />
      </el-form-item>
      <el-form-item label="退款状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 180px">
          <el-option label="待审核" value="pending_review" />
          <el-option label="已通过" value="approved" />
          <el-option label="处理中" value="processing" />
          <el-option label="已拒绝" value="rejected" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="申请ID" width="90" />
      <el-table-column label="订单号" min-width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleOpenDetail(row)">
            {{ row.order_no }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="requested_amount" label="退款金额" width="110" />
      <el-table-column label="退款状态" width="120">
        <template #default="{ row }">
          {{ getRefundStatusLabel(row.status) }}
        </template>
      </el-table-column>
      <el-table-column label="订单状态" width="120">
        <template #default="{ row }">
          {{ getOrderStatusLabel(row.order_status) }}
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="退款原因" min-width="180" />
      <el-table-column prop="admin_note" label="审核备注" min-width="180" />
      <el-table-column prop="created_at" label="申请时间" min-width="170" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="success"
            :disabled="row.status !== 'pending_review'"
            @click="handleApprove(row)"
          >
            审核通过
          </el-button>
          <el-button
            link
            type="danger"
            :disabled="row.status !== 'pending_review'"
            @click="handleReject(row)"
          >
            拒绝
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :current-page="query.page"
        :page-size="query.pageSize"
        @current-change="handlePageChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { fetchAdminRefunds, reviewAdminRefund, type RefundRow } from "../../api/admin";

const query = reactive({
  orderNo: "",
  status: "",
  page: 1,
  pageSize: 20
});

const rows = ref<RefundRow[]>([]);
const total = ref(0);
const loading = ref(false);
const router = useRouter();
const route = useRoute();

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

const loadRows = async () => {
  loading.value = true;
  try {
    const result = await fetchAdminRefunds(query);
    rows.value = result.list || [];
    total.value = Number(result.total || 0);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "退款数据读取失败");
  } finally {
    loading.value = false;
  }
};

const handleQuery = async () => {
  query.page = 1;
  await loadRows();
};

const handleReset = async () => {
  query.orderNo = "";
  query.status = "";
  query.page = 1;
  await loadRows();
};

const handlePageChange = async (page: number) => {
  query.page = page;
  await loadRows();
};

const handleOpenDetail = (row: RefundRow) => {
  router.push(`/refund/detail/${row.id}`);
};

const handleApprove = async (row: RefundRow) => {
  try {
    await ElMessageBox.confirm(`确认通过退款申请 #${row.id} 吗？`, "审核通过", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning"
    });
    await reviewAdminRefund({
      requestId: Number(row.id),
      decision: "approve"
    });
    ElMessage.success("已审核通过");
    await loadRows();
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(error instanceof Error ? error.message : "审核失败");
  }
};

const handleReject = async (row: RefundRow) => {
  try {
    const { value } = await ElMessageBox.prompt(`请填写拒绝原因（申请 #${row.id}）`, "拒绝退款", {
      confirmButtonText: "确认拒绝",
      cancelButtonText: "取消",
      inputPlaceholder: "可选，最多255字"
    });
    await reviewAdminRefund({
      requestId: Number(row.id),
      decision: "reject",
      adminNote: String(value || "").trim()
    });
    ElMessage.success("已拒绝该申请");
    await loadRows();
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(error instanceof Error ? error.message : "操作失败");
  }
};

onMounted(async () => {
  query.status = String(route.query.status || "").trim();
  query.page = 1;
  await loadRows();
});

watch(
  () => route.query.status,
  async (status) => {
    query.status = String(status || "").trim();
    query.page = 1;
    await loadRows();
  }
);
</script>

<style scoped>
.query-form {
  margin-bottom: 16px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
