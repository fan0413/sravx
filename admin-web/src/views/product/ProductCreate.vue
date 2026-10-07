<template>
  <el-card class="product-editor-page">
    <template #header>
      <div class="editor-heading">
        <div>
          <div class="editor-eyebrow">PRODUCT CATALOG</div>
          <h1>{{ isDeleteMode ? "删除商品" : isEditMode ? "编辑商品" : "新建商品" }}</h1>
          <p>{{ isDeleteMode ? "请确认本次操作不会影响正在进行的订单。" : "以用户端的商品浏览体验为准，完善商品信息、影像和规格。" }}</p>
        </div>
        <div class="editor-mode">{{ isEditMode ? "编辑模式" : "草稿模式" }}</div>
      </div>
    </template>
    <div class="create-grid">
      <el-form label-width="100px" :model="form" class="form">
        <div class="form-section-heading">
          <span>01</span>
          <div><strong>基础资料</strong><small>定义用户首先看到的商品信息</small></div>
        </div>
        <el-form-item label="商品分类">
          <el-select v-model="form.category_id" placeholder="请选择分类" style="width: 240px">
            <el-option
              v-for="category in categoryRows"
              :key="category.id"
              :label="category.name"
              :value="category.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="商品名称">
          <el-input v-model="form.name" placeholder="请输入商品名称" />
        </el-form-item>
        <el-form-item label="短名称">
          <el-input v-model="form.short_name" placeholder="请输入短名称（用于简洁展示）" maxlength="20" />
        </el-form-item>
        <el-form-item label="商品价格(元)">
          <el-input v-model="form.price" placeholder="请输入价格" />
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number v-model="form.stock" :min="0" />
        </el-form-item>
        <div class="form-section-heading">
          <span>02</span>
          <div><strong>产品影像</strong><small>上传列表、详情和展示所需的图片</small></div>
        </div>
        <el-form-item label="商品图片">
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
              <div class="upload-tip">用于列表主图，建议上传 1 张。</div>
            </div>

            <div class="uploader-wrap">
              <div class="upload-title">商品图片集</div>
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
              <div class="upload-tip">用于商品详情轮播，可上传 1-7 张。</div>
              <div v-if="galleryUploadFiles.length > 1" class="image-sort-list">
                <div
                  v-for="(file, index) in galleryUploadFiles"
                  :key="file.uid || file.name || index"
                  class="image-sort-item"
                  :class="{ 'is-dragging': draggingGalleryIndex === index }"
                  draggable="true"
                  @dragstart="handleGalleryDragStart(index, $event)"
                  @dragover.prevent
                  @drop.prevent="handleGalleryDrop(index)"
                  @dragend="handleGalleryDragEnd"
                >
                  <span class="image-sort-index">{{ index + 1 }}</span>
                  <img class="image-sort-thumb" :src="galleryImages[index]?.url || getUploadPreviewUrl(file)" alt="" />
                  <div class="image-sort-actions">
                    <el-button
                      circle
                      size="small"
                      :icon="ArrowLeft"
                      :disabled="index === 0"
                      title="前移"
                      @click.stop="moveGalleryImage(index, -1)"
                    />
                    <el-button
                      circle
                      size="small"
                      :icon="ArrowRight"
                      :disabled="index === galleryUploadFiles.length - 1"
                      title="后移"
                      @click.stop="moveGalleryImage(index, 1)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="简短描述">
          <el-input v-model="form.desc" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="商品详情图">
          <div class="uploader-wrap">
            <el-upload
              v-model:file-list="detailUploadFiles"
              list-type="picture-card"
              :auto-upload="false"
              :on-change="syncDetailImages"
              :on-remove="syncDetailImages"
              accept="image/*"
              multiple
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
            <div class="upload-tip">该区域用于详情页展示图片，可按顺序上传多张。</div>
          </div>
        </el-form-item>
        <el-form-item label="上架状态">
          <el-radio-group v-model="form.is_on_sale">
            <el-radio :value="1">上架</el-radio>
            <el-radio :value="0">下架</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="推荐商品">
          <el-radio-group v-model="form.is_recommend">
            <el-radio :value="1">是</el-radio>
            <el-radio :value="0">否</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="使用优惠券">
          <el-radio-group v-model="form.allow_coupon">
            <el-radio :value="1">允许</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
          <div class="upload-tip">禁用后该商品下单时不可使用优惠券</div>
        </el-form-item>
        <el-form-item label="质保月数">
          <el-input-number v-model="form.warranty_months" :min="0" :step="1" />
          <span class="warranty-tip">0=终身质保</span>
        </el-form-item>
        <div class="form-section-heading">
          <span>03</span>
          <div><strong>技术信息</strong><small>补充参数、规格与可选型号</small></div>
        </div>
        <el-form-item label="主要参数">
          <div class="param-editor">
            <div
              v-for="item in paramRows"
              :key="item.key"
              class="param-editor-row"
            >
              <div class="param-key-fixed">{{ item.key }}</div>
              <el-input v-model="item.value" placeholder="请填写参数值" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="规格配置">
          <div class="spec-list">
            <div
              v-for="(spec, index) in specRows"
              :key="spec.uid"
              class="spec-editor-row"
            >
              <div class="spec-main-row">
                <div class="spec-image-fields">
                  <div class="spec-image-field">
                    <div class="upload-title">规格图片</div>
                    <el-upload
                      v-model:file-list="spec.uploadFiles"
                      list-type="picture-card"
                      :auto-upload="false"
                      :on-change="createSpecUploadChangeHandler(spec, 'image')"
                      :on-remove="createSpecUploadRemoveHandler(spec, 'image')"
                      :on-exceed="createSpecUploadExceedHandler(spec, 'image')"
                      accept="image/*"
                      :limit="1"
                      :multiple="false"
                    >
                      <el-icon><Plus /></el-icon>
                    </el-upload>
                  </div>
                  <div class="spec-image-field">
                    <div class="upload-title">展示卡片</div>
                    <el-upload
                      v-model:file-list="spec.cardUploadFiles"
                      list-type="picture-card"
                      :auto-upload="false"
                      :on-change="createSpecUploadChangeHandler(spec, 'card')"
                      :on-remove="createSpecUploadRemoveHandler(spec, 'card')"
                      :on-exceed="createSpecUploadExceedHandler(spec, 'card')"
                      accept="image/*"
                      :limit="1"
                      :multiple="false"
                    >
                      <el-icon><Plus /></el-icon>
                    </el-upload>
                  </div>
                </div>
                <el-input v-model="spec.name" placeholder="配置名称，如：夜花黑纹款" />
                <el-input v-model.number="spec.price" placeholder="价格" />
                <el-input v-model="spec.sku" maxlength="64" placeholder="SKU（留空自动生成）" />
                <el-button
                  text
                  type="danger"
                  :disabled="specRows.length <= 1"
                  @click="removeSpecRow(index)"
                >
                  删除
                </el-button>
              </div>
              <div class="spec-shipping-row">
                <el-radio-group v-model="spec.shipping_type" size="small">
                  <el-radio-button value="normal">普通现货</el-radio-button>
                  <el-radio-button value="presale">预售</el-radio-button>
                  <el-radio-button value="custom">定制</el-radio-button>
                  <el-radio-button value="delayed">特殊延迟</el-radio-button>
                </el-radio-group>
                <div class="shipping-grid">
                  <el-form-item label="发货天数" label-width="72px" class="nested-form-item">
                    <el-input-number v-model="spec.ship_deadline_days" :min="1" :max="120" :step="1" />
                  </el-form-item>
                  <el-form-item label="延迟原因" label-width="72px" class="nested-form-item">
                    <el-select
                      v-model="spec.shipping_delay_reason"
                      placeholder="请选择"
                      clearable
                      style="width: 180px"
                    >
                      <el-option label="预售备货" value="预售备货" />
                      <el-option label="定制生产" value="定制生产" />
                      <el-option label="手工制作" value="手工制作" />
                      <el-option label="大件物流" value="大件物流" />
                      <el-option label="产地直发" value="产地直发" />
                      <el-option label="其他" value="其他" />
                    </el-select>
                  </el-form-item>
                </div>
                <el-input
                  v-model="spec.shipping_promise"
                  maxlength="120"
                  show-word-limit
                  placeholder="该规格发货承诺，例如：付款后7天内发货"
                />
                <el-input
                  v-model="spec.shipping_note"
                  type="textarea"
                  :rows="2"
                  maxlength="500"
                  show-word-limit
                  placeholder="该规格补充说明，可写定制周期、产地直发或与用户约定的发货条件"
                />
                <div class="upload-tip">用户下单选择该规格后，会按这里的天数生成预计发货时间。</div>
              </div>
            </div>
            <el-button text type="primary" @click="addSpecRow">+ 新增规格</el-button>
          </div>
        </el-form-item>
        <el-form-item class="form-actions">
          <el-button
            v-if="!isDeleteMode"
            type="primary"
            :loading="saving"
            @click="handleSave"
          >
            {{ isEditMode ? "更新" : "保存" }}
          </el-button>
          <el-button
            v-else
            type="danger"
            :loading="saving"
            @click="handleDelete"
          >
            确认删除
          </el-button>
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>

      <div class="preview-panel">
        <div class="preview-title">用户端预览</div>
        <p class="preview-hint">这里展示用户浏览商品时看到的信息层级。</p>
        <div class="phone">
          <div class="hero">
            <img class="hero-image" :src="previewImage" alt="商品图" />
            <span class="image-count">1/{{ Math.max(coverImages.length, 1) }}</span>
          </div>
          <div class="content">
            <div class="preview-eyebrow">SRAVX PROFESSIONAL TOOLS</div>
            <div class="name">{{ form.name || "请输入商品名称" }}</div>
            <div class="desc">{{ form.desc || "请输入商品简介，帮助用户理解产品用途。" }}</div>
          </div>
          <div class="preview-models">
            <div class="preview-section-title">型号：选择适合你的工具。</div>
            <div v-for="(spec, index) in specRows.filter((item) => item.name.trim()).slice(0, 2)" :key="spec.uid" class="preview-model" :class="{ selected: index === 0 }">
              <div><strong>{{ spec.name }}</strong><small>{{ spec.sku || "SKU 将自动生成" }}</small></div>
              <strong>¥{{ Number(spec.price || form.price || 0).toFixed(2) }}</strong>
            </div>
            <div v-if="!specRows.some((item) => item.name.trim())" class="preview-model selected">
              <div><strong>请先添加型号</strong><small>例如：标准款</small></div>
              <strong>¥{{ displayPrice }}</strong>
            </div>
          </div>
          <div class="params-wrap">
            <div class="preview-eyebrow">TECHNICAL DETAILS</div>
            <div class="params-title">主要参数</div>
            <div class="params-card">
              <div v-for="(item, index) in paramRows" :key="index" class="param-item">
                <span class="param-key">{{ item.key || "参数名" }}</span>
                <span class="param-value">{{ item.value || "参数值" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ArrowRight, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminProductDetail,
  fetchCategories,
  resolveAdminFileUrls,
  updateAdminProduct,
  uploadAdminImages
} from "../../api/admin";
import { targetAdminCatalogModeEnabled } from "../../lib/target-admin-auth";
import type { UploadFile, UploadFiles, UploadRawFile, UploadUserFile } from "element-plus";
import type { CategoryRow } from "../../api/types";

const router = useRouter();
const route = useRoute();
const editingId = computed(() => {
  const raw = route.params.id;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 0;
});
const isEditMode = computed(() => editingId.value > 0);
const isDeleteMode = computed(() => route.path.includes("/product/delete/"));
const categoryRows = ref<CategoryRow[]>([]);
const form = reactive({
  category_id: undefined as number | undefined,
  name: "",
  short_name: "",
  price: "",
  stock: 0,
  desc: "",
  is_on_sale: 1,
  is_recommend: 0,
  allow_coupon: 1,
  warranty_months: 12
});

const coverUploadFiles = ref<UploadUserFile[]>([]);
const coverImages = ref<{ name: string; url: string }[]>([]);
const galleryUploadFiles = ref<UploadUserFile[]>([]);
const galleryImages = ref<{ name: string; url: string }[]>([]);
const detailUploadFiles = ref<UploadUserFile[]>([]);
const detailImages = ref<{ name: string; url: string }[]>([]);
const draggingGalleryIndex = ref<number | null>(null);

const paramRows = ref([
  { key: "核心材质", value: "" },
  { key: "手柄材质", value: "" },
  { key: "尺寸", value: "" },
  { key: "重量(g)", value: "" },
  { key: "质保周期", value: "" }
]);
type SpecEditorRow = {
  uid: number;
  name: string;
  uploadFiles: UploadUserFile[];
  cardUploadFiles: UploadUserFile[];
  image: string;
  card_image: string;
  price: number;
  sku: string;
  shipping_type: ShippingType;
  ship_deadline_days: number;
  shipping_promise: string;
  shipping_delay_reason: string;
  shipping_note: string;
};
type ShippingType = "normal" | "presale" | "custom" | "delayed";
let specUidSeed = 0;

const createSpecRow = (): SpecEditorRow => ({
  uid: ++specUidSeed,
  name: "",
  uploadFiles: [],
  cardUploadFiles: [],
  image: "",
  card_image: "",
  price: 0,
  sku: "",
  shipping_type: "normal",
  ship_deadline_days: 2,
  shipping_promise: "",
  shipping_delay_reason: "",
  shipping_note: ""
});

const specRows = ref<SpecEditorRow[]>([createSpecRow()]);
const saving = ref(false);

const previewImage = computed(
  () =>
    coverImages.value[0]?.url ||
    "https://img.yzcdn.cn/vant/apple-1.jpg"
);

const displayPrice = computed(() => (form.price && Number(form.price) > 0 ? form.price : "0.00"));
const categoryName = computed(
  () => categoryRows.value.find((item) => item.id === form.category_id)?.name || "-"
);
const getShippingTypeText = (type?: string) => {
  const map = {
    normal: "普通现货",
    presale: "预售商品",
    custom: "定制商品",
    delayed: "特殊商品"
  };
  return map[String(type || "normal") as ShippingType] || "普通现货";
};
const buildSpecShippingPromise = (spec?: Pick<SpecEditorRow, "shipping_type" | "ship_deadline_days" | "shipping_promise">) => {
  const type = spec?.shipping_type || "normal";
  const days = Math.max(1, Number(spec?.ship_deadline_days || (type === "normal" ? 2 : 7)));
  const custom = String(spec?.shipping_promise || "").trim();
  if (custom) return custom;
  if (type === "normal" && days <= 2) return "付款后48小时内发货";
  return `${getShippingTypeText(type)}，付款后${days}天内发货`;
};

type StoredUploadUserFile = UploadUserFile & { storedUrl?: string };

const buildUploadFilesFromUrls = (urls: string[], urlMap: Record<string, string> = {}) =>
  urls.map((url, index) => ({
    name: `image-${index + 1}`,
    url: toPreviewUrl(url, urlMap),
    storedUrl: url
  })) as StoredUploadUserFile[];

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((x) => String(x || "")).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((x) => String(x || "")).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toPreviewUrl = (url: string, urlMap: Record<string, string>) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("cloud://") || raw.startsWith("catalog/")) return urlMap[raw] || raw;
  return raw;
};

const toShippingType = (value: unknown): ShippingType => {
  const type = String(value || "normal");
  return ["normal", "presale", "custom", "delayed"].includes(type) ? (type as ShippingType) : "normal";
};

const loadProductDetail = async (id: number) => {
  const detail = await fetchAdminProductDetail(id);
  form.category_id = Number(detail.category_id || 0) || undefined;
  form.name = String(detail.name || "");
  form.short_name = String(detail.short_name || "");
  form.price = String(detail.price || "");
  form.stock = Number(detail.stock || 0);
  form.desc = String(detail.desc || "");
  form.is_on_sale = Number(detail.is_on_sale || 0) === 0 ? 0 : 1;
  form.is_recommend = Number(detail.is_recommend || 0) === 1 ? 1 : 0;
  form.allow_coupon = Number(detail.allow_coupon ?? 1) === 0 ? 0 : 1;
  const fallbackShippingType = toShippingType(detail.shipping_type);
  const fallbackShipDeadlineDays = Math.max(
    1,
    Number(detail.ship_deadline_days ?? (fallbackShippingType === "normal" ? 2 : 7))
  );
  const fallbackShippingPromise = String(detail.shipping_promise || "");
  const fallbackShippingDelayReason = String(detail.shipping_delay_reason || "");
  const fallbackShippingNote = String(detail.shipping_note || "");
  form.warranty_months = Number(detail.warranty_months ?? 12);
  const cover = String(detail.cover_image || "");
  const images = parseStringArray(detail.images);
  const detailImagesRaw = parseStringArray(detail.detail_images);
  const specsRaw = Array.isArray(detail.specs) ? detail.specs : [];
  const specImageObjectKeys = specsRaw
    .map((item) => String((item as Record<string, unknown>).image || "").trim())
    .filter((item) => item.startsWith("cloud://") || item.startsWith("catalog/"));
  const specCardImageObjectKeys = specsRaw
    .map((item) => String((item as Record<string, unknown>).card_image || "").trim())
    .filter((item) => item.startsWith("cloud://") || item.startsWith("catalog/"));
  const allObjectKeys = [cover, ...images, ...detailImagesRaw, ...specImageObjectKeys, ...specCardImageObjectKeys]
    .map((item) => String(item || "").trim())
    .filter((item) => item.startsWith("cloud://") || item.startsWith("catalog/"));
  const urlMap = await resolveAdminFileUrls(allObjectKeys);

  coverUploadFiles.value = cover ? buildUploadFilesFromUrls([cover], urlMap) : [];
  galleryUploadFiles.value = buildUploadFilesFromUrls(images, urlMap);
  detailUploadFiles.value = buildUploadFilesFromUrls(detailImagesRaw, urlMap);
  syncCoverImages(undefined, coverUploadFiles.value as UploadFiles);
  syncGalleryImages(undefined, galleryUploadFiles.value as UploadFiles);
  syncDetailImages(undefined, detailUploadFiles.value as UploadFiles);

  const savedParams = detail.params && typeof detail.params === "object" && !Array.isArray(detail.params)
    ? detail.params as Record<string, unknown>
    : {};
  const paramsData: Record<string, unknown> = {
    核心材质: savedParams.核心材质 ?? detail.core_material ?? "",
    手柄材质: savedParams.手柄材质 ?? detail.handle_material ?? "",
    尺寸: savedParams.尺寸 ?? detail.size ?? "",
    "重量(g)": savedParams["重量(g)"] ?? detail.weight ?? "",
    质保周期: savedParams.质保周期 ?? detail.warranty_period ?? ""
  };
  paramRows.value = paramRows.value.map((item) => ({
    key: item.key,
    value: String(paramsData[item.key] || "")
  }));

  specRows.value =
    specsRaw.length > 0
      ? specsRaw.map((item) => {
          const name = String((item as Record<string, unknown>).name || "");
          const rawSpecImage = String((item as Record<string, unknown>).image || "");
          const rawSpecCardImage = String((item as Record<string, unknown>).card_image || "");
          const image = toPreviewUrl(rawSpecImage, urlMap);
          const cardImage = toPreviewUrl(rawSpecCardImage, urlMap);
          const price = Number((item as Record<string, unknown>).price || 0);
          const sku = String((item as Record<string, unknown>).sku || "");
          const shippingType = toShippingType((item as Record<string, unknown>).shipping_type || fallbackShippingType);
          const shipDeadlineDays = Math.max(
            1,
            Number(
              (item as Record<string, unknown>).ship_deadline_days ??
                (shippingType === fallbackShippingType ? fallbackShipDeadlineDays : shippingType === "normal" ? 2 : 7)
            )
          );
          return {
            uid: ++specUidSeed,
            name,
            image,
            card_image: cardImage,
            price,
            sku,
            shipping_type: shippingType,
            ship_deadline_days: shipDeadlineDays,
            shipping_promise: String((item as Record<string, unknown>).shipping_promise || fallbackShippingPromise),
            shipping_delay_reason: String(
              (item as Record<string, unknown>).shipping_delay_reason || fallbackShippingDelayReason
            ),
            shipping_note: String((item as Record<string, unknown>).shipping_note || fallbackShippingNote),
            uploadFiles: rawSpecImage ? buildUploadFilesFromUrls([rawSpecImage], urlMap) : [],
            cardUploadFiles: rawSpecCardImage ? buildUploadFilesFromUrls([rawSpecCardImage], urlMap) : []
          };
        })
      : [createSpecRow()];
};

onMounted(async () => {
  try {
    categoryRows.value = await fetchCategories();
    if (isEditMode.value) {
      await loadProductDetail(editingId.value);
    }
    if (!form.category_id && categoryRows.value.length > 0) {
      form.category_id = categoryRows.value[0].id;
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? `商品数据读取失败：${error.message}` : "商品数据读取失败");
  }
});

const getRawFile = (file: UploadUserFile): File | null => {
  const raw = file.raw;
  if (raw instanceof File) return raw;
  return null;
};

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
    const storedUrl = String((file as StoredUploadUserFile).storedUrl || "").trim();
    const currentUrl = storedUrl || String(file.url || "").trim();
    result[index] = currentUrl;
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
  coverImages.value = currentFiles
    .map((file) => {
      const url = file.url || (file.raw ? URL.createObjectURL(file.raw) : "");
      return { name: file.name || "image", url };
    })
    .filter((item) => Boolean(item.url));
};

const handleCoverExceed = (files: UploadRawFile[]) => {
  const latest = files[files.length - 1];
  if (!latest) return;
  if (!latest.uid) {
    latest.uid = Date.now();
  }
  coverUploadFiles.value = [
    {
      name: latest.name,
      url: URL.createObjectURL(latest),
      raw: latest
    }
  ];
  syncCoverImages(undefined, coverUploadFiles.value as UploadFiles);
  ElMessage.warning("封面图仅允许上传 1 张，已替换为最新选择的图片");
};

const syncGalleryImages = (_file?: UploadFile, files?: UploadFiles) => {
  const currentFiles = (files || galleryUploadFiles.value) as UploadUserFile[];
  galleryImages.value = currentFiles
    .map((file) => {
      const url = file.url || (file.raw ? URL.createObjectURL(file.raw) : "");
      return { name: file.name || "image", url };
    })
    .filter((item) => Boolean(item.url));
};

const getUploadPreviewUrl = (file: UploadUserFile) => {
  const currentUrl = String(file.url || "").trim();
  if (currentUrl) return currentUrl;
  const raw = getRawFile(file);
  if (!raw) return "";
  const previewUrl = URL.createObjectURL(raw);
  file.url = previewUrl;
  return previewUrl;
};

const moveGalleryImage = (index: number, direction: -1 | 1) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= galleryUploadFiles.value.length) return;
  const nextFiles = [...galleryUploadFiles.value];
  const [moved] = nextFiles.splice(index, 1);
  if (!moved) return;
  nextFiles.splice(targetIndex, 0, moved);
  galleryUploadFiles.value = nextFiles;
  syncGalleryImages(undefined, galleryUploadFiles.value as UploadFiles);
};

const handleGalleryDragStart = (index: number, event: DragEvent) => {
  draggingGalleryIndex.value = index;
  event.dataTransfer?.setData("text/plain", String(index));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
};

const handleGalleryDrop = (targetIndex: number) => {
  const sourceIndex = draggingGalleryIndex.value;
  draggingGalleryIndex.value = null;
  if (sourceIndex === null || sourceIndex === targetIndex) return;
  const nextFiles = [...galleryUploadFiles.value];
  const [moved] = nextFiles.splice(sourceIndex, 1);
  if (!moved) return;
  nextFiles.splice(targetIndex, 0, moved);
  galleryUploadFiles.value = nextFiles;
  syncGalleryImages(undefined, galleryUploadFiles.value as UploadFiles);
};

const handleGalleryDragEnd = () => {
  draggingGalleryIndex.value = null;
};

const syncDetailImages = (_file?: UploadFile, files?: UploadFiles) => {
  const currentFiles = (files || detailUploadFiles.value) as UploadUserFile[];
  detailImages.value = currentFiles
    .map((file) => {
      const url = file.url || (file.raw ? URL.createObjectURL(file.raw) : "");
      return { name: file.name || "image", url };
    })
    .filter((item) => Boolean(item.url));
};

const addSpecRow = () => {
  specRows.value.push(createSpecRow());
};

const removeSpecRow = (index: number) => {
  specRows.value.splice(index, 1);
};

type SpecImageSlot = "image" | "card";

const setSpecPreviewImage = (spec: SpecEditorRow, slot: SpecImageSlot, url: string) => {
  if (slot === "card") {
    spec.card_image = url;
  } else {
    spec.image = url;
  }
};

const syncSpecImages = (spec: SpecEditorRow, slot: SpecImageSlot, files: UploadFiles) => {
  const first = (files?.[0] || null) as UploadUserFile | null;
  if (!first) {
    setSpecPreviewImage(spec, slot, "");
    return;
  }
  const url = first.url || (first.raw ? URL.createObjectURL(first.raw) : "");
  setSpecPreviewImage(spec, slot, url || "");
};

const getSpecUploadFiles = (spec: SpecEditorRow, slot: SpecImageSlot) =>
  slot === "card" ? spec.cardUploadFiles : spec.uploadFiles;

const setSpecUploadFiles = (spec: SpecEditorRow, slot: SpecImageSlot, files: UploadUserFile[]) => {
  if (slot === "card") {
    spec.cardUploadFiles = files;
  } else {
    spec.uploadFiles = files;
  }
};

const createSpecUploadChangeHandler = (spec: SpecEditorRow, slot: SpecImageSlot) => {
  return (_file: UploadFile, files: UploadFiles) => {
    syncSpecImages(spec, slot, files);
  };
};

const createSpecUploadRemoveHandler = (spec: SpecEditorRow, slot: SpecImageSlot) => {
  return (_file: UploadFile, files: UploadFiles) => {
    syncSpecImages(spec, slot, files);
  };
};

const createSpecUploadExceedHandler = (spec: SpecEditorRow, slot: SpecImageSlot) => {
  return (files: UploadRawFile[]) => {
    const latest = files[files.length - 1];
    if (!latest) return;
    if (!latest.uid) {
      latest.uid = Date.now();
    }
    const nextFiles = [
      {
        name: latest.name,
        url: URL.createObjectURL(latest),
        raw: latest
      }
    ];
    setSpecUploadFiles(spec, slot, nextFiles);
    syncSpecImages(spec, slot, getSpecUploadFiles(spec, slot) as UploadFiles);
    ElMessage.warning(`${slot === "card" ? "展示卡片" : "规格图片"}仅允许上传 1 张，已替换为最新选择的图片`);
  };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildConfirmHtml = () => {
  const paramItems = paramRows.value
    .map((item) => ({ key: item.key.trim(), value: item.value.trim() }))
    .filter((item) => item.key && item.value);
  const specItems = specRows.value
    .map((item, index) => ({
      index: index + 1,
      name: item.name.trim(),
      price: Number(item.price || 0),
      hasImage: item.uploadFiles.length > 0,
      hasCardImage: item.cardUploadFiles.length > 0,
      shippingType: getShippingTypeText(item.shipping_type),
      shippingPromise: buildSpecShippingPromise(item),
      shippingReason: item.shipping_delay_reason.trim(),
      shippingNote: item.shipping_note.trim()
    }))
    .filter((item) => item.name);

  const paramsHtml =
    paramItems.length > 0
      ? `<div style="display:grid;gap:6px;">${paramItems
          .map(
            (item) =>
              `<div style="display:flex;justify-content:space-between;gap:12px;background:#fff;padding:6px 8px;border-radius:6px;">
                 <span style="color:#606266;">${escapeHtml(item.key)}</span>
                 <span style="color:#303133;">${escapeHtml(item.value)}</span>
               </div>`
          )
          .join("")}</div>`
      : `<div style="color:#909399;">无</div>`;

  const specsHtml =
    specItems.length > 0
      ? `<div style="display:grid;gap:6px;">${specItems
          .map(
            (item) =>
              `<div style="display:grid;gap:4px;background:#fff;padding:8px;border-radius:6px;">
                 <div style="display:flex;justify-content:space-between;gap:12px;">
                   <span style="color:#303133;">#${item.index} ${escapeHtml(item.name)}</span>
                    <span style="color:#606266;">¥${item.price} ｜ 规格图${item.hasImage ? "有" : "无"} ｜ 卡片${item.hasCardImage ? "有" : "无"}</span>
                 </div>
                 <div style="color:#606266;">${escapeHtml(item.shippingType)} ｜ ${escapeHtml(item.shippingPromise)}</div>
                 <div style="color:#909399;">原因：${escapeHtml(item.shippingReason || "-")} ｜ 说明：${escapeHtml(item.shippingNote || "-")}</div>
               </div>`
          )
          .join("")}</div>`
      : `<div style="color:#909399;">无</div>`;

  return `
    <div style="max-height:460px;overflow:auto;line-height:1.6;background:#f5f7fa;padding:12px;border-radius:8px;">
      <div style="background:#fff;padding:10px 12px;border-radius:8px;margin-bottom:10px;">
        <div style="font-weight:600;color:#303133;margin-bottom:8px;">基础信息</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;">
          <div><span style="color:#909399;">分类：</span><span>${escapeHtml(categoryName.value)}</span></div>
          <div><span style="color:#909399;">商品名称：</span><span>${escapeHtml(form.name.trim())}</span></div>
          <div><span style="color:#909399;">短名称：</span><span>${escapeHtml(form.short_name.trim() || "-")}</span></div>
          <div><span style="color:#909399;">价格：</span><span>¥${Number(form.price || 0)}</span></div>
          <div><span style="color:#909399;">库存：</span><span>${form.stock}</span></div>
          <div><span style="color:#909399;">状态：</span><span>${form.is_on_sale ? "上架" : "下架"} / ${
            form.is_recommend ? "推荐" : "普通"
          }</span></div>
        </div>
        <div style="margin-top:8px;"><span style="color:#909399;">描述：</span><span>${escapeHtml(form.desc.trim() || "-")}</span></div>
      </div>

      <div style="background:#fff;padding:10px 12px;border-radius:8px;margin-bottom:10px;">
        <div style="font-weight:600;color:#303133;margin-bottom:8px;">图片统计</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <span style="background:#ecf5ff;color:#409eff;padding:4px 8px;border-radius:999px;">封面图 ${coverUploadFiles.value.length} 张</span>
          <span style="background:#f0f9eb;color:#67c23a;padding:4px 8px;border-radius:999px;">图片集 ${galleryUploadFiles.value.length} 张</span>
          <span style="background:#fdf6ec;color:#e6a23c;padding:4px 8px;border-radius:999px;">详情图 ${detailUploadFiles.value.length} 张</span>
        </div>
      </div>

      <div style="background:#fff;padding:10px 12px;border-radius:8px;margin-bottom:10px;">
        <div style="font-weight:600;color:#303133;margin-bottom:8px;">主要参数</div>
        ${paramsHtml}
      </div>

      <div style="background:#fff;padding:10px 12px;border-radius:8px;">
        <div style="font-weight:600;color:#303133;margin-bottom:8px;">规格配置</div>
        ${specsHtml}
      </div>
    </div>
  `;
};

const handleDelete = async () => {
  if (!isDeleteMode.value || !editingId.value) return;
  if (targetAdminCatalogModeEnabled()) {
    try {
      await ElMessageBox.confirm("删除后将不再在商城展示，历史订单不会受影响。确认删除吗？", "删除确认", {
        confirmButtonText: "确认删除",
        cancelButtonText: "取消",
        type: "warning"
      });
    } catch {
      return;
    }
    saving.value = true;
    try {
      const res = await deleteAdminProduct(editingId.value);
      ElMessage.success(`商品删除成功，ID：${res.id}`);
      await router.push("/product/list");
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      saving.value = false;
    }
    return;
  }
  let adminPassword = "";
  try {
    const { value } = await ElMessageBox.prompt("请输入管理员密码确认删除", "删除确认", {
      inputType: "password",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      inputPlaceholder: "管理员密码",
      inputValidator: (val) => (String(val || "").trim() ? true : "请输入管理员密码")
    });
    adminPassword = String(value || "").trim();
  } catch {
    return;
  }
  saving.value = true;
  try {
    const { getLoginUser, signInWithUsernamePassword } = await import("../../lib/cloudbase");
    const user = await getLoginUser();
    const username = String(user?.username || "").trim();
    if (!username) {
      throw new Error("当前登录态缺少用户名，请重新登录后重试");
    }
    await signInWithUsernamePassword(username, adminPassword);
    const res = await deleteAdminProduct(editingId.value);
    ElMessage.success(`商品删除成功，ID：${res.id}`);
    await router.push("/product/list");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  } finally {
    saving.value = false;
  }
};

const handleSave = async () => {
  if (!form.name.trim()) {
    ElMessage.warning("请先填写商品名称");
    return;
  }
  if (!form.short_name.trim()) {
    ElMessage.warning("请先填写短名称");
    return;
  }
  if (!form.category_id) {
    ElMessage.warning("请先选择商品分类");
    return;
  }
  if (!String(form.price).trim()) {
    ElMessage.warning("请先填写商品价格");
    return;
  }
  if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) {
    ElMessage.warning("商品价格格式不正确");
    return;
  }
  if (!form.desc.trim()) {
    ElMessage.warning("请先填写简短描述");
    return;
  }
  if (coverUploadFiles.value.length === 0) {
    ElMessage.warning("请至少上传 1 张封面图");
    return;
  }
  if (galleryUploadFiles.value.length === 0) {
    ElMessage.warning("请至少上传 1 张商品图片集");
    return;
  }
  if (detailUploadFiles.value.length === 0) {
    ElMessage.warning("请至少上传 1 张商品详情图");
    return;
  }
  const missingParam = paramRows.value.find((item) => !item.value.trim());
  if (missingParam) {
    ElMessage.warning(`请先填写主要参数：${missingParam.key}`);
    return;
  }
  const invalidSpecShipping = specRows.value.find(
    (item) => item.name.trim() && (!Number.isFinite(Number(item.ship_deadline_days)) || Number(item.ship_deadline_days) < 1)
  );
  if (invalidSpecShipping) {
    ElMessage.warning(`请填写规格「${invalidSpecShipping.name.trim()}」的有效发货天数`);
    return;
  }
  try {
    await ElMessageBox.confirm(buildConfirmHtml(), isEditMode.value ? "确认更新商品信息" : "确认提交商品信息", {
      confirmButtonText: isEditMode.value ? "确认更新" : "确认提交",
      cancelButtonText: "返回修改",
      dangerouslyUseHTMLString: true
    });
  } catch {
    return;
  }

  saving.value = true;
  try {
    const paramPayload = paramRows.value.reduce<Record<string, string>>((acc, item) => {
      const key = item.key.trim();
      const value = item.value.trim();
      if (key && value) acc[key] = value;
      return acc;
    }, {});

    const buildPayload = async (uploadBasePath?: string) => {
      const uploadFiles = (files: UploadUserFile[], folder: string) =>
        uploadBasePath ? resolveUploadUrls(files, `${uploadBasePath}/${folder}`) : Promise.resolve([]);

      const [coverUploaded, galleryUploaded, detailUploaded] = await Promise.all([
        uploadFiles(coverUploadFiles.value, "cover"),
        uploadFiles(galleryUploadFiles.value, "gallery"),
        uploadFiles(detailUploadFiles.value, "detail")
      ]);

      const specs = await Promise.all(
        specRows.value.map(async (item, index) => {
          const specName = item.name.trim();
          if (!specName) return null;
          const uploadedSpecImages = uploadBasePath
            ? await resolveUploadUrls((item.uploadFiles || []).slice(0, 1), `${uploadBasePath}/specs`)
            : [];
          const uploadedSpecCardImages = uploadBasePath
            ? await resolveUploadUrls((item.cardUploadFiles || []).slice(0, 1), `${uploadBasePath}/spec-cards`)
            : [];

          return {
            name: specName,
            image: uploadedSpecImages[0] || "",
            card_image: uploadedSpecCardImages[0] || "",
            price: Number(item.price || 0),
            sku: item.sku.trim(),
            sort_order: index + 1,
            shipping_type: item.shipping_type,
            ship_deadline_days: Number(item.ship_deadline_days || (item.shipping_type === "normal" ? 2 : 7)),
            shipping_promise: item.shipping_promise.trim() || buildSpecShippingPromise(item),
            shipping_delay_reason: item.shipping_delay_reason.trim(),
            shipping_note: item.shipping_note.trim()
          };
        })
      ).then((rows) =>
        rows.filter(
          (item): item is {
            name: string;
            image: string;
            card_image: string;
            price: number;
            sku: string;
            sort_order: number;
            shipping_type: ShippingType;
            ship_deadline_days: number;
            shipping_promise: string;
            shipping_delay_reason: string;
            shipping_note: string;
          } => Boolean(item?.name)
        )
      );

      return {
        name: form.name,
        short_name: form.short_name,
        desc: form.desc,
        price: Number(form.price || 0),
        category_id: form.category_id,
        cover_image: coverUploaded[0] || "",
        images: galleryUploaded,
        detail_images: detailUploaded,
        params: paramPayload,
        stock: form.stock,
        warranty_months: form.warranty_months ?? 12,
        scissors_card_image: "",
        has_spec: specs.length > 0 ? 1 : 0,
        sort_order: 0,
        is_on_sale: form.is_on_sale,
        is_recommend: form.is_recommend,
        allow_coupon: form.allow_coupon,
        specs
      };
    };

    let res: { id: number };
    if (isEditMode.value) {

      const payload = await buildPayload(`products/${editingId.value}`);
      res = await updateAdminProduct({ ...payload, id: editingId.value });
    } else {
      if (targetAdminCatalogModeEnabled()) {
        const payload = await buildPayload(`products/draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
        res = await createAdminProduct(payload);
      } else {
        const initialPayload = await buildPayload();
        res = await createAdminProduct(initialPayload);
        const finalPayload = await buildPayload(`products/${res.id}`);
        await updateAdminProduct({ ...finalPayload, id: res.id });
      }
    }
    ElMessage.success(isEditMode.value ? `商品更新成功，ID：${res.id}` : `商品创建成功，ID：${res.id}`);
    await router.push("/product/list");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : isEditMode.value ? "更新失败" : "创建失败");
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.create-grid {
  display: grid;
  grid-template-columns: minmax(520px, 1fr) 390px;
  gap: 28px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
}

.form {
  max-width: 100%;
  padding: 30px 32px 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 22px;
  background: #fff;
}

.editor-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.editor-eyebrow {
  margin-bottom: 8px;
  color: #a16e3b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.editor-heading h1 {
  margin: 0;
  color: #1d1d1f;
  font-size: 28px;
  line-height: 1.2;
  letter-spacing: -0.03em;
}

.editor-heading p {
  margin: 10px 0 0;
  color: #6e6e73;
  font-size: 14px;
}

.editor-mode {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-radius: 999px;
  background: #f2f2f7;
  color: #6e6e73;
  font-size: 12px;
  font-weight: 650;
}

.form-section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 22px;
  padding: 6px 0 2px;
}

.form-section-heading:not(:first-child) {
  margin-top: 38px;
  padding-top: 30px;
  border-top: 1px solid rgba(60, 60, 67, 0.12);
}

.form-section-heading > span {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #1d1d1f;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.form-section-heading strong,
.form-section-heading small {
  display: block;
}

.form :deep(.el-form-item) {
  max-width: 840px;
  margin-bottom: 20px;
}

.form :deep(.el-form-item__label) {
  color: #515154;
  font-weight: 600;
}

.form-section-heading strong {
  color: #1d1d1f;
  font-size: 16px;
}

.form-section-heading small {
  margin-top: 3px;
  color: #86868b;
  font-size: 12px;
}

.form-actions {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid rgba(60, 60, 67, 0.12);
}

.param-editor {
  width: 100%;
}

.uploader-wrap {
  width: 100%;
}

.image-uploader-row {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.upload-title {
  margin-bottom: 6px;
  color: #606266;
  font-size: 13px;
}

.upload-tip {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
}

.image-sort-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.image-sort-item {
  position: relative;
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-rows: 56px 28px;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.image-sort-item:hover {
  border-color: #c6e2ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
}

.image-sort-item.is-dragging {
  opacity: 0.55;
}

.image-sort-index {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f4f4f5;
  color: #606266;
  font-size: 12px;
  font-weight: 600;
}

.image-sort-thumb {
  width: 100%;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  background: #f5f7fa;
}

.image-sort-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.shipping-editor {
  display: grid;
  gap: 10px;
  width: 100%;
}

.shipping-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.nested-form-item {
  margin-bottom: 0;
}

.param-editor-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.spec-list {
  display: grid;
  gap: 10px;
  width: 100%;
}

.spec-editor-row {
  display: grid;
  gap: 10px;
  padding: 12px;
  margin-bottom: 8px;
  align-items: start;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.spec-main-row {
  display: grid;
  grid-template-columns: 320px minmax(180px, 1fr) 120px 100px 56px;
  gap: 12px;
  align-items: start;
}

.spec-image-fields {
  display: grid;
  grid-template-columns: repeat(2, 140px);
  gap: 12px;
}

.spec-image-field {
  display: grid;
  gap: 6px;
}

.spec-shipping-row {
  display: grid;
  gap: 10px;
  padding-left: 320px;
}

.sku-label {
  color: #909399;
  font-size: 12px;
  text-align: center;
}

.spec-editor-row :deep(.el-upload--picture-card) {
  width: 140px;
  height: 140px;
}

.param-key-fixed {
  color: #606266;
  padding-left: 2px;
}

.preview-panel {
  position: sticky;
  top: 92px;
  padding: 20px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 22px;
  background: #fff;
}

.preview-title {
  color: #1d1d1f;
  font-size: 16px;
  font-weight: 720;
}

.preview-hint {
  margin: 6px 0 16px;
  color: #86868b;
  font-size: 12px;
  line-height: 1.5;
}

.phone {
  width: 100%;
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 18px;
  background: #fff;
  overflow: hidden;
}

.hero {
  position: relative;
  background: #f2f2f7;
  height: 300px;
}

.hero-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-count {
  position: absolute;
  right: 10px;
  bottom: 10px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 12px;
}

.content {
  padding: 22px 18px 14px;
}

.preview-eyebrow {
  color: #a16e3b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.name {
  margin-top: 9px;
  color: #1d1d1f;
  font-size: 23px;
  font-weight: 720;
  line-height: 1.2;
  letter-spacing: -0.035em;
}

.desc {
  margin-top: 8px;
  color: #8a8a8a;
  font-size: 14px;
}

.preview-models {
  margin: 4px 14px 18px;
  padding: 18px 14px;
  border-radius: 14px;
  background: #f7f7f8;
}

.preview-section-title {
  margin-bottom: 12px;
  color: #1d1d1f;
  font-size: 15px;
  font-weight: 700;
}

.preview-model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid #e2e2e6;
  border-radius: 11px;
  background: #fff;
  color: #1d1d1f;
  font-size: 13px;
}

.preview-model.selected {
  border: 2px solid #1d1d1f;
}

.preview-model strong,
.preview-model small {
  display: block;
}

.preview-model small {
  margin-top: 3px;
  color: #6e6e73;
  font-size: 10px;
}

.params-wrap {
  border-top: 8px solid #f2f2f7;
  padding: 20px 16px;
}

.params-title {
  margin-top: 8px;
  font-size: 18px;
  color: #1d1d1f;
  font-weight: 700;
  margin-bottom: 10px;
}

.params-card {
  background: #f2f2f7;
  border-radius: 12px;
  overflow: hidden;
}

.param-item {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  border-bottom: 1px solid #e8e8eb;
  padding: 11px 14px;
  font-size: 13px;
}

.param-item:last-child {
  border-bottom: none;
}

.param-key {
  color: #6f6f74;
  min-width: 80px;
}

.param-value {
  color: #8a8a8f;
  text-align: right;
}

@media (max-width: 1200px) {
  .create-grid {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }

  .image-uploader-row {
    grid-template-columns: 1fr;
  }

  .spec-main-row {
    grid-template-columns: 1fr;
  }

  .spec-shipping-row {
    padding-left: 0;
  }

  .spec-image-fields {
    grid-template-columns: repeat(2, 140px);
  }
}

@media (max-width: 720px) {
  .form {
    padding: 22px 18px 8px;
  }

  .editor-heading {
    display: block;
  }

  .editor-mode {
    display: inline-flex;
    margin-top: 14px;
  }

  .form-section-heading {
    margin-left: 0;
  }
}
</style>
