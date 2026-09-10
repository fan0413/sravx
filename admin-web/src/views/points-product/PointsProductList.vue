<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>积分商品管理</span>
        <el-button type="primary" @click="$router.push('/points-product/create')">新建积分商品</el-button>
      </div>
    </template>

    <div class="toolbar">
      <el-input v-model="queryParams.keyword" placeholder="商品名称" clearable style="width: 200px" />
      <el-input v-model="queryParams.sku" placeholder="SKU 模糊搜索" clearable style="width: 180px" />
      <el-select v-model="queryParams.status" placeholder="状态" clearable style="width: 140px">
        <el-option label="上架中" :value="1" />
        <el-option label="已下架" :value="0" />
      </el-select>
      <el-button type="primary" @click="handleSearch">搜索</el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>

    <el-table :data="products" v-loading="loading">
      <el-table-column label="封面图" width="90">
        <template #default="{ row }">
          <el-image v-if="row.cover_image" :src="row.cover_image" style="width: 56px; height: 56px; border-radius: 6px" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="商品名称" min-width="220" />
      <el-table-column label="价格" min-width="180">
        <template #default="{ row }">
          {{ row.points_price }} 积分
          <span v-if="Number(row.cash_price) > 0"> + ￥{{ row.cash_price }}</span>
        </template>
      </el-table-column>
      <el-table-column label="库存" width="140">
        <template #default="{ row }">
          {{ row.stock_available }} / {{ row.stock_total }}
        </template>
      </el-table-column>
      <el-table-column prop="sales_count" label="销量" width="100" />
      <el-table-column label="SKU" min-width="200">
        <template #default="{ row }">
          <template v-if="row.specs && row.specs.length > 0">
            <el-tag
              v-for="spec in row.specs"
              :key="spec.sku"
              size="small"
              effect="plain"
              class="sku-tag"
            >
              {{ spec.sku }}
            </el-tag>
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.is_on_sale === 1 ? 'success' : 'info'">
            {{ row.is_on_sale === 1 ? "上架中" : "已下架" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" @click="handleToggleStatus(row)">
            {{ row.is_on_sale === 1 ? "下架" : "上架" }}
          </el-button>
          <el-button text type="primary" @click="$router.push(`/points-product/edit/${row.id}`)">
            编辑
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="empty-wrap">暂无积分商品</div>
      </template>
    </el-table>

    <div class="pager-wrap">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="queryParams.page"
        :page-size="queryParams.pageSize"
        :total="total"
        @current-change="handlePageChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import { fetchAdminPointsProducts, togglePointsProduct, type PointsProductRow, type PointsProductQuery } from "@/api/admin";

const queryParams = ref<PointsProductQuery>({
  keyword: "",
  status: undefined,
  page: 1,
  pageSize: 20
});

const products = ref<PointsProductRow[]>([]);
const total = ref(0);
const loading = ref(false);

const loadData = async () => {
  loading.value = true;
  try {
    const res = await fetchAdminPointsProducts(queryParams.value);
    products.value = res.list;
    total.value = res.total;
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : "加载积分商品列表失败");
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  queryParams.value.page = 1;
  loadData();
};

const handleReset = () => {
  queryParams.value = {
    keyword: "",
    status: undefined,
    page: 1,
    pageSize: 20
  };
  loadData();
};

const handlePageChange = (page: number) => {
  queryParams.value.page = page;
  loadData();
};

const handleToggleStatus = async (product: PointsProductRow) => {
  const action = product.is_on_sale === 1 ? "下架" : "上架";
  try {
    await ElMessageBox.confirm(`确定要${action}商品“${product.name}”吗？`, "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning"
    });
    const newStatus = product.is_on_sale === 1 ? 0 : 1;
    await togglePointsProduct(product.id, newStatus);
    product.is_on_sale = newStatus;
    ElMessage.success(`${action}成功`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("cancel")) return;
    ElMessage.error(error instanceof Error ? error.message : `${action}失败`);
  }
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.pager-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.empty-wrap {
  color: #909399;
  padding: 24px 0;
}
.sku-tag {
  margin: 2px;
}
</style>
