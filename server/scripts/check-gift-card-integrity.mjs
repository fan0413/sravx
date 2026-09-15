function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export async function collectGiftCardIntegrity(connection) {
  const [[records]] = await connection.execute(
    `SELECT COUNT(*) AS totalRecords,
            SUM(r.user_id IS NULL OR u.id IS NULL) AS recordsWithoutUser,
            SUM(c.id IS NULL) AS recordsWithoutCard,
            SUM(r.gift_card_id IS NULL) AS recordsWithoutCardId
       FROM gift_redeem_records r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN gift_cards c ON c.id = r.gift_card_id`
  );
  const [[redeemedCards]] = await connection.execute(
    `SELECT COUNT(*) AS redeemedCardsWithoutRecord
       FROM gift_cards c
       LEFT JOIN gift_redeem_records r ON r.gift_card_id = c.id
      WHERE c.status = 'redeemed' AND r.id IS NULL`
  );
  const [[duplicates]] = await connection.execute(
    `SELECT COUNT(*) AS cardsWithMultipleRecords
       FROM (
         SELECT gift_card_id
           FROM gift_redeem_records
          GROUP BY gift_card_id
         HAVING COUNT(*) > 1
       ) duplicates`
  );
  const result = {
    totalRecords: count(records.totalRecords),
    recordsWithoutUser: count(records.recordsWithoutUser),
    recordsWithoutCard: count(records.recordsWithoutCard),
    recordsWithoutCardId: count(records.recordsWithoutCardId),
    redeemedCardsWithoutRecord: count(redeemedCards.redeemedCardsWithoutRecord),
    cardsWithMultipleRecords: count(duplicates.cardsWithMultipleRecords)
  };
  return { ...result, readyForUserScopedReads: Object.values(result).slice(1).every((value) => value === 0) };
}

function databaseArgument(args) {
  if (args.length !== 2 || args[0] !== '--database' || !args[1]) throw new Error('Usage: --database <name>');
  return args[1];
}

if (import.meta.main) {
  const database = databaseArgument(process.argv.slice(2));
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required.`);
    return value;
  };
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ host: required('MYSQL_HOST'), port: Number(required('MYSQL_PORT')), user: required('MYSQL_MIGRATION_USER'), password: required('MYSQL_MIGRATION_PASSWORD'), database, connectionLimit: 1 });
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION TRANSACTION READ ONLY');
      const result = await collectGiftCardIntegrity(connection);
      console.log(JSON.stringify(result));
      if (!result.readyForUserScopedReads) process.exitCode = 2;
    } finally { connection.release(); }
  } finally { await pool.end(); }
}
