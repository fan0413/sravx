function positiveInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function snapshot(value) {
  if (!value || typeof value === 'object') return value || {};
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function valueText(row, data) {
  if (row.gift_type === 'points') return `+${Number(row.points_change) || Number(data.points) || 0} 积分`;
  if (row.gift_type === 'coupon') return String(data.couponName || data.title || '优惠券');
  if (row.gift_type === 'product') return row.fulfillment_status === 'pending_address' ? '待填写地址' : '已生成订单';
  if (row.gift_type === 'combo' || row.gift_type === 'bundle') return '组合权益';
  return '已到账';
}

export function createMysqlGiftCardReadRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async list(userId, { page = 1, pageSize = 10 } = {}) {
      if (!positiveInteger(userId)) throw new Error('A valid user id is required.');
      const limit = Math.min(50, positiveInteger(pageSize, 10));
      const offset = (positiveInteger(page, 1) - 1) * limit;
      const [rows] = await pool.execute(
        `SELECT r.id, r.gift_type, r.gift_title, r.gift_snapshot, r.fulfillment_status, r.order_id, r.order_no, r.user_coupon_id, r.points_change, r.created_at
           FROM gift_redeem_records r
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
      return rows.map((row) => {
        const data = snapshot(row.gift_snapshot);
        const needsAddress = ['product', 'combo', 'bundle'].includes(row.gift_type) && row.fulfillment_status === 'pending_address';
        return { id: row.id, giftType: row.gift_type, title: row.gift_title || data.title || '礼品卡兑换', valueText: valueText(row, data), fulfillmentStatus: row.fulfillment_status, orderId: row.order_id, orderNo: row.order_no, userCouponId: row.user_coupon_id, points: Number(row.points_change) || 0, created_at: row.created_at, nextAction: needsAddress ? 'select_address' : '' };
      });
    }
  });
}
