<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <span>订单列表</span>
        <el-button v-if="!targetMode" type="primary" @click="openShipDialog">一键发货</el-button>
      </div>
    </template>
    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="订单号">
        <el-input v-model="query.orderNo" placeholder="请输入订单号" clearable />
      </el-form-item>
      <el-form-item label="订单状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="待付款" value="pending_payment" />
          <el-option label="已支付" value="paid" />
          <el-option label="已发货" value="shipped" />
          <el-option label="已完成" value="completed" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="退款中" value="refunding" />
          <el-option label="已退款" value="refunded" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="!targetMode" label="发货类型">
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
      <el-table-column label="订单号" min-width="210">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/order/detail/${row.id}`)">
            {{ row.order_no }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="user_id" label="用户ID" width="100" />
      <el-table-column label="商品/规格" min-width="220">
        <template #default="{ row }">
          <span>{{ row.specs_summary || "-" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="total_amount" label="订单总额" width="110" />
      <el-table-column prop="pay_amount" label="实付金额" width="110" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ getOrderStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发货承诺" min-width="210">
        <template #default="{ row }">
          <el-tag :type="shippingTagType(row.shipping_type)" size="small">
            {{ getShippingTypeLabel(row.shipping_type) }}
          </el-tag>
          <div class="shipping-promise">{{ getShippingPromise(row) }}</div>
          <div v-if="row.expected_ship_time" class="expected-time">
            预计：{{ row.expected_ship_time }}
            <el-tag v-if="isShippingOverdue(row)" size="small" type="danger">已超时</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="物流" min-width="200">
        <template #default="{ row }">
          <template v-if="row.logistics_company">
            {{ row.logistics_company }} / {{ row.logistics_no }}
          </template>
          <span v-else-if="row.status === 'paid'" class="pending-ship">待发货</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column v-if="!targetMode" label="微信同步" width="150">
        <template #default="{ row }">
          <template v-if="row.status === 'shipped'">
            <el-tag :type="wechatShippingTagType(row.wechat_shipping_upload_status)" size="small">
              {{ getWechatShippingLabel(row.wechat_shipping_upload_status) }}
            </el-tag>
            <div v-if="row.wechat_shipping_upload_error" class="wechat-error">
              {{ row.wechat_shipping_upload_error }}
            </div>
            <el-button
              v-if="canRetryWechatShipping(row)"
              link
              type="primary"
              size="small"
              :loading="wechatRetryingId === row.id"
              @click="handleRetryWechatShipping(row)"
            >
              重试同步
            </el-button>
          </template>
          <template v-else-if="row.shipping_type === 'delayed' || row.wechat_special_report_status">
            <el-tag :type="wechatSpecialReportTagType(row.wechat_special_report_status)" size="small">
              {{ getWechatSpecialReportLabel(row.wechat_special_report_status) }}
            </el-tag>
            <div v-if="row.wechat_special_report_error" class="wechat-error">
              {{ row.wechat_special_report_error }}
            </div>
          </template>
          <span v-else class="text-secondary">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="下单时间" min-width="170" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/order/detail/${row.id}`)">详情</el-button>
          <el-button v-if="['refunding', 'refunded'].includes(row.status)" link type="primary" @click="$router.push({ path: '/refund/list', query: { orderNo: row.order_no } })">退款处理</el-button>
          <el-button v-if="!targetMode && canDelay(row)" link type="warning" @click="openDelayDialog(row)">延期</el-button>
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

    <el-dialog v-model="shipDialogVisible" title="一键发货" width="1000px" destroy-on-close>
      <div class="ship-form">
        <el-radio-group v-model="shipForm.mode" style="margin-bottom: 12px">
          <el-radio-button value="sf">顺丰电子面单（API 自动下单）</el-radio-button>
          <el-radio-button value="manual">手动录入快递单号</el-radio-button>
        </el-radio-group>

        <template v-if="shipForm.mode === 'manual'">
          <el-form :inline="true">
            <el-form-item label="物流公司" required>
              <el-select v-model="shipForm.logistics_company" placeholder="选择物流公司" style="width: 180px">
                <el-option label="顺丰速运" value="顺丰速运" />
                <el-option label="中通快递" value="中通快递" />
                <el-option label="圆通速递" value="圆通速递" />
                <el-option label="韵达快递" value="韵达快递" />
                <el-option label="申通快递" value="申通快递" />
                <el-option label="邮政EMS" value="邮政EMS" />
              </el-select>
            </el-form-item>
            <el-form-item label="快递单号" required style="width: 300px">
              <el-input v-model="shipForm.logistics_no" placeholder="请输入快递单号" />
            </el-form-item>
          </el-form>
        </template>

        <template v-else>
          <el-alert
            title="顺丰电子面单模式：选中订单后将通过顺丰 API 自动下单并获取运单号，无需手动填写。"
            type="success"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
          />
          <el-form :inline="true" class="sf-template-form">
            <el-form-item label="快件产品">
              <el-select
                v-model="shipForm.sf_express_type_id"
                filterable
                allow-create
                clearable
                placeholder="顺丰默认/输入产品代码"
                style="width: 240px"
              >
                <el-option
                  v-for="option in SF_EXPRESS_TYPE_OPTIONS"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="面单尺寸">
              <el-select v-model="shipForm.sf_print_template_code" placeholder="选择顺丰面单模板" style="width: 340px">
                <el-option
                  v-for="template in SF_PRINT_TEMPLATES"
                  :key="template.code"
                  :label="template.label"
                  :value="template.code"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="模板编码">
              <el-tag type="info" size="small">{{ shipForm.sf_print_template_code }}</el-tag>
            </el-form-item>
          </el-form>
          <div class="sf-status" v-if="sfConfigured !== null">
            <el-tag :type="sfConfigured ? 'success' : 'danger'" size="small">
              {{ sfConfigured ? '顺丰 API 已连接' : '顺丰 API 未配置' }}
            </el-tag>
          </div>
        </template>

        <el-alert
          v-if="shipErrors.length > 0"
          title="部分订单发货失败"
          type="error"
          :closable="true"
          show-icon
          style="margin-bottom: 12px"
        >
          <ul style="margin: 4px 0; padding-left: 18px">
            <li v-for="(err, idx) in shipErrors" :key="idx">
              {{ err.orderNo || `订单#${err.id}` }}：{{ err.error }}
            </li>
          </ul>
        </el-alert>
      </div>

      <el-form :inline="true" :model="shipQuery" class="ship-query">
        <el-form-item label="订单号">
          <el-input v-model="shipQuery.orderNo" placeholder="待发货订单号" clearable style="width: 180px" />
        </el-form-item>
        <el-form-item label="发货类型">
          <el-select v-model="shipQuery.shippingType" placeholder="全部" clearable style="width: 150px">
            <el-option label="普通现货" value="normal" />
            <el-option label="预售" value="presale" />
            <el-option label="定制" value="custom" />
            <el-option label="特殊延迟" value="delayed" />
          </el-select>
        </el-form-item>
        <el-form-item label="下单日期">
          <el-date-picker
            v-model="shipQuery.createdRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            range-separator="至"
            style="width: 250px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadPendingShipRows">筛选</el-button>
          <el-button @click="resetShipQuery">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table
        ref="shipTableRef"
        :data="pendingRows"
        border
        v-loading="shipLoading"
        @selection-change="handleShipSelectionChange"
        max-height="400"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="order_no" label="订单号" min-width="200" />
        <el-table-column prop="user_id" label="用户ID" width="90" />
        <el-table-column prop="pay_amount" label="实付金额" width="110" />
        <el-table-column label="发货类型" min-width="170">
          <template #default="{ row }">
            <el-tag :type="shippingTagType(row.shipping_type)" size="small">
              {{ getShippingTypeLabel(row.shipping_type) }}
            </el-tag>
            <div class="shipping-promise">{{ getShippingPromise(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="预计发货" min-width="180">
          <template #default="{ row }">
            <span>{{ row.expected_ship_time || getShippingPromise(row) }}</span>
            <el-tag v-if="isPendingShipOverdue(row)" size="small" type="danger" class="overdue-tag">已超时</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="收货地址" min-width="260">
          <template #default="{ row }">
            <div class="ship-address">
              <div>{{ row.addr_name || "-" }} {{ row.addr_phone || "" }}</div>
              <div class="ship-address-detail">
                {{ formatShipAddress(row) }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="下单时间" min-width="160" />
        <el-table-column label="操作" width="96" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAddressDialog(row)">改地址</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-ship">暂无待发货订单</div>
        </template>
      </el-table>

      <template #footer>
        <el-button @click="shipDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="shipping" :disabled="selectedShipIds.length === 0" @click="handleBatchShip">
          确认发货（已选 {{ selectedShipIds.length }} 单）
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addressDialogVisible" title="修改收货地址" width="560px" destroy-on-close>
      <el-form label-width="92px">
        <el-form-item label="订单号">
          <span>{{ addressForm.orderNo }}</span>
        </el-form-item>
        <el-form-item label="收货人" required>
          <el-input v-model="addressForm.addr_name" maxlength="50" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="addressForm.addr_phone" maxlength="30" />
        </el-form-item>
        <el-form-item label="省/市/区" required>
          <div class="address-region-row">
            <el-input v-model="addressForm.addr_province" placeholder="省" maxlength="50" />
            <el-input v-model="addressForm.addr_city" placeholder="市" maxlength="50" />
            <el-input v-model="addressForm.addr_district" placeholder="区/县" maxlength="50" />
          </div>
        </el-form-item>
        <el-form-item label="详细地址" required>
          <el-input
            v-model="addressForm.addr_detail"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addressDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="addressSaving" @click="handleAddressSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="delayDialogVisible" title="调整发货时间" width="520px" destroy-on-close>
      <el-form label-width="96px">
        <el-form-item label="订单号">
          <span>{{ delayForm.orderNo }}</span>
        </el-form-item>
        <el-form-item label="预计发货" required>
          <el-date-picker
            v-model="delayForm.expected_ship_time"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            placeholder="选择预计发货时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="延期原因" required>
          <el-select v-model="delayForm.reason" placeholder="请选择" style="width: 100%">
            <el-option label="特殊商品延迟发货" value="特殊商品延迟发货" />
            <el-option label="预售备货" value="预售备货" />
            <el-option label="定制生产" value="定制生产" />
            <el-option label="用户约定延期" value="用户约定延期" />
            <el-option label="物流停运" value="物流停运" />
            <el-option label="不可抗力" value="不可抗力" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="delayForm.note"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="填写协商记录、报备说明或预计履约安排"
          />
        </el-form-item>
        <el-form-item label="微信报备">
          <el-switch
            v-model="delayForm.syncWechatSpecialReport"
            active-text="同步特殊发货报备"
            inactive-text="仅保存本地"
          />
          <div class="form-tip">
            已支付订单会调用微信特殊发货报备，预计发货时间会作为微信 delay_to 提交。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="delayDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="delaySaving" @click="handleDelaySave">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  delayOrderShipping,
  fetchOrders,
  fetchPendingShipOrders,
  retryWechatShipping,
  shipOrders,
  sfBatchShip,
  sfConfirmShip,
  sfHealth,
  sfWaybillPrint,
  updateOrderShippingAddress,
  type PendingShipRow
} from "../../api/admin";
import type { OrderRow } from "../../api/types";
import { targetAdminOperationsModeEnabled } from "../../lib/target-admin-auth";

const targetMode = targetAdminOperationsModeEnabled();

const SF_PRINT_TEMPLATES = [
  { label: "丰密150标准模板 100×150", code: "fm_150_standard_ZJGSDLMFI66J" },
  { label: "丰密180标准模板 100×180", code: "fm_180_standard_ZJGSDLMFI66J" },
  { label: "丰密210标准模板 100×210", code: "fm_210_standard_ZJGSDLMFI66J" },
  { label: "丰密76130标准模板 76×130", code: "fm_76130_standard_ZJGSDLMFI66J" },
  { label: "丰密76165一联模板 76×165", code: "fm_76165_standard1_ZJGSDLMFI66J" },
  { label: "丰密76165二联模板 76×165", code: "fm_76165_standard2_ZJGSDLMFI66J" }
] as const;

const DEFAULT_SF_PRINT_TEMPLATE_CODE = "fm_76130_standard_ZJGSDLMFI66J";
const SF_EXPRESS_TYPE_STORAGE_KEY = "sravx.sfExpressTypeId";

const SF_EXPRESS_TYPE_OPTIONS = [
  { label: "顺丰默认（合同默认）", value: "" },
  { label: "顺丰特快 1", value: "1" },
  { label: "顺丰标快 2", value: "2" },
  { label: "电商标快 154", value: "154" },
  { label: "顺丰空配 112", value: "112" },
  { label: "陆运包裹 231", value: "231" },
  { label: "顺丰特惠 18", value: "18" }
] as const;

const getSavedSfExpressTypeId = () => {
  try {
    return window.localStorage.getItem(SF_EXPRESS_TYPE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

const getSfExpressTypeLabel = (value?: string) => {
  const typeId = String(value || "").trim();
  if (!typeId) return "顺丰默认";
  return SF_EXPRESS_TYPE_OPTIONS.find((item) => item.value === typeId)?.label || `产品代码 ${typeId}`;
};

const getSfPrintTemplateLabel = (code?: string) => {
  return SF_PRINT_TEMPLATES.find((item) => item.code === code)?.label || "顺丰面单模板";
};

const query = reactive({
  orderNo: "",
  status: "",
  shippingType: "",
  page: 1,
  pageSize: 20
});

const rows = ref<OrderRow[]>([]);
const total = ref(0);
const loading = ref(false);
const wechatRetryingId = ref<number | null>(null);
let timer: number | undefined;

const ORDER_STATUS_LABEL_MAP: Record<string, string> = {
  pending_payment: "待付款",
  paid: "已支付",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中"
};

const STATUS_TAG_MAP: Record<string, "" | "warning" | "success" | "info" | "danger"> = {
  pending_payment: "warning",
  paid: "",
  shipped: "warning",
  completed: "success",
  cancelled: "info",
  refunding: "danger"
} as const;

const getOrderStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return ORDER_STATUS_LABEL_MAP[key] || key || "-";
};

const statusTagType = (status?: string) => {
  const key = String(status || "").trim();
  return (STATUS_TAG_MAP as Record<string, string>)[key] || "info";
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

const getWechatShippingLabel = (status?: string | null) => {
  const map: Record<string, string> = {
    success: "已通知",
    failed: "通知失败",
    skipped: "未同步"
  };
  return map[String(status || "")] || "待同步";
};

const wechatShippingTagType = (status?: string | null) => {
  const map: Record<string, "success" | "warning" | "info" | "danger"> = {
    success: "success",
    failed: "danger",
    skipped: "info"
  };
  return map[String(status || "")] || "warning";
};

const getWechatSpecialReportLabel = (status?: string | null) => {
  const map: Record<string, string> = {
    success: "已报备",
    failed: "报备失败",
    skipped: "未报备"
  };
  return map[String(status || "")] || "待报备";
};

const wechatSpecialReportTagType = (status?: string | null) => {
  const map: Record<string, "success" | "warning" | "info" | "danger"> = {
    success: "success",
    failed: "danger",
    skipped: "info"
  };
  return map[String(status || "")] || "warning";
};

const getShippingPromise = (row: Pick<OrderRow, "shipping_type" | "ship_deadline_days" | "shipping_promise"> | PendingShipRow) => {
  const promise = String(row.shipping_promise || "").trim();
  if (promise) return promise;
  const type = String(row.shipping_type || "normal");
  const days = Math.max(1, Number(row.ship_deadline_days || (type === "normal" ? 2 : 7)));
  if (type === "normal" && days <= 2) return "付款后48小时内发货";
  return `${getShippingTypeLabel(type)}，付款后${days}天内发货`;
};

const parseDateTime = (value?: string | null) => {
  if (!value) return NaN;
  return Date.parse(String(value).replace(/-/g, "/"));
};

const isShippingOverdue = (row: OrderRow) => {
  if (row.status !== "paid" || !row.expected_ship_time) return false;
  const time = parseDateTime(row.expected_ship_time);
  return Number.isFinite(time) && time < Date.now();
};

const isPendingShipOverdue = (row: PendingShipRow) => {
  if (!row.expected_ship_time) return false;
  const time = parseDateTime(row.expected_ship_time);
  return Number.isFinite(time) && time < Date.now();
};

const canDelay = (row: OrderRow) => ["pending_payment", "paid"].includes(String(row.status || ""));

const canRetryWechatShipping = (row: OrderRow) => {
  const status = String(row.wechat_shipping_upload_status || "");
  return row.status === "shipped" && !!row.logistics_no && status !== "success";
};

const showWechatShippingSummary = (summary?: {
  success: number;
  skipped: number;
  failed: number;
  list?: Array<{ id: number; error?: string; skipped?: boolean; success?: boolean }>;
}) => {
  if (!summary) return;
  const failedOrSkipped = (summary.list || []).filter((item) => !item.success);
  if (summary.failed > 0) {
    const firstError = failedOrSkipped.find((item) => !item.skipped)?.error || "微信发货信息同步失败";
    ElMessage.warning(`本地发货成功，微信同步失败 ${summary.failed} 笔：${firstError}`);
  } else if (summary.skipped > 0) {
    const firstError = failedOrSkipped[0]?.error || "微信同步已跳过";
    ElMessage.warning(`本地发货成功，微信同步跳过 ${summary.skipped} 笔：${firstError}`);
  } else if (summary.success > 0) {
    ElMessage.success(`已发货并同步微信 ${summary.success} 笔`);
  }
};

const handleRetryWechatShipping = async (row: OrderRow) => {
  wechatRetryingId.value = row.id;
  try {
    const result = await retryWechatShipping(row.id);
    if (result.success) {
      ElMessage.success("微信发货信息已同步");
    } else if (result.skipped) {
      ElMessage.warning(result.error || "微信同步已跳过");
    } else {
      ElMessage.warning(result.error || "微信发货信息同步失败");
    }
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "微信发货信息同步失败");
  } finally {
    wechatRetryingId.value = null;
  }
};

const formatShipAddress = (row: PendingShipRow) => {
  return [row.addr_province, row.addr_city, row.addr_district, row.addr_detail]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("");
};

const base64ToBlobUrl = (base64: string, contentType = "application/pdf") => {
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
};

const printPdfFiles = async (
  files: Array<{
    base64?: string;
    contentType?: string;
    fileName?: string;
    waybillNo?: string;
    merged?: boolean;
    sourceCount?: number;
    pageCount?: number;
  }>,
  printWindow?: Window | null
) => {
  const printableFiles = files.filter((file) => file.base64);
  if (printableFiles.length === 0) {
    ElMessage.warning("顺丰未返回可打印的 PDF 面单");
    return false;
  }

  const firstFile = printableFiles[0];
  const printCount = Number(firstFile?.sourceCount || firstFile?.pageCount || printableFiles.length);
  const isMergedPdf = printableFiles.length === 1 && firstFile?.merged;
  ElMessage.info(isMergedPdf ? `已合并 ${printCount} 张面单，将一次性打印` : `顺丰返回 ${printableFiles.length} 张面单`);

  if (!printWindow || printWindow.closed) {
    ElMessage.warning("打印窗口被浏览器拦截，请允许本站弹窗后重试");
    return false;
  }

  const blobUrls = printableFiles.map((file) => base64ToBlobUrl(file.base64 || "", file.contentType || "application/pdf"));

  return new Promise<boolean>((resolve) => {
    let currentIndex = 0;
    let finished = false;
    const doc = printWindow.document;

    const cleanup = () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };

    const finish = (printed: boolean) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(printed);
    };

    doc.open();
    doc.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>顺丰面单打印</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f3f4f6; }
            .toolbar {
              display: flex;
              align-items: center;
              gap: 10px;
              min-height: 64px;
              padding: 12px 16px;
              background: #ffffff;
              border-bottom: 1px solid #d1d5db;
              position: sticky;
              top: 0;
              z-index: 2;
            }
            .title { font-size: 16px; font-weight: 600; margin-right: auto; }
            button {
              height: 36px;
              padding: 0 14px;
              border: 1px solid #c7cbd1;
              border-radius: 6px;
              background: #ffffff;
              color: #111827;
              cursor: pointer;
              font-size: 14px;
            }
            button.primary { border-color: #1677ff; background: #1677ff; color: #ffffff; }
            button.success { border-color: #16a34a; background: #16a34a; color: #ffffff; }
            button:disabled { opacity: .45; cursor: not-allowed; }
            .hint { padding: 8px 16px; background: #fff7ed; border-bottom: 1px solid #fed7aa; color: #9a3412; font-size: 13px; }
            iframe { display: block; width: 100%; height: calc(100vh - 105px); border: 0; background: #d1d5db; }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div class="title" id="title">顺丰面单</div>
            <button id="printBtn" class="primary">打印当前</button>
            <button id="prevBtn">上一张</button>
            <button id="nextBtn">下一张</button>
            <button id="doneBtn" class="success">全部打印完成</button>
          </div>
          <div class="hint" id="hint">全部打印出来后点“全部打印完成”，再回管理端确认发货。</div>
          <iframe id="pdfFrame" title="顺丰面单"></iframe>
        </body>
      </html>`);
    doc.close();

    const title = doc.getElementById("title") as HTMLElement | null;
    const frame = doc.getElementById("pdfFrame") as HTMLIFrameElement | null;
    const hint = doc.getElementById("hint") as HTMLElement | null;
    const printBtn = doc.getElementById("printBtn") as HTMLButtonElement | null;
    const prevBtn = doc.getElementById("prevBtn") as HTMLButtonElement | null;
    const nextBtn = doc.getElementById("nextBtn") as HTMLButtonElement | null;
    const doneBtn = doc.getElementById("doneBtn") as HTMLButtonElement | null;

    if (isMergedPdf) {
      if (printBtn) printBtn.textContent = `打印全部 ${printCount} 张`;
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (hint) hint.textContent = `这是一份合并后的多页面单 PDF。点“打印全部 ${printCount} 张”或等待自动弹出打印窗口后，选择汉印 N31D，一次会连续打印全部面单。`;
    } else if (hint) {
      hint.textContent = "每打印完一张，请点“下一张”切换。全部打印出来后点“全部打印完成”，再回管理端确认发货。";
    }

    const render = () => {
      const file = printableFiles[currentIndex];
      if (title) {
        title.textContent = isMergedPdf
          ? `顺丰面单：已合并 ${printCount} 张`
          : `顺丰面单 ${currentIndex + 1} / ${printableFiles.length}${file.waybillNo ? `：${file.waybillNo}` : ""}`;
      }
      if (frame) frame.src = blobUrls[currentIndex];
      if (prevBtn) prevBtn.disabled = currentIndex === 0;
      if (nextBtn) nextBtn.disabled = currentIndex >= printableFiles.length - 1;
    };

    const printCurrent = () => {
      const frameWindow = frame?.contentWindow;
      if (!frameWindow) {
        ElMessage.warning("面单还在加载，请稍后再点打印");
        return;
      }
      frameWindow.focus();
      frameWindow.print();
    };

    printBtn?.addEventListener("click", printCurrent);
    prevBtn?.addEventListener("click", () => {
      currentIndex = Math.max(0, currentIndex - 1);
      render();
    });
    nextBtn?.addEventListener("click", () => {
      currentIndex = Math.min(printableFiles.length - 1, currentIndex + 1);
      render();
    });
    doneBtn?.addEventListener("click", () => finish(true));
    printWindow.addEventListener("beforeunload", () => finish(false), { once: true });

    render();
    setTimeout(printCurrent, 800);
  });
};

const printSfWaybills = async (waybillNos: string[], printWindow?: Window | null, templateCode?: string) => {
  const validWaybillNos = waybillNos.map((item) => String(item || "").trim()).filter(Boolean);
  if (validWaybillNos.length === 0) return false;

  try {
    const result = await sfWaybillPrint(validWaybillNos, { templateCode });
    const printed = await printPdfFiles(result.files || [], printWindow);
    ElMessage.success(`已生成 ${validWaybillNos.length} 张${getSfPrintTemplateLabel(result.templateCode)}，请在打印窗口选择汉印 N31D`);
    return printed;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "顺丰面单打印失败");
    return false;
  }
};

const loadRows = async () => {
  loading.value = true;
  try {
    const result = await fetchOrders(query);
    rows.value = result.list;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "订单数据读取失败");
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
  query.shippingType = "";
  query.page = 1;
  loadRows();
};

const handlePageChange = (page: number) => {
  query.page = page;
  loadRows();
};

const shipDialogVisible = ref(false);
const shipLoading = ref(false);
const shipping = ref(false);
const pendingRows = ref<PendingShipRow[]>([]);
const selectedShipIds = ref<number[]>([]);
const shipQuery = reactive({
  orderNo: "",
  shippingType: "",
  createdRange: [] as string[]
});

const shipForm = reactive({
  mode: "sf" as "sf" | "manual",
  logistics_company: "顺丰速运",
  logistics_no: "",
  sf_express_type_id: getSavedSfExpressTypeId(),
  sf_print_template_code: DEFAULT_SF_PRINT_TEMPLATE_CODE
});
const sfConfigured = ref<boolean | null>(null);
const shipErrors = ref<Array<{ id: number; orderNo?: string; error: string }>>([]);

watch(
  () => shipForm.sf_express_type_id,
  (value) => {
    try {
      window.localStorage.setItem(SF_EXPRESS_TYPE_STORAGE_KEY, String(value || "").trim());
    } catch {
      // Ignore storage errors in restricted browser contexts.
    }
  }
);

const handleShipSelectionChange = (selection: { id: number }[]) => {
  selectedShipIds.value = selection.map((item) => item.id);
};

const addressDialogVisible = ref(false);
const addressSaving = ref(false);
const addressForm = reactive({
  id: 0,
  orderNo: "",
  addr_name: "",
  addr_phone: "",
  addr_province: "",
  addr_city: "",
  addr_district: "",
  addr_detail: ""
});

const openAddressDialog = (row: PendingShipRow) => {
  addressForm.id = Number(row.id);
  addressForm.orderNo = row.order_no;
  addressForm.addr_name = row.addr_name || "";
  addressForm.addr_phone = row.addr_phone || "";
  addressForm.addr_province = row.addr_province || "";
  addressForm.addr_city = row.addr_city || "";
  addressForm.addr_district = row.addr_district || "";
  addressForm.addr_detail = row.addr_detail || "";
  addressDialogVisible.value = true;
};

const handleAddressSave = async () => {
  if (!addressForm.id) {
    ElMessage.warning("未找到订单");
    return;
  }
  if (!addressForm.addr_name.trim() || !addressForm.addr_phone.trim() || !addressForm.addr_province.trim() || !addressForm.addr_city.trim() || !addressForm.addr_detail.trim()) {
    ElMessage.warning("请完整填写收货人、手机号、省市和详细地址");
    return;
  }

  addressSaving.value = true;
  try {
    const updated = await updateOrderShippingAddress(addressForm.id, {
      addr_name: addressForm.addr_name,
      addr_phone: addressForm.addr_phone,
      addr_province: addressForm.addr_province,
      addr_city: addressForm.addr_city,
      addr_district: addressForm.addr_district,
      addr_detail: addressForm.addr_detail
    });
    const row = pendingRows.value.find((item) => item.id === addressForm.id);
    if (row) {
      row.addr_name = updated.addr_name;
      row.addr_phone = updated.addr_phone;
      row.addr_province = updated.addr_province;
      row.addr_city = updated.addr_city;
      row.addr_district = updated.addr_district;
      row.addr_detail = updated.addr_detail;
    }
    ElMessage.success("收货地址已更新");
    addressDialogVisible.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "修改收货地址失败");
  } finally {
    addressSaving.value = false;
  }
};

const loadPendingShipRows = async () => {
  shipLoading.value = true;
  selectedShipIds.value = [];
  try {
    pendingRows.value = await fetchPendingShipOrders({
      orderNo: shipQuery.orderNo,
      shippingType: shipQuery.shippingType,
      createdStart: shipQuery.createdRange?.[0] || "",
      createdEnd: shipQuery.createdRange?.[1] || ""
    });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "获取待发货订单失败");
  } finally {
    shipLoading.value = false;
  }
};

const resetShipQuery = async () => {
  shipQuery.orderNo = "";
  shipQuery.shippingType = "";
  shipQuery.createdRange = [];
  await loadPendingShipRows();
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatDateTime = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;
};

const delayDialogVisible = ref(false);
const delaySaving = ref(false);
const delayForm = reactive({
  id: 0,
  orderNo: "",
  expected_ship_time: "",
  reason: "特殊商品延迟发货",
  note: "",
  syncWechatSpecialReport: true
});

const openDelayDialog = (row: OrderRow) => {
  const fallbackDays = Math.max(1, Number(row.ship_deadline_days || 7));
  const fallbackDate = new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000);
  delayForm.id = Number(row.id);
  delayForm.orderNo = row.order_no;
  delayForm.expected_ship_time = row.expected_ship_time || formatDateTime(fallbackDate);
  delayForm.reason = row.delay_shipping_reason || "特殊商品延迟发货";
  delayForm.note = row.delay_shipping_note || "";
  delayForm.syncWechatSpecialReport = true;
  delayDialogVisible.value = true;
};

const handleDelaySave = async () => {
  if (!delayForm.id) {
    ElMessage.warning("未找到订单");
    return;
  }
  if (!delayForm.expected_ship_time) {
    ElMessage.warning("请选择预计发货时间");
    return;
  }
  if (!delayForm.reason.trim()) {
    ElMessage.warning("请选择延期原因");
    return;
  }
  delaySaving.value = true;
  try {
    const result = await delayOrderShipping({
      id: delayForm.id,
      expected_ship_time: delayForm.expected_ship_time,
      delay_shipping_reason: delayForm.reason.trim(),
      delay_shipping_note: delayForm.note.trim(),
      sync_wechat_special_report: delayForm.syncWechatSpecialReport,
      wechat_special_report_type: 1
    });
    if (delayForm.syncWechatSpecialReport) {
      if (result.wechatSpecialReport?.success) {
        ElMessage.success("发货时间已更新，并已同步微信特殊发货报备");
      } else if (result.wechatSpecialReport?.skipped) {
        ElMessage.warning(result.wechatSpecialReport.error || "发货时间已更新，微信报备已跳过");
      } else {
        ElMessage.warning(result.wechatSpecialReport?.error || "发货时间已更新，微信报备失败");
      }
    } else {
      ElMessage.success("发货时间已更新");
    }
    delayDialogVisible.value = false;
    await loadRows();
    if (shipDialogVisible.value) {
      await loadPendingShipRows();
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "调整发货时间失败");
  } finally {
    delaySaving.value = false;
  }
};

const openShipDialog = async () => {
  shipDialogVisible.value = true;
  shipForm.logistics_no = "";
  shipForm.mode = "sf";
  if (!SF_PRINT_TEMPLATES.some((item) => item.code === shipForm.sf_print_template_code)) {
    shipForm.sf_print_template_code = DEFAULT_SF_PRINT_TEMPLATE_CODE;
  }
  selectedShipIds.value = [];
  shipErrors.value = [];
  sfConfigured.value = null;
  shipQuery.orderNo = "";
  shipQuery.shippingType = "";
  shipQuery.createdRange = [];
  try {
    await loadPendingShipRows();
    sfHealth().then((res) => {
      sfConfigured.value = res.configured;
    }).catch(() => {
      sfConfigured.value = false;
    });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "获取待发货订单失败");
  }
};

const handleBatchShip = async () => {
  if (selectedShipIds.value.length === 0) {
    ElMessage.warning("请至少勾选一个订单");
    return;
  }

  if (shipForm.mode === "sf") {
    const selectedTemplateLabel = getSfPrintTemplateLabel(shipForm.sf_print_template_code);
    const selectedExpressTypeLabel = getSfExpressTypeLabel(shipForm.sf_express_type_id);
    try {
      await ElMessageBox.confirm(
        `确认通过顺丰电子面单为 ${selectedShipIds.value.length} 笔订单自动下单，快件产品为「${selectedExpressTypeLabel}」，并使用「${selectedTemplateLabel}」生成面单？打印确认后才会标记发货。`,
        "顺丰一键发货",
        { confirmButtonText: "确认", cancelButtonText: "取消", type: "warning" }
      );
    } catch {
      return;
    }

    shipping.value = true;
    shipErrors.value = [];
    const printWindow = window.open("", "sf-waybill-print", "width=900,height=700");
    if (printWindow && !printWindow.closed) {
      printWindow.document.write("<!doctype html><title>顺丰面单打印</title><body style=\"font-family: sans-serif; padding: 24px;\">正在向顺丰生成面单，请稍候...</body>");
      printWindow.document.close();
    } else {
      ElMessage.warning("浏览器可能拦截了打印窗口；若没有弹出，请允许本站弹窗后重试");
    }
    try {
      const selectedOrders = pendingRows.value.filter((r) => selectedShipIds.value.includes(r.id));
      const sfParams = selectedOrders.map((row) => ({
        orderId: row.id,
        d_contact: row.addr_name || "",
        d_tel: row.addr_phone || "",
        d_province: row.addr_province || "",
        d_city: row.addr_city || "",
        d_county: row.addr_district || "",
        d_address: row.addr_detail || "",
        expressTypeId: shipForm.sf_express_type_id || undefined
      }));
      const missing = sfParams.filter((p) => !p.d_contact || !p.d_tel || !p.d_address);
      if (missing.length > 0) {
        ElMessage.warning(`${missing.length} 笔订单缺少收货地址，请检查`);
        shipErrors.value = missing.map((p) => ({ id: p.orderId, error: "缺少收货地址" }));
        shipping.value = false;
        return;
      }
      const res = await sfBatchShip(sfParams);
      shipErrors.value = res.errors || [];
      if (res.shipped && res.shipped.length > 0) {
        ElMessage.success(`已生成 ${res.shipped.length} 个顺丰运单，准备打印 ${selectedTemplateLabel}`);
        const printed = await printSfWaybills(
          res.shipped.map((item) => item.waybillNo),
          printWindow,
          shipForm.sf_print_template_code
        );
        if (!printed) {
          ElMessage.warning("面单未确认打印，订单暂未标记发货，可重新点击一键发货重试");
          await loadPendingShipRows();
          return;
        }

        try {
          await ElMessageBox.confirm(
            "请确认面单已经成功打印。点“已打印并发货”后，订单才会变为已发货；如果打印窗口没有弹出或没有打出来，请点取消。",
            "确认打印结果",
            { confirmButtonText: "已打印并发货", cancelButtonText: "未打印，暂不发货", type: "warning" }
          );
        } catch {
          ElMessage.warning("未确认打印，订单暂未标记发货，可重新点击一键发货重试");
          await loadPendingShipRows();
          return;
        }

        const confirmResult = await sfConfirmShip(
          res.shipped
            .map((item) => ({ orderId: Number(item.localOrderId || 0), waybillNo: item.waybillNo }))
            .filter((item) => item.orderId > 0 && item.waybillNo)
        );
        if (confirmResult.errors && confirmResult.errors.length > 0) {
          shipErrors.value = confirmResult.errors;
          ElMessage.warning(`${confirmResult.errors.length} 笔订单确认发货失败，详情见下方列表`);
        }
        if (confirmResult.shipped && confirmResult.shipped.length > 0) {
          ElMessage.success(`已确认发货 ${confirmResult.shipped.length} 笔订单`);
        }
      }
      if (res.errors && res.errors.length > 0) {
        ElMessage.warning(`${res.errors.length} 笔订单生成面单失败，详情见下方列表`);
      }
      shipDialogVisible.value = shipErrors.value.length === 0;
      await loadRows();
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "顺丰发货失败");
    } finally {
      shipping.value = false;
    }
    return;
  }

  if (!shipForm.logistics_company) {
    ElMessage.warning("请选择物流公司");
    return;
  }
  if (!shipForm.logistics_no.trim()) {
    ElMessage.warning("请输入快递单号");
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认将 ${selectedShipIds.value.length} 笔订单发货？物流：${shipForm.logistics_company} / ${shipForm.logistics_no}`,
      "确认发货",
      { confirmButtonText: "确认", cancelButtonText: "取消", type: "warning" }
    );
  } catch {
    return;
  }

  shipping.value = true;
  try {
    const res = await shipOrders(selectedShipIds.value, shipForm.logistics_company, shipForm.logistics_no.trim());
    if (res.wechatShipping) {
      showWechatShippingSummary(res.wechatShipping);
    } else {
      ElMessage.success(`成功发货 ${res.shipped} 笔订单`);
    }
    shipDialogVisible.value = false;
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "发货失败");
  } finally {
    shipping.value = false;
  }
};

onMounted(async () => {
  await loadRows();
  timer = window.setInterval(() => {
    void loadRows();
  }, 900000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
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

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.pending-ship {
  color: #e6a23c;
  font-weight: 500;
}

.shipping-promise {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.4;
}

.ship-address {
  line-height: 1.5;
}

.ship-address-detail {
  color: #606266;
  font-size: 12px;
}

.address-region-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.expected-time {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}

.wechat-error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.4;
  max-height: 36px;
  overflow: hidden;
}

.text-secondary {
  color: #909399;
}

.ship-form {
  margin-bottom: 12px;
}

.sf-template-form {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #dce8d8;
  border-radius: 8px;
  background: #f7fbf4;
}

.ship-query {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.overdue-tag {
  margin-left: 6px;
}

.empty-ship {
  color: #909399;
  padding: 32px 0;
}
</style>
