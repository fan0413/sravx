<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>轮播图管理</span>
        <el-button type="primary" @click="openEditor()">新增轮播图</el-button>
      </div>
    </template>

    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="标题">
        <el-input v-model="query.keyword" placeholder="搜索标题" clearable />
      </el-form-item>
      <el-form-item label="位置">
        <el-select v-model="query.position" placeholder="全部" clearable style="width: 160px">
          <el-option label="首页 (home)" value="home" />
          <el-option label="分类页 (category)" value="category" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.is_active" placeholder="全部" clearable style="width: 140px">
          <el-option label="上线" :value="1" />
          <el-option label="下线" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="封面" width="100">
        <template #default="{ row }">
          <el-image :src="row.image" fit="cover" class="cover" lazy />
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="160" />
      <el-table-column prop="position" label="位置" width="100" />
      <el-table-column label="跳转" min-width="200">
        <template #default="{ row }">
          <span>{{ linkTypeLabel(row.link_type) }}</span>
          <span v-if="row.link_value" class="link-value">{{ row.link_value }}</span>
        </template>
      </el-table-column>
      <el-table-column label="排序" width="120">
        <template #default="{ row }">
          <el-input-number
            v-model="row.sort_order"
            :min="0"
            :max="9999"
            size="small"
            controls-position="right"
            style="width: 100px"
            @change="(val: number) => handleSortChange(row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_active === 1"
            @change="(val: boolean) => handleToggle(row, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="更新时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEditor(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
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

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑轮播图' : '新增轮播图'"
      width="680px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="轮播图展示标题" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="form.subtitle" placeholder="可选" maxlength="200" />
        </el-form-item>
        <el-form-item label="封面图" prop="image">
          <el-upload
            v-model:file-list="coverUploadFiles"
            list-type="picture-card"
            :auto-upload="false"
            :on-change="handleCoverChange"
            :on-remove="handleCoverRemove"
            :on-exceed="handleCoverExceed"
            accept="image/*"
            :limit="1"
            :multiple="false"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
          <div class="upload-tip">建议宽高比 16:9 或 2:1</div>
        </el-form-item>
        <el-form-item label="位置">
          <el-select v-model="form.position" placeholder="home" style="width: 220px">
            <el-option label="首页 (home)" value="home" />
            <el-option label="分类页 (category)" value="category" />
          </el-select>
        </el-form-item>
        <el-form-item label="跳转类型" prop="link_type">
          <el-radio-group v-model="form.link_type">
            <el-radio value="none">不跳转</el-radio>
            <el-radio value="product">商品</el-radio>
            <el-radio value="category">分类</el-radio>
            <el-radio value="web">外链</el-radio>
            <el-radio value="miniprogram">小程序页面</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="form.link_type !== 'none'"
          :label="linkValueLabel"
          prop="link_value"
        >
          <el-input v-model="form.link_value" :placeholder="linkValuePlaceholder" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" />
          <span class="hint">值越小越靠前</span>
        </el-form-item>
        <el-form-item label="是否上线">
          <el-switch v-model="isActiveSwitch" />
        </el-form-item>
        <el-form-item label="投放时间">
          <el-date-picker
            v-model="form.timeRange"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm:ss"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 420px"
          />
          <span class="hint">不填则长期有效</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules, UploadFile, UploadFiles, UploadRawFile, UploadUserFile } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import {
  deleteAdminBanner,
  fetchAdminBanners,
  resolveAdminFileUrls,
  saveAdminBanner,
  toggleAdminBanner,
  updateAdminBannerSort,
  uploadAdminImages
} from "../../api/admin";
import type { BannerRow } from "../../api/types";

type BannerDisplayRow = BannerRow & { raw_image?: string };
type StoredUploadUserFile = UploadUserFile & { storedUrl?: string };

const query = reactive({
  keyword: "",
  position: "",
  is_active: undefined as number | undefined,
  page: 1,
  pageSize: 50
});

const rows = ref<BannerDisplayRow[]>([]);
const total = ref(0);
const loading = ref(false);

const dialogVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const coverUploadFiles = ref<UploadUserFile[]>([]);

const form = reactive({
  id: 0,
  title: "",
  subtitle: "",
  image: "",
  link_type: "none" as BannerRow["link_type"],
  link_value: "",
  position: "home",
  sort_order: 0,
  is_active: 1,
  timeRange: null as [string, string] | null
});

const isActiveSwitch = computed({
  get: () => form.is_active === 1,
  set: (val: boolean) => {
    form.is_active = val ? 1 : 0;
  }
});

const linkValueLabel = computed(() => {
  if (form.link_type === "product") return "商品 ID";
  if (form.link_type === "category") return "分类 ID";
  if (form.link_type === "web") return "外链 URL";
  if (form.link_type === "miniprogram") return "小程序路径";
  return "跳转地址";
});

const linkValuePlaceholder = computed(() => {
  if (form.link_type === "product") return "例：16";
  if (form.link_type === "category") return "例：1";
  if (form.link_type === "web") return "https://...";
  if (form.link_type === "miniprogram") return "/pages/product/detail?id=16";
  return "";
});

const rules: FormRules = {
  title: [{ required: true, message: "请填写标题", trigger: "blur" }],
  image: [{ required: true, message: "请上传封面图", trigger: "change" }],
  link_type: [{ required: true, message: "请选择跳转类型", trigger: "change" }],
  link_value: [
    {
      validator: (_rule, _value, callback) => {
        if (form.link_type === "none") return callback();
        if (!String(form.link_value || "").trim()) return callback(new Error("请填写跳转目标"));
        callback();
      },
      trigger: "blur"
    }
  ]
};

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(String(value).replace(/\.\d+Z$/, ""));
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function linkTypeLabel(type: string): string {
  const map: Record<string, string> = {
    none: "不跳转",
    product: "商品",
    category: "分类",
    web: "外链",
    miniprogram: "小程序页面"
  };
  return map[type] || type;
}

async function loadRows() {
  try {
    loading.value = true;
    const result = await fetchAdminBanners(query);
    const list = result.list;
    if (list.length > 0) {
      const fileIDs = list
        .map((item) => item.image)
        .filter((src) => String(src || "").startsWith("cloud://"));
      if (fileIDs.length > 0) {
        const urlMap = await resolveAdminFileUrls(fileIDs);
        list.forEach((item) => {
          const rawImage = String(item.image || "");
          if (urlMap[rawImage]) {
            (item as BannerDisplayRow).raw_image = rawImage;
            item.image = urlMap[rawImage];
          }
        });
      }
    }
    rows.value = list as BannerDisplayRow[];
    total.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "轮播图加载失败");
  } finally {
    loading.value = false;
  }
}

async function handleQuery() {
  query.page = 1;
  await loadRows();
}

async function handleReset() {
  query.keyword = "";
  query.position = "";
  query.is_active = undefined;
  query.page = 1;
  await loadRows();
}

async function handlePageChange(page: number) {
  query.page = page;
  await loadRows();
}

async function handleToggle(row: BannerRow, active: boolean) {
  try {
    await toggleAdminBanner(row.id, active ? 1 : 0);
    row.is_active = active ? 1 : 0;
    ElMessage.success(active ? "已上线" : "已下线");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "状态更新失败");
  }
}

async function handleSortChange(row: BannerRow, sortOrder: number) {
  try {
    await updateAdminBannerSort(row.id, sortOrder);
    row.sort_order = sortOrder;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "排序更新失败");
  }
}

function openEditor(row?: BannerDisplayRow) {
  resetForm();
  if (row) {
    form.id = row.id;
    form.title = row.title;
    form.subtitle = row.subtitle || "";
    form.image = row.raw_image || row.image;
    form.link_type = row.link_type;
    form.link_value = row.link_value || "";
    form.position = row.position || "home";
    form.sort_order = Number(row.sort_order || 0);
    form.is_active = Number(row.is_active || 0);
    form.timeRange = row.start_time && row.end_time ? [row.start_time, row.end_time] : null;
    coverUploadFiles.value = row.image
      ? ([{ name: "cover", url: row.image, storedUrl: row.raw_image || row.image }] as StoredUploadUserFile[])
      : [];
  }
  dialogVisible.value = true;
}

function resetForm() {
  form.id = 0;
  form.title = "";
  form.subtitle = "";
  form.image = "";
  form.link_type = "none";
  form.link_value = "";
  form.position = "home";
  form.sort_order = 0;
  form.is_active = 1;
  form.timeRange = null;
  coverUploadFiles.value = [];
  formRef.value?.clearValidate();
}

function handleCoverChange(_file: UploadFile, files: UploadFiles) {
  coverUploadFiles.value = files as UploadUserFile[];
  const latest = files?.[files.length - 1] as UploadUserFile | undefined;
  if (latest?.url && !latest.raw) {
    form.image = latest.url;
  } else if (latest?.raw) {
    form.image = "__pending__";
  }
}

function handleCoverRemove() {
  coverUploadFiles.value = [];
  form.image = "";
}

function handleCoverExceed(files: UploadRawFile[]) {
  const latest = files[files.length - 1];
  if (!latest) return;
  latest.uid = latest.uid || Date.now();
  coverUploadFiles.value = [
    { name: latest.name, url: URL.createObjectURL(latest), raw: latest }
  ];
  form.image = "__pending__";
  ElMessage.warning("仅支持 1 张封面图，已替换为最新选择");
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  try {
    submitting.value = true;
    let image = form.image;
    const pendingFile = coverUploadFiles.value.find((file) => file.raw instanceof File);
    if (pendingFile && pendingFile.raw) {
      const bannerFolder = form.id
        ? `banners/${form.id}`
        : `banners/draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const uploaded = await uploadAdminImages([pendingFile.raw as unknown as File], bannerFolder);
      image = uploaded[0] || "";
      if (!image) throw new Error("封面图上传失败");
    } else {
      const storedUrl = String((coverUploadFiles.value[0] as StoredUploadUserFile | undefined)?.storedUrl || "").trim();
      if (storedUrl) image = storedUrl;
    }
    if (!image || image === "__pending__") throw new Error("请上传封面图");

    const payload = {
      id: form.id || undefined,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      image,
      link_type: form.link_type,
      link_value: form.link_value.trim() || undefined,
      position: form.position || "home",
      sort_order: form.sort_order,
      is_active: form.is_active,
      start_time: form.timeRange?.[0] || undefined,
      end_time: form.timeRange?.[1] || undefined
    };
    const result = await saveAdminBanner(payload);
    ElMessage.success(form.id ? "更新成功" : `新增成功，ID：${result.id}`);
    dialogVisible.value = false;
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: BannerRow) {
  try {
    await ElMessageBox.confirm(`确认删除轮播图「${row.title}」？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  try {
    await deleteAdminBanner(row.id);
    ElMessage.success("已删除");
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}

onMounted(async () => {
  await loadRows();
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.query-form {
  margin-bottom: 12px;
}
.cover {
  width: 72px;
  height: 42px;
  border-radius: 4px;
  object-fit: cover;
}
.link-value {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.upload-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
