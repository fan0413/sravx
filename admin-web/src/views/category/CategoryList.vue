<template>
  <div class="category-page">
    <div class="page-toolbar">
      <div>
        <p class="page-eyebrow">FRONT STORE STRUCTURE</p>
        <h2>分类与首页入口</h2>
        <p>分类名称、封面、展示状态和排序会决定用户端首页看到的目录入口。</p>
      </div>
      <el-button type="primary" @click="openCreate">新增分类</el-button>
    </div>

    <section v-if="rows.length" class="storefront-preview">
      <div class="preview-heading"><div><p class="page-eyebrow">USER EXPERIENCE</p><h3>用户端分类预览</h3></div><span>拖动排序功能将随后接入；当前按排序值展示</span></div>
      <div class="storefront-grid">
        <article v-for="row in sortedRows" :key="row.id" class="storefront-card" :class="{ disabled: row.is_show !== 1 }" @click="openEdit(row)">
          <div class="storefront-image"><img v-if="row.image" :src="row.image" :alt="row.name" /><span v-else>{{ row.name.slice(0, 1) }}</span></div>
          <div class="storefront-copy"><small>排序 {{ row.sort_order || 0 }} · {{ row.is_show === 1 ? '用户可见' : '已隐藏' }}</small><strong>{{ row.name }}</strong><p>{{ row.description || '未填写分类说明' }}</p></div>
          <span class="storefront-action">编辑 ›</span>
        </article>
      </div>
    </section>

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
        <el-table-column label="所属系列" width="140">
          <template #default="{ row }">{{ row.parent_id ? hierarchyRows.find(item => item.id === row.parent_id)?.name || '父级缺失' : '顶级系列' }}</template>
        </el-table-column>
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
        <el-form-item label="所属系列">
          <el-select v-model="form.parent_id" placeholder="顶级系列" clearable>
            <el-option v-for="row in parentOptions" :key="row.id" :label="row.name" :value="row.id" />
          </el-select>
        </el-form-item>
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
        <el-form-item v-if="targetMode" label="分类图标">
          <el-upload :show-file-list="false" :auto-upload="false" accept="image/jpeg,image/png,image/webp" :on-change="handleIconChange">
            <el-button>上传图标</el-button>
          </el-upload>
          <el-button v-if="form.icon" link type="danger" @click="form.icon = ''">移除</el-button>
        </el-form-item>
        <el-form-item v-else label="图标地址">
          <el-input v-model="form.icon" placeholder="可选，用于前台小图标" />
        </el-form-item>
        <el-form-item v-if="targetMode" label="分类图片">
          <el-upload :show-file-list="false" :auto-upload="false" accept="image/jpeg,image/png,image/webp" :on-change="handleImageChange">
            <el-button>上传图片</el-button>
          </el-upload>
          <el-button v-if="form.image" link type="danger" @click="form.image = ''">移除</el-button>
        </el-form-item>
        <el-form-item v-else label="图片地址">
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
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadFile } from "element-plus";
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  toggleAdminCategory,
  updateAdminCategory,
  uploadAdminImages,
  type CategoryInput,
  type CategoryQuery
} from "../../api/admin";
import type { CategoryRow } from "../../api/types";
import { targetAdminCatalogModeEnabled } from "../../lib/target-admin-auth";
import { seriesKey } from "../../../../sravx/common/product-classification.mjs";

const rows = ref<CategoryRow[]>([]);
const hierarchyRows = ref<CategoryRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const total = ref(0);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const targetMode = targetAdminCatalogModeEnabled();
const sortedRows = computed(() => [...rows.value].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)));
const parentOptions = computed(() => hierarchyRows.value.filter(row => !row.parent_id && row.id !== editingId.value && Boolean(seriesKey(row.name))));

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
    hierarchyRows.value = query.keyword || query.is_show !== "" ? (await fetchAdminCategories()).list : result.list;
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

async function uploadCategoryMedia(field: "icon" | "image", file: UploadFile) {
  if (!file.raw) return;
  try {
    saving.value = true;
    const [uploaded] = await uploadAdminImages([file.raw as unknown as File], "categories");
    if (!uploaded) throw new Error("图片上传失败");
    form[field] = uploaded;
    ElMessage.success("图片已上传，保存分类后生效");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "图片上传失败");
  } finally {
    saving.value = false;
  }
}

function handleIconChange(file: UploadFile) {
  return uploadCategoryMedia("icon", file);
}

function handleImageChange(file: UploadFile) {
  return uploadCategoryMedia("image", file);
}

async function handleSubmit() {
  await formRef.value?.validate();
  const parent = parentOptions.value.find(row => row.id === form.parent_id);
  if (form.parent_id && !parent) { ElMessage.warning("请选择有效的顶级系列，不能关联自身或子分类"); return; }
  if (form.parent_id && seriesKey(form.name)) { ElMessage.warning("系列应为顶级分类，不能放在另一个系列下"); return; }
  if (!form.parent_id && !seriesKey(form.name)) { ElMessage.warning("顶级分类请选择 Basic、Pro、Master 或配件；工具分类请先选择所属系列"); return; }
  saving.value = true;
  try {
    const payload: CategoryInput = {
      ...form,
      parent_id: parent?.id ?? null,
      level: parent ? 2 : 1,
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
  if (hierarchyRows.value.some(item => item.parent_id === row.id)) { ElMessage.warning("该系列仍有细分类，不能删除"); return; }
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

.page-eyebrow { margin: 0 0 7px; color: var(--sravx-accent); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.storefront-preview { padding: 24px; border-radius: 22px; background: #fff; box-shadow: 0 8px 28px rgba(29,29,31,.05); }
.preview-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.preview-heading h3 { margin: 0; color: var(--sravx-ink); font-size: 18px; letter-spacing: -.02em; }
.preview-heading > span { color: var(--sravx-muted); font-size: 12px; }
.storefront-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.storefront-card { position: relative; overflow: hidden; min-height: 198px; border: 1px solid var(--sravx-line); border-radius: 18px; background: #fff; cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
.storefront-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(29,29,31,.09); }
.storefront-card.disabled { opacity: .58; }
.storefront-image { height: 92px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f7eee8, #eee5dc); color: var(--sravx-accent); font-size: 34px; font-weight: 700; }
.storefront-image img { width: 100%; height: 100%; object-fit: cover; }
.storefront-copy { padding: 14px 16px; }
.storefront-copy small { color: var(--sravx-accent); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.storefront-copy strong { display: block; margin-top: 6px; color: var(--sravx-ink); font-size: 16px; }
.storefront-copy p { display: -webkit-box; margin: 6px 0 0; overflow: hidden; color: var(--sravx-muted); font-size: 12px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.storefront-action { position: absolute; right: 14px; bottom: 13px; color: var(--sravx-accent); font-size: 12px; font-weight: 650; }

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

@media (max-width: 900px) { .storefront-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .storefront-grid { grid-template-columns: 1fr; } .preview-heading { align-items: flex-start; flex-direction: column; } }
</style>
