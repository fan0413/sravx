<template>
  <el-card>
    <template #header>{{ isEditMode ? "编辑积分商品" : "新建积分商品" }}</template>
    <el-form label-width="120px" class="form">
      <el-form-item label="关联商品">
        <el-select
          v-model="selectedProductId"
          filterable
          remote
          reserve-keyword
          clearable
          placeholder="搜索普通商品并带入资料（可选）"
          :remote-method="searchProducts"
          :loading="productSearchLoading || productDetailLoading"
          style="width: 400px"
          @change="onProductSelect"
        >
          <el-option
            v-for="item in productOptions"
            :key="item.id"
            :label="`${item.name} (ID:${item.id})`"
            :value="item.id"
          />
        </el-select>
        <span class="hint-tip">可选。选择后会带入普通商品资料；不选择则作为独立积分商品展示。</span>
      </el-form-item>

      <el-form-item v-if="linkedProductName" label="商品信息">
        <div class="product-info-card">
          <el-image v-if="linkedCover" :src="linkedCover" style="width:80px;height:80px;border-radius:6px" />
          <div class="product-info-text">
            <div class="product-info-name">{{ linkedProductName }}</div>
            <div class="product-info-price">¥{{ linkedPrice }}</div>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="积分商品名称" required>
        <el-input v-model="form.name" placeholder="用户端积分商品列表和详情展示的名称" style="width: 460px" />
      </el-form-item>
      <el-form-item label="短名称">
        <el-input v-model="form.short_name" placeholder="可选，用于较窄位置展示" style="width: 460px" />
      </el-form-item>
      <el-form-item label="商品简介">
        <el-input
          v-model="form.desc"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="可选，用户端详情页说明"
          style="width: 560px"
        />
      </el-form-item>
      <el-form-item label="积分商品图片" required>
        <div class="image-uploader-row">
          <div class="uploader-wrap">
            <div class="upload-title">封面图</div>
            <el-upload
              v-model:file-list="coverUploadFiles"
              list-type="picture-card"
              :auto-upload="false"
              :on-change="syncCoverImages"
              :on-remove="syncCoverImages"
              :on-exceed="handleCoverExceed"
              accept="image/*"
              :limit="1"
              :multiple="false"
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
          </div>
          <div class="uploader-wrap">
            <div class="upload-title">轮播图</div>
            <el-upload
              v-model:file-list="galleryUploadFiles"
              list-type="picture-card"
              :auto-upload="false"
              :on-change="syncGalleryImages"
              :on-remove="syncGalleryImages"
              accept="image/*"
              multiple
              :limit="7"
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="积分价格">
        <el-input-number v-model="form.points_price" :min="0" :step="100" />
      </el-form-item>
      <el-form-item label="支持混合支付">
        <el-radio-group v-model="form.support_mixed_pay">
          <el-radio :value="1">是</el-radio>
          <el-radio :value="0">否</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.support_mixed_pay === 1" label="现金价格(元)">
        <el-input-number v-model="form.cash_price" :min="0" :precision="2" :step="1" />
      </el-form-item>
      <el-form-item label="最低会员等级">
        <el-select v-model="form.min_member_level" style="width: 140px">
          <el-option v-for="lv in 6" :key="lv" :label="`LV ${lv}`" :value="lv" />
        </el-select>
      </el-form-item>

      <el-form-item label="库存">
        <el-input-number v-if="!isEditMode" v-model="form.stock_total" :min="0" :step="10" />
        <div v-else class="stock-line">
          <el-input-number v-model="form.add_stock" :step="10" />
          <span class="stock-tip">当前可用库存：{{ form.stock_available }}</span>
        </div>
      </el-form-item>

      <el-form-item label="规格配置">
        <div class="spec-editor">
          <div v-for="(spec, index) in specRows" :key="index" class="spec-editor-row">
            <el-upload
              v-model:file-list="spec.uploadFiles"
              list-type="picture-card"
              :auto-upload="false"
              :on-change="createSpecUploadChangeHandler(spec)"
              :on-remove="createSpecUploadRemoveHandler(spec)"
              :on-exceed="createSpecUploadExceedHandler(spec)"
              accept="image/*"
              :limit="1"
              :multiple="false"
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
            <el-input v-model="spec.name" placeholder="规格名称，如：基础款" />
            <el-input-number v-model="spec.points_price" :min="0" :step="100" placeholder="积分价" />
            <el-input-number v-if="form.support_mixed_pay === 1" v-model="spec.cash_price" :min="0" :precision="2" placeholder="现金价" />
            <el-button text type="danger" :disabled="specRows.length <= 1" @click="removeSpecRow(index)">
              删除
            </el-button>
          </div>
          <el-button text type="primary" @click="addSpecRow">+ 新增规格</el-button>
        </div>
      </el-form-item>

      <el-form-item label="排序权重">
        <el-input-number v-model="form.sort_order" :min="0" />
      </el-form-item>
      <el-form-item label="上架状态">
        <el-radio-group v-model="form.is_on_sale">
          <el-radio :value="1">上架</el-radio>
          <el-radio :value="0">下架</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEditMode ? "更新" : "保存" }}
        </el-button>
        <el-button @click="router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  createPointsProduct,
  fetchPointsProductDetail,
  updatePointsProduct,
  fetchAdminProducts,
  fetchAdminProductDetail,
  resolveAdminFileUrls,
  uploadAdminImages,
  type CreatePointsProductInput,
  type PointsProductRow
} from "@/api/admin";
import type { ProductRow } from "@/api/types";
import type { UploadFile, UploadFiles, UploadRawFile, UploadUserFile } from "element-plus";

const route = useRoute();
const router = useRouter();
const isEditMode = computed(() => {
  const id = Number(route.params.id);
  return Number.isFinite(id) && id > 0;
});
const editingId = computed(() => Number(route.params.id || 0));
const saving = ref(false);

const form = reactive<CreatePointsProductInput & { stock_available?: number }>({
  product_id: 0,
  name: "",
  short_name: "",
  desc: "",
  cover_image: "",
  images: [],
  detail_images: [],
  category_id: null,
  points_price: 0,
  cash_price: 0,
  stock_total: 0,
  add_stock: 0,
  min_member_level: 1,
  support_mixed_pay: 0,
  is_on_sale: 1,
  sort_order: 0,
  specs: [],
  stock_available: 0
});

const selectedProductId = ref<number | undefined>();
const productSearchLoading = ref(false);
const productDetailLoading = ref(false);
const productOptions = ref<ProductRow[]>([]);

const linkedProductName = ref("");
const linkedCover = ref("");
const linkedPrice = ref("");
const coverUploadFiles = ref<UploadUserFile[]>([]);
const galleryUploadFiles = ref<UploadUserFile[]>([]);

type SpecEditorRow = {
  name: string;
  image: string;
  points_price: number;
  cash_price: number;
  uploadFiles: UploadUserFile[];
};
type StoredUploadUserFile = UploadUserFile & { storedUrl?: string };
const createSpecRow = (): SpecEditorRow => ({
  name: "",
  image: "",
  points_price: 0,
  cash_price: 0,
  uploadFiles: []
});
const specRows = ref<SpecEditorRow[]>([createSpecRow()]);

const buildUploadFilesFromUrls = (items: Array<{ raw: string; preview: string }>) =>
  items.map((item, idx) => ({
    name: `image-${idx + 1}`,
    url: item.preview || item.raw,
    storedUrl: item.raw || item.preview
  })) as StoredUploadUserFile[];

const getRawFile = (file: UploadUserFile): File | null => (file.raw instanceof File ? file.raw : null);

const resolveUploadUrls = async (files: UploadUserFile[], folder: string) => {
  const result: string[] = [];
  const pending: File[] = [];
  const pendingIndexes: number[] = [];
  files.forEach((file, index) => {
    const raw = getRawFile(file);
    if (raw) {
      pending.push(raw);
      pendingIndexes.push(index);
      result[index] = "";
      return;
    }
    result[index] = String((file as StoredUploadUserFile).storedUrl || file.url || "").trim();
  });
  if (pending.length > 0) {
    const uploaded = await uploadAdminImages(pending, folder);
    pendingIndexes.forEach((idx, offset) => {
      result[idx] = uploaded[offset] || "";
    });
  }
  return result.filter(Boolean);
};

const syncCoverImages = (_file?: UploadFile, files?: UploadFiles) => {
  const currentFiles = (files || coverUploadFiles.value) as UploadUserFile[];
  const first = currentFiles[0];
  form.cover_image = first ? first.url || (first.raw ? URL.createObjectURL(first.raw) : "") : "";
};

const syncGalleryImages = (_file?: UploadFile, files?: UploadFiles) => {
  const currentFiles = (files || galleryUploadFiles.value) as UploadUserFile[];
  form.images = currentFiles
    .map((file) => file.url || (file.raw ? URL.createObjectURL(file.raw) : ""))
    .filter(Boolean);
};

const handleCoverExceed = (files: UploadRawFile[]) => {
  const latest = files[files.length - 1];
  if (!latest) return;
  if (!latest.uid) latest.uid = Date.now();
  coverUploadFiles.value = [{ name: latest.name, url: URL.createObjectURL(latest), raw: latest }];
  syncCoverImages(undefined, coverUploadFiles.value as UploadFiles);
};

const toImageList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [text];
  }
};

const resolvePreviewUrl = async (raw: string) => {
  const value = raw.trim();
  if (!value || !value.startsWith("cloud://")) return value;
  const map = await resolveAdminFileUrls([value]);
  return map[value] || value;
};

const getProductField = (product: Partial<ProductRow> | Record<string, unknown>, key: string) =>
  (product as Record<string, unknown>)[key];

const syncLinkedProductInfo = (product: Partial<ProductRow> | Record<string, unknown>) => {
  linkedProductName.value = String(getProductField(product, "name") || "");
  linkedCover.value = String(getProductField(product, "cover_image") || "");
  linkedPrice.value = String(getProductField(product, "price") || "");
};

const buildProductOption = (product: Record<string, unknown>): ProductRow => ({
  id: Number(product.id || 0),
  name: String(product.name || ""),
  short_name: String(product.short_name || ""),
  desc: String(product.desc || ""),
  price: String(product.price || "0"),
  category_id: Number(product.category_id || 0),
  cover_image: String(product.cover_image || ""),
  images: typeof product.images === "string" ? product.images : JSON.stringify(toImageList(product.images)),
  detail_images: typeof product.detail_images === "string" ? product.detail_images : "",
  core_material: String(product.core_material || ""),
  handle_material: String(product.handle_material || ""),
  size: String(product.size || ""),
  weight: String(product.weight || ""),
  warranty_period: String(product.warranty_period || ""),
  warranty_months: Number(product.warranty_months || 0),
  scissors_card_image: String(product.scissors_card_image || ""),
  stock: Number(product.stock || 0),
  is_on_sale: Number(product.is_on_sale || 1),
  is_recommend: Number(product.is_recommend || 0),
  allow_coupon: Number(product.allow_coupon || 0),
  has_spec: Number(product.has_spec || 0),
  sort_order: Number(product.sort_order || 0),
  sales_count: Number(product.sales_count || 0),
  specs: Array.isArray(product.specs) ? product.specs as ProductRow["specs"] : [],
  created_at: String(product.created_at || ""),
  updated_at: String(product.updated_at || "")
});

const shouldAutoFillSpecs = () =>
  !isEditMode.value ||
  specRows.value.length === 0 ||
  specRows.value.every((row) => !row.name.trim() && row.uploadFiles.length === 0);

const fillSpecsFromProduct = async (product: Record<string, unknown>) => {
  if (!shouldAutoFillSpecs()) return;
  const productSpecs = Array.isArray(product.specs) ? product.specs as Array<Record<string, unknown>> : [];
  const sourceSpecs = productSpecs.length > 0
    ? productSpecs
    : [{
        name: "默认",
        image: String(product.cover_image || ""),
        price: product.price
      }];
  const rawImages = sourceSpecs.map((item) => String(item.image || "").trim()).filter(Boolean);
  const cloudIds = rawImages.filter((item) => item.startsWith("cloud://"));
  const urlMap = cloudIds.length > 0 ? await resolveAdminFileUrls(cloudIds) : {};
  specRows.value = sourceSpecs.map((item) => {
    const rawImage = String(item.image || "").trim();
    const preview = rawImage.startsWith("cloud://") ? urlMap[rawImage] || rawImage : rawImage;
    return {
      name: String(item.name || "默认"),
      image: preview,
      points_price: Number(form.points_price || 0),
      cash_price: Number(form.cash_price || 0),
      uploadFiles: rawImage ? buildUploadFilesFromUrls([{ raw: rawImage, preview }]) : []
    };
  });
};

const searchProducts = async (query: string) => {
  if (!query.trim()) {
    productOptions.value = [];
    return;
  }
  productSearchLoading.value = true;
  try {
    const result = await fetchAdminProducts({ keyword: query.trim(), pageSize: 20 });
    productOptions.value = result.list;
  } finally {
    productSearchLoading.value = false;
  }
};

const onProductSelect = async (productId: number | undefined) => {
  form.product_id = productId || 0;
  if (!productId) {
    linkedProductName.value = "";
    linkedCover.value = "";
    linkedPrice.value = "";
    return;
  }
  const found = productOptions.value.find((p) => p.id === productId);
  if (found) {
    syncLinkedProductInfo(found);
  }
  productDetailLoading.value = true;
  try {
    const detail = await fetchAdminProductDetail(productId);
    syncLinkedProductInfo(detail);
    const rawCover = String(detail.cover_image || "");
    linkedCover.value = await resolvePreviewUrl(rawCover);
    form.name = String(detail.name || form.name || "");
    form.short_name = String(detail.short_name || form.short_name || "");
    form.desc = String(detail.desc || detail.detail || form.desc || "");
    form.category_id = Number(detail.category_id || 0) || null;
    const rawImages = toImageList(detail.images);
    const cloudIds = [rawCover, ...rawImages].filter((item) => item.startsWith("cloud://"));
    const urlMap = cloudIds.length > 0 ? await resolveAdminFileUrls(cloudIds) : {};
    if (rawCover) {
      coverUploadFiles.value = buildUploadFilesFromUrls([{ raw: rawCover, preview: urlMap[rawCover] || rawCover }]);
      syncCoverImages(undefined, coverUploadFiles.value as UploadFiles);
    }
    galleryUploadFiles.value = (rawImages.length > 0 ? rawImages : rawCover ? [rawCover] : [])
      .map((raw, index) => ({
        name: `image-${index + 1}`,
        url: urlMap[raw] || raw,
        storedUrl: raw
      })) as StoredUploadUserFile[];
    syncGalleryImages(undefined, galleryUploadFiles.value as UploadFiles);
    if (!productOptions.value.some((item) => item.id === productId)) {
      productOptions.value.push(buildProductOption(detail));
    }
    await fillSpecsFromProduct(detail);
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : "关联商品详情加载失败");
  } finally {
    productDetailLoading.value = false;
  }
};

const syncLinkedProduct = (detail: PointsProductRow) => {
  const productId = Number(detail.product_id || 0);
  form.product_id = productId;
  selectedProductId.value = productId > 0 ? productId : undefined;

  if (productId <= 0) {
    linkedProductName.value = "";
    linkedCover.value = "";
    linkedPrice.value = "";
    return;
  }

  linkedProductName.value = detail.name || `商品 #${productId}`;
  linkedCover.value = detail.cover_image || "";
  linkedPrice.value = "";
  if (!productOptions.value.some((item) => item.id === productId)) {
    productOptions.value.push({
      id: productId,
      name: linkedProductName.value,
      short_name: detail.short_name || "",
      cover_image: detail.cover_image || "",
      images: detail.images || [],
      category_id: detail.category_id || 0,
      price: "0",
      stock: 0,
      is_on_sale: 1,
      is_recommend: 0,
      sort_order: 0
    } as ProductRow);
  }
};

const addSpecRow = () => specRows.value.push(createSpecRow());
const removeSpecRow = (index: number) => specRows.value.splice(index, 1);

const syncSpecImages = (spec: SpecEditorRow, files: UploadFiles) => {
  const first = (files?.[0] || null) as UploadUserFile | null;
  if (!first) { spec.image = ""; return; }
  spec.image = first.url || (first.raw ? URL.createObjectURL(first.raw) : "");
};
const createSpecUploadChangeHandler = (spec: SpecEditorRow) => (_file: UploadFile, files: UploadFiles) => {
  syncSpecImages(spec, files);
};
const createSpecUploadRemoveHandler = (spec: SpecEditorRow) => (_file: UploadFile, files: UploadFiles) => {
  syncSpecImages(spec, files);
};
const createSpecUploadExceedHandler = (spec: SpecEditorRow) => (files: UploadRawFile[]) => {
  const latest = files[files.length - 1];
  if (!latest) return;
  if (!latest.uid) latest.uid = Date.now();
  spec.uploadFiles = [{ name: latest.name, url: URL.createObjectURL(latest), raw: latest }];
  syncSpecImages(spec, spec.uploadFiles as UploadFiles);
};

const loadDetail = async () => {
  if (!isEditMode.value) return;
  const detail = await fetchPointsProductDetail(editingId.value);
  if (!detail) return;

  form.id = detail.id;
  syncLinkedProduct(detail);
  form.name = detail.name || "";
  form.short_name = detail.short_name || "";
  form.desc = String(detail.desc || "");
  form.cover_image = detail.cover_image || "";
  form.images = toImageList(detail.images);
  form.detail_images = toImageList(detail.detail_images);
  form.category_id = detail.category_id || null;
  form.points_price = Number(detail.points_price || 0);
  form.cash_price = Number(detail.cash_price || 0);
  form.stock_total = Number(detail.stock_total || 0);
  form.min_member_level = Number(detail.min_member_level || 1);
  form.support_mixed_pay = Number(detail.support_mixed_pay || 0);
  form.is_on_sale = Number(detail.is_on_sale || 0) === 0 ? 0 : 1;
  form.sort_order = Number(detail.sort_order || 0);
  form.stock_available = Number(detail.stock_available || 0);

  const specs = Array.isArray(detail.specs) ? detail.specs : [];
  const coverRaw = String(detail.raw_cover_image || detail.cover_image || "");
  const imageRaws = Array.isArray(detail.raw_images) && detail.raw_images.length > 0
    ? detail.raw_images
    : toImageList(detail.images);
  const mediaCloudIds = [coverRaw, ...imageRaws].filter((item) => item.startsWith("cloud://"));
  const mediaUrlMap = mediaCloudIds.length > 0 ? await resolveAdminFileUrls(mediaCloudIds) : {};
  coverUploadFiles.value = coverRaw ? buildUploadFilesFromUrls([{ raw: coverRaw, preview: mediaUrlMap[coverRaw] || coverRaw }]) : [];
  galleryUploadFiles.value = imageRaws.map((raw, index) => ({
    name: `image-${index + 1}`,
    url: mediaUrlMap[raw] || raw,
    storedUrl: raw
  })) as StoredUploadUserFile[];
  if (specs.length > 0) {
    const specImageUrls = specs.map((s) => String(s.image || "")).filter(Boolean);
    const urlMap = specImageUrls.length > 0 ? await resolveAdminFileUrls(specImageUrls) : {};
    specRows.value = specs.map((row) => {
      const rawImage = String(row.raw_image || row.image || "");
      const image = urlMap[rawImage] || String(row.image || "");
      return {
        name: String(row.name || ""),
        image,
        points_price: Number(row.points_price || 0),
        cash_price: Number(row.cash_price || 0),
        uploadFiles: rawImage ? buildUploadFilesFromUrls([{ raw: rawImage, preview: image }]) : []
      };
    });
  } else {
    specRows.value = [createSpecRow()];
  }
};

onMounted(async () => {
  try {
    if (isEditMode.value) await loadDetail();
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : "积分商品详情加载失败");
  }
});

const handleSave = async () => {
  if (form.points_price <= 0) {
    ElMessage.warning("积分价格必须大于 0");
    return;
  }
  if (!String(form.name || "").trim()) {
    ElMessage.warning("请填写积分商品名称");
    return;
  }
  if (coverUploadFiles.value.length === 0) {
    ElMessage.warning("请上传积分商品封面图");
    return;
  }
  if (form.support_mixed_pay === 1 && form.cash_price <= 0) {
    ElMessage.warning("开启混合支付后，现金价格必须大于 0");
    return;
  }

  saving.value = true;
  try {
    const buildSpecs = async (uploadBasePath: string | null) => Promise.all(
      specRows.value.map(async (item, index) => {
        const name = item.name.trim();
        if (!name) return null;
        const uploaded = uploadBasePath
          ? await resolveUploadUrls(item.uploadFiles.slice(0, 1), `${uploadBasePath}/specs`)
          : [];
        return {
          name,
          image: uploaded[0] || "",
          points_price: item.points_price || form.points_price || 0,
          cash_price: form.support_mixed_pay === 1 ? item.cash_price || form.cash_price || 0 : 0,
          sort_order: index + 1
        };
      })
    ).then((rows) => rows.filter((x): x is NonNullable<typeof x> => Boolean(x?.name)));

    const buildPayload = async (uploadBasePath: string | null): Promise<CreatePointsProductInput> => {
      const [coverUploaded, galleryUploaded] = uploadBasePath
        ? await Promise.all([
            resolveUploadUrls(coverUploadFiles.value.slice(0, 1), `${uploadBasePath}/cover`),
            resolveUploadUrls(galleryUploadFiles.value, `${uploadBasePath}/gallery`)
          ])
        : [[], []];
      const coverImage = coverUploaded[0] || String((coverUploadFiles.value[0] as StoredUploadUserFile | undefined)?.storedUrl || "");
      const galleryImages = galleryUploaded.length > 0
        ? galleryUploaded
        : galleryUploadFiles.value
            .map((file) => String((file as StoredUploadUserFile).storedUrl || file.url || "").trim())
            .filter(Boolean);
      return {
      ...form,
        name: String(form.name || "").trim(),
        short_name: String(form.short_name || "").trim(),
        desc: String(form.desc || "").trim(),
        product_id: form.product_id || undefined,
        cover_image: coverImage,
        images: galleryImages.length > 0 ? galleryImages : coverImage ? [coverImage] : [],
        specs: await buildSpecs(uploadBasePath)
      };
    };

    if (isEditMode.value) {
      const payload = await buildPayload(`points-products/${editingId.value}`);
      payload.id = editingId.value;
      await updatePointsProduct(payload);
      ElMessage.success("更新成功");
    } else {
      const created = await createPointsProduct(await buildPayload(null));
      await updatePointsProduct({
        ...(await buildPayload(`points-products/${created.id}`)),
        id: created.id
      });
      ElMessage.success("创建成功");
    }
    router.back();
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.form {
  max-width: 1100px;
}
.linked-product {
  color: #409eff;
  font-weight: 500;
}
.product-info-card {
  display: flex;
  gap: 12px;
  align-items: center;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 8px;
}
.product-info-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.product-info-name {
  font-weight: 600;
  color: #303133;
}
.product-info-price {
  color: #b08b54;
  font-size: 18px;
  font-weight: 600;
}
.spec-editor {
  display: grid;
  gap: 12px;
  width: 100%;
}
.spec-editor-row {
  display: grid;
  grid-template-columns: 150px 1fr 130px 130px auto;
  gap: 8px;
  align-items: center;
}
.stock-line {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stock-tip {
  color: #909399;
  font-size: 12px;
}
.hint-tip {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}
.image-uploader-row {
  width: 100%;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 18px;
}
.uploader-wrap {
  width: 100%;
}
.upload-title {
  margin-bottom: 6px;
  color: #606266;
  font-size: 13px;
}
</style>
