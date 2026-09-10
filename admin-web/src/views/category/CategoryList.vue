<template>
  <div class="category-page">
    <div class="page-toolbar">
      <div>
        <h2>分类管理</h2>
        <p>维护商城前台展示的商品分类、排序和上下架状态</p>
      </div>
      <el-button type="primary" @click="openCreate">新增分类</el-button>
    </div>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="query" class="filter-form" @submit.prevent>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="分类名称 / 描述"
            @keyup.enter="loadCategories"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.is_show" class="status-select" placeholder="全部状态">
            <el-option label="全部" value="" />
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadCategories">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="rows" border v-loading="loading" row-key="id">
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column label="分类名称" min-width="180">
          <template #default="{ row }">
            <div class="name-cell">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.is_nav === 1" size="small" effect="plain">导航</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column prop="sort_order" label="排序" width="100" />
        <el-table-column prop="product_count" label="商品数" width="100" />
        <el-table-column label="显示状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === "active" ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link :type="row.is_show === 1 ? 'warning' : 'success'" @click="handleToggle(row)">
              {{ row.is_show === 1 ? "停用" : "启用" }}
            </el-button>
            <el-button link type="danger" :disabled="Boolean(row.product_count)" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        共 {{ total }} 个分类
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑分类' : '新增分类'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="form.name" maxlength="40" show-word-limit placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="分类描述">
          <el-input
            v-model="form.description"
            type="textarea"
            maxlength="200"
            show-word-limit
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请输入分类描述"
          />
        </el-form-item>
        <el-form-item label="图标地址">
          <el-input v-model="form.icon" placeholder="可选，用于前台小图标" />
        </el-form-item>
        <el-form-item label="图片地址">
          <el-input v-model="form.image" placeholder="可选，用于分类封面图" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="999999" controls-position="right" />
        </el-form-item>
        <el-form-item label="显示状态">
          <el-switch v-model="form.is_show" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="导航显示">
          <el-switch v-model="form.is_nav" :active-value="1" :inactive-value="0" active-text="显示" inactive-text="隐藏" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  toggleAdminCategory,
  updateAdminCategory,
  type CategoryInput,
  type CategoryQuery
} from "../../api/admin";
import type { CategoryRow } from "../../api/types";

const rows = ref<CategoryRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const total = ref(0);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const query = reactive<CategoryQuery>({
  keyword: "",
  is_show: ""
});

const form = reactive<CategoryInput>({
  name: "",
  description: "",
  icon: "",
  image: "",
  sort_order: 0,
  is_show: 1,
  is_nav: 0
});

const rules: FormRules<CategoryInput> = {
  name: [
    { required: true, message: "请输入分类名称", trigger: "blur" },
    { min: 1, max: 40, message: "分类名称不超过 40 个字符", trigger: "blur" }
  ]
};

function resetForm() {
  editingId.value = null;
  Object.assign(form, {
    id: undefined,
    parent_id: null,
    name: "",
    description: "",
    icon: "",
    image: "",
    sort_order: 0,
    is_show: 1,
    is_nav: 0
  });
  formRef.value?.clearValidate();
}

async function loadCategories() {
  loading.value = true;
  try {
    const result = await fetchAdminCategories(query);
    rows.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  query.keyword = "";
  query.is_show = "";
  loadCategories();
}

function openCreate() {
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: CategoryRow) {
  resetForm();
  editingId.value = row.id;
  Object.assign(form, {
    id: row.id,
    parent_id: row.parent_id ?? null,
    name: row.name,
    description: row.description || "",
    icon: row.icon || "",
    image: row.image || "",
    sort_order: row.sort_order || 0,
    is_show: row.is_show ?? (row.status === "active" ? 1 : 0),
    is_nav: row.is_nav || 0
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload: CategoryInput = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim(),
      icon: form.icon?.trim(),
      image: form.image?.trim()
    };
    if (editingId.value) {
      await updateAdminCategory({ ...payload, id: editingId.value });
      ElMessage.success("分类已更新");
    } else {
      await createAdminCategory(payload);
      ElMessage.success("分类已新增");
    }
    dialogVisible.value = false;
    await loadCategories();
  } finally {
    saving.value = false;
  }
}

async function handleToggle(row: CategoryRow) {
  const nextShow = row.is_show === 1 ? 0 : 1;
  await toggleAdminCategory(row.id, nextShow);
  ElMessage.success(nextShow === 1 ? "分类已启用" : "分类已停用");
  await loadCategories();
}

async function handleDelete(row: CategoryRow) {
  if (row.product_count) {
    ElMessage.warning("该分类下仍有商品，不能删除");
    return;
  }
  await ElMessageBox.confirm(`确认删除分类「${row.name}」？`, "删除确认", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消"
  });
  await deleteAdminCategory(row.id);
  ElMessage.success("分类已删除");
  await loadCategories();
}

onMounted(loadCategories);
</script>

<style scoped>
.category-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-toolbar h2 {
  margin: 0;
  color: #1f2937;
  font-size: 22px;
  font-weight: 600;
}

.page-toolbar p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.filter-card :deep(.el-card__body) {
  padding-bottom: 2px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
}

.status-select {
  width: 140px;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
  color: #6b7280;
  font-size: 14px;
}
</style>
