<template>
  <el-card>
    <template #header>
      <div class="header-row">
        <div>
          <div>型号、颜色与 SKU</div>
          <div class="subtle">商品 #{{ productId }} · 保存只更新目录配置，不会发布商品或创建订单。</div>
        </div>
        <div>
          <el-button :loading="loading" @click="load">刷新</el-button>
          <el-button @click="router.push(`/product/edit/${productId}`)">返回商品</el-button>
        </div>
      </div>
    </template>

    <el-alert
      title="结构化 SKU 需在迁移演练完成后开启。未开启时本页面只会提示，不会写入任何数据。"
      type="info"
      :closable="false"
      class="notice"
    />

    <template v-if="ready">
      <el-form label-width="112px" class="base-form">
        <el-form-item label="所属系列"><el-input v-model="form.series" maxlength="32" placeholder="如 Pro" /></el-form-item>
        <el-form-item label="工具用途"><el-input v-model="form.toolGroup" maxlength="64" placeholder="如 直剪、弯剪" /></el-form-item>
        <el-form-item label="工具形态"><el-input v-model="form.toolSubtype" maxlength="64" placeholder="如 鱼骨剪" /></el-form-item>
        <el-form-item label="展示尺寸"><el-input v-model="form.displaySize" maxlength="32" placeholder="如 7.0 英寸" /></el-form-item>
        <el-form-item label="钢材材质"><el-input v-model="form.steelMaterial" maxlength="128" placeholder="如 440C" /></el-form-item>
      </el-form>

      <section>
        <div class="section-head"><h3>型号</h3><el-button text type="primary" @click="addModel">添加型号</el-button></div>
        <div v-for="(model, index) in models" :key="model.key" class="row-grid two">
          <el-input v-model="model.name" maxlength="80" placeholder="如 7.0 英寸" />
          <el-button text type="danger" :disabled="models.length === 1" @click="models.splice(index, 1)">删除</el-button>
        </div>
      </section>

      <section>
        <div class="section-head"><h3>颜色</h3><el-button text type="primary" @click="addColor">添加颜色</el-button></div>
        <div v-for="(color, index) in colors" :key="color.key" class="row-grid color-row">
          <el-input v-model="color.name" maxlength="80" placeholder="如 深空黑" />
          <el-input v-model="color.swatch" maxlength="32" placeholder="#111111" />
          <el-button text type="danger" :disabled="colors.length === 1" @click="colors.splice(index, 1)">删除</el-button>
        </div>
      </section>

      <section>
        <div class="section-head"><h3>可售 SKU 组合</h3><el-button text type="primary" @click="addSku">添加组合</el-button></div>
        <div v-for="(sku, index) in skus" :key="sku.key" class="sku-row">
          <el-select v-model="sku.modelName" placeholder="型号"><el-option v-for="model in models" :key="model.key" :label="model.name || '未命名型号'" :value="model.name" /></el-select>
          <el-select v-model="sku.colorName" placeholder="颜色"><el-option v-for="color in colors" :key="color.key" :label="color.name || '未命名颜色'" :value="color.name" /></el-select>
          <el-input v-model="sku.skuCode" maxlength="64" placeholder="SKU 编码" />
          <el-input-number v-model="sku.priceYuan" :min="0" :precision="2" :step="10" controls-position="right" />
          <el-input-number v-model="sku.stockAvailable" :min="0" :step="1" controls-position="right" />
          <el-select v-model="sku.shippingType"><el-option label="普通现货" value="normal" /><el-option label="预售" value="presale" /><el-option label="定制" value="custom" /><el-option label="特殊延迟" value="delayed" /></el-select>
          <el-input-number v-model="sku.shipDeadlineDays" :min="0" :max="365" controls-position="right" />
          <el-input v-model="sku.shippingPromise" maxlength="255" placeholder="如 48 小时内发货" />
          <el-switch v-model="sku.isOnSale" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" />
          <el-button text type="danger" :disabled="skus.length === 1" @click="skus.splice(index, 1)">删除</el-button>
        </div>
      </section>

      <div class="actions"><el-button type="primary" :loading="saving" @click="save">保存 SKU 配置</el-button></div>
    </template>
    <el-empty v-else-if="!loading" description="结构化 SKU 尚未启用或商品不存在" />
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { fetchStructuredProductVariants, replaceStructuredProductVariants, type StructuredProductVariantInput } from "../../api/admin";

type ModelEditor = { key: number; name: string };
type ColorEditor = { key: number; name: string; swatch: string };
type SkuEditor = { key: number; modelName: string; colorName: string; skuCode: string; priceYuan: number; stockAvailable: number; isOnSale: number; shippingType: "normal" | "presale" | "custom" | "delayed"; shipDeadlineDays: number; shippingPromise: string };
const route = useRoute();
const router = useRouter();
const productId = Number(route.params.id);
const loading = ref(false);
const saving = ref(false);
const ready = ref(false);
let seed = 0;
const form = reactive({ series: "", toolGroup: "", toolSubtype: "", displaySize: "", steelMaterial: "" });
const models = ref<ModelEditor[]>([]);
const colors = ref<ColorEditor[]>([]);
const skus = ref<SkuEditor[]>([]);
const nextKey = () => ++seed;
const addModel = () => models.value.push({ key: nextKey(), name: "" });
const addColor = () => colors.value.push({ key: nextKey(), name: "", swatch: "" });
const addSku = () => skus.value.push({ key: nextKey(), modelName: models.value[0]?.name || "", colorName: colors.value[0]?.name || "", skuCode: "", priceYuan: 0, stockAvailable: 0, isOnSale: 1, shippingType: "normal", shipDeadlineDays: 2, shippingPromise: "48 小时内发货" });

async function load() {
  if (!Number.isInteger(productId) || productId < 1) return;
  loading.value = true;
  try {
    const data = await fetchStructuredProductVariants(productId);
    form.series = String(data.series || ""); form.toolGroup = String(data.tool_group || ""); form.toolSubtype = String(data.tool_subtype || ""); form.displaySize = String(data.display_size || ""); form.steelMaterial = String(data.steel_material || "");
    models.value = data.models.map((item) => ({ key: nextKey(), name: item.name }));
    colors.value = data.colors.map((item) => ({ key: nextKey(), name: item.name, swatch: item.swatch || "" }));
    skus.value = data.skus.map((item) => ({ key: nextKey(), modelName: item.model_name, colorName: item.color_name, skuCode: item.sku_code, priceYuan: Number(item.price_fen) / 100, stockAvailable: Number(item.stock_available), isOnSale: Number(item.is_on_sale), shippingType: item.shipping_type as SkuEditor["shippingType"], shipDeadlineDays: Number(item.ship_deadline_days), shippingPromise: item.shipping_promise }));
    if (!models.value.length) addModel(); if (!colors.value.length) addColor(); if (!skus.value.length) addSku();
    ready.value = true;
  } catch (error) {
    ready.value = false;
    ElMessage.error(error instanceof Error ? error.message : "加载 SKU 配置失败");
  } finally { loading.value = false; }
}

function payload(): StructuredProductVariantInput {
  return {
    ...form,
    models: models.value.map((item, index) => ({ name: item.name.trim(), sortOrder: index })),
    colors: colors.value.map((item, index) => ({ name: item.name.trim(), swatch: item.swatch.trim(), sortOrder: index })),
    skus: skus.value.map((item, index) => ({ modelName: item.modelName.trim(), colorName: item.colorName.trim(), skuCode: item.skuCode.trim(), priceFen: Math.round(Number(item.priceYuan) * 100), stockAvailable: Math.floor(Number(item.stockAvailable)), isOnSale: item.isOnSale, shippingType: item.shippingType, shipDeadlineDays: Math.floor(Number(item.shipDeadlineDays)), shippingPromise: item.shippingPromise.trim(), sortOrder: index }))
  };
}

async function save() {
  const next = payload();
  if (next.models.some((item) => !item.name) || next.colors.some((item) => !item.name) || next.skus.some((item) => !item.modelName || !item.colorName || !item.skuCode || !item.shippingPromise || item.priceFen < 0 || item.stockAvailable < 0)) { ElMessage.warning("请完整填写型号、颜色和每个 SKU 的编码、价格、库存与发货承诺"); return; }
  try { await ElMessageBox.confirm("保存会更新 SKU 可售状态和库存汇总；未列出的旧 SKU 将下架但不会删除。", "确认保存 SKU 配置", { confirmButtonText: "保存", cancelButtonText: "返回修改", type: "warning" }); } catch { return; }
  saving.value = true;
  try { await replaceStructuredProductVariants(productId, next); ElMessage.success("SKU 配置已保存"); await load(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : "保存 SKU 配置失败"); } finally { saving.value = false; }
}

void load();
</script>

<style scoped>
.header-row,.section-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.subtle{margin-top:6px;color:#909399;font-size:13px}.notice{margin-bottom:24px}.base-form{max-width:640px}section{margin-top:28px;padding-top:18px;border-top:1px solid #ebeef5}h3{margin:0;font-size:15px}.row-grid{display:grid;gap:10px;align-items:center;margin-top:10px}.two{grid-template-columns:minmax(240px,480px) auto}.color-row{grid-template-columns:minmax(180px,340px) minmax(150px,260px) auto}.sku-row{display:grid;grid-template-columns:150px 150px minmax(150px,1fr) 130px 130px 130px 120px minmax(180px,1fr) 92px auto;gap:10px;align-items:center;margin-top:10px}.actions{margin-top:28px}@media (max-width:1200px){.sku-row{grid-template-columns:repeat(2,minmax(180px,1fr))}.two,.color-row{grid-template-columns:1fr auto}}
</style>
