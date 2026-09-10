<template>
  <el-card>
    <template #header>合作咨询管理</template>

    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="搜索">
        <el-input v-model="query.keyword" placeholder="姓名/电话/微信/地址" clearable style="width: 240px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 140px">
          <el-option label="待处理" :value="0" />
          <el-option label="已联系" :value="1" />
          <el-option label="已合作" :value="2" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="inquiry-cards">
      <div v-for="row in rows" :key="row.id" class="inquiry-card" :class="{ contacted: row.status === 1, cooperated: row.status === 2 }">
        <el-form label-width="90px" class="card-form">
          <div class="card-header">
            <span class="card-id">#{{ row.id }}</span>
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            <span class="card-date">{{ formatDate(row.created_at) }}</span>
          </div>

          <div class="card-body">
            <el-form-item label="姓名">
              <span class="field-value">{{ row.name }}</span>
            </el-form-item>
            <el-form-item label="性别">
              <span class="field-value">{{ row.gender }}</span>
            </el-form-item>
            <el-form-item label="规模">
              <span class="field-value">{{ row.scale }}</span>
            </el-form-item>
            <el-form-item label="电话">
              <span class="field-value">{{ row.phone }}</span>
            </el-form-item>
            <el-form-item label="微信">
              <span class="field-value">{{ row.wechat || "-" }}</span>
            </el-form-item>
            <el-form-item label="地址">
              <span class="field-value">{{ row.address || "-" }}</span>
            </el-form-item>
            <el-form-item label="合作意向" class="intention-item">
              <span class="field-value intention-text">{{ row.intention || "-" }}</span>
            </el-form-item>
          </div>

          <div class="card-actions">
            <el-button
              v-if="row.status === 0"
              type="primary"
              size="small"
              @click="handleMark(row, 1)"
            >
              标记已联系
            </el-button>
            <el-button
              v-if="row.status !== 2"
              type="success"
              size="small"
              @click="handleMark(row, 2)"
            >
              标记已合作
            </el-button>
            <el-button
              v-if="row.status !== 0"
              type="warning"
              size="small"
              plain
              @click="handleMark(row, 0)"
            >
              重置待处理
            </el-button>
          </div>
        </el-form>
      </div>

      <div v-if="!rows.length && !loading" class="empty-state">
        暂无合作咨询记录
      </div>
    </div>

    <div class="pagination" v-if="total > 0">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        @current-change="handlePageChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { fetchInquiries, updateInquiryStatus, type InquiryRow, type InquiryQuery } from "@/api/admin";

const query = reactive<InquiryQuery>({
  keyword: "",
  status: undefined,
  page: 1,
  pageSize: 20
});

const rows = ref<InquiryRow[]>([]);
const total = ref(0);
const loading = ref(false);

const statusLabel = (s: number) => {
  const map: Record<number, string> = { 0: "待处理", 1: "已联系", 2: "已合作" };
  return map[s] || "未知";
};

const statusTag = (s: number) => {
  const map: Record<number, string> = { 0: "warning", 1: "primary", 2: "success" };
  return map[s] || "info";
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const d = new Date(String(value).replace(/\.\d+Z$/, ""));
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const loadRows = async () => {
  loading.value = true;
  try {
    const result = await fetchInquiries(query);
    rows.value = result.list;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "合作咨询数据读取失败");
  } finally {
    loading.value = false;
  }
};

const handleQuery = () => {
  query.page = 1;
  loadRows();
};

const handleReset = () => {
  query.keyword = "";
  query.status = undefined;
  query.page = 1;
  loadRows();
};

const handlePageChange = (page: number) => {
  query.page = page;
  loadRows();
};

const handleMark = async (row: InquiryRow, status: number) => {
  try {
    await updateInquiryStatus(row.id, status);
    row.status = status;
    ElMessage.success(`已标记为${statusLabel(status)}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "更新状态失败");
  }
};

onMounted(() => {
  loadRows();
});
</script>

<style scoped>
.query-form {
  margin-bottom: 16px;
}

.inquiry-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

.inquiry-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  transition: box-shadow 0.2s;
}

.inquiry-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.inquiry-card.contacted {
  border-left: 3px solid #409eff;
}

.inquiry-card.cooperated {
  border-left: 3px solid #67c23a;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
}

.card-id {
  font-weight: 700;
  color: #909399;
  font-size: 13px;
}

.card-date {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}

.card-body {
  padding: 4px 0;
}

.card-body :deep(.el-form-item) {
  margin-bottom: 4px;
}

.card-body :deep(.el-form-item__label) {
  color: #909399;
  font-size: 12px;
  line-height: 24px;
}

.field-value {
  font-size: 14px;
  color: #303133;
  line-height: 24px;
}

.intention-item :deep(.el-form-item__content) {
  line-height: 1.6;
}

.intention-text {
  white-space: pre-wrap;
  word-break: break-all;
}

.card-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 8px;
}

.empty-state {
  color: #909399;
  text-align: center;
  padding: 48px 0;
  grid-column: 1 / -1;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
