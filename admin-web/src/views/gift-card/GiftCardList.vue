<template>
  <div class="gift-card-page">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="礼品卡管理" name="cards">
        <el-card>
          <template #header>
            <div class="header-row">
              <span>礼品卡列表</span>
              <div class="header-actions">
                <el-button type="primary" @click="openCreate">创建礼品卡</el-button>
                <el-button @click="openImport">批量导入</el-button>
              </div>
            </div>
          </template>

          <el-form :inline="true" :model="query" class="query-form">
            <el-form-item label="关键词">
              <el-input v-model="query.keyword" clearable placeholder="兑换码 / 标题" style="width: 180px" />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable placeholder="全部" style="width: 130px">
                <el-option label="未兑换" value="unused" />
                <el-option label="已兑换" value="redeemed" />
                <el-option label="已禁用" value="disabled" />
                <el-option label="已过期" value="expired" />
              </el-select>
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="query.giftType" clearable placeholder="全部" style="width: 130px">
                <el-option label="积分" value="points" />
                <el-option label="优惠券" value="coupon" />
                <el-option label="商品" value="product" />
                <el-option label="组合" value="combo" />
              </el-select>
            </el-form-item>
            <el-form-item label="批次">
              <el-input v-model="query.batchNo" clearable placeholder="batch_no" style="width: 160px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadCards">查询</el-button>
              <el-button @click="resetCards">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="cards" border v-loading="loading">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="code" label="兑换码" min-width="150" />
            <el-table-column prop="title" label="标题" min-width="170" show-overflow-tooltip />
            <el-table-column label="权益" min-width="240">
              <template #default="{ row }">
                <div class="benefit-summary">{{ giftSummary(row.gift_type, row.gift_payload) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="batch_no" label="批次" width="130" show-overflow-tooltip />
            <el-table-column label="过期时间" min-width="220">
              <template #default="{ row }">
                <div class="expire-cell">
                  <el-date-picker
                    v-model="row.expire_time"
                    type="datetime"
                    value-format="YYYY-MM-DD HH:mm:ss"
                    placeholder="不限"
                    clearable
                    size="small"
                  />
                  <el-button link type="primary" @click="saveExpire(row)">保存</el-button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="兑换人" min-width="150">
              <template #default="{ row }">
                <span v-if="row.redeemed_phone">{{ row.redeemed_phone }}</span>
                <span v-else class="text-secondary">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" min-width="170" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'unused'"
                  link
                  type="warning"
                  @click="toggleCard(row, 'disabled')"
                >
                  禁用
                </el-button>
                <el-button
                  v-if="row.status === 'disabled'"
                  link
                  type="success"
                  @click="toggleCard(row, 'unused')"
                >
                  启用
                </el-button>
                <span v-if="row.status === 'redeemed'" class="text-secondary">已锁定</span>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination">
            <el-pagination
              layout="total, prev, pager, next"
              :total="cardTotal"
              :current-page="query.page"
              :page-size="query.pageSize"
              @current-change="changeCardPage"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="兑换记录" name="records">
        <el-card>
          <template #header>
            <div class="header-row">
              <span>兑换记录</span>
              <el-button @click="loadRecords">刷新</el-button>
            </div>
          </template>
          <el-form :inline="true" :model="recordQuery" class="query-form">
            <el-form-item label="关键词">
              <el-input v-model="recordQuery.keyword" clearable placeholder="兑换码 / 手机号 / openid" style="width: 240px" />
            </el-form-item>
            <el-form-item label="履约状态">
              <el-select v-model="recordQuery.fulfillmentStatus" clearable placeholder="全部" style="width: 160px">
                <el-option label="已完成" value="fulfilled" />
                <el-option label="待补地址" value="pending_address" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadRecords">查询</el-button>
              <el-button @click="showPendingAddress">待补地址</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="records" border v-loading="recordLoading">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="code" label="兑换码" min-width="150" />
            <el-table-column prop="phone" label="手机号" width="130" />
            <el-table-column prop="username" label="用户" width="120" />
            <el-table-column prop="gift_title" label="权益标题" min-width="170" />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">{{ typeLabel(row.gift_type) }}</template>
            </el-table-column>
            <el-table-column label="履约" width="110">
              <template #default="{ row }">
                <el-tag :type="row.fulfillment_status === 'pending_address' ? 'warning' : 'success'">
                  {{ row.fulfillment_status === "pending_address" ? "待补地址" : "已完成" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="points_change" label="积分" width="90" />
            <el-table-column prop="user_coupon_id" label="用户券ID" width="110" />
            <el-table-column prop="order_no" label="订单号" min-width="170" />
            <el-table-column prop="batch_no" label="批次" width="130" show-overflow-tooltip />
            <el-table-column prop="created_at" label="兑换时间" min-width="170" />
          </el-table>

          <div class="pagination">
            <el-pagination
              layout="total, prev, pager, next"
              :total="recordTotal"
              :current-page="recordQuery.page"
              :page-size="recordQuery.pageSize"
              @current-change="changeRecordPage"
            />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="editorVisible" :title="importMode ? '批量导入礼品卡' : '创建礼品卡'" width="860px">
      <el-form label-width="110px" :model="form">
        <el-form-item v-if="!importMode" label="兑换码" required>
          <el-input v-model="form.code" placeholder="至少 8 位字母或数字" @blur="checkCode" />
          <div v-if="codeExists" class="form-tip danger">兑换码已存在</div>
        </el-form-item>
        <el-form-item v-else label="兑换码" required>
          <el-input
            v-model="form.codesText"
            type="textarea"
            :rows="5"
            placeholder="每行一个兑换码，也支持逗号或空格分隔"
          />
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="展示给用户的礼品标题" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-segmented v-model="form.gift_type" :options="giftTypeOptions" @change="resetBenefits" />
        </el-form-item>
        <el-form-item label="权益" required>
          <div class="benefit-editor">
            <template v-if="form.gift_type !== 'combo'">
              <BenefitLine
                :benefit="singleBenefit"
                :coupons="optionCoupons"
                :products="optionProducts"
              />
            </template>
            <template v-else>
              <div v-for="(benefit, index) in form.gifts" :key="index" class="benefit-row">
                <BenefitLine :benefit="benefit" :coupons="optionCoupons" :products="optionProducts" />
                <el-button link type="danger" :disabled="form.gifts.length <= 2" @click="removeBenefit(index)">
                  删除
                </el-button>
              </div>
              <el-button :disabled="form.gifts.length >= 3" @click="addBenefit">添加权益</el-button>
            </template>
          </div>
        </el-form-item>
        <el-form-item label="批次号">
          <el-input v-model="form.batch_no" placeholder="可选，用于批量筛选" />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker
            v-model="form.expire_time"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="不设置则长期有效"
            clearable
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.admin_note" type="textarea" :rows="2" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="codeExists" @click="submitGiftCard">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, onMounted, reactive, ref } from "vue";
import { ElButton, ElInput, ElInputNumber, ElMessage, ElOption, ElSelect } from "element-plus";
import {
  checkGiftCardCode,
  createGiftCard,
  fetchGiftCardOptions,
  fetchGiftCards,
  fetchGiftRecords,
  importGiftCards,
  updateGiftCard
} from "../../api/admin";
import type {
  GiftBenefitInput,
  GiftCardOptionCoupon,
  GiftCardOptionProduct,
  GiftCardPayload,
  GiftCardRow,
  GiftCardType,
  GiftRedeemRecordRow
} from "../../api/admin";

const BenefitLine = defineComponent({
  name: "BenefitLine",
  props: {
    benefit: { type: Object as () => GiftBenefitInput, required: true },
    coupons: { type: Array as () => GiftCardOptionCoupon[], required: true },
    products: { type: Array as () => GiftCardOptionProduct[], required: true }
  },
  setup(props) {
    return () => h("div", { class: "benefit-line" }, [
      h(ElSelect, {
        modelValue: props.benefit.type,
        "onUpdate:modelValue": (value: GiftBenefitInput["type"]) => {
          props.benefit.type = value;
          props.benefit.points = value === "points" ? 100 : undefined;
          props.benefit.couponId = undefined;
          props.benefit.productId = undefined;
          props.benefit.quantity = value === "product" ? 1 : undefined;
        },
        style: "width: 120px"
      }, () => [
        h(ElOption, { label: "积分", value: "points" }),
        h(ElOption, { label: "优惠券", value: "coupon" }),
        h(ElOption, { label: "商品", value: "product" })
      ]),
      props.benefit.type === "points"
        ? h(ElInputNumber, {
          modelValue: props.benefit.points || 100,
          "onUpdate:modelValue": (value: number | undefined) => { props.benefit.points = Number(value || 0); },
          min: 1,
          step: 50,
          style: "width: 150px"
        })
        : null,
      props.benefit.type === "coupon"
        ? h(ElSelect, {
          modelValue: props.benefit.couponId,
          "onUpdate:modelValue": (value: number) => { props.benefit.couponId = value; },
          filterable: true,
          placeholder: "选择优惠券",
          style: "width: 280px"
        }, () => props.coupons.map((coupon) => h(ElOption, {
          label: `#${coupon.id} ${coupon.name} / 剩余${coupon.remain_count}`,
          value: coupon.id,
          disabled: !coupon.available
        })))
        : null,
      props.benefit.type === "product"
        ? h(ElSelect, {
          modelValue: props.benefit.productId,
          "onUpdate:modelValue": (value: number) => { props.benefit.productId = value; },
          filterable: true,
          placeholder: "选择商品",
          style: "width: 340px"
        }, () => props.products.map((product) => h(ElOption, {
          label: `#${product.id} ${product.name} / 可用${product.stock_available}`,
          value: product.id,
          disabled: !product.available
        })))
        : null,
      props.benefit.type === "product"
        ? h(ElInputNumber, {
          modelValue: props.benefit.quantity || 1,
          "onUpdate:modelValue": (value: number | undefined) => { props.benefit.quantity = Number(value || 1); },
          min: 1,
          style: "width: 120px"
        })
        : null,
      h(ElInput, {
        modelValue: props.benefit.title || "",
        "onUpdate:modelValue": (value: string) => { props.benefit.title = value; },
        placeholder: "权益标题",
        style: "width: 180px"
      })
    ]);
  }
});

const activeTab = ref("cards");
const loading = ref(false);
const recordLoading = ref(false);
const saving = ref(false);
const editorVisible = ref(false);
const importMode = ref(false);
const codeExists = ref(false);
const cards = ref<GiftCardRow[]>([]);
const records = ref<GiftRedeemRecordRow[]>([]);
const cardTotal = ref(0);
const recordTotal = ref(0);
const optionCoupons = ref<GiftCardOptionCoupon[]>([]);
const optionProducts = ref<GiftCardOptionProduct[]>([]);
const optionsLoaded = ref(false);

const query = reactive({
  keyword: "",
  status: "",
  giftType: "",
  batchNo: "",
  page: 1,
  pageSize: 20
});

const recordQuery = reactive({
  keyword: "",
  fulfillmentStatus: "",
  page: 1,
  pageSize: 20
});

const form = reactive({
  code: "",
  codesText: "",
  title: "",
  gift_type: "points" as GiftCardType,
  gifts: [
    { type: "points", points: 100, title: "积分" },
    { type: "coupon", couponId: undefined, title: "优惠券" }
  ] as GiftBenefitInput[],
  batch_no: "",
  expire_time: "",
  admin_note: ""
});

const singleBenefit = reactive<GiftBenefitInput>({
  type: "points",
  points: 100,
  title: "积分"
});

const giftTypeOptions = [
  { label: "积分", value: "points" },
  { label: "优惠券", value: "coupon" },
  { label: "商品", value: "product" },
  { label: "组合", value: "combo" }
];

function typeLabel(type: string) {
  return ({ points: "积分", coupon: "优惠券", product: "商品", combo: "组合" } as Record<string, string>)[type] || type;
}

function statusLabel(status: string) {
  return ({ unused: "未兑换", redeemed: "已兑换", disabled: "已禁用", expired: "已过期" } as Record<string, string>)[status] || status;
}

function statusType(status: string) {
  const map: Record<string, "success" | "warning" | "info" | "danger"> = {
    unused: "success",
    redeemed: "info",
    disabled: "warning",
    expired: "danger"
  };
  return map[status] || "info";
}

function giftSummary(type: GiftCardType, payload: GiftCardPayload) {
  const items = type === "combo" ? payload.gifts || [] : [{ ...payload, type }];
  return items.map((item) => {
    if (item.type === "points") return `${item.title || "积分"} +${Number(item.points || 0)}`;
    if (item.type === "coupon") return `${item.title || "优惠券"} #${item.couponId || "-"}`;
    if (item.type === "product") return `${item.title || "商品"} #${item.productId || "-"} x${item.quantity || 1}`;
    return "权益";
  }).join(" + ");
}

function resetForm() {
  form.code = "";
  form.codesText = "";
  form.title = "";
  form.gift_type = "points";
  singleBenefit.type = "points";
  singleBenefit.points = 100;
  singleBenefit.couponId = undefined;
  singleBenefit.productId = undefined;
  singleBenefit.quantity = undefined;
  singleBenefit.title = "积分";
  form.gifts = [
    { type: "points", points: 100, title: "积分" },
    { type: "coupon", couponId: undefined, title: "优惠券" }
  ];
  form.batch_no = "";
  form.expire_time = "";
  form.admin_note = "";
  codeExists.value = false;
}

function resetBenefits() {
  codeExists.value = false;
  if (form.gift_type === "combo") return;
  singleBenefit.type = form.gift_type;
  singleBenefit.title = typeLabel(form.gift_type);
  singleBenefit.points = form.gift_type === "points" ? Math.max(1, Number(singleBenefit.points || 100)) : undefined;
  singleBenefit.couponId = form.gift_type === "coupon" ? singleBenefit.couponId : undefined;
  singleBenefit.productId = form.gift_type === "product" ? singleBenefit.productId : undefined;
  singleBenefit.quantity = form.gift_type === "product" ? Math.max(1, Number(singleBenefit.quantity || 1)) : undefined;
}

function buildPayload(): GiftCardPayload {
  if (form.gift_type === "combo") return { gifts: form.gifts };
  if (form.gift_type === "points") return { points: singleBenefit.points, title: form.title };
  if (form.gift_type === "coupon") return { couponId: singleBenefit.couponId, title: form.title };
  return { productId: singleBenefit.productId, quantity: singleBenefit.quantity, title: form.title };
}

function addBenefit() {
  if (form.gifts.length >= 3) return;
  form.gifts.push({ type: "points", points: 100, title: "积分" });
}

function removeBenefit(index: number) {
  form.gifts.splice(index, 1);
}

async function loadOptions() {
  if (optionsLoaded.value) return;
  const options = await fetchGiftCardOptions();
  optionCoupons.value = options.coupons;
  optionProducts.value = options.products;
  optionsLoaded.value = true;
}

async function loadCards() {
  loading.value = true;
  try {
    const result = await fetchGiftCards(query);
    cards.value = result.list;
    cardTotal.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

async function loadRecords() {
  recordLoading.value = true;
  try {
    const result = await fetchGiftRecords(recordQuery);
    records.value = result.list;
    recordTotal.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    recordLoading.value = false;
  }
}

function resetCards() {
  query.keyword = "";
  query.status = "";
  query.giftType = "";
  query.batchNo = "";
  query.page = 1;
  void loadCards();
}

function changeCardPage(page: number) {
  query.page = page;
  void loadCards();
}

function changeRecordPage(page: number) {
  recordQuery.page = page;
  void loadRecords();
}

async function openCreate() {
  importMode.value = false;
  resetForm();
  try {
    await loadOptions();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载权益选项失败");
  }
  editorVisible.value = true;
}

async function openImport() {
  importMode.value = true;
  resetForm();
  try {
    await loadOptions();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载权益选项失败");
  }
  editorVisible.value = true;
}

async function checkCode() {
  if (importMode.value || !form.code.trim()) return;
  try {
    const result = await checkGiftCardCode(form.code);
    codeExists.value = result.exists;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "校验失败");
  }
}

async function submitGiftCard() {
  if (!form.title.trim()) {
    ElMessage.warning("请填写标题");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      title: form.title,
      gift_type: form.gift_type,
      gift_payload: buildPayload(),
      batch_no: form.batch_no,
      expire_time: form.expire_time,
      admin_note: form.admin_note
    };
    if (importMode.value) {
      const result = await importGiftCards({ ...payload, codesText: form.codesText });
      ElMessage.success(`导入 ${result.inserted} 张，跳过 ${result.skipped} 张`);
    } else {
      await createGiftCard({ ...payload, code: form.code });
      ElMessage.success("创建成功");
    }
    editorVisible.value = false;
    await loadCards();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

async function toggleCard(row: GiftCardRow, status: "unused" | "disabled") {
  try {
    await updateGiftCard({ id: row.id, status });
    ElMessage.success("状态已更新");
    await loadCards();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "操作失败");
  }
}

async function saveExpire(row: GiftCardRow) {
  try {
    await updateGiftCard({ id: row.id, expire_time: row.expire_time || "" });
    ElMessage.success("过期时间已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

function showPendingAddress() {
  activeTab.value = "records";
  recordQuery.fulfillmentStatus = "pending_address";
  recordQuery.page = 1;
  void loadRecords();
}

function handleTabChange() {
  if (activeTab.value === "records" && records.value.length === 0) void loadRecords();
}

onMounted(async () => {
  await loadCards();
});
</script>

<style scoped>
.gift-card-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-actions,
.expire-cell,
.benefit-line,
.benefit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.query-form {
  margin-bottom: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.benefit-summary {
  line-height: 1.5;
  white-space: normal;
}

.benefit-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.benefit-row {
  width: 100%;
}

.text-secondary {
  color: #909399;
}

.form-tip {
  margin-top: 6px;
  font-size: 12px;
}

.danger {
  color: #f56c6c;
}
</style>
