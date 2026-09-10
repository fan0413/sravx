<template>
  <el-card>
    <template #header>积分订单管理</template>
    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="订单号">
        <el-input v-model="query.orderNo" placeholder="请输入订单号" clearable />
      </el-form-item>
      <el-form-item label="订单状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="待支付" value="pending_payment" />
          <el-option label="待发送" value="pending_send" />
          <el-option label="已支付" value="paid" />
          <el-option label="已发货" value="shipped" />
          <el-option label="已完成" value="completed" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="退款中" value="refunding" />
          <el-option label="已退款" value="refunded" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="订单号" min-width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/points-order/detail/${row.id}`)">
            {{ row.order_no }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="user_id" label="用户ID" width="100" />
      <el-table-column label="商品" min-width="180">
        <template #default="{ row }">
          {{ row.product_name_snapshot || row.product_name || "-" }}
        </template>
      </el-table-column>
      <el-table-column label="规格" min-width="120">
        <template #default="{ row }">
          {{ row.selected_spec_snapshot || "-" }}
        </template>
      </el-table-column>
      <el-table-column label="积分" width="100">
        <template #default="{ row }">
          {{ row.total_points }}
        </template>
      </el-table-column>
      <el-table-column label="现金" width="100">
        <template #default="{ row }">
          ￥{{ Number(row.payable_cash || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="物流" min-width="170">
        <template #default="{ row }">
          <template v-if="row.logistics_company">
            {{ row.logistics_company }} / {{ row.logistics_no }}
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" min-width="170" />
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/points-order/detail/${row.id}`)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        @current-change="handlePageChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { fetchPointsOrders, type PointsOrderRow, type PointsOrderQuery } from "@/api/admin";

const query = reactive<PointsOrderQuery>({
  orderNo: "",
  status: "",
  page: 1,
  pageSize: 20
});

const rows = ref<PointsOrderRow[]>([]);
const total = ref(0);
const loading = ref(false);

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

const loadRows = async () => {
  loading.value = true;
  try {
    const res = await fetchPointsOrders(query);
    rows.value = res.list;
    total.value = res.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "积分订单数据读取失败");
  } finally {
    loading.value = false;
  }
};

const handleQuery = () => {
  query.page = 1;
  loadRows();
};

const handleReset = () => {
  query.orderNo = "";
  query.status = "";
  query.page = 1;
  loadRows();
};

const handlePageChange = (page: number) => {
  query.page = page;
  loadRows();
};

onMounted(() => {
  loadRows();
});
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
