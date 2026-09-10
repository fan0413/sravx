<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>优惠券管理</span>
        <div>
          <el-button @click="openRulesManageDialog">规则管理</el-button>
          <el-button type="primary" @click="openIssueDialog">新建优惠券</el-button>
        </div>
      </div>
    </template>

    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="名称">
        <el-input v-model="query.keyword" placeholder="搜索优惠券名称" clearable />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="生效中" value="active" />
          <el-option label="待生效" value="pending" />
          <el-option label="已暂停" value="paused" />
          <el-option label="已过期" value="expired" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="面额" width="100">
        <template #default="{ row }">
          <span v-if="row.type === 'percent'">{{ formatAmount(row.value) }}%</span>
          <span v-else>¥{{ formatAmount(row.value) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="门槛" width="100">
        <template #default="{ row }">满¥{{ formatAmount(row.min_amount) }}</template>
      </el-table-column>
      <el-table-column label="叠加" width="70">
        <template #default="{ row }">
          <el-tag :type="row.stackable ? 'success' : 'info'" size="small">{{ row.stackable ? "可" : "否" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="total_count" label="总量" width="70" />
      <el-table-column prop="issued_count" label="已发" width="70" />
      <el-table-column prop="used_count" label="已用" width="70" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="有效期" min-width="210">
        <template #default="{ row }">{{ formatDateTime(row.start_time) }} ~ {{ formatDateTime(row.expire_time) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" size="small" @click="handleDeleteCoupon(row)">删除</el-button>
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

    <!-- 新建优惠券（统一） -->
    <el-dialog v-model="dialogVisible" title="新建优惠券" width="720px" :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-divider content-position="left">基础设置</el-divider>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="例：春季满减券" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio value="fixed">满减券</el-radio>
            <el-radio value="percent">折扣券</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="form.type === 'percent' ? '折扣(%)' : '面额(元)'" prop="value">
          <el-input-number v-model="form.value" :min="0.01" :max="form.type === 'percent' ? 99 : 100000" :precision="2" :step="form.type === 'percent' ? 1 : 5" />
          <span class="hint">{{ form.type === "percent" ? "例：80=打8折" : "直接抵扣金额" }}</span>
        </el-form-item>
        <el-form-item label="满减门槛" prop="min_amount">
          <el-input-number v-model="form.min_amount" :min="0" :precision="2" :step="50" />
          <span class="hint">0=无门槛</span>
        </el-form-item>
        <el-form-item label="有效期" prop="timeRange">
          <el-date-picker v-model="form.timeRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" range-separator="至" start-placeholder="开始" end-placeholder="结束" :shortcuts="rangeShortcuts" style="width: 420px" />
        </el-form-item>
        <el-form-item label="使用说明">
          <el-input v-model="form.usage_note" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="可叠加">
          <el-switch v-model="form.stackable" active-text="可与其他券叠加" />
        </el-form-item>

        <el-divider content-position="left">发放设置</el-divider>
        <el-form-item label="发放方式" prop="issueMode">
          <el-radio-group v-model="form.issueMode" @change="onIssueModeChange">
            <el-radio value="push">立即发放</el-radio>
            <el-radio value="auto">自动规则</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.issueMode === 'push'">
          <el-form-item label="目标用户" prop="targetType">
            <el-radio-group v-model="form.targetType" @change="handleTargetTypeChange">
              <el-radio value="all_active">所有活跃用户</el-radio>
              <el-radio value="phones">定向手机号</el-radio>
              <el-radio value="openids">定向 OpenID</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.targetType === 'phones'" label="手机号列表" prop="phonesText">
            <el-input v-model="form.phonesText" type="textarea" :rows="3" placeholder="换行/逗号/空格分隔" />
          </el-form-item>
          <el-form-item v-if="form.targetType === 'openids'" label="OpenID列表" prop="openidsText">
            <el-input v-model="form.openidsText" type="textarea" :rows="3" placeholder="换行/逗号/空格分隔" />
          </el-form-item>
          <el-form-item label="">
            <el-button @click="handlePreview" :loading="previewing">预估人数</el-button>
            <span v-if="preview" class="preview-box">
              匹配 <b>{{ preview.total }}</b> 人
              <span v-if="preview.missing.length" class="miss">({{ preview.missing.length }}条未匹配)</span>
            </span>
          </el-form-item>
        </template>

        <template v-if="form.issueMode === 'auto'">
          <el-form-item label="触发事件" prop="triggerEvent">
            <el-select v-model="form.triggerEvent" style="width: 200px">
              <el-option label="新人欢迎（首次登录）" value="welcome" />
              <el-option label="每日上线" value="daily" />
              <el-option label="首单奖励" value="first_order" />
            </el-select>
            <span class="hint">{{ eventHint(form.triggerEvent) }}</span>
          </el-form-item>
          <el-form-item label="每人限次">
            <el-input-number v-model="form.rulePerUserLimit" :min="1" :max="99" />
            <span class="hint">同一用户最多触发次数</span>
          </el-form-item>
          <el-form-item label="最低会员">
            <el-select v-model="form.ruleMinMemberLevel" style="width: 100px">
              <el-option label="不限" :value="0" />
              <el-option v-for="lv in 6" :key="lv" :label="`LV${lv}`" :value="lv" />
            </el-select>
          </el-form-item>
          <el-form-item label="立即启用">
            <el-switch v-model="form.ruleIsActive" active-text="是" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ form.issueMode === "auto" ? "创建优惠券并保存规则" : "确认发放" }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 规则管理 -->
    <el-dialog v-model="rulesDialogVisible" title="自动发放规则管理" width="850px" :close-on-click-modal="false">
      <el-table :data="rulesRows" border v-loading="rulesLoading" size="small">
        <el-table-column prop="id" label="ID" width="55" />
        <el-table-column label="事件" width="100">
          <template #default="{ row }">{{ eventLabel(row.trigger_event) }}</template>
        </el-table-column>
        <el-table-column label="关联券" min-width="180">
          <template #default="{ row }">
            <template v-if="row.coupon_id">{{ row.coupon_name || `#${row.coupon_id}` }} (¥{{ Number(row.coupon_value||0).toFixed(2) }})</template>
            <span v-else class="text-secondary">-</span>
          </template>
        </el-table-column>
        <el-table-column label="限次" width="60">
          <template #default="{ row }">{{ row.per_user_limit || "-" }}</template>
        </el-table-column>
        <el-table-column label="会员" width="70">
          <template #default="{ row }">{{ row.min_member_level > 0 ? `LV${row.min_member_level}` : "不限" }}</template>
        </el-table-column>
        <el-table-column label="状态" width="70">
          <template #default="{ row }"><el-tag :type="row.is_active?'success':'info'" size="small">{{ row.is_active?"启用":"禁用" }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="editRule(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="deleteRuleItem(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-divider />

      <el-form :inline="true" size="small">
        <el-form-item label="事件">
          <el-select v-model="ruleForm.trigger_event" style="width:150px">
            <el-option label="新人欢迎" value="welcome" /><el-option label="每日上线" value="daily" /><el-option label="首单奖励" value="first_order" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联券">
          <el-select v-model="ruleForm.coupon_id" filterable style="width:240px" clearable>
            <el-option v-for="c in couponOptions" :key="c.id" :label="`${c.name} (¥${Number(c.value).toFixed(2)})`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="限次"><el-input-number v-model="ruleForm.per_user_limit" :min="1" :max="99" style="width:90px" /></el-form-item>
        <el-form-item label="会员"><el-select v-model="ruleForm.min_member_level" style="width:90px"><el-option label="不限" :value="0" /><el-option v-for="lv in 6" :key="lv" :label="`LV${lv}`" :value="lv" /></el-select></el-form-item>
        <el-form-item><el-switch v-model="ruleForm.is_active" active-text="启用" /></el-form-item>
        <el-form-item><el-button type="primary" @click="saveRule">保存</el-button></el-form-item>
      </el-form>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import {
  fetchAdminCoupons, previewCouponTargets, issueAdminCoupon,
  deleteAdminCoupon, fetchCouponRules, setCouponRule, deleteCouponRule,
  type AdminCouponRow, type CouponTargetPreviewResult, type CouponTargetType, type CouponRuleRow
} from "../../api/admin";

interface CouponFormModel {
  name: string;
  type: "fixed" | "percent";
  value: number;
  min_amount: number;
  timeRange: [string, string] | null;
  usage_note: string;
  stackable: boolean;
  issueMode: "push" | "auto";
  targetType: CouponTargetType;
  phonesText: string;
  openidsText: string;
  triggerEvent: string;
  rulePerUserLimit: number;
  ruleMinMemberLevel: number;
  ruleIsActive: boolean;
}

const query = reactive({ keyword: "", status: "", page: 1, pageSize: 50 });
const rows = ref<AdminCouponRow[]>([]);
const total = ref(0);
const loading = ref(false);

const dialogVisible = ref(false);
const submitting = ref(false);
const previewing = ref(false);
const preview = ref<CouponTargetPreviewResult | null>(null);
const formRef = ref<FormInstance>();

const rulesDialogVisible = ref(false);
const rulesRows = ref<CouponRuleRow[]>([]);
const rulesLoading = ref(false);
const ruleForm = reactive({ id: 0, trigger_event: "welcome", coupon_id: undefined as number | undefined, per_user_limit: 1, min_member_level: 0, is_active: true });
const couponOptions = ref<AdminCouponRow[]>([]);

const defaultRange = (): [string, string] => [formatDateTime(new Date()), formatDateTime(new Date(Date.now() + 30*86400000))];

const form = reactive<CouponFormModel>({
  name: "", type: "fixed", value: 20, min_amount: 199, timeRange: defaultRange(), usage_note: "", stackable: false,
  issueMode: "push", targetType: "all_active", phonesText: "", openidsText: "",
  triggerEvent: "welcome", rulePerUserLimit: 1, ruleMinMemberLevel: 0, ruleIsActive: true
});

const rules: FormRules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  value: [{ required: true, message: "请输入面额", trigger: "blur" }],
  timeRange: [{ required: true, message: "请选择有效期", trigger: "change" }],
  targetType: [{ required: true, message: "请选择目标用户", trigger: "change" }],
  phonesText: [{ validator: (_r, v, cb) => { if (form.issueMode==="push" && form.targetType==="phones" && parseLines(String(v||"")).length===0) return cb(new Error("请填写手机号")); cb(); }, trigger: "blur" }],
  openidsText: [{ validator: (_r, v, cb) => { if (form.issueMode==="push" && form.targetType==="openids" && parseLines(String(v||"")).length===0) return cb(new Error("请填写OpenID")); cb(); }, trigger: "blur" }],
  triggerEvent: [{ validator: (_r, v, cb) => { if (form.issueMode==="auto" && !v) return cb(new Error("请选择触发事件")); cb(); }, trigger: "change" }],
};

const rangeShortcuts = [
  { text: "7 天", value: () => [new Date(), new Date(Date.now()+7*86400000)] as [Date,Date] },
  { text: "30 天", value: () => [new Date(), new Date(Date.now()+30*86400000)] as [Date,Date] },
  { text: "90 天", value: () => [new Date(), new Date(Date.now()+90*86400000)] as [Date,Date] },
];

function parseLines(t: string) { return t.split(/[\s,，;；\n\r]+/).map(s=>s.trim()).filter(Boolean); }
function formatDateTime(v: string|Date|null|undefined) { if(!v) return "-"; const d=typeof v==="string"?new Date(String(v).replace(/\.\d+Z$/,"")):v; if(Number.isNaN(d.getTime())) return String(v); const p=(n:number)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function formatAmount(v: string|number) { const n=Number(v); return Number.isFinite(n)?n.toFixed(2):"-"; }
function statusLabel(s: string) { const m:Record<string,string>={active:"生效中",pending:"待生效",paused:"已暂停",expired:"已过期"}; return m[s]||s||"-"; }
function statusTagType(s: string) { if(s==="active") return "success"; if(s==="pending") return "warning"; if(s==="expired") return "info"; return "danger"; }
function eventLabel(e: string) { const m:Record<string,string>={welcome:"新人欢迎",daily:"每日上线",first_order:"首单奖励"}; return m[e]||e; }
function eventHint(e: string) { const m:Record<string,string>={welcome:"新用户首次登录时自动发放，每人仅一次",daily:"用户每天首次打开小程序时发放",first_order:"用户完成首笔订单后发放"}; return m[e]||""; }

async function loadRows() { loading.value=true; try { const r=await fetchAdminCoupons(query); rows.value=r.list; total.value=r.total; } catch(e) { ElMessage.error(e instanceof Error?e.message:"加载失败"); } finally { loading.value=false; } }
async function handleQuery() { query.page=1; await loadRows(); }
async function handleReset() { query.keyword=""; query.status=""; query.page=1; await loadRows(); }
async function handlePageChange(p:number) { query.page=p; await loadRows(); }

function openIssueDialog() { resetForm(); dialogVisible.value=true; }

async function handleDeleteCoupon(row: AdminCouponRow) {
  try {
    await ElMessageBox.confirm(`确认删除优惠券「${row.name}」？已发放到用户的券记录会保留。`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }

  try {
    await deleteAdminCoupon(row.id);
    ElMessage.success("优惠券已删除");
    if (rows.value.length === 1 && query.page > 1) query.page -= 1;
    await loadRows();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "删除失败");
  }
}

function resetForm() {
  form.name=""; form.type="fixed"; form.value=20; form.min_amount=199; form.timeRange=defaultRange(); form.usage_note=""; form.stackable=false;
  form.issueMode="push"; form.targetType="all_active"; form.phonesText=""; form.openidsText="";
  form.triggerEvent="welcome"; form.rulePerUserLimit=1; form.ruleMinMemberLevel=0; form.ruleIsActive=true;
  preview.value=null; formRef.value?.clearValidate();
}

function onIssueModeChange() { preview.value=null; formRef.value?.clearValidate(); }
function handleTargetTypeChange() { preview.value=null; }

async function handlePreview() {
  if(form.targetType==="phones" && parseLines(form.phonesText).length===0) { ElMessage.warning("请填写手机号"); return; }
  if(form.targetType==="openids" && parseLines(form.openidsText).length===0) { ElMessage.warning("请填写OpenID"); return; }
  previewing.value=true;
  try { preview.value=await previewCouponTargets({targetType:form.targetType,phones:parseLines(form.phonesText),openids:parseLines(form.openidsText)}); if(preview.value.total===0) ElMessage.warning("未匹配到用户"); }
  catch(e) { ElMessage.error(e instanceof Error?e.message:"预估失败"); }
  finally { previewing.value=false; }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if(!valid) return;
  if(!form.timeRange || !form.timeRange[0] || !form.timeRange[1]) { ElMessage.warning("请选择有效期"); return; }

  if(form.issueMode === "push") {
    const phones=parseLines(form.phonesText); const openids=parseLines(form.openidsText);
    const confirmText = form.targetType==="all_active" ? "即将向所有活跃用户发放优惠券，确认？" : form.targetType==="phones" ? `向${phones.length}个手机号发放，确认？` : `向${openids.length}个OpenID发放，确认？`;
    try { await ElMessageBox.confirm(confirmText,"确认发放",{type:"warning",confirmButtonText:"确认",cancelButtonText:"取消"}); } catch { return; }
    submitting.value=true;
    try {
      const r=await issueAdminCoupon({name:form.name.trim(),type:form.type,value:Number(form.value),min_amount:Number(form.min_amount),start_time:form.timeRange[0],expire_time:form.timeRange[1],usage_note:form.usage_note.trim(),stackable:form.stackable?1:0,targetType:form.targetType,phones,openids});
      ElMessage.success(`发放成功：#${r.couponId}，${r.issuedCount}份${r.missing.length?`，${r.missing.length}条未匹配`:""}`);
      dialogVisible.value=false; await loadRows();
    } catch(e) { ElMessage.error(e instanceof Error?e.message:"发放失败"); }
    finally { submitting.value=false; }
  } else {
    try { await ElMessageBox.confirm(`将创建优惠券"${form.name}"并设为「${eventLabel(form.triggerEvent)}」自动发放规则，确认？`,"确认",{type:"warning"}); } catch { return; }
    submitting.value=true;
    try {
      const r=await issueAdminCoupon({name:form.name.trim(),type:form.type,value:Number(form.value),min_amount:Number(form.min_amount),start_time:form.timeRange[0],expire_time:form.timeRange[1],usage_note:form.usage_note.trim(),stackable:form.stackable?1:0,targetType:"none",phones:[],openids:[]});
      await setCouponRule({trigger_event:form.triggerEvent,coupon_id:r.couponId,per_user_limit:form.rulePerUserLimit,min_member_level:form.ruleMinMemberLevel,is_active:form.ruleIsActive?1:0});
      ElMessage.success(`已创建优惠券 #${r.couponId} 并保存自动发放规则`);
      dialogVisible.value=false; await loadRows();
    } catch(e) { ElMessage.error(e instanceof Error?e.message:"操作失败"); }
    finally { submitting.value=false; }
  }
}

async function openRulesManageDialog() {
  rulesDialogVisible.value=true; rulesLoading.value=true;
  try { const [rules,coupons]=await Promise.all([fetchCouponRules(),fetchAdminCoupons({page:1,pageSize:200})]); rulesRows.value=rules; couponOptions.value=coupons.list; }
  catch(e) { ElMessage.error(e instanceof Error?e.message:"加载规则失败"); }
  finally { rulesLoading.value=false; }
}

function editRule(row: CouponRuleRow) { ruleForm.id=row.id; ruleForm.trigger_event=row.trigger_event; ruleForm.coupon_id=row.coupon_id; ruleForm.per_user_limit=row.per_user_limit||1; ruleForm.min_member_level=row.min_member_level||0; ruleForm.is_active=!!row.is_active; }

async function saveRule() {
  if(!ruleForm.trigger_event || !ruleForm.coupon_id) { ElMessage.warning("请填写事件和关联券"); return; }
  try { await setCouponRule({id:ruleForm.id>0?ruleForm.id:undefined,trigger_event:ruleForm.trigger_event,coupon_id:Number(ruleForm.coupon_id),per_user_limit:ruleForm.per_user_limit,min_member_level:ruleForm.min_member_level,is_active:ruleForm.is_active?1:0}); ElMessage.success(ruleForm.id>0?"已更新":"已创建"); openRulesManageDialog(); }
  catch(e) { ElMessage.error(e instanceof Error?e.message:"保存失败"); }
}

async function deleteRuleItem(id:number) { try { await ElMessageBox.confirm("确定删除？","确认",{type:"warning"}); } catch { return; } try { await deleteCouponRule(id); ElMessage.success("已删除"); openRulesManageDialog(); } catch(e) { ElMessage.error(e instanceof Error?e.message:"删除失败"); } }

onMounted(async () => { await loadRows(); });
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.query-form { margin-bottom: 16px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.hint { margin-left: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
.preview-box { margin-left: 12px; color: var(--el-text-color-regular); font-size: 14px; }
.preview-box b { color: var(--el-color-primary); font-size: 16px; margin: 0 4px; }
.preview-box .miss { color: var(--el-color-warning); margin-left: 6px; }
.text-secondary { color: var(--el-text-color-placeholder); }
</style>
