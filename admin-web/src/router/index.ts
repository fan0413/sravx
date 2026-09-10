import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import AdminLayout from "../layout/AdminLayout.vue";
import { isNonAnonymousLoggedIn } from "../lib/cloudbase";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("../views/auth/LoginView.vue"),
    meta: { public: true, title: "登录" }
  },
  {
    path: "/",
    component: AdminLayout,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        name: "Dashboard",
        component: () => import("../views/dashboard/DashboardHome.vue"),
        meta: { title: "经营看板" }
      },
      {
        path: "product/list",
        name: "ProductList",
        component: () => import("../views/product/ProductList.vue"),
        meta: { title: "商品列表" }
      },
      {
        path: "product/create",
        name: "ProductCreate",
        component: () => import("../views/product/ProductCreate.vue"),
        meta: { title: "新建商品" }
      },
      {
        path: "product/edit/:id",
        name: "ProductEdit",
        component: () => import("../views/product/ProductCreate.vue"),
        meta: { title: "编辑商品" }
      },
      {
        path: "points-product/list",
        name: "PointsProductList",
        component: () => import("../views/points-product/PointsProductList.vue"),
        meta: { title: "积分商品管理" }
      },
      {
        path: "points-product/create",
        name: "PointsProductCreate",
        component: () => import("../views/points-product/PointsProductCreate.vue"),
        meta: { title: "添加积分商品" }
      },
      {
        path: "points-product/edit/:id",
        name: "PointsProductEdit",
        component: () => import("../views/points-product/PointsProductCreate.vue"),
        meta: { title: "编辑积分商品" }
      },
      {
        path: "product/delete/:id",
        name: "ProductDelete",
        component: () => import("../views/product/ProductCreate.vue"),
        meta: { title: "删除商品" }
      },
      {
        path: "order/list",
        name: "OrderList",
        component: () => import("../views/order/OrderList.vue"),
        meta: { title: "订单列表" }
      },
      {
        path: "order/detail/:id",
        name: "OrderDetail",
        component: () => import("../views/order/OrderDetail.vue"),
        meta: { title: "订单详情" }
      },
      {
        path: "points-order/list",
        name: "PointsOrderList",
        component: () => import("../views/points-order/PointsOrderList.vue"),
        meta: { title: "积分订单管理" }
      },
      {
        path: "points-order/detail/:id",
        name: "PointsOrderDetail",
        component: () => import("../views/points-order/PointsOrderDetail.vue"),
        meta: { title: "积分订单详情" }
      },
      {
        path: "refund/list",
        name: "RefundList",
        component: () => import("../views/refund/RefundList.vue"),
        meta: { title: "售后退款" }
      },
      {
        path: "refund/detail/:id",
        name: "RefundDetail",
        component: () => import("../views/refund/RefundDetail.vue"),
        meta: { title: "退款详情" }
      },
      {
        path: "user/list",
        name: "UserList",
        component: () => import("../views/user/UserList.vue"),
        meta: { title: "用户列表" }
      },
      {
        path: "user/detail/:id",
        name: "UserDetail",
        component: () => import("../views/user/UserDetail.vue"),
        meta: { title: "编辑用户" }
      },
      {
        path: "category/list",
        name: "CategoryList",
        component: () => import("../views/category/CategoryList.vue"),
        meta: { title: "分类管理" }
      },
      {
        path: "coupon/list",
        name: "CouponList",
        component: () => import("../views/coupon/CouponList.vue"),
        meta: { title: "优惠券管理" }
      },
      {
        path: "gift-card/list",
        name: "GiftCardList",
        component: () => import("../views/gift-card/GiftCardList.vue"),
        meta: { title: "礼品卡管理" }
      },
      {
        path: "scissors/list",
        name: "ScissorsList",
        component: () => import("../views/scissors/ScissorsList.vue"),
        meta: { title: "剪刀 SN 管理" }
      },
      {
        path: "scissors/after-sale",
        name: "ScissorsAfterSaleList",
        component: () => import("../views/scissors/ScissorsAfterSaleList.vue"),
        meta: { title: "剪刀售后" }
      },
      {
        path: "banner/list",
        name: "BannerList",
        component: () => import("../views/banner/BannerList.vue"),
        meta: { title: "轮播图管理" }
      },
      {
        path: "inquiry/list",
        name: "InquiryList",
        component: () => import("../views/inquiry/InquiryList.vue"),
        meta: { title: "合作咨询" }
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard"
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const loggedIn = await isNonAnonymousLoggedIn();
  if (loggedIn) return true;
  return {
    path: "/login",
    query: { redirect: to.fullPath }
  };
});

export default router;
