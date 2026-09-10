<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>剪刀 SN 码管理</span>
        <div>
          <el-button @click="openBatches">批次一览</el-button>
          <el-button type="primary" @click="openGenerate">批量生成 SN</el-button>
        </div>
      </div>
    </template>

    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="SN">
        <el-input v-model="query.sn" placeholder="模糊搜索 SN" clearable style="width: 220px" />
      </el-form-item>
      <el-form-item label="批次号">
        <el-input v-model="query.batchNo" placeholder="精确匹配批次号" clearable style="width: 220px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="未使用" value="unused" />
          <el-option label="已绑定" value="bound" />
          <el-option label="已出库" value="sold" />
          <el-option label="已失效" value="expired" />
        </el-select>
      </el-form-item>
      <el-form-item label="所属商品">
        <el-select
          v-model="query.productId"
          placeholder="全部"
          clearable
          filterable
          style="width: 220px"
          @change="handleQueryProductChange"
        >
          <el-option
            v-for="item in productOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="规格">
        <el-select
          v-model="query.specId"
          placeholder="全部"
          clearable
          filterable
          :disabled="querySpecOptions.length === 0"
          style="width: 220px"
        >
          <el-option
            v-for="item in querySpecOptions"
            :key="item.id"
            :label="formatSpecLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table
      :data="rows"
      border
      v-loading="loading"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="48" :selectable="isUnused" />
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="sn" label="SN 码" min-width="220">
        <template #default="{ row }">
          <span class="sn-text">{{ row.sn }}</span>
          <el-button link type="primary" size="small" @click="copyText(row.sn)">复制</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="batch_no" label="批次号" min-width="180" />
      <el-table-column label="卡片图" width="96">
        <template #default="{ row }">
          <el-image
            v-if="row.image"
            :src="row.image"
            fit="cover"
            class="card-thumb"
            :preview-src-list="[row.image]"
            preview-teleported
          />
          <span v-else class="text-secondary">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="剪刀名称" min-width="160" />
      <el-table-column label="规格" min-width="180">
        <template #default="{ row }">
          <div class="spec-info">
            <span>{{ displaySpecName(row) }}</span>
            <span v-if="row.matched_sku || row.sku" class="spec-sku">{{ row.matched_sku || row.sku }}</span>
            <el-tag v-if="isUnlinkedMultiSpec(row)" size="small" type="warning" effect="plain">未关联规格</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="积分价值" width="110">
        <template #default="{ row }">
          <el-tag type="warning" effect="plain">+{{ row.points_value }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="warranty_months" label="保修(月)" width="100" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="绑定用户" min-width="180">
        <template #default="{ row }">
          <template v-if="row.bound_user_id">
            <div class="bound-info">
              <span class="bound-name">{{ row.bound_username || "-" }}</span>
              <span class="bound-phone">{{ row.bound_phone || "-" }}</span>
            </div>
          </template>
          <span v-else class="text-secondary">-</span>
        </template>
      </el-table-column>
      <el-table-column label="绑定时间" min-width="140">
        <template #default="{ row }">{{ formatDate(row.bound_at) || "-" }}</template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <div>
        <el-button
          size="small"
          type="danger"
          plain
          :disabled="selectedIds.length === 0"
          @click="handleDeleteSelected"
        >
          删除所选未使用 SN ({{ selectedIds.length }})
        </el-button>
      </div>
      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :current-page="query.page"
        :page-size="query.pageSize"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 批量生成对话框 -->
    <el-dialog
      v-model="generateVisible"
      title="批量生成 SN 码"
      width="640px"
      :close-on-click-modal="false"
      @closed="resetGenerate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="所属商品" prop="product_id">
          <el-select
            v-model="form.product_id"
            filterable
            placeholder="请选择要发放的剪刀商品"
            style="width: 100%"
            @change="handleGenerateProductChange"
          >
            <el-option
              v-for="item in productOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="所属规格">
          <el-select
            v-model="form.spec_id"
            filterable
            clearable
            placeholder="多规格商品必须选择"
            :disabled="generateSpecOptions.length === 0"
            style="width: 100%"
            @change="handleGenerateSpecChange"
          >
            <el-option
              v-for="item in generateSpecOptions"
              :key="item.id"
              :label="formatSpecLabel(item)"
              :value="item.id"
            />
          </el-select>
          <span class="hint">会写入 SN 的 spec_id / SKU / 规格名，用于用户端卡片精确匹配规格图</span>
        </el-form-item>
        <el-form-item label="卡片图覆盖">
          <el-input
            v-model="form.card_image"
            placeholder="可选，仅当本批 SN 需要独立卡片图时填写 URL 或 cloud://"
            maxlength="500"
          />
        </el-form-item>
        <el-form-item label="生成数量" prop="count">
          <el-input-number v-model="form.count" :min="1" :max="5000" :step="50" />
          <span class="hint">单次最多 5000 条</span>
        </el-form-item>
        <el-form-item label="积分价值" prop="points_value">
          <el-input-number v-model="form.points_value" :min="1" :max="1000000" :step="50" />
          <span class="hint">用户绑定成功后发放的积分</span>
        </el-form-item>
        <el-form-item label="保修月数" prop="warranty_months">
          <el-input-number v-model="form.warranty_months" :min="0" :max="120" :step="6" />
        </el-form-item>
        <el-form-item label="生产日期">
          <el-date-picker
            v-model="form.produce_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="默认使用今日"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="SN 长度" prop="sn_length">
          <el-input-number v-model="form.sn_length" :min="6" :max="16" :step="1" />
          <span class="hint">用于激光雕刻，推荐 8 位；6 位最精简，10+ 位更防猜</span>
        </el-form-item>
        <el-form-item label="SN 前缀">
          <el-input
            v-model="form.prefix"
            placeholder="可选，例如 YF / NF（最多 4 位，自动过滤 0 O 1 I L）"
            maxlength="4"
            style="width: 220px"
            @input="handlePrefixInput"
          />
          <span class="hint">前缀会占用 SN 长度，例如 YF + 长度 8 = "YF" + 6 位随机</span>
        </el-form-item>
        <el-form-item label="预览示例">
          <el-tag type="info" class="sn-preview">{{ snPreview }}</el-tag>
          <span class="hint">只用安全字母（去掉 0/O、1/I/L），更利于识别和雕刻</span>
        </el-form-item>
        <el-form-item label="型号(可选)">
          <el-input v-model="form.model" placeholder="如 6.0寸直剪" maxlength="50" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleGenerate">确认生成</el-button>
      </template>
    </el-dialog>

    <!-- 生成结果对话框 -->
    <el-dialog v-model="resultVisible" title="SN 码生成成功" width="640px">
      <div v-if="lastResult" class="result-box">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="批次号">{{ lastResult.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ lastResult.count }}</el-descriptions-item>
          <el-descriptions-item label="所属商品">{{ lastResult.productName }}</el-descriptions-item>
          <el-descriptions-item label="所属规格">{{ lastResult.specName || "-" }}</el-descriptions-item>
          <el-descriptions-item label="SKU">{{ lastResult.sku || "-" }}</el-descriptions-item>
          <el-descriptions-item label="积分价值">+{{ lastResult.pointsValue }}</el-descriptions-item>
          <el-descriptions-item label="保修月数">{{ lastResult.warrantyMonths }}</el-descriptions-item>
          <el-descriptions-item label="生产日期">{{ lastResult.produceDate }}</el-descriptions-item>
          <el-descriptions-item label="SN 长度">{{ lastResult.snLength }}</el-descriptions-item>
        </el-descriptions>
        <div class="sn-area">
          <div class="sn-area-head">
            <span>共 {{ lastResult.allSns.length }} 个 SN，可复制或下载</span>
            <el-space>
              <el-button size="small" @click="copyAllSns">复制全部</el-button>
              <el-button size="small" type="primary" @click="downloadSns">下载 CSV</el-button>
            </el-space>
          </div>
          <el-input
            type="textarea"
            :rows="10"
            readonly
            :model-value="lastResult.allSns.join('\n')"
          />
        </div>
      </div>
    </el-dialog>

    <!-- 批次一览抽屉 -->
    <el-drawer v-model="batchDrawerVisible" title="SN 批次列表" size="780px">
      <el-table :data="batches" border v-loading="batchesLoading" size="small">
        <el-table-column prop="batch_no" label="批次号" min-width="180" />
        <el-table-column prop="name" label="剪刀" min-width="160" />
        <el-table-column label="规格" min-width="160">
          <template #default="{ row }">
            <div class="spec-info">
              <span>{{ row.spec_name || "-" }}</span>
              <span v-if="row.sku" class="spec-sku">{{ row.sku }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="积分" width="90">
          <template #default="{ row }">+{{ row.points_value }}</template>
        </el-table-column>
        <el-table-column label="总量/未用/已绑定" width="160">
          <template #default="{ row }">
            {{ row.total_count }} /
            <span class="text-unused">{{ row.unused_count }}</span> /
            <span class="text-bound">{{ row.bound_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="生产日期" width="110">
          <template #default="{ row }">{{ formatDate(row.produce_date) || "-" }}</template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="150">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="filterByBatch(row.batch_no)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="SN 详情" size="560px">
      <div v-if="detail" class="detail-box">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="SN">{{ detail.scissors.sn }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ detail.scissors.batch_no }}</el-descriptions-item>
          <el-descriptions-item label="剪刀">{{ detail.scissors.name }}</el-descriptions-item>
          <el-descriptions-item label="卡片图">
            <el-image
              v-if="detail.scissors.image"
              :src="detail.scissors.image"
              fit="cover"
              class="detail-card-image"
              :preview-src-list="[detail.scissors.image]"
              preview-teleported
            />
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="规格">{{ displaySpecName(detail.scissors) }}</el-descriptions-item>
          <el-descriptions-item label="SKU">{{ detail.scissors.matched_sku || detail.scissors.sku || "-" }}</el-descriptions-item>
          <el-descriptions-item label="SN 卡片图覆盖">{{ detail.scissors.card_image || "-" }}</el-descriptions-item>
          <el-descriptions-item label="积分价值">+{{ detail.scissors.points_value }}</el-descriptions-item>
          <el-descriptions-item label="保修月数">{{ detail.scissors.warranty_months }}</el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="statusTagType(detail.scissors.status)">{{
              statusLabel(detail.scissors.status)
            }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            formatDateTime(detail.scissors.created_at)
          }}</el-descriptions-item>
        </el-descriptions>
        <el-divider content-position="left">绑定信息</el-divider>
        <template v-if="detail.binding">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="用户">{{
              detail.binding.username || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{
              detail.binding.phone || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="OpenID">{{
              detail.binding.openid || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="激活日期">{{
              formatDate(detail.binding.activation_date)
            }}</el-descriptions-item>
            <el-descriptions-item label="保修到期">{{
              formatDate(detail.binding.warranty_expire)
            }}</el-descriptions-item>
            <el-descriptions-item label="绑定来源">{{ detail.binding.source }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ detail.binding.remark || "-" }}</el-descriptions-item>
          </el-descriptions>
          <el-divider content-position="left">积分奖励</el-divider>
          <div v-if="detail.pointsLog">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="奖励积分">
                <el-tag type="warning">+{{ detail.pointsLog.points }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="发放后余额">{{ detail.pointsLog.balance }}</el-descriptions-item>
              <el-descriptions-item label="说明">{{
                detail.pointsLog.reason || "-"
              }}</el-descriptions-item>
              <el-descriptions-item label="发放时间">{{
                formatDateTime(detail.pointsLog.created_at)
              }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <el-alert v-else type="info" :closable="false">未匹配到积分发放流水</el-alert>
        </template>
        <el-alert v-else type="warning" title="该 SN 尚未绑定用户" :closable="false" />
      </div>
    </el-drawer>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import {
  batchGenerateScissors,
  deleteUnusedScissors,
  fetchAdminScissors,
  fetchAdminScissorsBatches,
  fetchAdminScissorsDetail,
  fetchAdminScissorsProducts,
  type BatchGenerateScissorsResult,
  type ScissorsBatchRow,
  type ScissorsDetailResult,
  type ScissorsProductOption,
  type ScissorsRow
} from "../../api/admin";

const query = reactive({
  sn: "",
  batchNo: "",
  status: "",
  productId: undefined as number | undefined,
  specId: undefined as number | undefined,
  page: 1,
  pageSize: 50
});

const rows = ref<ScissorsRow[]>([]);
const total = ref(0);
const loading = ref(false);
const selectedIds = ref<number[]>([]);

const productOptions = ref<ScissorsProductOption[]>([]);

const generateVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  product_id: undefined as number | undefined,
  spec_id: undefined as number | undefined,
  sku: "",
  spec_name: "",
  card_image: "",
  count: 100,
  points_value: 100,
  warranty_months: 24,
  produce_date: "",
  prefix: "",
  sn_length: 8,
  model: ""
});

type ProductSpecOption = NonNullable<ScissorsProductOption["specs"]>[number];

const selectedQueryProduct = computed(() =>
  productOptions.value.find((item) => item.id === query.productId)
);
const querySpecOptions = computed(() => selectedQueryProduct.value?.specs || []);
const selectedGenerateProduct = computed(() =>
  productOptions.value.find((item) => item.id === form.product_id)
);
const generateSpecOptions = computed(() => selectedGenerateProduct.value?.specs || []);

function formatSpecLabel(spec: ProductSpecOption): string {
  const sku = spec.sku ? ` / ${spec.sku}` : "";
  return `${spec.name}${sku}`;
}

function getGenerateSpec(specId?: number) {
  return generateSpecOptions.value.find((item) => item.id === specId);
}

function displaySpecName(row: ScissorsRow): string {
  return row.matched_spec_name || row.spec_name || (Number(row.spec_count || 0) > 1 ? "未关联规格" : "-");
}

function isUnlinkedMultiSpec(row: ScissorsRow): boolean {
  return Number(row.spec_count || 0) > 1 && !row.matched_spec_id;
}

function syncGenerateSpecSnapshot() {
  const spec = getGenerateSpec(form.spec_id);
  form.sku = String(spec?.sku || "");
  form.spec_name = String(spec?.name || "");
}

function handleGenerateProductChange() {
  form.spec_id = undefined;
  form.sku = "";
  form.spec_name = "";
  const specs = generateSpecOptions.value;
  if (specs.length === 1) {
    form.spec_id = specs[0].id;
    syncGenerateSpecSnapshot();
  }
}

function handleGenerateSpecChange() {
  syncGenerateSpecSnapshot();
}

function handleQueryProductChange() {
  query.specId = undefined;
}

const SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function sanitizePrefixInput(raw: string): string {
  const upper = raw.toUpperCase();
  let result = "";
  for (const ch of upper) {
    if (SAFE_ALPHABET.includes(ch)) {
      result += ch;
      if (result.length >= 4) break;
    }
  }
  return result;
}

function handlePrefixInput(value: string) {
  form.prefix = sanitizePrefixInput(value);
}

const snPreview = computed(() => {
  const prefix = form.prefix || "";
  const total = Math.max(6, Math.min(16, form.sn_length || 8));
  const minTail = 6;
  const actualLen = Math.max(total, prefix.length + minTail);
  const tailLen = actualLen - prefix.length;
  let tail = "";
  for (let i = 0; i < tailLen; i += 1) {
    tail += SAFE_ALPHABET[(Math.random() * SAFE_ALPHABET.length) | 0];
  }
  return `${prefix}${tail}`;
});

const rules: FormRules = {
  product_id: [{ required: true, message: "请选择所属商品", trigger: "change" }],
  count: [{ required: true, message: "请填写生成数量", trigger: "blur" }],
  points_value: [{ required: true, message: "请填写积分价值", trigger: "blur" }],
  sn_length: [{ required: true, message: "请填写 SN 长度", trigger: "blur" }],
  warranty_months: [{ required: true, message: "请填写保修月数", trigger: "blur" }]
};

const resultVisible = ref(false);
const lastResult = ref<BatchGenerateScissorsResult | null>(null);

const batchDrawerVisible = ref(false);
const batches = ref<ScissorsBatchRow[]>([]);
const batchesLoading = ref(false);

const detailVisible = ref(false);
const detail = ref<ScissorsDetailResult | null>(null);

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(String(value).replace(/\.\d+Z$/, ""));
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(String(value).replace(/\.\d+Z$/, ""));
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    unused: "未使用",
    bound: "已绑定",
    sold: "已出库",
    expired: "已失效"
  };
  return map[status] || status;
}

function statusTagType(status: string): "success" | "warning" | "info" | "danger" | "primary" {
  if (status === "unused") return "info";
  if (status === "bound") return "success";
  if (status === "sold") return "warning";
  return "danger";
}

function isUnused(row: ScissorsRow): boolean {
  return row.status === "unused";
}

function handleSelectionChange(rows: ScissorsRow[]) {
  selectedIds.value = rows.map((r) => r.id);
}

async function loadRows() {
  try {
    loading.value = true;
    const result = await fetchAdminScissors(query);
    rows.value = result.list;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "SN 列表加载失败");
  } finally {
    loading.value = false;
  }
}

async function loadProducts() {
  try {
    productOptions.value = await fetchAdminScissorsProducts();
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : "商品选项加载失败");
  }
}

async function handleQuery() {
  query.page = 1;
  await loadRows();
}

async function handleReset() {
  query.sn = "";
  query.batchNo = "";
  query.status = "";
  query.productId = undefined;
  query.specId = undefined;
  query.page = 1;
  await loadRows();
}

async function handlePageChange(page: number) {
  query.page = page;
  await loadRows();
}

function openGenerate() {
  generateVisible.value = true;
}

function resetGenerate() {
  form.product_id = undefined;
  form.spec_id = undefined;
  form.sku = "";
  form.spec_name = "";
  form.card_image = "";
  form.count = 100;
  form.points_value = 100;
  form.warranty_months = 24;
  form.produce_date = "";
  form.prefix = "";
  form.sn_length = 8;
  form.model = "";
  formRef.value?.clearValidate();
}

async function handleGenerate() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (generateSpecOptions.value.length > 1 && !form.spec_id) {
    ElMessage.warning("该商品有多个规格，请先选择本批 SN 对应的规格");
    return;
  }
  if (generateSpecOptions.value.length === 1 && !form.spec_id) {
    form.spec_id = generateSpecOptions.value[0].id;
    syncGenerateSpecSnapshot();
  }
  try {
    submitting.value = true;
    const result = await batchGenerateScissors({
      product_id: Number(form.product_id),
      spec_id: form.spec_id ? Number(form.spec_id) : undefined,
      sku: form.sku || undefined,
      spec_name: form.spec_name || undefined,
      card_image: form.card_image.trim() || undefined,
      count: Number(form.count),
      points_value: Number(form.points_value),
      sn_length: Number(form.sn_length),
      warranty_months: Number(form.warranty_months),
      produce_date: form.produce_date || undefined,
      prefix: form.prefix.trim() || undefined,
      model: form.model.trim() || undefined
    });
    lastResult.value = result;
    generateVisible.value = false;
    resultVisible.value = true;
    ElMessage.success(`批次 ${result.batchNo} 生成成功，共 ${result.count} 条`);
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "生成失败");
  } finally {
    submitting.value = false;
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(
    () => ElMessage.success("已复制"),
    () => ElMessage.warning("复制失败，请手动复制")
  );
}

function copyAllSns() {
  if (!lastResult.value) return;
  navigator.clipboard.writeText(lastResult.value.allSns.join("\n")).then(
    () => ElMessage.success(`已复制 ${lastResult.value?.allSns.length} 条 SN`),
    () => ElMessage.warning("复制失败，请手动复制")
  );
}

function downloadSns() {
  if (!lastResult.value) return;
  const header = "SN,Batch,Product,SpecId,SKU,SpecName,PointsValue,WarrantyMonths";
  const lines = lastResult.value.allSns.map(
    (sn) =>
      `${sn},${lastResult.value!.batchNo},${lastResult.value!.productName},${lastResult.value!.specId || ""},${lastResult.value!.sku || ""},${lastResult.value!.specName || ""},${lastResult.value!.pointsValue},${lastResult.value!.warrantyMonths}`
  );
  const csv = `${header}\n${lines.join("\n")}`;
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${lastResult.value.batchNo}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function openBatches() {
  batchDrawerVisible.value = true;
  try {
    batchesLoading.value = true;
    const result = await fetchAdminScissorsBatches(1, 50);
    batches.value = result.list;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "批次加载失败");
  } finally {
    batchesLoading.value = false;
  }
}

function filterByBatch(batchNo: string) {
  query.batchNo = batchNo;
  query.page = 1;
  batchDrawerVisible.value = false;
  loadRows();
}

async function viewDetail(row: ScissorsRow) {
  try {
    detail.value = await fetchAdminScissorsDetail({ id: row.id });
    detailVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "详情加载失败");
  }
}

async function handleDeleteSelected() {
  if (selectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `将删除 ${selectedIds.value.length} 条未使用的 SN，确认继续？`,
      "删除确认",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  try {
    const result = await deleteUnusedScissors([...selectedIds.value]);
    ElMessage.success(`已删除 ${result.deleted} / ${result.requested} 条`);
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}

onMounted(async () => {
  await Promise.all([loadRows(), loadProducts()]);
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
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}
.sn-text {
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-weight: 600;
  letter-spacing: 1px;
  margin-right: 6px;
}
.sn-preview {
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-size: 14px;
  letter-spacing: 2px;
  padding: 0 12px;
}
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.bound-info {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.bound-name {
  font-weight: 600;
}
.bound-phone {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.card-thumb {
  width: 58px;
  height: 58px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}
.detail-card-image {
  width: 160px;
  height: 90px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}
.spec-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.3;
}
.spec-sku {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-family: Consolas, Monaco, "Courier New", monospace;
}
.text-secondary {
  color: var(--el-text-color-placeholder);
}
.text-unused {
  color: var(--el-color-info);
}
.text-bound {
  color: var(--el-color-success);
}
.sn-area {
  margin-top: 16px;
}
.sn-area-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.detail-box :deep(.el-descriptions) {
  word-break: break-all;
}
</style>
