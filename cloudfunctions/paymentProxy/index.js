const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})

const PAYMENT_API_BASE = process.env.PAYMENT_API_BASE || 'https://payment-api-248775-6-1419382340.sh.run.tcloudbase.com'

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PAYMENT_API_BASE)
    const body = JSON.stringify(payload || {})
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      port: url.port || 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 15000
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try {
          parsed = raw ? JSON.parse(raw) : null
        } catch (err) {
          reject(new Error(`支付服务响应异常(${res.statusCode})`))
          return
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error((parsed && (parsed.error || parsed.message)) || `支付服务请求失败(${res.statusCode})`))
          return
        }
        resolve(parsed)
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('支付服务请求超时'))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '用户未登录' }
  }

  const { action, ...params } = event || {}
  const payload = {
    ...params,
    openid
  }

  try {
    let response
    if (action === 'createOrder') {
      response = await postJson('/api/payment/createOrder', payload)
    } else if (action === 'refundOrder') {
      response = await postJson('/api/payment/refund', payload)
    } else {
      return { success: false, error: '未知操作' }
    }

    if (response && response.success) {
      return { success: true, data: response.data }
    }
    return { success: false, error: (response && (response.error || response.message)) || '支付服务返回失败' }
  } catch (err) {
    console.error('[paymentProxy] error:', err)
    return { success: false, error: err.message || '支付服务请求失败' }
  }
}
