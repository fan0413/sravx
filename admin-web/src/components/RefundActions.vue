<template>
  <el-button v-if="status === 'pending_review'" type="success" :loading="busy" :disabled="busy" @click="review('approve')">同意退款</el-button>
  <el-button v-if="status === 'pending_review'" type="danger" :disabled="busy" @click="review('reject')">拒绝退款</el-button>
  <el-button v-if="status === 'approved' || status === 'processing'" type="primary" :loading="busy" :disabled="busy" @click="execute">{{ status === 'processing' ? '重试原退款' : '执行退款' }}</el-button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { reviewAdminRefund, executeAdminRefund } from '../api/admin';
const props = defineProps<{ requestId: number; status: string; amount: string }>();
const emit = defineEmits<{ changed: [] }>();
const busy = ref(false);
async function review(decision: 'approve' | 'reject') {
  if (busy.value) return;
  busy.value = true;
  try {
    let adminNote = '';
    if (decision === 'approve') {
      await ElMessageBox.confirm(`同意 ¥${props.amount} 原路退款？审核后仍需点击“执行退款”。`, '同意退款', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' });
    } else {
      const result = await ElMessageBox.prompt('请填写拒绝原因', '拒绝退款', { confirmButtonText: '确定', cancelButtonText: '取消', inputValidator: (value: string) => value.trim().length > 0 && value.trim().length <= 255 || '请填写1至255字原因' });
      adminNote = result.value.trim();
    }
    await reviewAdminRefund({ requestId: props.requestId, decision, adminNote });
    ElMessage.success(decision === 'approve' ? '已同意，请执行退款' : '已拒绝退款');
    emit('changed');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '审核失败');
  } finally { busy.value = false; }
}
async function execute() {
  if (busy.value) return;
  busy.value = true;
  try {
    await ElMessageBox.confirm(`向微信发起 ¥${props.amount} 原路退款。重复操作沿用原退款单号，不重复扣款。是否继续？`, '执行真实退款', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' });
    await executeAdminRefund(props.requestId);
    ElMessage.success('退款请求已受理，以微信退款成功通知为准');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '退款结果尚未确认');
  } finally { busy.value = false; emit('changed'); }
}
</script>
