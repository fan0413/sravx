const assert = require('assert')
const {
  columnExpr,
  buildSpecMatchCondition,
  buildSpecMatchOrder,
  resolveCardImage,
  normalizeScissorsItem
} = require('../../cloudfunctions/scissors/card-logic')

function testSqlBuilders() {
  const fullColumns = { spec_id: true, sku: true, spec_name: true, card_image: true, image: true }
  const condition = buildSpecMatchCondition(fullColumns, 'ps2', 's')
  assert.ok(condition.includes('ps2.id = s.spec_id'))
  assert.ok(condition.includes('ps2.sku = s.sku'))
  assert.ok(condition.includes('ps2.name = s.spec_name'))

  const order = buildSpecMatchOrder(fullColumns, 'ps2', 's')
  assert.ok(order.includes('THEN 1'))
  assert.ok(order.includes('THEN 2'))
  assert.ok(order.includes('THEN 3'))

  assert.strictEqual(columnExpr('s', 'card_image', fullColumns), 's.card_image')

  const emptyColumns = {}
  assert.strictEqual(buildSpecMatchCondition(emptyColumns, 'ps2', 's'), '1 = 0')
  assert.strictEqual(buildSpecMatchOrder(emptyColumns, 'ps2', 's'), '9')
  assert.strictEqual(columnExpr('s', 'card_image', emptyColumns), 'NULL')
}

function testImagePriority() {
  assert.strictEqual(
    resolveCardImage({
      scissors_card_image: 'sn-card.jpg',
      spec_image: 'spec.jpg',
      product_cover_image: 'cover.jpg',
      user_image: 'snapshot.jpg'
    }),
    'sn-card.jpg'
  )

  assert.strictEqual(
    resolveCardImage({
      spec_image: 'spec.jpg',
      scissors_image: 'legacy-sn.jpg',
      product_cover_image: 'cover.jpg'
    }),
    'spec.jpg'
  )

  assert.strictEqual(
    resolveCardImage({
      single_spec_image: 'single-spec.jpg',
      product_cover_image: 'cover.jpg',
      user_image: 'snapshot.jpg'
    }),
    'single-spec.jpg'
  )

  assert.strictEqual(
    resolveCardImage({
      product_cover_image: 'cover.jpg',
      user_image: 'snapshot.jpg'
    }),
    'cover.jpg'
  )
}

function testNormalize() {
  const item = normalizeScissorsItem(
    {
      id: 10,
      sn: 'SN001',
      user_image: 'cloud://snapshot',
      matched_spec_id: 3,
      matched_spec_name: 'Black',
      matched_spec_sku: 'P0001-02',
      spec_image: 'cloud://spec-image'
    },
    {
      'cloud://spec-image': 'https://cdn.example/spec-image.jpg'
    }
  )

  assert.strictEqual(item.spec_id, 3)
  assert.strictEqual(item.spec_name, 'Black')
  assert.strictEqual(item.sku, 'P0001-02')
  assert.strictEqual(item.card_image, 'https://cdn.example/spec-image.jpg')
}

testSqlBuilders()
testImagePriority()
testNormalize()

console.log('scissors card logic tests passed')
