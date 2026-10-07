<template>
  <div class="user-detail-page" v-loading="loading">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>{{ targetOperations ? "用户资料" : "编辑用户" }}</span>
          <div class="header-actions">
            <el-button @click="goBack">返回</el-button>
            <el-button v-if="!targetOperations" type="primary" :loading="saving" @click="handleSave">保存</el-button>
          </div>
        </div>
      </template>

      <el-form :model="form" label-width="100px" class="base-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="用户ID">
              <el-input :model-value="String(form.id || '-')" disabled />
            </el-form-item>
          </el-col>
          <el-col v-if="!targetOperations" :span="12">
            <el-form-item label="OpenID">
              <el-input v-model="form.openid" disabled />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="用户名">
              <el-input v-model="form.username" placeholder="请输入用户名" :disabled="targetOperations" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机号">
              <el-input v-model="form.phone" placeholder="请输入手机号" :disabled="targetOperations" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="状态">
              <el-select v-model="form.status" :disabled="targetOperations">
                <el-option label="正常" value="active" />
                <el-option label="冻结" value="frozen" />
                <el-option label="已删除" value="deleted" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="会员等级">
              <el-input-number v-model="form.member_level" :min="1" :max="10" :disabled="targetOperations" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="积分">
              <el-input-number v-model="form.points" :min="0" :disabled="targetOperations" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-card v-if="!targetOperations" class="mt12">
      <template #header>历史下单</template>
      <el-table :data="orders" border>
        <el-table-column prop="id" label="订单ID" width="90" />
        <el-table-column prop="order_no" label="订单号" min-width="220" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            {{ getOrderStatusLabel(row.status) }}
          </template>
        </el-table-column>
        <el-table-column label="支付方式" width="100">
          <template #default="{ row }">
            {{ getPayTypeLabel(row.pay_type) }}
          </template>
        </el-table-column>
        <el-table-column prop="pay_amount" label="实付金额" width="110" />
        <el-table-column prop="created_at" label="创建时间" min-width="170" />
      </el-table>
    </el-card>

    <el-card class="mt12">
      <template #header>地址信息</template>
      <el-table :data="addresses" border>
        <el-table-column prop="id" label="地址ID" width="90" />
        <el-table-column prop="name" label="收货人" width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="完整地址" min-width="280">
          <template #default="{ row }">
            {{ [row.province, row.city, row.district, row.detail].filter(Boolean).join(" ") }}
          </template>
        </el-table-column>
        <el-table-column prop="tag" label="标签" width="100" />
        <el-table-column label="默认" width="70">
          <template #default="{ row }">
            {{ Number(row.is_default) === 1 ? "是" : "否" }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="!targetOperations" class="mt12">
      <template #header>优惠券情况</template>
      <el-table :data="coupons" border>
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="coupon_name" label="券名称" min-width="180" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            {{ getCouponTypeLabel(row.coupon_type) }}
          </template>
        </el-table-column>
        <el-table-column prop="coupon_value" label="面额/折扣" width="110" />
        <el-table-column prop="min_amount" label="门槛金额" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            {{ getCouponStatusLabel(row.status) }}
          </template>
        </el-table-column>
        <el-table-column prop="expire_time" label="过期时间" min-width="170" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { fetchAdminUserDetail, updateAdminUser } from "../../api/admin";
import { targetAdminOperationsModeEnabled } from "../../lib/target-admin-auth";

type AnyRecord = Record<string, any>;

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const targetOperations = targetAdminOperationsModeEnabled();
const orders = ref<AnyRecord[]>([]);
const addresses = ref<AnyRecord[]>([]);
const coupons = ref<AnyRecord[]>([]);

const form = reactive({
  id: 0,
  username: "",
  openid: "",
  phone: "",
  status: "active",
  member_level: 1,
  points: 0
});

const ORDER_STATUS_MAP: Record<string, string> = {
  pending_payment: "待付款",
  paid: "已支付",
  shipped: "已发货",
  received: "已收货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款"
};

const PAY_TYPE_MAP: Record<string, string> = {
  wechat: "微信支付",
  balance: "余额支付",
  other: "其他"
};

const COUPON_TYPE_MAP: Record<string, string> = {
  fixed: "满减券",
  percent: "折扣券"
};

const COUPON_STATUS_MAP: Record<string, string> = {
  unused: "未使用",
  used: "已使用",
  expired: "已过期"
};

const getOrderStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return ORDER_STATUS_MAP[key] || key || "-";
};

const getPayTypeLabel = (payType?: string) => {
  const key = String(payType || "").trim();
  return PAY_TYPE_MAP[key] || key || "-";
};

const getCouponTypeLabel = (couponType?: string) => {
  const key = String(couponType || "").trim();
  return COUPON_TYPE_MAP[key] || key || "-";
};

const getCouponStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return COUPON_STATUS_MAP[key] || key || "-";
};

const loadDetail = async () => {
  const id = Number(route.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    ElMessage.error("用户ID无效");
    return;
  }
  try {
    loading.value = true;
    const detail = await fetchAdminUserDetail(id);
    const user = (detail.user || {}) as AnyRecord;
    form.id = Number(user.id || 0);
    form.username = String(user.username || "");
    form.openid = String(user.openid || "");
    form.phone = String(user.phone || "");
    form.status = String(user.status || "active");
    form.member_level = Number(user.member_level || 1);
    form.points = Number(user.points || 0);
    orders.value = detail.orders || [];
    addresses.value = detail.addresses || [];
    coupons.value = detail.coupons || [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "读取用户详情失败");
  } finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  if (!form.id) return;
  if (!form.username.trim()) {
    ElMessage.warning("请输入用户名");
    return;
  }
  try {
    saving.value = true;
    await updateAdminUser({
      id: form.id,
      username: form.username.trim(),
      phone: form.phone.trim(),
      status: form.status,
      member_level: Number(form.member_level || 1),
      points: Number(form.points || 0)
    });
    ElMessage.success("用户信息已更新");
    await loadDetail();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  router.push("/user/list");
};

onMounted(async () => {
  await loadDetail();
});
</script>

<style scoped>
.user-detail-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.base-form {
  margin-top: 8px;
}

.mt12 {
  margin-top: 0;
}
</style>
