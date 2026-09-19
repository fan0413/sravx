import { randomUUID } from 'node:crypto';

function positive(value, maximum = Number.MAX_SAFE_INTEGER) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : null; }
function code(value) { return typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 64) : ''; }
function parse(value) { try { return value && typeof value === 'object' ? value : JSON.parse(String(value || '{}')); } catch { return {}; } }
function error(code) { const cause = new Error(code); cause.code = code; return cause; }
function orderNo() { return `SG${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`; }
function view(record, { idempotent = false } = {}) { const snapshot = parse(record.gift_snapshot); return { recordId: Number(record.id), giftType: record.gift_type, title: record.gift_title, fulfillmentStatus: record.fulfillment_status, orderId: record.order_id ? Number(record.order_id) : null, orderNo: record.order_no || '', userCouponId: record.user_coupon_id ? Number(record.user_coupon_id) : null, points: Number(record.points_change) || 0, nextAction: record.fulfillment_status === 'pending_address' ? 'select_address' : record.order_id ? 'order_detail' : record.gift_type === 'coupon' ? 'coupon_list' : record.gift_type === 'points' ? 'points_mall' : '', snapshot, idempotent }; }

export function createMysqlGiftCardRepository(pool) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  async function transaction(work) { const connection = await pool.getConnection(); try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); } }
  async function user(connection, id) { const [[row]] = await connection.execute('SELECT id, openid, points, total_points FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [id]); if (!row) throw error('USER_NOT_FOUND'); return row; }
  async function address(connection, userId, addressId) {
    const [[row]] = await connection.execute(`SELECT a.name, a.contact, a.phone, a.province, a.city, a.district, a.detail FROM addresses a INNER JOIN users u ON u.openid = a.openid WHERE a.id = ? AND u.id = ? LIMIT 1 FOR UPDATE`, [addressId, userId]);
    if (!row || !row.phone || !row.detail) throw error('ADDRESS_NOT_FOUND'); return row;
  }
  async function createGiftOrder(connection, userRow, payload, addressRow) {
    const productId = positive(payload.productId ?? payload.product_id); const quantity = positive(payload.quantity ?? 1, 99); const specName = typeof payload.selectedSpecName === 'string' ? payload.selectedSpecName.trim().slice(0, 100) : '';
    if (!productId || !quantity) throw error('GIFT_PRODUCT_INVALID');
    const [[product]] = await connection.execute('SELECT id, name, price, cover_image, stock, is_on_sale, deleted_at FROM products WHERE id = ? LIMIT 1 FOR UPDATE', [productId]);
    if (!product || Number(product.is_on_sale) !== 1 || product.deleted_at) throw error('GIFT_PRODUCT_UNAVAILABLE');
    let price = Number(product.price); let sku = null;
    if (specName) { const [[spec]] = await connection.execute('SELECT sku, price FROM product_specs WHERE product_id = ? AND name = ? LIMIT 1 FOR UPDATE', [productId, specName]); if (!spec) throw error('GIFT_PRODUCT_SPEC_NOT_FOUND'); sku = spec.sku || null; if (spec.price !== null) price = Number(spec.price); }
    if (!Number.isFinite(price) || price < 0) throw error('GIFT_PRODUCT_INVALID');
    const [stock] = await connection.execute('UPDATE products SET stock = stock - ?, sales_count = IFNULL(sales_count, 0) + ? WHERE id = ? AND stock >= ?', [quantity, quantity, productId, quantity]);
    if (stock.affectedRows !== 1) throw error('GIFT_PRODUCT_OUT_OF_STOCK');
    const total = (price * quantity).toFixed(2); const no = orderNo();
    const [created] = await connection.execute(`INSERT INTO orders (order_no, user_id, _openid, total_amount, freight, discount_amount, coupon_amount, points_amount, pay_amount, status, pay_type, pay_time, buyer_message, shipping_type, ship_deadline_days, shipping_promise, delay_shipping_reason, delay_shipping_note, created_at, updated_at) VALUES (?, ?, ?, ?, 0.00, ?, 0.00, 0.00, 0.00, 'paid', 'other', NOW(), '礼品卡兑换', 'normal', 2, '', '', '', NOW(), NOW())`, [no, userRow.id, userRow.openid, total, total]);
    const id = created.insertId;
    await connection.execute('INSERT INTO order_items (order_id, _openid, product_id, sku, product_name, product_image, spec_desc, price, quantity, selected_color, discount_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, NOW())', [id, userRow.openid, productId, sku, product.name, product.cover_image || null, specName || null, quantity, specName || null, total]);
    await connection.execute('INSERT INTO order_addresses (order_id, _openid, name, phone, province, city, district, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [id, userRow.openid, addressRow.name || addressRow.contact, addressRow.phone, addressRow.province || '', addressRow.city || '', addressRow.district || '', addressRow.detail]);
    return { id, no, productId, productName: product.name, quantity, selectedSpecName: specName, productImage: product.cover_image || '' };
  }
  return Object.freeze({
    async redeem(userId, input) {
      const customerId = positive(userId); const rawCode = code(input?.code); const addressId = positive(input?.addressId);
      if (!customerId || !rawCode) throw error('INVALID_REQUEST');
      return transaction(async (connection) => {
        const currentUser = await user(connection, customerId);
        const [[card]] = await connection.execute('SELECT * FROM gift_cards WHERE code = ? LIMIT 1 FOR UPDATE', [rawCode]);
        if (!card) throw error('GIFT_CARD_NOT_FOUND');
        if (card.status === 'redeemed') {
          const [[record]] = await connection.execute('SELECT * FROM gift_redeem_records WHERE gift_card_id = ? LIMIT 1', [card.id]);
          if (record && Number(record.user_id) === customerId) return view(record, { idempotent: true });
          throw error('GIFT_CARD_ALREADY_REDEEMED');
        }
        if (card.status !== 'unused' || (card.expire_time && new Date(card.expire_time).getTime() <= Date.now())) { if (card.status === 'unused') await connection.execute("UPDATE gift_cards SET status = 'expired', updated_at = NOW() WHERE id = ?", [card.id]); throw error('GIFT_CARD_UNAVAILABLE'); }
        const payload = parse(card.gift_payload); const type = String(card.gift_type || '').trim(); let record;
        if (type === 'points') {
          const points = positive(payload.points, 10000000); if (!points) throw error('GIFT_POINTS_INVALID');
          const before = Number(currentUser.points) || 0; const after = before + points;
          await connection.execute('UPDATE users SET points = points + ?, total_points = total_points + ? WHERE id = ?', [points, points, customerId]);
          await connection.execute(`INSERT INTO points_logs (user_id, openid, _openid, order_id, change_type, points, balance, reason, remark, created_at) VALUES (?, ?, ?, NULL, 'activity_reward', ?, ?, 'gift_card', ?, NOW())`, [customerId, currentUser.openid, currentUser.openid, points, after, `礼品卡兑换：${card.title}`]);
          const [created] = await connection.execute(`INSERT INTO gift_redeem_records (gift_card_id, code, user_id, _openid, gift_type, gift_title, gift_snapshot, redeem_status, fulfillment_status, points_change, created_at, updated_at) VALUES (?, ?, ?, ?, 'points', ?, ?, 'success', 'fulfilled', ?, NOW(), NOW())`, [card.id, card.code, customerId, currentUser.openid, card.title, JSON.stringify({ points, title: card.title }), points]);
          [[record]] = await connection.execute('SELECT * FROM gift_redeem_records WHERE id = ? LIMIT 1', [created.insertId]);
        } else if (type === 'coupon') {
          const campaignId = positive(payload.campaignId ?? payload.campaign_id); if (!campaignId) throw error('GIFT_COUPON_INVALID');
          const [[campaign]] = await connection.execute(`SELECT * FROM coupon_campaigns WHERE id = ? AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW() LIMIT 1 FOR UPDATE`, [campaignId]);
          if (!campaign || Number(campaign.claimed_count) >= Number(campaign.total_limit)) throw error('GIFT_COUPON_UNAVAILABLE');
          const [[existingClaim]] = await connection.execute('SELECT id FROM coupon_claims WHERE user_id = ? AND campaign_id = ? LIMIT 1 FOR UPDATE', [customerId, campaignId]);
          if (existingClaim) throw error('GIFT_COUPON_ALREADY_CLAIMED');
          const [claim] = await connection.execute(`INSERT INTO coupon_claims (campaign_id, user_id, idempotency_key, status, claimed_at) VALUES (?, ?, ?, 'unused', NOW())`, [campaignId, customerId, `gift-${card.id}`]);
          await connection.execute('UPDATE coupon_campaigns SET claimed_count = claimed_count + 1 WHERE id = ? AND claimed_count < total_limit', [campaignId]);
          const [created] = await connection.execute(`INSERT INTO gift_redeem_records (gift_card_id, code, user_id, _openid, gift_type, gift_title, gift_snapshot, redeem_status, fulfillment_status, user_coupon_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'coupon', ?, ?, 'success', 'fulfilled', ?, NOW(), NOW())`, [card.id, card.code, customerId, currentUser.openid, card.title, JSON.stringify({ campaignId, title: card.title }), claim.insertId]);
          [[record]] = await connection.execute('SELECT * FROM gift_redeem_records WHERE id = ? LIMIT 1', [created.insertId]);
        } else if (type === 'product') {
          if (addressId) {
            const addressRow = await address(connection, customerId, addressId); const giftOrder = await createGiftOrder(connection, currentUser, payload, addressRow);
            const [created] = await connection.execute(`INSERT INTO gift_redeem_records (gift_card_id, code, user_id, _openid, gift_type, gift_title, gift_snapshot, redeem_status, fulfillment_status, order_id, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, 'product', ?, ?, 'success', 'fulfilled', ?, ?, NOW(), NOW())`, [card.id, card.code, customerId, currentUser.openid, card.title, JSON.stringify(giftOrder), giftOrder.id, giftOrder.no]);
            [[record]] = await connection.execute('SELECT * FROM gift_redeem_records WHERE id = ? LIMIT 1', [created.insertId]);
          } else {
            const [created] = await connection.execute(`INSERT INTO gift_redeem_records (gift_card_id, code, user_id, _openid, gift_type, gift_title, gift_snapshot, redeem_status, fulfillment_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'product', ?, ?, 'success', 'pending_address', NOW(), NOW())`, [card.id, card.code, customerId, currentUser.openid, card.title, JSON.stringify(payload)]);
            [[record]] = await connection.execute('SELECT * FROM gift_redeem_records WHERE id = ? LIMIT 1', [created.insertId]);
          }
        } else throw error('GIFT_CARD_TYPE_UNSUPPORTED');
        await connection.execute(`UPDATE gift_cards SET status = 'redeemed', redeemed_by = ?, redeemed_record_id = ?, redeemed_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'unused'`, [currentUser.openid, record.id, card.id]);
        return view(record);
      });
    },
    async confirmProductAddress(userId, recordId, addressId) {
      const customerId = positive(userId); const record = positive(recordId); const addressIdValue = positive(addressId);
      if (!customerId || !record || !addressIdValue) throw error('INVALID_REQUEST');
      return transaction(async (connection) => {
        const currentUser = await user(connection, customerId);
        const [[redeem]] = await connection.execute(`SELECT * FROM gift_redeem_records WHERE id = ? AND user_id = ? AND gift_type = 'product' LIMIT 1 FOR UPDATE`, [record, customerId]);
        if (!redeem) throw error('GIFT_REDEEM_NOT_FOUND');
        if (redeem.fulfillment_status === 'fulfilled' && redeem.order_id) return view(redeem, { idempotent: true });
        if (redeem.fulfillment_status !== 'pending_address') throw error('GIFT_REDEEM_NOT_PENDING_ADDRESS');
        const addressRow = await address(connection, customerId, addressIdValue); const giftOrder = await createGiftOrder(connection, currentUser, parse(redeem.gift_snapshot), addressRow);
        await connection.execute(`UPDATE gift_redeem_records SET fulfillment_status = 'fulfilled', order_id = ?, order_no = ?, gift_snapshot = ?, updated_at = NOW() WHERE id = ?`, [giftOrder.id, giftOrder.no, JSON.stringify(giftOrder), redeem.id]);
        const [[updated]] = await connection.execute('SELECT * FROM gift_redeem_records WHERE id = ? LIMIT 1', [redeem.id]);
        return view(updated);
      });
    }
  });
}
