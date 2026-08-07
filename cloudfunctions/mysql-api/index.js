/**
 * MySQL HTTP API 云函数
 * 提供统一的 MySQL 数据访问接口
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ENV_ID = 'cloud1-8gk3bptqefbf01d6';
const DB_NAME = 'cloud1-8gk3bptqefbf01d6';

// 简单查询函数 - 使用 REST API
async function query(table, conditions = {}) {
  const baseUrl = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`;
  let url = `${baseUrl}/${table}?limit=100`;
  
  // 构建查询条件
  Object.entries(conditions).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url += `&${key}=eq.${encodeURIComponent(value)}`;
    }
  });
  
  try {
    const res = await cloud.request({
      url,
      method: 'GET',
      header: { 'Content-Type': 'application/json' }
    });
    return res.data || [];
  } catch (err) {
    console.error(`Query error for ${table}:`, err);
    return [];
  }
}

// 带排序和分页的查询
async function queryWithOptions(table, options = {}) {
  const { select = '*', order, limit = 100, offset = 0, conditions = {} } = options;
  const baseUrl = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`;
  let url = `${baseUrl}/${table}?select=${select}&limit=${limit}&offset=${offset}`;
  
  // 添加排序
  if (order) {
    const [field, dir] = order.split('.');
    url += `&order=${field}.${dir || 'asc'}`;
  }
  
  // 添加查询条件
  Object.entries(conditions).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && value.op) {
        url += `&${key}=${value.op}.${encodeURIComponent(value.value)}`;
      } else {
        url += `&${key}=eq.${encodeURIComponent(value)}`;
      }
    }
  });
  
  try {
    const res = await cloud.request({
      url,
      method: 'GET',
      header: { 'Content-Type': 'application/json' }
    });
    return res.data || [];
  } catch (err) {
    console.error(`Query error for ${table}:`, err);
    return [];
  }
}

exports.main = async (event, context) => {
  const { action, table, ...params } = event;

  try {
    // 获取轮播图
    if (action === 'getBanners') {
      const data = await queryWithOptions('banners', {
        conditions: { is_active: 1, position: 'home' },
        order: 'sort_order.asc'
      });
      return { success: true, data };
    }

    // 获取分类
    if (action === 'getCategories') {
      const data = await queryWithOptions('categories', {
        conditions: { is_show: 1 },
        order: 'sort_order.asc'
      });
      return { success: true, data };
    }

    // 获取商品列表
    if (action === 'getProducts') {
      const { categoryId, page = 1, pageSize = 10 } = params;
      const conditions = { is_on_sale: 1 };
      
      if (categoryId) {
        conditions.category_id = Number(categoryId);
      }
      
      const data = await queryWithOptions('products', {
        select: 'id,name,short_name,price,cover_image,stock,sales_count',
        conditions,
        order: 'sort_order.desc',
        limit: Number(pageSize),
        offset: (Number(page) - 1) * Number(pageSize)
      });
      return { success: true, data };
    }

    // 获取推荐商品
    if (action === 'getRecommendProducts') {
      const data = await queryWithOptions('products', {
        select: 'id,name,price,cover_image,stock,sales_count',
        conditions: { is_on_sale: 1, is_recommend: 1 },
        order: 'sort_order.desc',
        limit: 6
      });
      return { success: true, data };
    }

    // 获取商品详情
    if (action === 'getProductDetail') {
      const { id } = params;
      if (!id) return { success: false, error: '缺少商品ID' };
      
      const data = await query('products', { id: Number(id), is_on_sale: 1 });
      if (data.length === 0) {
        return { success: false, error: '商品不存在' };
      }
      return { success: true, data: data[0] };
    }

    // 获取优惠券列表
    if (action === 'getCoupons') {
      const data = await queryWithOptions('coupons', {
        conditions: { status: 'active' },
        order: 'created_at.desc'
      });
      return { success: true, data };
    }

    // 通用查询
    if (action === 'query') {
      if (!table) return { success: false, error: '缺少表名' };
      const data = await queryWithOptions(table, params);
      return { success: true, data };
    }

    return { success: false, error: '未知操作' };
  } catch (error) {
    console.error('MySQL API error:', error);
    return { success: false, error: error.message };
  }
};
