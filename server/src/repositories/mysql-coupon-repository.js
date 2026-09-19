function asInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function moneyToFen(value) {
  const matched = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim());
  if (!matched) return null;
  const amount = Number(matched[1]) * 100 + Number((matched[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function campaignView(row, claim = null) {
  return {
    id: Number(row.id), name: row.name, type: row.kind, kind: row.kind,
    value: Number(row.value_fen) / 100, value_fen: Number(row.value_fen),
    min_amount: Number(row.minimum_fen) / 100, minimum_fen: Number(row.minimum_fen),
    remain_count: Math.max(0, Number(row.total_limit) - Number(row.claimed_count)),
    start_time: row.starts_at, expire_time: row.ends_at,
    ...(claim ? { user_coupon_id: Number(claim.id), status: claim.status, received_at: claim.claimed_at, used_at: claim.used_at } : {})
  };
}

function couponError(code) {
  const cause = new Error(code);
  cause.code = code;
  return cause;
}

export function createMysqlCouponRepository(pool) {
  if (!pool || typeof pool.execute !== 'function' || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');

  async function transaction(work) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }

  return Object.freeze({
    async listAvailable() {
      const [rows] = await pool.execute(
        `SELECT id, name, kind, value_fen, minimum_fen, total_limit, claimed_count, starts_at, ends_at
           FROM coupon_campaigns
          WHERE status = 'active' AND starts_at <= NOW() AND ends_at > NOW() AND claimed_count < total_limit
          ORDER BY created_at DESC, id DESC`
      );
      return rows.map((row) => campaignView(row));
    },

    async listMine(userId, status = 'unused') {
      const id = asInteger(userId);
      if (!id || !['unused', 'used', 'expired'].includes(status)) throw couponError('INVALID_REQUEST');
      const statusClause = status === 'unused'
        ? "cc.status = 'unused' AND cp.ends_at > NOW()"
        : status === 'used' ? "cc.status = 'used'" : "(cc.status = 'expired' OR cp.ends_at <= NOW())";
      const [rows] = await pool.execute(
        `SELECT cp.id, cp.name, cp.kind, cp.value_fen, cp.minimum_fen, cp.total_limit, cp.claimed_count, cp.starts_at, cp.ends_at,
                cc.id AS claim_id, cc.status AS claim_status, cc.claimed_at, cc.used_at
           FROM coupon_claims cc INNER JOIN coupon_campaigns cp ON cp.id = cc.campaign_id
          WHERE cc.user_id = ? AND ${statusClause}
          ORDER BY cc.claimed_at DESC, cc.id DESC`,
        [id]
      );
      return rows.map((row) => campaignView(row, { id: row.claim_id, status: row.claim_status, claimed_at: row.claimed_at, used_at: row.used_at }));
    },

    async claim(userId, campaignId, idempotencyKey) {
      const id = asInteger(userId);
      const campaign = asInteger(campaignId);
      if (!id || !campaign || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{12,64}$/.test(idempotencyKey)) throw couponError('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[sameRequest]] = await connection.execute(
          `SELECT cc.id, cc.status, cc.claimed_at, cc.used_at, cp.id AS campaign_id, cp.name, cp.kind, cp.value_fen, cp.minimum_fen, cp.total_limit, cp.claimed_count, cp.starts_at, cp.ends_at
             FROM coupon_claims cc INNER JOIN coupon_campaigns cp ON cp.id = cc.campaign_id
            WHERE cc.user_id = ? AND cc.idempotency_key = ? LIMIT 1 FOR UPDATE`, [id, idempotencyKey]
        );
        if (sameRequest) return { coupon: campaignView({ ...sameRequest, id: sameRequest.campaign_id }, { id: sameRequest.id, status: sameRequest.status, claimed_at: sameRequest.claimed_at, used_at: sameRequest.used_at }), idempotent: true };

        const [[alreadyClaimed]] = await connection.execute('SELECT id FROM coupon_claims WHERE user_id = ? AND campaign_id = ? LIMIT 1 FOR UPDATE', [id, campaign]);
        if (alreadyClaimed) throw couponError('COUPON_ALREADY_CLAIMED');
        const [[current]] = await connection.execute(
          `SELECT id, name, kind, value_fen, minimum_fen, total_limit, claimed_count, per_user_limit, starts_at, ends_at
             FROM coupon_campaigns WHERE id = ? AND status = 'active' FOR UPDATE`, [campaign]
        );
        if (!current || new Date(current.starts_at).getTime() > Date.now() || new Date(current.ends_at).getTime() <= Date.now() || Number(current.claimed_count) >= Number(current.total_limit)) throw couponError('COUPON_UNAVAILABLE');
        if (Number(current.per_user_limit) !== 1) throw couponError('COUPON_RULE_UNSUPPORTED');
        const [insert] = await connection.execute(
          `INSERT INTO coupon_claims (campaign_id, user_id, idempotency_key, status, claimed_at) VALUES (?, ?, ?, 'unused', NOW())`, [campaign, id, idempotencyKey]
        );
        const [updated] = await connection.execute('UPDATE coupon_campaigns SET claimed_count = claimed_count + 1 WHERE id = ? AND claimed_count < total_limit', [campaign]);
        if (updated.affectedRows !== 1) throw couponError('COUPON_UNAVAILABLE');
        return { coupon: campaignView({ ...current, claimed_count: Number(current.claimed_count) + 1 }, { id: insert.insertId, status: 'unused', claimed_at: new Date(), used_at: null }), idempotent: false };
      });
    },

    async check(userId, claimId, orderAmount) {
      const id = asInteger(userId);
      const claim = asInteger(claimId);
      const orderAmountFen = moneyToFen(orderAmount);
      if (!id || !claim || orderAmountFen === null) throw couponError('INVALID_REQUEST');
      const [rows] = await pool.execute(
        `SELECT cp.id, cp.name, cp.kind, cp.value_fen, cp.minimum_fen, cp.total_limit, cp.claimed_count, cp.starts_at, cp.ends_at,
                cc.id AS claim_id, cc.status AS claim_status, cc.claimed_at, cc.used_at
           FROM coupon_claims cc INNER JOIN coupon_campaigns cp ON cp.id = cc.campaign_id
          WHERE cc.id = ? AND cc.user_id = ? AND cc.status = 'unused' AND cp.status = 'active' AND cp.starts_at <= NOW() AND cp.ends_at > NOW()
          LIMIT 1`, [claim, id]
      );
      if (!rows.length) throw couponError('COUPON_UNAVAILABLE');
      const row = rows[0];
      if (orderAmountFen < Number(row.minimum_fen)) throw couponError('COUPON_MINIMUM_NOT_MET');
      return campaignView(row, { id: row.claim_id, status: row.claim_status, claimed_at: row.claimed_at, used_at: row.used_at });
    }
  });
}
