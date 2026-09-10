<template>
  <el-card>
    <template #header>用户列表</template>
    <el-form :inline="true" :model="query" class="query-form">
      <el-form-item label="昵称">
        <el-input v-model="query.username" placeholder="请输入用户名" clearable />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="正常" value="active" />
          <el-option label="冻结" value="frozen" />
          <el-option label="已删除" value="deleted" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column prop="openid" label="OpenID" min-width="260" />
      <el-table-column prop="phone" label="手机号" min-width="120" />
      <el-table-column prop="member_level" label="会员等级" width="100" />
      <el-table-column prop="points" label="积分" width="100" />
      <el-table-column prop="total_spent" label="累计消费" width="110" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          {{ getUserStatusLabel(row.status) }}
        </template>
      </el-table-column>
      <el-table-column prop="last_login_at" label="最近登录" min-width="170" />
      <el-table-column prop="created_at" label="注册时间" min-width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
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
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { fetchUsersWithTotal } from "../../api/admin";
import type { UserRow } from "../../api/types";

const query = reactive({
  username: "",
  status: "",
  page: 1,
  pageSize: 50
});

const rows = ref<UserRow[]>([]);
const loading = ref(false);
const total = ref(0);
const router = useRouter();

const USER_STATUS_MAP: Record<string, string> = {
  active: "正常",
  frozen: "冻结",
  deleted: "已删除"
};

const getUserStatusLabel = (status?: string) => {
  const key = String(status || "").trim();
  return USER_STATUS_MAP[key] || key || "-";
};

const loadRows = async () => {
  try {
    loading.value = true;
    const result = await fetchUsersWithTotal(query);
    rows.value = result.list || [];
    total.value = Number(result.total || 0);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "用户数据读取失败");
  } finally {
    loading.value = false;
  }
};

const handleQuery = async () => {
  query.page = 1;
  await loadRows();
};

const handleReset = async () => {
  query.username = "";
  query.status = "";
  query.page = 1;
  await loadRows();
};

const handlePageChange = async (page: number) => {
  query.page = page;
  await loadRows();
};

const handleEdit = (row: UserRow) => {
  router.push(`/user/detail/${row.id}`);
};

onMounted(async () => {
  await loadRows();
});
</script>

<style scoped>
.query-form {
  margin-bottom: 16px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
