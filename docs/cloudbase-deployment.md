# Saven 剪刀电商小程序 - CloudBase 部署说明

## 一、环境信息

- **环境ID**: `cloud1-8gk3bptqefbf01d6`
- **环境名称**: cloud1
- **地域**: ap-shanghai
- **MySQL实例**: `tnt-amkncrjmc` (状态: RUNNING)

## 二、已创建数据库表 (14张)

| 表名 | 中文名 | 说明 |
|------|--------|------|
| users | 用户表 | 存储用户基本信息 |
| user_addresses | 收货地址表 | 用户收货地址 |
| categories | 商品分类表 | 商品分类 |
| products | 商品表 | 商品信息 |
| product_specs | 商品规格表 | 商品规格选项 |
| scissors | 剪刀产品表 | 剪刀SN码管理 |
| orders | 订单表 | 订单主表 |
| order_items | 订单商品表 | 订单商品详情 |
| order_addresses | 订单地址快照表 | 订单收货地址快照 |
| user_scissors | 用户绑定剪刀表 | 用户绑定剪刀记录 |
| points_logs | 积分变动记录表 | 积分变动日志 |
| coupons | 优惠券表 | 优惠券定义 |
| user_coupons | 用户优惠券表 | 用户领取的优惠券 |
| banners | 轮播图表 | 首页轮播图 |

## 三、已部署云函数 (9个)

| 云函数名 | 功能 | 触发方式 |
|----------|------|----------|
| login | 微信登录/自动注册 | 小程序调用 |
| user | 用户信息查询 | 小程序调用 |
| category | 分类列表/详情 | 小程序调用 |
| product | 商品列表/详情/首页推荐 | 小程序调用 |
| address | 收货地址管理 | 小程序调用 |
| order | 订单管理（创建/查询/取消/确认收货） | 小程序调用 |
| scissors | 剪刀绑定/解绑/保修查询 | 小程序调用 |
| coupon | 优惠券领取/使用 | 小程序调用 |
| banner | 轮播图获取 | 小程序调用 |

## 四、云函数调用方式

### 微信小程序调用示例

```javascript
// 使用 wx.cloud.callFunction 调用云函数
wx.cloud.callFunction({
  name: 'login', // 云函数名称
  data: {},      // 参数
  success: res => {
    console.log(res);
  }
});
```

### 1. 登录

```javascript
wx.cloud.callFunction({
  name: 'login',
  data: {},
  success: res => {
    if (res.result.success) {
      const { userId, isNewUser } = res.result.data;
    }
  }
});
```

### 2. 商品列表

```javascript
wx.cloud.callFunction({
  name: 'product',
  data: {
    action: 'list',
    categoryId: 1,      // 可选
    page: 1,
    pageSize: 10
  },
  success: res => {
    const { list, pagination } = res.result.data;
  }
});
```

### 3. 订单创建

```javascript
wx.cloud.callFunction({
  name: 'order',
  data: {
    action: 'create',
    addressId: 1,
    items: [
      { productId: 1, quantity: 1, specDesc: '银色/7寸' }
    ],
    remark: '请尽快发货',
    couponId: 1,       // 可选
    usedPoints: 100    // 可选
  },
  success: res => {
    const { orderId, orderNo, payAmount } = res.result.data;
  }
});
```

### 4. 剪刀绑定

```javascript
wx.cloud.callFunction({
  name: 'scissors',
  data: {
    action: 'bind',
    sn: 'SC202604200001'
  },
  success: res => {
    const { sn, name, warranty_expire } = res.result.data;
  }
});
```

## 五、数据库权限说明

### 安全架构

由于使用微信小程序 + 云函数架构，数据安全通过以下方式保障：

1. **云函数鉴权**: 所有数据操作必须通过云函数进行
2. **用户身份验证**: 云函数通过 `wxContext.OPENID` 获取用户身份
3. **业务逻辑校验**: 在云函数内部验证用户是否具有操作权限

### 数据库直连限制

建议不要在客户端直接连接 MySQL，所有操作应通过云函数进行。

## 六、控制台入口

- **云函数管理**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8gk3bptqefbf01d6#/scf
- **MySQL管理**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8gk3bptqefbf01d6#/db/mysql
- **静态托管**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8gk3bptqefbf01d6#/static-hosting

## 七、下一步操作

1. **配置管理员数据**: 插入初始分类、商品、优惠券数据
2. **测试云函数**: 在微信开发者工具中测试各云函数
3. **前端对接**: 在小程序中调用云函数实现业务功能
4. **配置安全域名**: 在微信公众平台配置 request 合法域名

## 八、云函数代码位置

```
cloudfunctions/
├── login/         # 登录云函数
├── user/         # 用户云函数
├── category/      # 分类云函数
├── product/      # 商品云函数
├── address/      # 地址云函数
├── order/        # 订单云函数
├── scissors/     # 剪刀云函数
├── coupon/       # 优惠券云函数
└── banner/       # 轮播图云函数
```
