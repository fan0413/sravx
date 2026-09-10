import { callCloudFunction, getTempFileUrlMap, uploadFileToCloud } from "../lib/cloudbase";
import { targetAdminModeEnabled, targetAdminRequest } from "../lib/target-admin-auth";
import type {
  BannerRow,
  CategoryRow,
  OrderRow,
  OverviewStats,
  ProductRow,
  UserRow
} from "./types";

export interface PointsProductRow {
  id: number;
  product_id: number | null;
  points_price: number;
  cash_price: string;
  stock: number;
  stock_total: number;
  stock_available: number;
  stock_frozen: number;
  sales_count: number;
  is_on_sale: number;
  sort_order: number;
  min_member_level: number;
  support_mixed_pay: number;
  created_at?: string;
  updated_at?: string;
  name?: string;
  short_name?: string;
  desc?: string;
  cover_image?: string;
  raw_cover_image?: string;
  images?: string[] | string;
  raw_images?: string[];
  detail_images?: string[] | string;
  category_id?: number;
  specs?: PointsProductSpecRow[];
}

export interface PointsProductSpecRow {
  name: string;
  image?: string;
  raw_image?: string;
  points_price: number;
  cash_price: number;
  sku: string;
}

export interface PointsProductQuery {
  keyword?: string;
  status?: number;
  sku?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminPointsProductListResult {
  list: PointsProductRow[];
  total: number;
}

export interface CreatePointsProductInput {
  id?: number;
  product_id?: number;
  name?: string;
  short_name?: string;
  desc?: string;
  cover_image?: string;
  images?: string[];
  detail_images?: string[];
  category_id?: number | null;
  points_price: number;
  cash_price: number;
  stock_total?: number;
  add_stock?: number;
  min_member_level: number;
  support_mixed_pay: number;
  is_on_sale: number;
  sort_order: number;
  specs?: Array<{
    name: string;
    image?: string;
    points_price: number;
    cash_price: number;
    sort_order?: number;
  }>;
}

export type { BannerRow, CategoryRow, OrderRow, OverviewStats, ProductRow, UserRow };

export type ScissorsAfterSaleRow = {
  id: number; request_no: string; sn: string; service_type: "repair" | "replacement"; status: string;
  issue_description: string; username?: string; phone?: string; recipient_name?: string;
  recipient_phone?: string; recipient_address_text?: string; service_address_text?: string;
  return_carrier?: string; return_tracking_no?: string; return_freight_amount?: string;
  outbound_carrier?: string; outbound_tracking_no?: string; freight_coupon_status?: string;
  freight_coupon_note?: string; seller_message?: string; created_at: string;
};
export type AfterSaleServiceAddress = { id?: number; label: string; contact: string; phone: string; province?: string; city?: string; district?: string; detail: string; is_enabled?: boolean; sort_order?: number };

export async function fetchScissorsAfterSales(query: { status?: string; keyword?: string; serviceType?: string } = {}): Promise<ScissorsAfterSaleRow[]> {
  const result = await callCloudFunction<CloudFunctionResponse<ScissorsAfterSaleRow[]>>("scissors", { action: "afterSaleAdminList", status: query.status || "", keyword: query.keyword || "", serviceType: query.serviceType || "" });
  return unwrapCloudResponse(result, "获取剪刀售后工单失败");
}

export async function fetchAfterSaleServiceAddresses(): Promise<AfterSaleServiceAddress[]> {
  const result = await callCloudFunction<CloudFunctionResponse<AfterSaleServiceAddress[]>>("scissors", { action: "afterSaleServiceAddressList" });
  return unwrapCloudResponse(result, "获取售后收件地址失败");
}

export async function saveAfterSaleServiceAddress(address: AfterSaleServiceAddress) {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("scissors", { action: "afterSaleServiceAddressSave", address });
  return unwrapCloudResponse(result, "保存售后收件地址失败");
}

export async function updateScissorsAfterSale(payload: Record<string, unknown>) {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; status: string }>>("scissors", { action: "afterSaleAdminUpdate", ...payload });
  return unwrapCloudResponse(result, "更新售后工单失败");
}

export async function replyScissorsAfterSale(id: number, content: string) {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("scissors", { action: "afterSaleAdminReply", id, content });
  return unwrapCloudResponse(result, "发送售后留言失败");
}

export interface ProductQuery {
  keyword?: string;
  status?: number;
  categoryId?: number;
  lowStock?: number;
  sku?: string;
  shippingType?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminProductListResult {
  list: ProductRow[];
  total: number;
}

export interface AdminOrderListResult {
  list: OrderRow[];
  total: number;
}

export interface WechatShippingSyncItem {
  id: number;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface WechatShippingSyncSummary {
  success: number;
  skipped: number;
  failed: number;
  list: WechatShippingSyncItem[];
}

export interface ShipOrdersResult {
  shipped: number;
  ids?: number[];
  wechatShipping?: WechatShippingSyncSummary;
}

export interface PointsOrderRow {
  id: number;
  order_no: string;
  user_id: number;
  product_name_snapshot: string;
  selected_spec_snapshot?: string | null;
  total_points: number;
  payable_cash: string;
  status: string;
  payment_status: string;
  logistics_company: string;
  logistics_no: string;
  pay_time: string | null;
  ship_time: string | null;
  created_at: string;
  updated_at: string;
  product_name?: string;
}

export interface PointsOrderDetail {
  order: {
    id: number;
    order_no: string;
    idempotency_key: string;
    user_id: number;
    _openid: string;
    points_product_id: number;
    product_id: number;
    product_name_snapshot: string;
    product_image_snapshot: string;
    selected_spec_snapshot: string;
    quantity: number;
    unit_points: number;
    total_points: number;
    unit_cash: string;
    total_cash: string;
    payable_cash: string;
    status: string;
    payment_status: string;
    payment_channel: string | null;
    pay_transaction_id: string | null;
    refund_transaction_id: string | null;
    receiver_name: string;
    receiver_phone: string;
    address_text: string;
    logistics_company: string;
    logistics_no: string;
    pay_time: string | null;
    ship_time: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string;
    remark: string | null;
    created_at: string;
    updated_at: string;
  };
  items: Array<{
    id: number;
    points_product_id: number;
    product_name: string;
    product_image: string | null;
    points_price: number;
    quantity: number;
    spec_text: string | null;
    sku: string | null;
    created_at: string;
  }>;
}

export interface AdminPointsOrderListResult {
  list: PointsOrderRow[];
  total: number;
}

export interface PointsOrderQuery {
  orderNo?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface RefundRow {
  id: number;
  order_id: number;
  order_no: string;
  user_id: number | null;
  request_type: string;
  reason: string;
  requested_amount: string;
  status: string;
  admin_note: string | null;
  pay_amount?: string;
  order_status?: string;
  created_at: string;
  updated_at: string;
}

export interface RefundQuery {
  orderNo?: string;
  status?: string;
}

export interface OrderItemRow {
  id: number;
  product_id: number;
  product_name: string;
  product_image: string | null;
  price: string;
  quantity: number;
  selected_color: string | null;
  selected_spec?: string | null;
  spec_text?: string | null;
  sku?: string | null;
}

export interface OrderAddressInfo {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}

export interface OrderDetailResult {
  order: OrderRow;
  items: OrderItemRow[];
  address: OrderAddressInfo | null;
  user: { id: number; username: string; phone: string; member_level: number; points: number } | null;
  coupon: { id: number; name: string; type: string; discount_value: string; min_amount: string } | null;
}

export interface AdminRefundListResult {
  list: RefundRow[];
  total: number;
}

export interface RefundDetailResult {
  refund: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  user: Record<string, unknown> | null;
  address: Record<string, unknown> | null;
  items: Record<string, unknown>[];
}

export interface RefundReviewInput {
  requestId: number;
  decision: "approve" | "reject";
  adminNote?: string;
}

export interface OrderQuery {
  orderNo?: string;
  status?: string;
  shippingType?: string;
  page?: number;
  pageSize?: number;
}

export interface UserQuery {
  username?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminUserListResult {
  list: UserRow[];
  total: number;
}

export interface AdminUserDetailResult {
  user: Record<string, unknown> | null;
  orders: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  coupons: Record<string, unknown>[];
}

export interface CreateProductSpecInput {
  name: string;
  image?: string;
  card_image?: string;
  price?: number;
  sort_order: number;
  shipping_type?: "normal" | "presale" | "custom" | "delayed";
  ship_deadline_days?: number;
  shipping_promise?: string;
  shipping_delay_reason?: string;
  shipping_note?: string;
}

export interface CreateProductInput {
  id?: number;
  name: string;
  short_name?: string;
  desc?: string;
  price?: string | number;
  category_id?: number | null;
  cover_image?: string;
  images?: string[];
  detail_images?: string[];
  params?: Record<string, string>;
  detail?: string;
  core_material?: string;
  handle_material?: string;
  size?: string;
  weight?: number | null;
  warranty_period?: string;
  warranty_months?: number;
  scissors_card_image?: string;
  stock?: number;
  has_spec?: number;
  sort_order?: number;
  is_on_sale?: number;
  is_recommend?: number;
  allow_coupon?: number;
  shipping_type?: "normal" | "presale" | "custom" | "delayed";
  ship_deadline_days?: number;
  shipping_promise?: string;
  shipping_delay_reason?: string;
  shipping_note?: string;
  specs?: CreateProductSpecInput[];
}

type CloudFunctionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type CloudCategory = {
  id: number;
  parent_id?: number | null;
  name: string;
  icon?: string | null;
  image?: string | null;
  description?: string | null;
  level?: number;
  sort_order: number;
  is_show?: number;
  is_nav?: number;
  product_count?: number;
  status?: "active" | "disabled";
  created_at?: string | null;
  updated_at?: string | null;
};

function unwrapCloudResponse<T>(res: CloudFunctionResponse<T>, fallbackError: string): T {
  if (!res?.success) {
    throw new Error(res?.error || fallbackError);
  }
  return res.data as T;
}

export async function fetchOverview(): Promise<OverviewStats> {
  const result = await callCloudFunction<CloudFunctionResponse<OverviewStats>>("admin-stats", {
    action: "overview"
  });
  return unwrapCloudResponse(result, "获取经营看板数据失败");
}

export async function fetchProducts(query: ProductQuery): Promise<ProductRow[]> {
  const result = await callCloudFunction<CloudFunctionResponse<ProductRow[]>>("product", {
    action: "list",
    keyword: (query.keyword || "").trim(),
    categoryId: query.categoryId,
    page: query.page || 1,
    pageSize: query.pageSize || 100
  });

  const rows = unwrapCloudResponse(result, "获取商品列表失败");
  if (typeof query.status === "number") {
    return rows.filter((item) => Number(item.is_on_sale) === query.status);
  }
  return rows;
}

export async function fetchAdminProducts(query: ProductQuery): Promise<AdminProductListResult> {
  if (targetAdminModeEnabled()) { const p = new URLSearchParams(); Object.entries({ keyword: query.keyword?.trim(), categoryId: query.categoryId, status: query.status, page: query.page || 1, pageSize: query.pageSize || 50 }).forEach(([k,v]) => { if (v !== undefined && v !== "") p.set(k, String(v)); }); return targetAdminRequest<AdminProductListResult>(`/api/v1/admin/products?${p}`); }
  const result = await callCloudFunction<CloudFunctionResponse<AdminProductListResult>>("admin-product", {
    action: "list",
    keyword: (query.keyword || "").trim(),
    categoryId: query.categoryId,
    status: query.status,
    lowStock: query.lowStock,
    sku: (query.sku || "").trim(),
    shippingType: (query.shippingType || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });

  const data = unwrapCloudResponse(result, "获取后台商品列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function createPointsProduct(payload: CreatePointsProductInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-points-product", {
    action: "add",
    ...payload
  });
  return unwrapCloudResponse(result, "创建积分商品失败");
}

export async function updatePointsProduct(payload: CreatePointsProductInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-points-product", {
    action: "update",
    ...payload
  });
  return unwrapCloudResponse(result, "更新积分商品失败");
}

export async function togglePointsProduct(id: number, is_on_sale: number): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-points-product", {
    action: "toggle",
    id,
    is_on_sale
  });
  return unwrapCloudResponse(result, "更新积分商品状态失败");
}

export async function fetchAdminPointsProducts(query: PointsProductQuery): Promise<AdminPointsProductListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminPointsProductListResult>>("admin-points-product", {
    action: "list",
    keyword: (query.keyword || "").trim(),
    status: query.status,
    sku: (query.sku || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });
  const data = unwrapCloudResponse(result, "获取后台积分商品列表失败");
  const list = Array.isArray(data?.list) ? data.list : [];
  const coverCloudIds = list
    .map((item) => String(item?.cover_image || "").trim())
    .filter((item) => item.startsWith("cloud://"));
  const coverUrlMap = coverCloudIds.length > 0 ? await resolveAdminFileUrls(coverCloudIds) : {};
  return {
    list: list.map((item) => {
      const rawCover = String(item?.cover_image || "").trim();
      return {
        ...item,
        cover_image: rawCover.startsWith("cloud://") ? coverUrlMap[rawCover] || rawCover : rawCover
      };
    }),
    total: Number(data?.total || 0)
  };
}

export async function fetchPointsProductDetail(id: number): Promise<PointsProductRow | undefined> {
  const result = await callCloudFunction<CloudFunctionResponse<PointsProductRow>>("admin-points-product", {
    action: "detail",
    id
  });
  const detail = unwrapCloudResponse(result, "获取积分商品详情失败");
  if (!detail) return undefined;

  const specs = Array.isArray(detail.specs) ? detail.specs : [];

  const specCloudIds = specs
    .map((item) => String(item?.image || "").trim())
    .filter((item) => item.startsWith("cloud://"));
  const coverRaw = String(detail.cover_image || "").trim();
  const images = Array.isArray(detail.images)
    ? (detail.images as string[])
    : typeof detail.images === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(detail.images as string);
            return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [];
          } catch {
            return detail.images ? [String(detail.images)] : [];
          }
        })()
      : [];
  const allCloudIds = [coverRaw, ...images, ...specCloudIds]
    .filter((item) => item.startsWith("cloud://"));
  const urlMap = allCloudIds.length > 0 ? await resolveAdminFileUrls(allCloudIds) : {};
  const toUrl = (raw: string) => (raw.startsWith("cloud://") ? urlMap[raw] || raw : raw);

  return {
    ...detail,
    raw_cover_image: coverRaw,
    cover_image: toUrl(coverRaw),
    raw_images: images,
    images: images.map(toUrl),
    specs: specs.map((item) => {
      const raw = String(item?.image || "").trim();
      return {
        ...item,
        image: toUrl(raw),
        raw_image: raw
      };
    })
  };
}

export async function fetchOrders(query: OrderQuery): Promise<AdminOrderListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminOrderListResult>>("admin-order", {
    action: "list",
    orderNo: (query.orderNo || "").trim(),
    status: (query.status || "").trim(),
    shippingType: (query.shippingType || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 20
  });
  const data = unwrapCloudResponse(result, "获取订单列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchOrderById(id: string): Promise<OrderDetailResult | undefined> {
  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0) return undefined;
  const result = await callCloudFunction<CloudFunctionResponse<OrderDetailResult>>("admin-order", {
    action: "detail",
    id: orderId
  });
  return unwrapCloudResponse(result, "获取订单详情失败");
}

export async function fetchPointsOrders(query: PointsOrderQuery): Promise<AdminPointsOrderListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminPointsOrderListResult>>("admin-order", {
    action: "pointsList",
    orderNo: (query.orderNo || "").trim(),
    status: (query.status || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });
  const data = unwrapCloudResponse(result, "获取积分订单列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchPointsOrderDetail(id: number): Promise<PointsOrderDetail | undefined> {
  const result = await callCloudFunction<CloudFunctionResponse<PointsOrderDetail>>("admin-order", {
    action: "pointsDetail",
    id
  });
  return unwrapCloudResponse(result, "获取积分订单详情失败");
}

export interface PendingShipRow {
  id: number;
  order_no: string;
  user_id: number;
  total_amount: string;
  pay_amount: string;
  logistics_company: string | null;
  logistics_no: string | null;
  shipping_type?: string;
  ship_deadline_days?: number;
  shipping_promise?: string | null;
  expected_ship_time?: string | null;
  delay_shipping_reason?: string | null;
  delay_shipping_note?: string | null;
  created_at: string;
  addr_name?: string;
  addr_phone?: string;
  addr_province?: string;
  addr_city?: string;
  addr_district?: string;
  addr_detail?: string;
}

export interface PendingShipQuery {
  orderNo?: string;
  shippingType?: string;
  createdStart?: string;
  createdEnd?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchPendingShipOrders(query: PendingShipQuery = {}): Promise<PendingShipRow[]> {
  const result = await callCloudFunction<CloudFunctionResponse<{ list: PendingShipRow[]; total: number }>>("admin-order", {
    action: "pendingShip",
    orderNo: (query.orderNo || "").trim(),
    shippingType: (query.shippingType || "").trim(),
    createdStart: (query.createdStart || "").trim(),
    createdEnd: (query.createdEnd || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 200
  });
  const data = unwrapCloudResponse(result, "获取待发货订单失败");
  return Array.isArray(data?.list) ? data.list : [];
}

export type ShippingAddressInput = Pick<
  PendingShipRow,
  "addr_name" | "addr_phone" | "addr_province" | "addr_city" | "addr_district" | "addr_detail"
>;

export async function updateOrderShippingAddress(
  id: number,
  address: ShippingAddressInput
): Promise<ShippingAddressInput & { id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<ShippingAddressInput & { id: number }>>("admin-order", {
    action: "updateShippingAddress",
    id,
    name: (address.addr_name || "").trim(),
    phone: (address.addr_phone || "").trim(),
    province: (address.addr_province || "").trim(),
    city: (address.addr_city || "").trim(),
    district: (address.addr_district || "").trim(),
    detail: (address.addr_detail || "").trim()
  });
  return unwrapCloudResponse(result, "修改收货地址失败");
}

export async function shipOrders(ids: number[], logisticsCompany: string, logisticsNo: string): Promise<ShipOrdersResult> {
  const result = await callCloudFunction<CloudFunctionResponse<ShipOrdersResult>>("admin-order", {
    action: "ship",
    ids,
    logistics_company: logisticsCompany,
    logistics_no: logisticsNo
  });
  return unwrapCloudResponse(result, "发货失败");
}

export async function retryWechatShipping(orderId: number): Promise<WechatShippingSyncItem> {
  const result = await callCloudFunction<CloudFunctionResponse<WechatShippingSyncItem>>("admin-order", {
    action: "retryWechatShipping",
    id: orderId
  });
  return unwrapCloudResponse(result, "同步微信发货信息失败");
}

export async function delayOrderShipping(payload: {
  id: number;
  expected_ship_time: string;
  delay_shipping_reason?: string;
  delay_shipping_note?: string;
  sync_wechat_special_report?: boolean;
  wechat_special_report_type?: number;
}): Promise<{
  id: number;
  expected_ship_time: string;
  delay_shipping_reason: string;
  delay_shipping_note: string;
  wechatSpecialReport?: {
    success: boolean;
    skipped?: boolean;
    error?: string;
  } | null;
}> {
  const result = await callCloudFunction<CloudFunctionResponse<{
    id: number;
    expected_ship_time: string;
    delay_shipping_reason: string;
    delay_shipping_note: string;
    wechatSpecialReport?: {
      success: boolean;
      skipped?: boolean;
      error?: string;
    } | null;
  }>>("admin-order", {
    action: "delayShip",
    ...payload
  });
  return unwrapCloudResponse(result, "调整发货时间失败");
}

export async function fetchAdminRefunds(query: RefundQuery): Promise<AdminRefundListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminRefundListResult>>("admin-order", {
    action: "refundList",
    orderNo: (query.orderNo || "").trim(),
    status: (query.status || "").trim(),
    page: 1,
    pageSize: 200
  });
  const data = unwrapCloudResponse(result, "获取退款列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchPendingRefundCount(): Promise<number> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminRefundListResult>>("admin-order", {
    action: "refundList",
    orderNo: "",
    status: "pending_review",
    page: 1,
    pageSize: 1
  });
  const data = unwrapCloudResponse(result, "获取待审核退款数量失败");
  return Number(data?.total || 0);
}

export async function fetchAdminRefundDetail(requestId: number): Promise<RefundDetailResult> {
  const result = await callCloudFunction<CloudFunctionResponse<RefundDetailResult>>("admin-order", {
    action: "refundDetail",
    requestId
  });
  const data = unwrapCloudResponse(result, "获取退款详情失败");
  return {
    refund: data?.refund || null,
    order: data?.order || null,
    user: data?.user || null,
    address: data?.address || null,
    items: Array.isArray(data?.items) ? data.items : []
  };
}

export async function reviewAdminRefund(payload: RefundReviewInput): Promise<{ requestId: number; decision: string }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ requestId: number; decision: string }>>("admin-order", {
    action: "refundReview",
    ...payload
  });
  return unwrapCloudResponse(result, "退款审核操作失败");
}

export async function fetchUsers(query: UserQuery): Promise<UserRow[]> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminUserListResult>>("admin-user", {
    action: "list",
    username: (query.username || "").trim(),
    status: (query.status || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });
  const data = unwrapCloudResponse(result, "获取用户列表失败");
  return Array.isArray(data?.list) ? data.list : [];
}

export async function fetchUsersWithTotal(query: UserQuery): Promise<AdminUserListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminUserListResult>>("admin-user", {
    action: "list",
    username: (query.username || "").trim(),
    status: (query.status || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });
  const data = unwrapCloudResponse(result, "获取用户列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchAdminUserDetail(id: number): Promise<AdminUserDetailResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminUserDetailResult>>("admin-user", {
    action: "detail",
    id
  });
  const data = unwrapCloudResponse(result, "获取用户详情失败");
  return {
    user: data?.user || null,
    orders: Array.isArray(data?.orders) ? data.orders : [],
    addresses: Array.isArray(data?.addresses) ? data.addresses : [],
    coupons: Array.isArray(data?.coupons) ? data.coupons : []
  };
}

export async function updateAdminUser(payload: {
  id: number;
  username: string;
  phone?: string;
  status: string;
  member_level: number;
  points: number;
}): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-user", {
    action: "update",
    ...payload
  });
  return unwrapCloudResponse(result, "更新用户失败");
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const result = await callCloudFunction<CloudFunctionResponse<CloudCategory[]>>("category", {
    action: "list"
  });
  const rows = unwrapCloudResponse(result, "获取分类失败");
  return rows
    .map((item) => ({
      id: Number(item.id),
      name: item.name,
      sort_order: Number(item.sort_order || 0),
      status: item.status || "active"
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export interface CategoryQuery {
  keyword?: string;
  is_show?: number | "";
}

export interface CategoryInput {
  id?: number;
  parent_id?: number | null;
  name: string;
  icon?: string;
  image?: string;
  description?: string;
  sort_order?: number;
  is_show?: number;
  is_nav?: number;
}

export interface AdminCategoryListResult {
  list: CategoryRow[];
  total: number;
}

function normalizeAdminCategory(item: CloudCategory): CategoryRow {
  const isShow = Number(item.is_show ?? (item.status === "disabled" ? 0 : 1));
  return {
    id: Number(item.id),
    parent_id: item.parent_id == null ? null : Number(item.parent_id),
    name: item.name,
    icon: item.icon || "",
    image: item.image || "",
    description: item.description || "",
    level: Number(item.level || 1),
    sort_order: Number(item.sort_order || 0),
    is_show: isShow,
    is_nav: Number(item.is_nav || 0),
    product_count: Number(item.product_count || 0),
    status: isShow === 1 ? "active" : "disabled",
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  };
}

export async function fetchAdminCategories(query: CategoryQuery = {}): Promise<AdminCategoryListResult> {
  if (targetAdminModeEnabled()) { const p = new URLSearchParams(); if (query.keyword?.trim()) p.set("keyword", query.keyword.trim()); if (query.is_show !== undefined && query.is_show !== "") p.set("isShow", String(query.is_show)); return targetAdminRequest<AdminCategoryListResult>(`/api/v1/admin/categories?${p}`); }
  const result = await callCloudFunction<CloudFunctionResponse<{ list: CloudCategory[]; total: number }>>(
    "admin-category",
    {
      action: "list",
      keyword: query.keyword?.trim() || undefined,
      is_show: query.is_show === "" ? undefined : query.is_show
    }
  );
  const data = unwrapCloudResponse(result, "获取分类列表失败");
  return {
    list: (data.list || []).map(normalizeAdminCategory),
    total: Number(data.total || 0)
  };
}

export async function createAdminCategory(payload: CategoryInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-category", {
    action: "create",
    ...payload
  });
  return unwrapCloudResponse(result, "新增分类失败");
}

export async function updateAdminCategory(payload: CategoryInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-category", {
    action: "update",
    ...payload
  });
  return unwrapCloudResponse(result, "更新分类失败");
}

export async function toggleAdminCategory(id: number, is_show: number): Promise<{ id: number; is_show: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; is_show: number }>>("admin-category", {
    action: "toggle",
    id,
    is_show
  });
  return unwrapCloudResponse(result, "切换分类状态失败");
}

export async function deleteAdminCategory(id: number): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-category", {
    action: "delete",
    id
  });
  return unwrapCloudResponse(result, "删除分类失败");
}

export interface AdminCouponRow {
  id: number;
  name: string;
  desc: string | null;
  type: "fixed" | "percent";
  value: string;
  min_amount: string;
  total_count: number;
  remain_count: number;
  status: "active" | "pending" | "paused" | "expired";
  stackable: number;
  start_time: string;
  expire_time: string;
  created_at?: string | null;
  updated_at?: string | null;
  issued_count: number;
  used_count: number;
}

export interface AdminCouponListResult {
  list: AdminCouponRow[];
  total: number;
}

export interface AdminCouponQuery {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export type CouponTargetType = "all_active" | "phones" | "openids" | "none";

export interface CouponTargetSample {
  id: number;
  username: string | null;
  phone: string | null;
  openid: string | null;
}

export interface CouponTargetPreviewResult {
  targetType: CouponTargetType;
  total: number;
  missing: string[];
  samples: CouponTargetSample[];
}

export interface PreviewCouponTargetsInput {
  targetType: CouponTargetType;
  phones?: string[];
  openids?: string[];
}

export interface IssueCouponInput {
  name: string;
  desc?: string;
  type?: "fixed" | "percent";
  value: number;
  min_amount: number;
  start_time?: string;
  expire_time: string;
  usage_note?: string;
  per_user_limit?: number;
  stackable?: number;
  targetType: CouponTargetType;
  phones?: string[];
  openids?: string[];
}

export interface CouponRuleRow {
  id: number;
  trigger_event: string;
  coupon_id: number;
  coupon_name?: string;
  coupon_type?: string;
  coupon_value?: number;
  coupon_min_amount?: number;
  per_user_limit: number;
  min_member_level: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CouponRuleInput {
  id?: number;
  trigger_event: string;
  coupon_id: number;
  per_user_limit?: number;
  min_member_level?: number;
  is_active?: number;
}

export interface CouponIssueResult {
  couponId: number;
  couponName: string;
  issuedCount: number;
  skippedNoOpenid: number;
  missing: string[];
}

export type GiftCardType = "points" | "coupon" | "product" | "combo";
export type GiftCardStatus = "unused" | "redeemed" | "disabled" | "expired";

export interface GiftBenefitInput {
  type: Exclude<GiftCardType, "combo">;
  title?: string;
  points?: number;
  couponId?: number;
  productId?: number;
  quantity?: number;
  selectedSpecName?: string;
}

export interface GiftCardPayload {
  gifts?: GiftBenefitInput[];
  title?: string;
  points?: number;
  couponId?: number;
  productId?: number;
  quantity?: number;
  selectedSpecName?: string;
}

export interface GiftCardRow {
  id: number;
  code: string;
  title: string;
  gift_type: GiftCardType;
  gift_payload: GiftCardPayload;
  status: GiftCardStatus;
  batch_no: string;
  redeemed_by: string | null;
  redeemed_record_id: number | null;
  redeemed_at: string | null;
  expire_time: string | null;
  admin_note: string;
  created_at: string;
  updated_at: string;
  redeemed_username?: string | null;
  redeemed_phone?: string | null;
}

export interface GiftRedeemRecordRow {
  id: number;
  gift_card_id: number;
  code: string;
  user_id: number | null;
  _openid: string;
  gift_type: GiftCardType;
  gift_title: string;
  gift_snapshot: GiftCardPayload;
  redeem_status: string;
  fulfillment_status: "fulfilled" | "pending_address" | string;
  order_id: number | null;
  order_no: string | null;
  user_coupon_id: number | null;
  points_change: number;
  fail_reason: string;
  batch_no?: string | null;
  username?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftCardOptionCoupon {
  id: number;
  name: string;
  type: string;
  value: string;
  min_amount: string;
  remain_count: number;
  status: string;
  expire_time: string;
  available: boolean;
}

export interface GiftCardOptionProduct {
  id: number;
  name: string;
  stock: number;
  reserved_stock: number;
  stock_available: number;
  is_on_sale: number;
  cover_image?: string | null;
  available: boolean;
}

export interface GiftCardListResult {
  list: GiftCardRow[];
  total: number;
}

export interface GiftRecordListResult {
  list: GiftRedeemRecordRow[];
  total: number;
}

export interface GiftCardOptionsResult {
  coupons: GiftCardOptionCoupon[];
  products: GiftCardOptionProduct[];
}

export interface GiftCardQuery {
  keyword?: string;
  status?: string;
  giftType?: string;
  batchNo?: string;
  page?: number;
  pageSize?: number;
}

export interface GiftRecordQuery {
  keyword?: string;
  fulfillmentStatus?: string;
  page?: number;
  pageSize?: number;
}

export interface SaveGiftCardInput {
  code: string;
  title: string;
  gift_type: GiftCardType;
  gift_payload: GiftCardPayload;
  batch_no?: string;
  expire_time?: string;
  admin_note?: string;
}

export interface ImportGiftCardsInput extends Omit<SaveGiftCardInput, "code"> {
  codesText?: string;
  codes?: string[];
}

export async function fetchGiftCards(query: GiftCardQuery): Promise<GiftCardListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<GiftCardListResult>>("giftCard", {
    action: "adminList",
    keyword: (query.keyword || "").trim(),
    status: (query.status || "").trim(),
    giftType: (query.giftType || "").trim(),
    batchNo: (query.batchNo || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 20
  });
  const data = unwrapCloudResponse(result, "获取礼品卡列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchGiftRecords(query: GiftRecordQuery): Promise<GiftRecordListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<GiftRecordListResult>>("giftCard", {
    action: "adminRecords",
    keyword: (query.keyword || "").trim(),
    fulfillmentStatus: (query.fulfillmentStatus || "").trim(),
    page: query.page || 1,
    pageSize: query.pageSize || 20
  });
  const data = unwrapCloudResponse(result, "获取兑换记录失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchGiftCardOptions(): Promise<GiftCardOptionsResult> {
  let data: GiftCardOptionsResult;
  try {
    const result = await callCloudFunction<CloudFunctionResponse<GiftCardOptionsResult>>("giftCard", {
      action: "adminOptions"
    });
    data = unwrapCloudResponse(result, "获取权益选项失败");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "需要登录") {
      throw error;
    }
    const [couponResult, productResult] = await Promise.all([
      fetchAdminCoupons({ status: "active", page: 1, pageSize: 100 }),
      fetchAdminProducts({ status: 1, page: 1, pageSize: 100 })
    ]);
    data = {
      coupons: couponResult.list.map((item) => ({
        id: Number(item.id),
        name: item.name,
        type: item.type,
        value: item.value,
        min_amount: item.min_amount,
        remain_count: Number(item.remain_count || 0),
        status: item.status,
        expire_time: item.expire_time,
        available: item.status === "active" && Number(item.remain_count || 0) > 0
      })),
      products: productResult.list.map((item) => {
        const stockAvailable = Number(
          (item as ProductRow & { stock_available?: number; reserved_stock?: number }).stock_available ??
            item.stock ??
            0
        );
        return {
          id: Number(item.id),
          name: item.name,
          stock: Number(item.stock || 0),
          reserved_stock: Number((item as ProductRow & { reserved_stock?: number }).reserved_stock || 0),
          stock_available: stockAvailable,
          is_on_sale: Number(item.is_on_sale || 0),
          cover_image: item.cover_image,
          available: Number(item.is_on_sale || 0) === 1 && stockAvailable > 0
        };
      })
    };
  }
  return {
    coupons: Array.isArray(data?.coupons) ? data.coupons : [],
    products: Array.isArray(data?.products) ? data.products : []
  };
}

export async function checkGiftCardCode(code: string): Promise<{ exists: boolean; code: string }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ exists: boolean; code: string }>>("giftCard", {
    action: "adminCheckCode",
    code
  });
  return unwrapCloudResponse(result, "校验兑换码失败");
}

export async function createGiftCard(payload: SaveGiftCardInput): Promise<{ id: number; code: string }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; code: string }>>("giftCard", {
    action: "adminCreate",
    ...payload
  });
  return unwrapCloudResponse(result, "创建礼品卡失败");
}

export async function importGiftCards(payload: ImportGiftCardsInput): Promise<{
  inserted: number;
  skipped: number;
  existing: string[];
  duplicatesInInput: string[];
}> {
  const result = await callCloudFunction<CloudFunctionResponse<{
    inserted: number;
    skipped: number;
    existing: string[];
    duplicatesInInput: string[];
  }>>("giftCard", {
    action: "adminImport",
    ...payload
  });
  const data = unwrapCloudResponse(result, "批量导入礼品卡失败");
  return {
    inserted: Number(data?.inserted || 0),
    skipped: Number(data?.skipped || 0),
    existing: Array.isArray(data?.existing) ? data.existing : [],
    duplicatesInInput: Array.isArray(data?.duplicatesInInput) ? data.duplicatesInInput : []
  };
}

export async function updateGiftCard(payload: {
  id: number;
  title?: string;
  status?: "unused" | "disabled" | "expired";
  expire_time?: string;
  admin_note?: string;
}): Promise<{ id: number; status: string }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; status: string }>>("giftCard", {
    action: "adminUpdate",
    ...payload
  });
  return unwrapCloudResponse(result, "更新礼品卡失败");
}

export interface InquiryRow {
  id: number;
  name: string;
  gender: string;
  scale: string;
  phone: string;
  wechat: string;
  address: string;
  intention: string;
  _openid: string;
  status: number;
  created_at: string;
}

export interface InquiryListResult {
  list: InquiryRow[];
  total: number;
}

export interface InquiryQuery {
  keyword?: string;
  status?: number;
  page?: number;
  pageSize?: number;
}

export async function fetchAdminCoupons(query: AdminCouponQuery): Promise<AdminCouponListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<AdminCouponListResult>>(
    "admin-coupon",
    {
      action: "list",
      keyword: (query.keyword || "").trim(),
      status: (query.status || "").trim(),
      page: query.page || 1,
      pageSize: query.pageSize || 50
    }
  );
  const data = unwrapCloudResponse(result, "获取优惠券列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function previewCouponTargets(
  input: PreviewCouponTargetsInput
): Promise<CouponTargetPreviewResult> {
  const result = await callCloudFunction<CloudFunctionResponse<CouponTargetPreviewResult>>(
    "admin-coupon",
    {
      action: "previewTargets",
      targetType: input.targetType,
      phones: input.phones || [],
      openids: input.openids || []
    }
  );
  const data = unwrapCloudResponse(result, "预估发放人群失败");
  return {
    targetType: data.targetType,
    total: Number(data.total || 0),
    missing: Array.isArray(data.missing) ? data.missing : [],
    samples: Array.isArray(data.samples) ? data.samples : []
  };
}

export async function issueAdminCoupon(payload: IssueCouponInput): Promise<CouponIssueResult> {
  const result = await callCloudFunction<CloudFunctionResponse<CouponIssueResult>>("admin-coupon", {
    action: "issue",
    ...payload
  });
  const data = unwrapCloudResponse(result, "发放优惠券失败");
  return {
    couponId: Number(data?.couponId || 0),
    couponName: String(data?.couponName || ""),
    issuedCount: Number(data?.issuedCount || 0),
    skippedNoOpenid: Number(data?.skippedNoOpenid || 0),
    missing: Array.isArray(data?.missing) ? data.missing : []
  };
}

export async function deleteAdminCoupon(id: number): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-coupon", {
    action: "delete",
    id
  });
  return unwrapCloudResponse(result, "删除优惠券失败");
}

export interface ScissorsRow {
  id: number;
  sn: string;
  batch_no: string | null;
  product_id: number;
  spec_id: number | null;
  sku: string | null;
  spec_name: string | null;
  card_image: string | null;
  legacy_image?: string | null;
  matched_spec_id: number | null;
  matched_spec_name: string | null;
  matched_sku: string | null;
  spec_count: number | null;
  name: string;
  model: string | null;
  image: string | null;
  produce_date: string | null;
  warranty_months: number;
  points_value: number;
  status: "unused" | "sold" | "bound" | "expired";
  created_at: string | null;
  updated_at: string | null;
  bound_user_id: number | null;
  bound_at: string | null;
  bound_username: string | null;
  bound_phone: string | null;
  bound_openid: string | null;
}

export interface ScissorsListResult {
  list: ScissorsRow[];
  total: number;
}

export interface ScissorsQuery {
  sn?: string;
  batchNo?: string;
  status?: string;
  productId?: number;
  specId?: number;
  page?: number;
  pageSize?: number;
}

export interface ScissorsBatchRow {
  batch_no: string;
  product_id: number;
  name: string;
  matched_spec_id?: number | null;
  spec_name?: string | null;
  sku?: string | null;
  points_value: number;
  warranty_months: number;
  produce_date: string | null;
  total_count: number;
  unused_count: number;
  bound_count: number;
  sold_count: number;
  expired_count: number;
  created_at: string | null;
}

export interface ScissorsBatchListResult {
  list: ScissorsBatchRow[];
  total: number;
}

export interface ScissorsProductOption {
  id: number;
  name: string;
  cover_image?: string | null;
  specs?: Array<{
    id: number;
    product_id: number;
    name: string;
    image?: string | null;
    price?: number;
    sort_order?: number;
    sku?: string | null;
  }>;
}

export interface BatchGenerateScissorsInput {
  product_id: number;
  spec_id?: number;
  sku?: string;
  spec_name?: string;
  card_image?: string;
  count: number;
  points_value: number;
  sn_length?: number;
  warranty_months?: number;
  prefix?: string;
  produce_date?: string;
  name?: string;
  model?: string;
  image?: string;
  batch_no?: string;
}

export interface BatchGenerateScissorsResult {
  batchNo: string;
  count: number;
  productId: number;
  productName: string;
  specId?: number | null;
  specName?: string;
  sku?: string;
  cardImage?: string;
  pointsValue: number;
  warrantyMonths: number;
  produceDate: string | null;
  snLength: number;
  sampleSns: string[];
  allSns: string[];
}

export interface ScissorsDetailResult {
  scissors: ScissorsRow;
  binding: {
    id: number;
    user_id: number;
    sn: string;
    activation_date: string;
    warranty_expire: string;
    status: string;
    remark: string | null;
    source: string;
    created_at: string;
    username: string | null;
    phone: string | null;
    openid: string | null;
  } | null;
  pointsLog: {
    id: number;
    points: number;
    balance: number;
    change_type: string;
    reason: string | null;
    remark: string | null;
    created_at: string;
  } | null;
}

export async function fetchAdminScissors(query: ScissorsQuery): Promise<ScissorsListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<ScissorsListResult>>("admin-scissors", {
    action: "list",
    sn: (query.sn || "").trim(),
    batchNo: (query.batchNo || "").trim(),
    status: (query.status || "").trim(),
    productId: query.productId || 0,
    specId: query.specId || 0,
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });
  const data = unwrapCloudResponse(result, "获取 SN 列表失败");
  const list = Array.isArray(data?.list) ? data.list : [];
  const cloudIds = list
    .flatMap((item) => [item.image, item.card_image, item.legacy_image])
    .map((item) => String(item || "").trim())
    .filter((item) => item.startsWith("cloud://"));
  const urlMap = cloudIds.length > 0 ? await resolveAdminFileUrls(cloudIds) : {};
  return {
    list: list.map((item) => ({
      ...item,
      image: item.image && String(item.image).startsWith("cloud://") ? urlMap[item.image] || item.image : item.image,
      card_image:
        item.card_image && String(item.card_image).startsWith("cloud://")
          ? urlMap[item.card_image] || item.card_image
          : item.card_image,
      legacy_image:
        item.legacy_image && String(item.legacy_image).startsWith("cloud://")
          ? urlMap[item.legacy_image] || item.legacy_image
          : item.legacy_image
    })),
    total: Number(data?.total || 0)
  };
}

export async function fetchAdminScissorsBatches(
  page = 1,
  pageSize = 30
): Promise<ScissorsBatchListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<ScissorsBatchListResult>>(
    "admin-scissors",
    {
      action: "listBatches",
      page,
      pageSize
    }
  );
  const data = unwrapCloudResponse(result, "获取 SN 批次失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchAdminScissorsProducts(): Promise<ScissorsProductOption[]> {
  const result = await callCloudFunction<CloudFunctionResponse<ScissorsProductOption[]>>(
    "admin-scissors",
    { action: "listProducts" }
  );
  const data = unwrapCloudResponse(result, "获取商品列表失败");
  return Array.isArray(data) ? data : [];
}

export async function batchGenerateScissors(
  payload: BatchGenerateScissorsInput
): Promise<BatchGenerateScissorsResult> {
  const result = await callCloudFunction<CloudFunctionResponse<BatchGenerateScissorsResult>>(
    "admin-scissors",
    {
      action: "batchGenerate",
      ...payload
    }
  );
  return unwrapCloudResponse(result, "批量生成 SN 失败");
}

export async function fetchAdminScissorsDetail(params: {
  id?: number;
  sn?: string;
}): Promise<ScissorsDetailResult> {
  const result = await callCloudFunction<CloudFunctionResponse<ScissorsDetailResult>>(
    "admin-scissors",
    {
      action: "detail",
      id: params.id || 0,
      sn: params.sn || ""
    }
  );
  const data = unwrapCloudResponse(result, "获取 SN 详情失败");
  const imageIds = [data?.scissors?.image, data?.scissors?.card_image, data?.scissors?.legacy_image]
    .map((item) => String(item || "").trim())
    .filter((item) => item.startsWith("cloud://"));
  const urlMap = imageIds.length > 0 ? await resolveAdminFileUrls(imageIds) : {};
  if (data?.scissors) {
    const image = String(data.scissors.image || "");
    const cardImage = String(data.scissors.card_image || "");
    const legacyImage = String(data.scissors.legacy_image || "");
    data.scissors.image = image.startsWith("cloud://") ? urlMap[image] || image : data.scissors.image;
    data.scissors.card_image = cardImage.startsWith("cloud://") ? urlMap[cardImage] || cardImage : data.scissors.card_image;
    data.scissors.legacy_image = legacyImage.startsWith("cloud://")
      ? urlMap[legacyImage] || legacyImage
      : data.scissors.legacy_image;
  }
  return data;
}

export async function deleteUnusedScissors(ids: number[]): Promise<{ deleted: number; requested: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ deleted: number; requested: number }>>(
    "admin-scissors",
    {
      action: "deleteUnused",
      ids
    }
  );
  return unwrapCloudResponse(result, "删除失败");
}

export interface AdminBannerQuery {
  keyword?: string;
  position?: string;
  is_active?: number;
  page?: number;
  pageSize?: number;
}

export interface AdminBannerListResult {
  list: BannerRow[];
  total: number;
}

export interface AdminBannerInput {
  id?: number;
  title: string;
  subtitle?: string;
  image: string;
  mobile_image?: string;
  link_type: BannerRow["link_type"];
  link_value?: string;
  link_param?: unknown;
  position?: string;
  sort_order?: number;
  is_active?: number;
  start_time?: string;
  end_time?: string;
}

export async function fetchAdminBanners(query: AdminBannerQuery = {}): Promise<AdminBannerListResult> {
  if (targetAdminModeEnabled()) { const p = new URLSearchParams(); Object.entries({ keyword: query.keyword?.trim(), position: query.position?.trim(), isActive: query.is_active, page: query.page || 1, pageSize: query.pageSize || 50 }).forEach(([k,v]) => { if (v !== undefined && v !== "") p.set(k, String(v)); }); return targetAdminRequest<AdminBannerListResult>(`/api/v1/admin/banners?${p}`); }
  const result = await callCloudFunction<CloudFunctionResponse<AdminBannerListResult>>("admin-banner", {
    action: "list",
    keyword: (query.keyword || "").trim(),
    position: (query.position || "").trim(),
    is_active: query.is_active === undefined ? "" : query.is_active,
    page: query.page || 1,
    pageSize: query.pageSize || 50
  });
  const data = unwrapCloudResponse(result, "获取轮播图列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function fetchAdminBannerDetail(id: number): Promise<BannerRow> {
  const result = await callCloudFunction<CloudFunctionResponse<BannerRow>>("admin-banner", {
    action: "detail",
    id
  });
  return unwrapCloudResponse(result, "获取轮播图详情失败");
}

export async function saveAdminBanner(payload: AdminBannerInput): Promise<{ id: number }> {
  const action = payload.id ? "update" : "create";
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-banner", {
    action,
    ...payload
  });
  return unwrapCloudResponse(result, payload.id ? "更新轮播图失败" : "新增轮播图失败");
}

export async function toggleAdminBanner(id: number, isActive: number): Promise<{ id: number; is_active: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; is_active: number }>>(
    "admin-banner",
    {
      action: "toggle",
      id,
      is_active: isActive
    }
  );
  return unwrapCloudResponse(result, "更新轮播图状态失败");
}

export async function updateAdminBannerSort(id: number, sortOrder: number): Promise<{ id: number; sort_order: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; sort_order: number }>>(
    "admin-banner",
    {
      action: "updateSort",
      id,
      sort_order: sortOrder
    }
  );
  return unwrapCloudResponse(result, "更新轮播图排序失败");
}

export async function deleteAdminBanner(id: number): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-banner", {
    action: "delete",
    id
  });
  return unwrapCloudResponse(result, "删除轮播图失败");
}

export async function fetchBanners(): Promise<BannerRow[]> {
  const result = await fetchAdminBanners({ is_active: 1, pageSize: 100 });
  return result.list;
}

export async function createProduct(payload: CreateProductInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("product", {
    action: "add",
    ...payload
  });
  return unwrapCloudResponse(result, "创建商品失败");
}

export async function createAdminProduct(payload: CreateProductInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-product", {
    action: "add",
    ...payload
  });
  return unwrapCloudResponse(result, "后台创建商品失败");
}

export async function fetchAdminProductDetail(id: number): Promise<Record<string, unknown>> {
  const result = await callCloudFunction<CloudFunctionResponse<Record<string, unknown>>>("admin-product", {
    action: "detail",
    id
  });
  return unwrapCloudResponse(result, "获取商品详情失败");
}

export async function updateAdminProduct(payload: CreateProductInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-product", {
    action: "update",
    ...payload
  });
  return unwrapCloudResponse(result, "后台更新商品失败");
}

export async function deleteAdminProduct(id: number): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-product", {
    action: "delete",
    id
  });
  return unwrapCloudResponse(result, "后台删除商品失败");
}

export async function restockAdminProduct(id: number, stock: number): Promise<{ id: number; stock: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; stock: number }>>("admin-product", {
    action: "restock",
    id,
    stock
  });
  return unwrapCloudResponse(result, "后台更新库存失败");
}

export async function uploadAdminImages(files: File[], folder: string) {
  const uploaded = await Promise.all(
    files.map((file) => {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const cloudPath = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
      return uploadFileToCloud(cloudPath, file);
    })
  );
  return uploaded;
}

export async function resolveAdminFileUrls(fileIDs: string[]) {
  return getTempFileUrlMap(fileIDs);
}

export async function fetchCouponRules(): Promise<CouponRuleRow[]> {
  const result = await callCloudFunction<CloudFunctionResponse<CouponRuleRow[]>>("admin-coupon", { action: "rules" });
  const data = unwrapCloudResponse(result, "获取优惠券规则失败");
  return Array.isArray(data) ? data : [];
}

export async function setCouponRule(rule: CouponRuleInput): Promise<{ id: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number }>>("admin-coupon", { action: "setRule", ...rule });
  return unwrapCloudResponse(result, "保存优惠券规则失败");
}

export async function deleteCouponRule(id: number): Promise<void> {
  await callCloudFunction("admin-coupon", { action: "deleteRule", id });
}

export async function fetchInquiries(query: InquiryQuery): Promise<InquiryListResult> {
  const result = await callCloudFunction<CloudFunctionResponse<InquiryListResult>>("admin-inquiry", {
    action: "list",
    keyword: (query.keyword || "").trim(),
    status: query.status !== undefined ? query.status : -1,
    page: query.page || 1,
    pageSize: query.pageSize || 20
  });
  const data = unwrapCloudResponse(result, "获取合作咨询列表失败");
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    total: Number(data?.total || 0)
  };
}

export async function updateInquiryStatus(id: number, status: number): Promise<{ id: number; status: number }> {
  const result = await callCloudFunction<CloudFunctionResponse<{ id: number; status: number }>>("admin-inquiry", {
    action: "updateStatus",
    id,
    status
  });
  return unwrapCloudResponse(result, "更新咨询状态失败");
}

export interface SfShipResult {
  localOrderId?: number;
  orderId: string;
  waybillNo: string;
  waybillToken: string;
  status: string;
  deferred?: boolean;
  reused?: boolean;
}

export interface SfShipError {
  id: number;
  orderNo?: string;
  error: string;
}

export interface SfBatchShipResult {
  shipped: SfShipResult[];
  errors: SfShipError[];
}

export interface SfConfirmShipResult {
  shipped: Array<{ id: number; orderNo: string; waybillNo: string; reused?: boolean }>;
  errors: SfShipError[];
}

export interface SfWaybillPrintFile {
  url?: string;
  token?: string;
  waybillNo?: string;
  fileName?: string;
  contentType?: string;
  base64?: string;
  merged?: boolean;
  sourceCount?: number;
  pageCount?: number;
  error?: string;
}

export interface SfWaybillPrintResult {
  templateCode: string;
  fileType: string;
  files: SfWaybillPrintFile[];
}

export interface SfWaybillPrintOptions {
  templateCode?: string;
  customTemplateCode?: string;
  mergePdf?: boolean;
}

export interface SfRouteResult {
  waybillNo: string;
  mailNo: string;
  routes: Array<{
    acceptTime: string;
    acceptAddress: string;
    remark: string;
    opCode: string;
  }>;
}

export interface SfHealthResult {
  configured: boolean;
  partnerID?: string;
  isProd?: boolean;
  baseUrl?: string;
  tokenValid?: boolean;
  sender?: { company: string; contact: string; tel: string; province: string; city: string; county: string; address: string };
  error?: string;
}

export interface SfWaybillActionResult {
  operation: "cancel" | "intercept";
  orderId: number | null;
  orderNo: string;
  waybillNo: string;
  restoredToPaid?: boolean;
  routeCount?: number;
  message?: string;
  result?: unknown;
}

export interface SfOrderParams {
  orderId: number;
  d_contact: string;
  d_tel: string;
  d_province: string;
  d_city: string;
  d_county: string;
  d_address: string;
  cargoName?: string;
  cargoCount?: number;
  cargoUnit?: string;
  remark?: string;
  expressTypeId?: string | number;
}

export async function sfShip(params: SfOrderParams): Promise<SfShipResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfShipResult>>("sf-express", {
    action: "order",
    deferShip: true,
    ...params
  });
  return unwrapCloudResponse(result, "顺丰下单失败");
}

export async function sfBatchShip(orders: SfOrderParams[]): Promise<SfBatchShipResult> {
  const shipped: SfShipResult[] = [];
  const errors: SfShipError[] = [];
  for (const params of orders) {
    try {
      const res = await sfShip(params);
      shipped.push({ ...res, localOrderId: res.localOrderId || params.orderId });
    } catch (e) {
      errors.push({ id: params.orderId, error: e instanceof Error ? e.message : "未知错误" });
    }
  }
  return { shipped, errors };
}

export async function sfConfirmShip(
  shipments: Array<{ orderId: number; waybillNo: string }>
): Promise<SfConfirmShipResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfConfirmShipResult>>("sf-express", {
    action: "confirmShip",
    shipments
  });
  return unwrapCloudResponse(result, "确认顺丰发货失败");
}

export async function sfWaybillPrint(
  waybillNos: string[],
  options: SfWaybillPrintOptions = {}
): Promise<SfWaybillPrintResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfWaybillPrintResult>>("sf-express", {
    action: "print",
    waybillNos: waybillNos.map((item) => String(item || "").trim()).filter(Boolean),
    templateCode: options.templateCode,
    customTemplateCode: options.customTemplateCode,
    includeFileData: true,
    mergePdf: options.mergePdf !== false
  });
  return unwrapCloudResponse(result, "顺丰面单打印失败");
}

export async function sfRoute(trackingNumber: string): Promise<SfRouteResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfRouteResult>>("sf-express", {
    action: "route",
    trackingNumber
  });
  return unwrapCloudResponse(result, "顺丰轨迹查询失败");
}

export async function sfCancelWaybill(params: { orderId?: number; orderNo?: string; waybillNo: string }): Promise<SfWaybillActionResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfWaybillActionResult>>("sf-express", {
    action: "cancel",
    ...params
  });
  return unwrapCloudResponse(result, "顺丰运单取消失败");
}

export async function sfInterceptWaybill(params: { orderId?: number; orderNo?: string; waybillNo: string }): Promise<SfWaybillActionResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfWaybillActionResult>>("sf-express", {
    action: "intercept",
    ...params
  });
  return unwrapCloudResponse(result, "顺丰运单拦截失败");
}

export async function sfHealth(): Promise<SfHealthResult> {
  const result = await callCloudFunction<CloudFunctionResponse<SfHealthResult>>("sf-express", {
    action: "health"
  });
  return unwrapCloudResponse(result, "顺丰配置检查失败");
}


