<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>商品列表</span>
        <el-button type="primary" @click="$router.push('/product/create')">新建商品</el-button>
      </div>
    </template>

    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="商品名称">
        <el-input v-model="query.keyword" placeholder="请输入关键词" clearable />
      </el-form-item>
      <el-form-item label="商品分类">
        <el-select v-model="query.categoryId" placeholder="全部分类" clearable style="width: 180px">
          <el-option
            v-for="category in categories"
            :key="category.id"
            :label="category.name"
            :value="category.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="上架状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="上架" :value="1" />
          <el-option label="下架" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item label="SKU">
        <el-input v-model="query.sku" placeholder="SKU 模糊搜索" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="发货类型">
        <el-select v-model="query.shippingType" placeholder="全部" clearable style="width: 150px">
          <el-option label="普通现货" value="normal" />
          <el-option label="预售" value="presale" />
          <el-option label="定制" value="custom" />
          <el-option label="特殊延迟" value="delayed" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="图片" width="150" align="center" header-align="center">
        <template #default="{ row }">
          <el-image
            v-if="row.cover_image"
            :src="row.cover_image"
            fit="cover"
            class="cover"
          />
        </template>
      </el-table-column>
      <el-table-column label="商品名称" min-width="220">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="short_name" label="短名称" width="120" />
      <el-table-column label="商品分类" width="120">
        <template #default="{ row }">
          {{ getCategoryName(row.category_id) }}
        </template>
      </el-table-column>
      <el-table-column prop="price" label="售价" width="110" />
      <el-table-column prop="stock" label="库存" width="100" />
      <el-table-column prop="sales_count" label="销量" width="100" />
      <el-table-column label="发货" min-width="190">
        <template #default="{ row }">
          <template v-if="row.specs && row.specs.length > 0">
            <div v-for="spec in row.specs" :key="spec.sku || spec.name" class="spec-shipping-line">
              <el-tag :type="shippingTagType(spec.shipping_type)" size="small">
                {{ getShippingTypeLabel(spec.shipping_type) }}
              </el-tag>
              <span class="spec-name">{{ spec.name }}</span>
              <div class="shipping-promise">{{ getShippingPromise(spec) }}</div>
            </div>
          </template>
          <template v-else>
            <el-tag :type="shippingTagType(row.shipping_type)" size="small">
              {{ getShippingTypeLabel(row.shipping_type) }}
            </el-tag>
            <div class="shipping-promise">{{ getShippingPromise(row) }}</div>
          </template>
        </template>
      </el-table-column>
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
          <span v-else class="text-secondary">-</span>
        </template>
      </el-table-column>
      <el-table-column label="上架" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_on_sale ? 'success' : 'info'">
            {{ row.is_on_sale ? "是" : "否" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="推荐" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_recommend ? 'warning' : 'info'">
            {{ row.is_recommend ? "是" : "否" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" min-width="170" />
      <el-table-column label="操作" :width="targetMode ? 100 : 180" fixed="right" align="center" header-align="center">
        <template #default="{ row }">
          <template v-if="targetMode">
            <el-button link type="danger" @click="handleDelete(row)">删除商品</el-button>
          </template>
          <template v-else>
            <el-button link type="primary" @click="router.push(`/product/edit/${row.id}`)">编辑商品</el-button>
            <el-button link type="primary" @click="handleRestock(row)">设置库存</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除商品</el-button>
          </template>
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
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { deleteAdminProduct, fetchAdminProducts, fetchCategories, resolveAdminFileUrls, restockAdminProduct } from "../../api/admin";
import type { CategoryRow, ProductRow } from "../../api/admin";
import { targetAdminModeEnabled } from "../../lib/target-admin-auth";

const query = reactive({
  keyword: "",
  categoryId: undefined as number | undefined,
  status: undefined as number | undefined,
  lowStock: undefined as number | undefined,
  sku: "",
  shippingType: "",
  page: 1,
  pageSize: 50
});
const route = useRoute();
const router = useRouter();
const targetMode = targetAdminModeEnabled();

const rows = ref<ProductRow[]>([]);
const total = ref(0);
const loading = ref(false);
const categories = ref<CategoryRow[]>([]);
type ShippingSource = Pick<
  ProductRow,
  "shipping_type" | "ship_deadline_days" | "shipping_promise"
>;

const categoryNameMap = new Map<number, string>();

const getCategoryName = (categoryId: number) => {
  return categoryNameMap.get(categoryId) ?? `分类#${categoryId}`;
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
  const map: Record<string, "success" | "warning" | "info"> = {
    normal: "success",
    presale: "warning",
    custom: "warning",
    delayed: "info"
  };
  return map[String(type || "normal")] || "info";
};

const getShippingPromise = (row: ShippingSource) => {
  const promise = String(row.shipping_promise || "").trim();
  if (promise) return promise;
  const type = String(row.shipping_type || "normal");
  const days = Math.max(1, Number(row.ship_deadline_days || (type === "normal" ? 2 : 7)));
  if (type === "normal" && days <= 2) return "付款后48小时内发货";
  return `${getShippingTypeLabel(type)}，付款后${days}天内发货`;
};

const loadRows = async () => {
  loading.value = true;
  try {
    const result = await fetchAdminProducts(query);
    total.value = Number(result.total || 0);
    const list = result.list || [];
    const fileIds = list
      .map((item) => String(item.cover_image || "").trim())
      .filter((item) => item.startsWith("cloud://") || item.startsWith("catalog/"));
    const urlMap = await resolveAdminFileUrls(fileIds);
    rows.value = list.map((item) => {
      const cover = String(item.cover_image || "").trim();
      return {
        ...item,
        cover_image: cover.startsWith("cloud://") || cover.startsWith("catalog/") ? urlMap[cover] || cover : cover
      };
    });
  } finally {
    loading.value = false;
  }
};

const handleQuery = async () => {
  query.page = 1;
  await loadRows();
};

const handleReset = async () => {
  query.keyword = "";
  query.categoryId = undefined;
  query.status = undefined;
  query.lowStock = undefined;
  query.shippingType = "";
  query.page = 1;
  await loadRows();
};

const handlePageChange = async (page: number) => {
  query.page = page;
  await loadRows();
};

const handleRestock = async (row: ProductRow) => {
  try {
    const { value } = await ElMessageBox.prompt(`请输入目标库存值（商品：${row.name}）`, "设置库存", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputType: "number",
      inputValue: String(row.stock ?? 0),
      inputValidator: (val: string) => {
        const stock = Math.floor(Number(val));
        if (!Number.isFinite(stock) || stock < 0) return "请输入大于等于0的整数";
        return true;
      }
    });
    const stock = Math.floor(Number(value));
    if (!Number.isFinite(stock) || stock < 0) return;
    await restockAdminProduct(Number(row.id), stock);
    ElMessage.success("库存更新成功");
    await loadRows();
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(error instanceof Error ? error.message : "库存更新失败");
  }
};

const handleDelete = async (row: ProductRow) => {
  try {
    await ElMessageBox.confirm(`确认删除商品“${row.name}”吗？删除后不在前台展示。`, "删除商品", { type: "warning", confirmButtonText: "确认删除", cancelButtonText: "取消" });
    await deleteAdminProduct(Number(row.id));
    ElMessage.success("商品已删除");
    await loadRows();
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(error instanceof Error ? error.message : "商品删除失败");
  }
};

onMounted(async () => {
  try {
    query.lowStock = route.query.lowStock === "1" ? 1 : undefined;
    categories.value = await fetchCategories();
    categories.value.forEach((category) => categoryNameMap.set(category.id, category.name));
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? `商品数据读取失败：${error.message}` : "商品数据读取失败");
  }
});

watch(
  () => route.query.lowStock,
  async (value) => {
    const nextLowStock = value === "1" ? 1 : undefined;
    if (query.lowStock === nextLowStock) return;
    query.lowStock = nextLowStock;
    query.page = 1;
    await loadRows();
  }
);
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.query-form {
  margin-bottom: 16px;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cover {
  width: 96px;
  height: 96px;
  border-radius: 4px;
}

.sku-tag {
  margin: 2px;
}

.shipping-promise {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.4;
}

.spec-shipping-line {
  padding: 4px 0;
  border-bottom: 1px solid #f0f2f5;
}

.spec-shipping-line:last-child {
  border-bottom: none;
}

.spec-name {
  margin-left: 6px;
  color: #606266;
  font-size: 12px;
}

.text-secondary {
  color: #909399;
}

:deep(.el-table) {
  font-size: 15px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
