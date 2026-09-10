export interface OverviewStats {
  users: { total: number; active: number };
  products: { total: number; onSale: number; lowStock: number };
  orders: { total: number; paid: number; pending: number; fulfilled: number };
  gmv: { total: number; week: number };
  refunds: { pending: number };
  coupons: { active: number };
  scissors: { total: number; unused: number; bound: number };
  banners: { online: number };
}

export interface UserRow {
  id: number;
  username: string | null;
  openid: string | null;
  _openid?: string | null;
  phone: string | null;
  member_level: number;
  points: number;
  total_spent: string | number;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface BannerRow {
  id: number;
  title: string;
  subtitle: string | null;
  image: string;
  mobile_image?: string | null;
  link_type: "none" | "product" | "category" | "web" | "path" | "miniprogram";
  link_value: string | null;
  link_param?: unknown;
  position: string;
  sort_order: number;
  is_active: number;
  start_time: string | null;
  end_time: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OrderRow {
  id: number;
  order_no: string;
  user_id: number;
  _openid?: string;
  total_amount: string;
  freight: string;
  discount_amount: string;
  coupon_amount: string;
  points_amount: string;
  pay_amount: string;
  status: "pending_payment" | "paid" | "shipped" | "completed" | "cancelled" | "refunding" | "refunded";
  pay_type: string | null;
  pay_time: string | null;
  pay_transaction_id: string | null;
  logistics_company: string | null;
  logistics_no: string | null;
  ship_time: string | null;
  receive_time: string | null;
  buyer_message: string | null;
  shipping_type?: "normal" | "presale" | "custom" | "delayed";
  ship_deadline_days?: number;
  shipping_promise?: string | null;
  expected_ship_time?: string | null;
  delay_shipping_reason?: string | null;
  delay_shipping_note?: string | null;
  delay_shipping_updated_at?: string | null;
  wechat_shipping_upload_status?: "success" | "failed" | "skipped" | "" | null;
  wechat_shipping_upload_time?: string | null;
  wechat_shipping_upload_error?: string | null;
  wechat_special_report_status?: "success" | "failed" | "skipped" | "" | null;
  wechat_special_report_type?: number | null;
  wechat_special_report_delay_to?: string | null;
  wechat_special_report_time?: string | null;
  wechat_special_report_error?: string | null;
  specs_summary?: string | null;
  used_coupon_id: number | null;
  used_points: number;
  need_invoice: number;
  invoice_title: string | null;
  cancel_time: string | null;
  complete_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: number;
  name: string;
  short_name: string;
  desc: string | null;
  price: string;
  category_id: number;
  cover_image: string | null;
  images: string | null;
  detail_images: string | null;
  core_material: string | null;
  handle_material: string | null;
  size: string | null;
  weight: string | null;
  warranty_period: string | null;
  warranty_months: number;
  scissors_card_image: string | null;
  stock: number;
  is_on_sale: number;
  is_recommend: number;
  allow_coupon: number;
  shipping_type?: "normal" | "presale" | "custom" | "delayed";
  ship_deadline_days?: number;
  shipping_promise?: string | null;
  shipping_delay_reason?: string | null;
  shipping_note?: string | null;
  has_spec?: number;
  sort_order?: number;
  sales_count: number;
  specs?: Array<{
    id?: number;
    name: string;
    image?: string;
    price: number;
    sku: string;
    shipping_type?: "normal" | "presale" | "custom" | "delayed";
    ship_deadline_days?: number;
    shipping_promise?: string | null;
    shipping_delay_reason?: string | null;
    shipping_note?: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
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
  status: "active" | "disabled";
  created_at?: string | null;
  updated_at?: string | null;
}
