<template>
  <div class="login-page">
    <el-card class="login-card">
      <template #header>管理后台登录</template>
      <el-form :model="form" label-width="72px" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleLogin">登录</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { adminLogin } from "../../lib/admin-auth";

const router = useRouter();
const route = useRoute();
const submitting = ref(false);

const form = reactive({
  username: "",
  password: ""
});

const handleLogin = async () => {
  if (!form.username.trim()) {
    ElMessage.warning("请输入用户名");
    return;
  }
  if (!form.password) {
    ElMessage.warning("请输入密码");
    return;
  }

  submitting.value = true;
  try {
    await adminLogin(form.username.trim(), form.password);
    ElMessage.success("登录成功");
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/channel/common";
    await router.replace(redirect);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f6fb;
}

.login-card {
  width: 420px;
}
</style>

