const express = require('express')
const crypto = require('crypto')
const cors = require('cors')

const app = express()
app.use(cors())
// 保留原始 body 字符串供微信支付回调验签使用
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf && buf.length ? buf.toString('utf8') : ''
  }
}))

// 订单查询/更新统一走云函数，CloudRun 不直接连接 MySQL，
// 避免公网出口 IP 触发数据库白名单/鉴权问题。
const envId = process.env.CLOUDBASE_ENV_ID || 'cloud1-8gk3bptqefbf01d6'
let tcbApp = null
let sfExpressModule = null

function getSfExpress() {
  if (sfExpressModule) return sfExpressModule
  try {
    sfExpressModule = require('./sf-express')
    return sfExpressModule
  } catch (e) {
    const err = new Error('顺丰物流模块未配置，请补充 cloudrun/payment-api/sf-express.js 后再使用顺丰接口')
    err.cause = e
    throw err
  }
}

function getCloudCredentials() {
  const secretId =
    process.env.TCB_SECRET_ID ||
    process.env.SECRET_ID ||
    process.env.TENCENTCLOUD_SECRETID ||
    ''
  const secretKey =
    process.env.TCB_SECRET_KEY ||
    process.env.SECRET_KEY ||
    process.env.TENCENTCLOUD_SECRETKEY ||
    ''
  const token =
    process.env.TCB_TOKEN ||
    process.env.TENCENTCLOUD_SESSIONTOKEN ||
    ''
  return { secretId, secretKey, token }
}

function getTcbApp() {
  if (tcbApp) return tcbApp
  const tcb = require('@cloudbase/node-sdk')
  const { secretId, secretKey, token } = getCloudCredentials()
  const initConfig = { env: envId }

  // CloudRun 不保证自动注入可用云 API 凭证，这里优先读取环境变量显式配置。
  if (secretId && secretKey) {
    initConfig.secretId = secretId
    initConfig.secretKey = secretKey
    if (token) initConfig.sessionToken = token
  }

  tcbApp = tcb.init(initConfig)
  return tcbApp
}

/** 规范化环境变量里的商户 API 私钥（apiclient_key.pem） */
function normalizePayPrivateKey(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let s = raw.replace(/^\uFEFF/, '').trim()
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n')
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  // 兼容 JSON 视图下可能出现的行尾反斜杠续行符
  s = s.replace(/\\\n/g, '\n').trim()

  // 尝试将各种“被污染”的私钥恢复为标准 PEM
  const beginRsa = '-----BEGIN RSA PRIVATE KEY-----'
  const endRsa = '-----END RSA PRIVATE KEY-----'
  const beginPkcs8 = '-----BEGIN PRIVATE KEY-----'
  const endPkcs8 = '-----END PRIVATE KEY-----'
  const hasRsa = s.includes(beginRsa) && s.includes(endRsa)
  const hasPkcs8 = s.includes(beginPkcs8) && s.includes(endPkcs8)

  if (hasRsa || hasPkcs8) {
    const begin = hasPkcs8 ? beginPkcs8 : beginRsa
    const end = hasPkcs8 ? endPkcs8 : endRsa
    const start = s.indexOf(begin) + begin.length
    const finish = s.indexOf(end)
    let body = s.slice(start, finish)
    // 去掉所有空白和反斜杠，保留纯 base64
    body = body.replace(/[\\\s]/g, '')
    if (!body) return ''
    // 重新按 64 字符分行
    const lines = body.match(/.{1,64}/g) || []
    return `${begin}\n${lines.join('\n')}\n${end}`
  }

  return s.trim()
}

function getPrivateKeyFromEnv() {
  const fallback = normalizePayPrivateKey((process.env.PAY_PRIVATE_KEY || '').replace(/\\n/g, '\n'))
  return { key: fallback, source: 'PAY_PRIVATE_KEY' }
}

// 归一化微信支付平台公钥 PEM
function normalizePayPublicKey(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let s = raw.replace(/^\uFEFF/, '').trim()
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n')
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  s = s.replace(/\\\n/g, '\n').trim()
  const begin = '-----BEGIN PUBLIC KEY-----'
  const end = '-----END PUBLIC KEY-----'
  if (s.includes(begin) && s.includes(end)) {
    const start = s.indexOf(begin) + begin.length
    const finish = s.indexOf(end)
    const body = s.slice(start, finish).replace(/[\\\s]/g, '')
    if (!body) return ''
    const lines = body.match(/.{1,64}/g) || []
    return `${begin}\n${lines.join('\n')}\n${end}`
  }
  return s
}

// 支付配置（从环境变量读取）
function getPayConfig() {
  const serialRaw = (process.env.PAY_SERIAL_NO || '').trim()
  // 微信支付 v3 请求头里的 serial_no 一般为证书序列号大写十六进制
  const serialNo = serialRaw ? serialRaw.toUpperCase() : ''
  const privateKeyResolved = getPrivateKeyFromEnv()
  return {
    appId: (process.env.PAY_APPID || '').trim(),
    mchId: (process.env.PAY_MCH_ID || '').trim(),
    apiV3Key: (process.env.PAY_API_V3_KEY || '').trim(),
    serialNo,
    privateKey: privateKeyResolved.key,
    privateKeySource: privateKeyResolved.source,
    callbackUrl: (process.env.CALLBACK_URL || '').trim().replace(/\/+$/, ''),
    // 微信支付平台公钥（可选；配置后启用回调验签）
    publicKey: normalizePayPublicKey((process.env.PAY_PUBLIC_KEY || '').replace(/\\n/g, '\n')),
    publicKeyId: (process.env.PAY_PUBLIC_KEY_ID || '').trim()
  }
}

/**
 * 微信支付 APIv3 回调验签
 * 验签串：${timestamp}\n${nonce}\n${rawBody}\n
 * 算法：RSA-SHA256（用微信支付平台公钥验证 Wechatpay-Signature）
 *
 * @param {object} headers 小写 header 对象
 * @param {string} rawBody 请求原始 body 字符串（未经 JSON 解析）
 * @param {object} cfg getPayConfig() 结果
 * @returns {{ok:boolean, reason:string, serial?:string}}
 */
function verifyWechatPayCallback(headers, rawBody, cfg) {
  if (!cfg.publicKey || !cfg.publicKeyId) {
    return { ok: false, reason: 'public_key_not_configured', skipped: true }
  }
  const ts = headers['wechatpay-timestamp']
  const nonce = headers['wechatpay-nonce']
  const signature = headers['wechatpay-signature']
  const serial = headers['wechatpay-serial']
  if (!ts || !nonce || !signature) {
    return { ok: false, reason: 'missing_signature_headers' }
  }
  // 防重放：时间戳与本机相差 ≤ 5 分钟
  const now = Math.floor(Date.now() / 1000)
  const drift = Math.abs(now - parseInt(ts, 10))
  if (!Number.isFinite(drift) || drift > 300) {
    return { ok: false, reason: `timestamp_out_of_range (drift=${drift}s)`, serial }
  }
  // 校验 serial 是否与配置的公钥 ID 一致（防止使用错误公钥验签）
  if (serial && cfg.publicKeyId && serial !== cfg.publicKeyId) {
    return { ok: false, reason: `serial_mismatch (header=${serial}, configured=${cfg.publicKeyId})`, serial }
  }
  const verifyStr = `${ts}\n${nonce}\n${rawBody || ''}\n`
  try {
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(verifyStr)
    verify.end()
    const ok = verify.verify(cfg.publicKey, signature, 'base64')
    return { ok, reason: ok ? 'verified' : 'signature_mismatch', serial }
  } catch (e) {
    return { ok: false, reason: `verify_error: ${e.message}`, serial }
  }
}

function buildPayConfigDiagnostics(cfg) {
  const privateKey = cfg.privateKey || ''
  const privateKeyLines = privateKey ? privateKey.split('\n') : []
  const privateKeyHead = (privateKeyLines[0] || '').trim()
  const privateKeyTail = (privateKeyLines.slice(-1)[0] || '').trim()
  const serialNo = cfg.serialNo || ''
  const serialNoNormalized = serialNo.toUpperCase()
  const serialLooksLikeHex = /^[A-F0-9]+$/.test(serialNoNormalized)

  return {
    appIdPresent: Boolean(cfg.appId),
    mchIdPresent: Boolean(cfg.mchId),
    apiV3KeyPresent: Boolean(cfg.apiV3Key),
    serialNoPresent: Boolean(serialNo),
    serialNoLength: serialNo.length,
    serialNoUppercase: serialNoNormalized,
    serialLooksLikeHex,
    privateKeyPresent: Boolean(privateKey),
    privateKeyHead,
    privateKeyTail,
    privateKeyLineCount: privateKeyLines.length,
    privateKeySource: cfg.privateKeySource,
    privateKeyLooksLikePem:
      /-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKeyHead) &&
      /-----END (RSA )?PRIVATE KEY-----/.test(privateKeyTail)
  }
}

// 响应工具函数
function success(data) { return { success: true, data } }
function error(message) { return { success: false, error: message } }

function maskMiddle(value, prefix = 6, suffix = 6) {
  const s = String(value || '')
  if (s.length <= prefix + suffix) return s
  return `${s.slice(0, prefix)}***${s.slice(-suffix)}`
}

// ====== 工具函数 ======

/** 生成随机字符串 */
function generateNonceStr(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

/** RSA 签名（SHA256 with RSA），私钥须为 apiclient_key.pem 的 PEM 文本 */
function signRSAPrivate(message, privateKey) {
  const keyPem = normalizePayPrivateKey(privateKey)
  if (!keyPem) {
    throw new Error('PAY_PRIVATE_KEY 为空，请配置商户 API 证书私钥')
  }
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(keyPem)) {
    throw new Error(
      'PAY_PRIVATE_KEY 须为 PEM 文本（以 -----BEGIN PRIVATE KEY----- 或 -----BEGIN RSA PRIVATE KEY----- 开头），勿使用 .p12'
    )
  }

  const trySign = (key) => {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(message)
    sign.end()
    return sign.sign(key, 'base64')
  }

  try {
    return trySign(keyPem)
  } catch (e) {
    try {
      const keyObj = crypto.createPrivateKey({ key: keyPem, format: 'pem' })
      return trySign(keyObj)
    } catch (e2) {
      throw new Error(
        '微信支付商户私钥无法解析（常见原因：内容被截断、换行丢失、与证书序列号不是同一套、或粘贴了错误文件）。请重新从商户平台下载 apiclient_key.pem 全文配置到 PAY_PRIVATE_KEY'
      )
    }
  }
}

function getPublicKeySha256FromPrivateKey(privateKey) {
  const keyPem = normalizePayPrivateKey(privateKey)
  const keyObj = crypto.createPrivateKey({ key: keyPem, format: 'pem' })
  const pubObj = crypto.createPublicKey(keyObj)
  const der = pubObj.export({ type: 'spki', format: 'der' })
  return crypto.createHash('sha256').update(der).digest('hex')
}

/** 解密回调中的加密信息 */
function decryptResource(apiV3Key, ciphertext, nonce, associatedData) {
  try {
    const authTagSize = 16
    const key = Buffer.from(apiV3Key, 'utf-8')
    const iv = Buffer.from(nonce, 'utf-8')
    const cipherBuffer = Buffer.from(ciphertext, 'base64')
    const authTag = cipherBuffer.slice(-authTagSize)
    const encrypted = cipherBuffer.slice(0, -authTagSize)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf-8'))

    let decrypted = decipher.update(encrypted, undefined, 'utf-8')
    decrypted += decipher.final('utf-8')
    return JSON.parse(decrypted)
  } catch (e) {
    console.error('[Payment] 解密失败:', e.message)
    return null
  }
}

/**
 * 发送微信支付 API 请求（使用原生 https，兼容性最好）
 */
function wechatPayRequest(urlPath, bodyObj, config) {
  return new Promise((resolve) => {
    const https = require('https')
    const bodyStr = JSON.stringify(bodyObj)

    const timestamp = Math.floor(Date.now() / 1000)
    const nonceStr = generateNonceStr(32)

    // 构建签名消息
    let signatureMessage = `POST\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`
    let signature
    try {
      signature = signRSAPrivate(signatureMessage, config.privateKey)
    } catch (e) {
      console.error('[Payment] 签名失败:', e.message)
      return resolve({ error: e.message || '商户私钥签名失败' })
    }

    // 构建 Authorization 头
    //   - 认证类型与参数之间是空格（非逗号）
    //   - 参数之间用逗号分隔（不加空格，微信 v3 parser 严格）
    const token = `WECHATPAY2-SHA256-RSA2048 ${[
      `mchid="${config.mchId}"`,
      `nonce_str="${nonceStr}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${config.serialNo}"`,
      `signature="${signature}"`
    ].join(',')}`
    const authHeaderLooksInvalid = token.includes('WECHATPAY2-SHA256-RSA2048,')
    const signatureMessageSha256 = crypto.createHash('sha256').update(signatureMessage).digest('hex')
    console.log('[Payment][Diag] authHeader authHeaderLooksInvalid=%s serialNoLength=%d signLen=%d sha256=%s',
      authHeaderLooksInvalid, (config.serialNo || '').length, signature.length, signatureMessageSha256)

    const options = {
      hostname: 'api.mch.weixin.qq.com',
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Sravx-CloudRun/1.0',
        'Authorization': token
      },
      timeout: 30000
    }

    console.log(`[Payment] requesting ${urlPath}`)

    const req = https.request(options, (res) => {
      let chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        try {
          const json = JSON.parse(buffer.toString())
          console.log('[Payment][Diag] wechat response meta:', JSON.stringify({
            status: res.statusCode,
            requestId: json.request_id || json.requestId || '',
            code: json.code || '',
            message: json.message || ''
          }))
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: buffer.toString() })
        }
      })
    })

    req.on('error', err => {
      console.error(`[Payment] request error (${urlPath}):`, err.message)
      resolve({ error: err.message })
    })

    req.setTimeout(30000, () => {
      req.destroy()
      resolve({ error: '请求超时' })
    })

    req.write(bodyStr)
    req.end()
  })
}

/**
 * 微信支付 API v3 GET（签名体末行为空 body，即连续两个 \\n）
 */
function wechatPayGet(urlPath, config) {
  return new Promise((resolve) => {
    const https = require('https')
    const bodyStr = ''
    const timestamp = Math.floor(Date.now() / 1000)
    const nonceStr = generateNonceStr(32)
    const signatureMessage = `GET\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`
    let signature
    try {
      signature = signRSAPrivate(signatureMessage, config.privateKey)
    } catch (e) {
      console.error('[Payment] GET 签名失败:', e.message)
      return resolve({ error: e.message || '商户私钥签名失败' })
    }
    const token = `WECHATPAY2-SHA256-RSA2048 ${[
      `mchid="${config.mchId}"`,
      `nonce_str="${nonceStr}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${config.serialNo}"`,
      `signature="${signature}"`
    ].join(',')}`

    const options = {
      hostname: 'api.mch.weixin.qq.com',
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Sravx-CloudRun/1.0',
        Authorization: token
      },
      timeout: 30000
    }

    console.log(`[Payment] GET ${urlPath}`)

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        try {
          const json = JSON.parse(buffer.toString())
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: buffer.toString() })
        }
      })
    })

    req.on('error', (err) => {
      console.error(`[Payment] GET error (${urlPath}):`, err.message)
      resolve({ error: err.message })
    })
    req.setTimeout(30000, () => {
      req.destroy()
      resolve({ error: '请求超时' })
    })
    req.end()
  })
}

// ==================== API 路由 ====================

/**
 * POST /api/payment/createOrder
 * 创建微信支付订单，返回支付参数给前端
 */
app.post('/api/payment/createOrder', async (req, res) => {
  try {
    const { orderId, description, openid, orderType = 'normal' } = req.body
    console.log('[Payment] createOrder entry:', JSON.stringify({
      orderId: orderId || null,
      orderType,
      hasOpenid: Boolean(openid),
      openidPrefix: openid ? String(openid).slice(0, 6) + '***' : '',
      hasDescription: Boolean(description)
    }))

    if (!orderId || !openid) {
      return res.status(400).json(error('缺少必填参数 orderId 或 openid'))
    }

    const config = getPayConfig()
    console.log('[Payment] createOrder config check:', JSON.stringify({
      hasAppId: Boolean(config.appId),
      hasMchId: Boolean(config.mchId),
      hasApiV3Key: Boolean(config.apiV3Key),
      hasSerialNo: Boolean(config.serialNo),
      hasCallbackUrl: Boolean(config.callbackUrl),
      privateKeyLooksLikePem: /-----BEGIN (RSA )?PRIVATE KEY-----/.test(config.privateKey || '')
    }))

    if (!config.mchId || !config.privateKey || !config.apiV3Key || !config.serialNo) {
      console.error('[Payment] 商户配置缺失')
      return res.json(error('商户配置未完成，请联系管理员'))
    }

    // 查询订单（通过云函数）
    const envId = process.env.CLOUDBASE_ENV_ID || 'cloud1-8gk3bptqefbf01d6'
    const orderResult = await callCloudFunction('order', {
      action: 'getOrderForPayment',
      orderId: orderId,
      openid: openid,
      orderType
    })

    if (!orderResult.success) {
      return res.json(error(orderResult.error || '订单不存在'))
    }

    const order = orderResult.data

    // 已支付
    if (order.status === 'paid') {
      return res.json(success({ paid: true, message: '该订单已支付' }))
    }

    // 非待支付状态
    if (order.status !== 'pending_payment') {
      return res.json(error(`当前订单状态不允许支付(${order.status})`))
    }

    // 金额校验（单位：分）
    const totalFee = Math.round(parseFloat(order.pay_amount) * 100)
    if (totalFee <= 0) {
      return res.json(error('订单金额异常'))
    }

    // 构建下单请求体
    // 商户订单号与业务 order_no 一致：对账、退款、小程序购物订单「${商品订单号}」跳转均依赖该约定
    const payBody = {
      appid: config.appId,
      mchid: config.mchId,
      description: description || (String(orderType) === 'points' ? 'Sravx 积分订单' : 'Sravx 商品订单'),
      out_trade_no: order.order_no,
      notify_url: `${config.callbackUrl}/api/payment/callback`,
      amount: {
        total: totalFee,
        currency: 'CNY'
      },
      payer: {
        openid: openid
      }
    }

    console.log(`[Payment] createOrder: out_trade_no=${order.order_no}, amount=${totalFee}, openid=${openid}`)

    // 调用微信支付 JSAPI 下单接口
    const result = await wechatPayRequest('/v3/pay/transactions/jsapi', payBody, config)
    console.log('[Payment] createOrder wechat result:', JSON.stringify({
      hasError: Boolean(result && result.error),
      status: result && result.status ? result.status : null,
      hasPrepayId: Boolean(result && result.data && result.data.prepay_id),
      wxCode: result && result.data && result.data.code ? result.data.code : '',
      wxMessage: result && result.data && result.data.message ? result.data.message : ''
    }))

    if (result.error) {
      return res.json(error(`网络请求失败: ${result.error}`))
    }

    if (result.data && result.data.prepay_id) {
      // 构建 wx.requestPayment 所需的参数
      const prepayId = result.data.prepay_id
      const timeStamp = String(Math.floor(Date.now() / 1000))
      const nonceStr2 = generateNonceStr()
      const packageStr = `prepay_id=${prepayId}`
      const signStr = `${config.appId}\n${timeStamp}\n${nonceStr2}\n${packageStr}\n`
      let paySign
      try {
        paySign = signRSAPrivate(signStr, config.privateKey)
      } catch (e) {
        console.error('[Payment] paySign 失败:', e.message)
        return res.json(error(e.message || '调起支付签名失败'))
      }

      return res.json(success({
        prepay_id: prepayId,
        appId: config.appId,
        timeStamp,
        nonceStr: nonceStr2,
        package: packageStr,
        signType: 'RSA',
        paySign
      }))
    } else {
      const wxErr = result.data || {}
      const wxCode = wxErr.code || ''
      const wxMsg = wxErr.message || '下单失败，请重试'
      const wxReqId = wxErr.request_id || wxErr.requestId || ''
      console.error('[Payment] JSAPI 下单失败详情:', JSON.stringify({
        code: wxCode,
        message: wxMsg,
        request_id: wxReqId
      }))
      const extra = [wxCode ? `code=${wxCode}` : '', wxReqId ? `request_id=${wxReqId}` : '']
        .filter(Boolean)
        .join(', ')
      return res.json(error(`微信支付下单失败: ${wxMsg}${extra ? ` (${extra})` : ''}`))
    }
  } catch (err) {
    console.error('[Payment] createOrder error:', err)
    res.json(error(err.message))
  }
})

/**
 * POST /api/payment/callback
 * 微信支付回调通知
 *
 * 流程：验证签名 → 解密获取支付信息 → 更新本地订单状态 → 返回成功响应
 */
app.post('/api/payment/callback', async (req, res) => {
  console.log('[Payment] 收到支付回调通知')

  try {
    const config = getPayConfig()

    // 1. 验签（API v3 规范要求，用微信支付平台公钥）
    const verifyResult = verifyWechatPayCallback(req.headers, req.rawBody, config)
    if (verifyResult.skipped) {
      console.warn('[Payment] 回调验签已跳过（未配置 PAY_PUBLIC_KEY / PAY_PUBLIC_KEY_ID），建议尽快补上')
    } else if (!verifyResult.ok) {
      console.error('[Payment] 回调验签失败:', verifyResult.reason, 'serial=', verifyResult.serial)
      return res.status(401).json({ code: 'FAIL', message: `签名验证失败: ${verifyResult.reason}` })
    } else {
      console.log('[Payment] 回调验签通过, serial=', verifyResult.serial)
    }

    const callbackData = req.body
    const { resource } = callbackData

    if (!resource) {
      console.error('[Payment] 回调数据缺少 resource 字段')
      return res.json({ code: 'FAIL', message: '回调数据格式错误' })
    }

    // 2. 解密资源数据（AES-256-GCM，用 APIv3 密钥）
    const paymentInfo = decryptResource(
      config.apiV3Key,
      resource.ciphertext,
      resource.nonce,
      resource.associated_data
    )

    if (!paymentInfo) {
      console.error('[Payment] 回调解密失败')
      return res.json({ code: 'FAIL', message: '解密失败' })
    }

    const {
      out_trade_no,
      transaction_id,
      trade_state,
      amount,
      success_time
    } = paymentInfo

    console.log(`[Payment] 回调解析: out_trade_no=${out_trade_no}, state=${trade_state}, transaction_id=${transaction_id}`)

    // 仅处理交易成功
    if (trade_state !== 'SUCCESS') {
      console.log(`[Payment] 交易状态非SUCCESS: ${trade_state}`)
      return res.json({ code: 'SUCCESS', message: '已接收但未处理非成功状态' })
    }

    // 调用云函数更新订单状态（通过 @cloudbase/node-sdk）
    try {
      const cfResult = await callCloudFunction('order', {
        action: 'updatePaymentStatusByOrderNo',
        orderNo: out_trade_no,
        transactionId: transaction_id,
        callbackPayload: {
          trade_state,
          success_time,
          amount
        }
      })
      console.log('[Payment] 回调更新订单结果:', JSON.stringify({
        outTradeNo: out_trade_no,
        tradeState: trade_state,
        cfSuccess: Boolean(cfResult && cfResult.success),
        cfError: cfResult && cfResult.error ? cfResult.error : ''
      }))
      if (!cfResult || !cfResult.success) {
        console.error('[Payment] 回调更新订单失败:', cfResult && cfResult.error)
      }
    } catch (cfErr) {
      console.error('[Payment] 调用云函数失败:', cfErr && cfErr.message)
      // 这里不向微信返回 FAIL，避免重复回调打到不同分支，等定时核对兜底
    }
    
    console.log(`[Payment] 订单 ${out_trade_no} 支付成功处理完成，流水号: ${transaction_id}`)
    res.json({ code: 'SUCCESS', message: 'OK' })
  } catch (err) {
    console.error('[Payment] callback error:', err)
    res.json({ code: 'FAIL', message: '内部错误' })
  }
})

/**
 * POST /api/payment/refund
 * 发起退款
 */
app.post('/api/payment/refund', async (req, res) => {
  try {
    const { orderId, reason, totalFee, openid, orderType = 'normal' } = req.body

    if (!orderId || !openid) {
      return res.status(400).json(error('缺少必填参数'))
    }

    const config = getPayConfig()

    // 查询订单（通过云函数）
    const envId = process.env.CLOUDBASE_ENV_ID || 'cloud1-8gk3bptqefbf01d6'
    const orderResult = await callCloudFunction('order', {
      action: 'getOrderForPayment',
      orderId: orderId,
      openid: openid,
      orderType
    })

    if (!orderResult.success) {
      return res.json(error(orderResult.error || '订单不存在'))
    }

    const order = orderResult.data

    if (order.status !== 'paid' && order.status !== 'refunding') {
      return res.json(error('仅 paid/refunding 状态订单可退款'))
    }

    if (!order.pay_transaction_id) {
      return res.json(error('缺少支付流水号'))
    }

    const refundAmount = totalFee || Math.round(parseFloat(order.pay_amount) * 100)
    const outRefundNo = `RF${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const refundBody = {
      out_refund_no: outRefundNo,
      reason: reason || '用户申请退款',
      notify_url: `${config.callbackUrl}/api/payment/refund/callback`,
      amount: {
        refund: refundAmount,
        total: Math.round(parseFloat(order.pay_amount) * 100),
        currency: 'CNY'
      },
      transaction_id: order.pay_transaction_id
    }

    console.log(`[Payment] refund: out_refund_no=${outRefundNo}, amount=${refundAmount}`)

    const result = await wechatPayRequest('/v3/refund/domestic/refunds', refundBody, config)

    if (result.error) {
      return res.json(error(`退款请求失败: ${result.error}`))
    }

    if (result.data && result.data.refund_id) {
      // 更新订单退款状态（通过云函数）
      await callCloudFunction('order', {
        action: 'updateRefundStatus',
        orderId: orderId,
        orderType
      })
      const wxSt = String(result.data.status || '').toUpperCase()
      if (wxSt === 'SUCCESS') {
        if (String(orderType) === 'points') {
          const sync = await callCloudFunction('order', {
            action: 'refundPointsOrder',
            orderId,
            refundTransactionId: String(result.data.refund_id || ''),
            refundReason: reason || '微信退款成功'
          })
          console.log('[Payment] 积分订单退款接口同步返回 SUCCESS，已尝试落库:', JSON.stringify(sync))
        } else {
          const sync = await callCloudFunction('order', {
            action: 'completeRefundByOrderNo',
            orderNo: order.order_no,
            outRefundNo,
            refundId: String(result.data.refund_id || '')
          })
          console.log('[Payment] 退款接口同步返回 SUCCESS，已尝试落库:', JSON.stringify(sync))
        }
      } else {
        // 异步通知可能丢失：后台轮询查单，成功则 completeRefundByOrderNo
        if (String(orderType) !== 'points') {
          scheduleRefundDbSync(config, order.order_no, outRefundNo)
        }
      }
      return res.json(success({ refundId: result.data.refund_id, outRefundNo }))
    } else {
      const errMsg = (result.data && result.data.message) || '退款请求失败'
      return res.json(error(errMsg))
    }
  } catch (err) {
    console.error('[Payment] refund error:', err)
    res.json(error(err.message))
  }
})

/**
 * POST /api/payment/refund/callback
 * 微信支付退款结果通知（与发起退款时 notify_url 对应）
 */
app.post('/api/payment/refund/callback', async (req, res) => {
  console.log('[Payment] 收到退款结果通知')

  try {
    const config = getPayConfig()
    const verifyResult = verifyWechatPayCallback(req.headers, req.rawBody, config)
    if (verifyResult.skipped) {
      console.warn('[Payment] 退款回调验签已跳过（未配置 PAY_PUBLIC_KEY / PAY_PUBLIC_KEY_ID）')
    } else if (!verifyResult.ok) {
      console.error('[Payment] 退款回调验签失败:', verifyResult.reason, 'serial=', verifyResult.serial)
      return res.status(401).json({ code: 'FAIL', message: `签名验证失败: ${verifyResult.reason}` })
    } else {
      console.log('[Payment] 退款回调验签通过, serial=', verifyResult.serial)
    }

    const callbackData = req.body
    const { resource } = callbackData
    if (!resource) {
      console.error('[Payment] 退款回调缺少 resource')
      return res.json({ code: 'FAIL', message: '回调数据格式错误' })
    }

    const refundInfo = decryptResource(
      config.apiV3Key,
      resource.ciphertext,
      resource.nonce,
      resource.associated_data
    )
    if (!refundInfo) {
      console.error('[Payment] 退款回调解密失败')
      return res.json({ code: 'FAIL', message: '解密失败' })
    }

    const { out_trade_no, out_refund_no, refund_id } = refundInfo
    const refundStatusRaw = refundInfo.refund_status != null ? refundInfo.refund_status : refundInfo.status
    if (String(refundStatusRaw).toUpperCase() !== 'SUCCESS') {
      console.log(`[Payment] 退款状态非 SUCCESS: ${refundStatusRaw}, out_trade_no=${out_trade_no}`)
      return res.json({ code: 'SUCCESS', message: '已接收' })
    }
    if (!out_trade_no) {
      console.error('[Payment] 退款回调缺少 out_trade_no')
      return res.json({ code: 'FAIL', message: '缺少商户订单号' })
    }

    try {
      const cfResult = await callCloudFunction('order', {
        action: 'completeRefundByOrderNo',
        orderNo: out_trade_no,
        outRefundNo: out_refund_no || '',
        refundId: refund_id || ''
      })
      console.log('[Payment] 退款回调更新订单:', JSON.stringify({
        outTradeNo: out_trade_no,
        cfSuccess: Boolean(cfResult && cfResult.success),
        cfError: cfResult && cfResult.error ? cfResult.error : ''
      }))
      if (!cfResult || !cfResult.success) {
        console.error('[Payment] 退款回调云函数失败:', cfResult && cfResult.error)
        return res.json({ code: 'FAIL', message: (cfResult && cfResult.error) || '更新订单失败' })
      }
    } catch (cfErr) {
      console.error('[Payment] 退款回调调用云函数异常:', cfErr && cfErr.message)
      return res.json({ code: 'FAIL', message: '内部错误' })
    }

    return res.json({ code: 'SUCCESS', message: 'OK' })
  } catch (err) {
    console.error('[Payment] refund/callback error:', err)
    return res.json({ code: 'FAIL', message: '内部错误' })
  }
})

/**
 * GET /health - 健康检查
 */
app.get('/health', (req, res) => {
  res.json({ service: 'payment-api', status: 'ok', time: new Date().toISOString() })
})

/**
 * GET /health/pay-sign-check
 * 仅用于排查签名问题，返回脱敏信息与公钥指纹，不返回私钥原文。
 */
app.get('/health/pay-sign-check', (req, res) => {
  try {
    const cfg = getPayConfig()
    const diagnostics = buildPayConfigDiagnostics(cfg)
    const sampleMessage = 'pay-sign-self-check'
    const sig = signRSAPrivate(sampleMessage, cfg.privateKey)
    const pubHash = getPublicKeySha256FromPrivateKey(cfg.privateKey)
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(sampleMessage)
    verify.end()
    const ok = verify.verify(crypto.createPublicKey(crypto.createPrivateKey(cfg.privateKey)), sig, 'base64')

    const { secretId, secretKey } = getCloudCredentials()

    res.json({
      success: true,
      envId,
      appId: maskMiddle(cfg.appId, 4, 4),
      appIdFull: cfg.appId, // 排查 AppID 与小程序是否一致，可移除
      mchId: maskMiddle(cfg.mchId, 4, 4),
      serialNo: maskMiddle(cfg.serialNo, 8, 8),
      callbackUrl: cfg.callbackUrl,
      privateKeyHead: diagnostics.privateKeyHead,
      privateKeyTail: diagnostics.privateKeyTail,
      privateKeyLineCount: diagnostics.privateKeyLineCount,
      privateKeySource: diagnostics.privateKeySource,
      privateKeyPublicKeySha256: pubHash,
      selfSignVerifyPassed: Boolean(ok),
      serverTime: new Date().toISOString(),
      serverUnixTime: Math.floor(Date.now() / 1000),
      diagnostics: {
        appIdPresent: diagnostics.appIdPresent,
        mchIdPresent: diagnostics.mchIdPresent,
        apiV3KeyPresent: diagnostics.apiV3KeyPresent,
        apiV3KeyLength: (cfg.apiV3Key || '').length,
        serialNoPresent: diagnostics.serialNoPresent,
        serialNoLength: diagnostics.serialNoLength,
        serialLooksLikeHex: diagnostics.serialLooksLikeHex,
        privateKeyPresent: diagnostics.privateKeyPresent,
        privateKeyLooksLikePem: diagnostics.privateKeyLooksLikePem,
        callbackUrlPresent: Boolean(cfg.callbackUrl),
        hasTcbSecretId: Boolean(secretId),
        hasTcbSecretKey: Boolean(secretKey),
        // 微信支付平台公钥（回调验签用）
        payPublicKeyPresent: Boolean(cfg.publicKey),
        payPublicKeyLooksLikePem: /-----BEGIN PUBLIC KEY-----/.test(cfg.publicKey || ''),
        payPublicKeyIdPresent: Boolean(cfg.publicKeyId),
        payPublicKeyId: cfg.publicKeyId ? maskMiddle(cfg.publicKeyId, 12, 6) : ''
      }
    })
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    })
  }
})

/**
 * GET /health/test-cert
 * 用当前配置向微信支付 /v3/certificates 接口发 GET（空 body 的最简单调用）。
 * 若该接口也返回 SIGN_ERROR，说明**商户证书在微信侧不被认可**（已作废/失效）。
 * 若返回 200/其它错误码，则下单失败另有原因。
 */
app.get('/health/test-cert', async (req, res) => {
  try {
    const cfg = getPayConfig()
    const https = require('https')
    const urlPath = '/v3/certificates'
    const bodyStr = ''
    const timestamp = Math.floor(Date.now() / 1000)
    const nonceStr = generateNonceStr(32)
    const signatureMessage = `GET\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`
    const signature = signRSAPrivate(signatureMessage, cfg.privateKey)
    // 协议要求认证类型与参数之间是空格，不是逗号
    const token = `WECHATPAY2-SHA256-RSA2048 ${[
      `mchid="${cfg.mchId}"`,
      `nonce_str="${nonceStr}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${cfg.serialNo}"`,
      `signature="${signature}"`
    ].join(',')}`

    const result = await new Promise((resolve) => {
      const options = {
        hostname: 'api.mch.weixin.qq.com',
        port: 443,
        path: urlPath,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Sravx-CloudRun/1.0',
          'Authorization': token
        },
        timeout: 15000
      }
      const r = https.request(options, (resp) => {
        const chunks = []
        resp.on('data', c => chunks.push(c))
        resp.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          let parsed = null
          try { parsed = JSON.parse(raw) } catch (e) {}
          resolve({ status: resp.statusCode, headers: resp.headers, body: parsed, raw })
        })
      })
      r.on('error', err => resolve({ error: err.message }))
      r.setTimeout(15000, () => { r.destroy(); resolve({ error: 'timeout' }) })
      r.end()
    })

    res.json({
      requestMeta: {
        url: `https://api.mch.weixin.qq.com${urlPath}`,
        method: 'GET',
        mchid: cfg.mchId,
        serialNo: cfg.serialNo,
        timestamp,
        signatureLength: signature.length
      },
      response: {
        status: result.status,
        wechatRequestIdHeader: result.headers && (result.headers['request-id'] || result.headers['x-request-id'] || ''),
        body: result.body,
        rawHead: (result.raw || '').slice(0, 500),
        error: result.error
      },
      interpretation:
        result.status === 200 ? '✅ 商户证书有效，签名正确' :
        (result.body && result.body.code === 'SIGN_ERROR') ? '❌ 商户证书在微信侧不认（作废/失效），需在商户平台重新申请证书' :
        '⚠️ 其它错误，看 response.body.code'
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/**
 * POST /health/sim-paysign
 * 用当前配置模拟生成 wx.requestPayment 参数，方便排查 -1/签名错误。
 * body: { prepayId?: string, appId?: string }
 *   - prepayId 可选，不传会用占位值（不会真的能调起支付，仅校验签名格式）
 *   - appId 可选，不传用 PAY_APPID
 */
app.post('/health/sim-paysign', (req, res) => {
  try {
    const cfg = getPayConfig()
    const appId = (req.body && req.body.appId) || cfg.appId
    const prepayId = (req.body && req.body.prepayId) || 'wx00000000000000000000000000000000'
    const timeStamp = String(Math.floor(Date.now() / 1000))
    const nonceStr = generateNonceStr()
    const packageStr = `prepay_id=${prepayId}`
    const signStr = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`
    const paySign = signRSAPrivate(signStr, cfg.privateKey)

    // 本地验一次：公钥能不能还原
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(signStr)
    verify.end()
    const pub = crypto.createPublicKey(crypto.createPrivateKey(cfg.privateKey))
    const ok = verify.verify(pub, paySign, 'base64')

    res.json({
      success: true,
      usedAppId: appId,
      configuredAppId: cfg.appId,
      appIdMatchesConfig: appId === cfg.appId,
      timeStamp,
      nonceStr,
      package: packageStr,
      signType: 'RSA',
      paySign,
      signStrPreview: signStr,
      selfVerifyPassed: Boolean(ok),
      publicKeySha256: getPublicKeySha256FromPrivateKey(cfg.privateKey),
      serialNo: cfg.serialNo,
      note: 'prepayId 如果是假的，前端调 wx.requestPayment 会报 "系统繁忙/订单号不存在"，不是 -1 签名错误'
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/**
 * 调用云函数更新订单状态
 */
async function callCloudFunction(functionName, data) {
  try {
    const { secretId, secretKey } = getCloudCredentials()
    if (!secretId || !secretKey) {
      return {
        success: false,
        error: '调用云函数失败: 缺少云 API 凭证，请配置 TCB_SECRET_ID / TCB_SECRET_KEY'
      }
    }

    const app = getTcbApp()
    const invokeResult = await app.callFunction({
      name: functionName,
      data
    })
    if (invokeResult && invokeResult.result) {
      return invokeResult.result
    }
    return invokeResult || { success: false, error: '云函数返回为空' }
  } catch (err) {
    const detail = err && err.message ? err.message : String(err)
    console.error(`[CloudFunction] SDK 调用 ${functionName} 失败:`, detail)
    return { success: false, error: `调用云函数失败: ${detail}` }
  }
}

/**
 * 退款异步通知不可靠时：轮询「查询单笔退款」，SUCCESS 则调云函数标为已退款
 */
function scheduleRefundDbSync(config, orderNo, outRefundNo) {
  const mch = encodeURIComponent(String(config.mchId || '').trim())
  const out = encodeURIComponent(String(outRefundNo || '').trim())
  if (!mch || !out || !orderNo) {
    console.warn('[Payment] scheduleRefundDbSync 跳过: 缺少 mchId/outRefundNo/orderNo')
    return
  }
  const urlPath = `/v3/refund/domestic/refunds/out-refund-no/${out}?mchid=${mch}`
  let attempts = 0
  const maxAttempts = 10
  const delayMs = 2500

  const tick = async () => {
    attempts += 1
    try {
      const q = await wechatPayGet(urlPath, config)
      if (q.error) {
        console.warn(`[Payment] refund poll ${attempts}/${maxAttempts}:`, q.error)
      } else if (q.data && String(q.data.status || '').toUpperCase() === 'SUCCESS') {
        const cf = await callCloudFunction('order', {
          action: 'completeRefundByOrderNo',
          orderNo,
          outRefundNo: String(outRefundNo || ''),
          refundId: String((q.data && q.data.refund_id) || '')
        })
        console.log('[Payment] refund poll → completeRefundByOrderNo', JSON.stringify(cf))
        return
      }
    } catch (e) {
      console.error('[Payment] refund poll exception:', e && e.message)
    }
    if (attempts < maxAttempts) {
      setTimeout(tick, delayMs)
    }
  }

  setTimeout(tick, 800)
}

// ---------- 微信小程序：access_token + 订单详情 path + 发货信息录入 ----------
// 需在云托管环境变量配置：
//   WECHAT_MINI_APPSECRET（必填）小程序 AppSecret，用于拉取 access_token
//   WECHAT_MINI_APPID（可选，默认同 PAY_APPID）
//   WECHAT_MP_OPS_SECRET（必填）运维接口密钥，请求头 x-wechat-mp-ops-secret 须与其一致
//   ORDER_DETAIL_PATH（可选）默认 pages/orderDetail/orderDetail?id=${商品订单号}
// 说明：订单中心授权协议须在公众平台先签署；详情 path 与后台「商品订单详情 path」一致。

const DEFAULT_ORDER_DETAIL_PATH = 'pages/orderDetail/orderDetail?id=${商品订单号}'

let mpAccessTokenCache = { token: '', expireAt: 0 }

function getMiniProgramAppId() {
  return (process.env.WECHAT_MINI_APPID || process.env.PAY_APPID || '').trim()
}

function getMiniProgramSecret() {
  return (process.env.WECHAT_MINI_APPSECRET || process.env.WECHAT_APP_SECRET || '').trim()
}

function getMpOpsSecret() {
  return (process.env.WECHAT_MP_OPS_SECRET || '').trim()
}

function assertMpOpsAuth(req, res) {
  const need = getMpOpsSecret()
  if (!need) {
    res.status(501).json(error('未配置 WECHAT_MP_OPS_SECRET，运维接口未启用'))
    return false
  }
  const got = String(
    req.get('x-wechat-mp-ops-secret') ||
      req.get('X-Wechat-Mp-Ops-Secret') ||
      (req.body && req.body.opsSecret) ||
      ''
  ).trim()
  const a = Buffer.from(need, 'utf8')
  const b = Buffer.from(got, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json(error('无权限调用运维接口'))
    return false
  }
  return true
}

function wxOpenHttpsJson(method, pathnameWithQuery, bodyObj) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const bodyStr =
      bodyObj !== undefined && bodyObj !== null && (method === 'POST' || method === 'PUT')
        ? JSON.stringify(bodyObj)
        : ''
    const opts = {
      hostname: 'api.weixin.qq.com',
      port: 443,
      path: pathnameWithQuery,
      method,
      headers: {}
    }
    if (bodyStr) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }
    const req = https.request(opts, (r) => {
      let raw = ''
      r.on('data', (c) => {
        raw += c
      })
      r.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch (e) {
          resolve({ errcode: -1, errmsg: raw || e.message })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

async function fetchMiniProgramAccessToken() {
  const appid = getMiniProgramAppId()
  const secret = getMiniProgramSecret()
  if (!appid || !secret) {
    const e = new Error('缺少 WECHAT_MINI_APPSECRET（及小程序 AppId：WECHAT_MINI_APPID 或 PAY_APPID）')
    e.code = 'MISSING_MP_CREDENTIALS'
    throw e
  }
  const q = `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  const data = await wxOpenHttpsJson('GET', q, null)
  if (data.errcode) {
    const e = new Error(data.errmsg || `获取 access_token 失败 errcode=${data.errcode}`)
    e.code = 'MP_TOKEN_ERR'
    throw e
  }
  if (!data.access_token) {
    const e = new Error('获取 access_token 返回无 access_token 字段')
    e.code = 'MP_TOKEN_EMPTY'
    throw e
  }
  return { access_token: data.access_token, expires_in: Number(data.expires_in) || 7200 }
}

async function getMiniProgramAccessToken() {
  if (mpAccessTokenCache.token && Date.now() < mpAccessTokenCache.expireAt - 60000) {
    return mpAccessTokenCache.token
  }
  const r = await fetchMiniProgramAccessToken()
  mpAccessTokenCache = {
    token: r.access_token,
    expireAt: Date.now() + r.expires_in * 1000
  }
  return r.access_token
}

function rfc3339ShanghaiWithMs() {
  const d = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d)
  const g = (t) => parts.find((x) => x.type === t)?.value || '00'
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}.${ms}+08:00`
}

/**
 * POST /api/wechat/mp/update-order-detail-path
 * 调用 wxa/sec/order/update_order_detail_path（需先签署订单中心协议）
 * Body: { path?: string }  path 须含字面量 ${商品订单号}
 */
app.post('/api/wechat/mp/update-order-detail-path', async (req, res) => {
  try {
    if (!assertMpOpsAuth(req, res)) return
    const pathStr = (req.body && req.body.path ? String(req.body.path) : process.env.ORDER_DETAIL_PATH || '').trim() || DEFAULT_ORDER_DETAIL_PATH
    if (!pathStr.includes('${商品订单号}')) {
      return res.status(400).json(error('path 必须包含占位符 ${商品订单号}'))
    }
    const token = await getMiniProgramAccessToken()
    const apiPath = `/wxa/sec/order/update_order_detail_path?access_token=${encodeURIComponent(token)}`
    const wxRes = await wxOpenHttpsJson('POST', apiPath, { path: pathStr })
    if (wxRes.errcode !== undefined && wxRes.errcode !== 0) {
      return res.status(400).json(error(wxRes.errmsg || `微信接口错误 errcode=${wxRes.errcode}`))
    }
    return res.json(success({ path: pathStr, wx: wxRes }))
  } catch (e) {
    console.error('[wechat/mp] update-order-detail-path', e)
    return res.status(500).json(error(e.message || String(e)))
  }
})

/**
 * POST /api/wechat/mp/get-order-detail-path
 * 查询当前已配置的订单详情 path
 */
app.post('/api/wechat/mp/get-order-detail-path', async (req, res) => {
  try {
    if (!assertMpOpsAuth(req, res)) return
    const token = await getMiniProgramAccessToken()
    const apiPath = `/wxa/sec/order/get_order_detail_path?access_token=${encodeURIComponent(token)}`
    const wxRes = await wxOpenHttpsJson('POST', apiPath, {})
    if (wxRes.errcode !== undefined && wxRes.errcode !== 0) {
      return res.status(400).json(error(wxRes.errmsg || `微信接口错误 errcode=${wxRes.errcode}`))
    }
    return res.json(success(wxRes))
  } catch (e) {
    console.error('[wechat/mp] get-order-detail-path', e)
    return res.status(500).json(error(e.message || String(e)))
  }
})

/**
 * POST /api/wechat/mp/upload-shipping
 * 调用 wxa/sec/order/upload_shipping_info（实体快递统一发货）
 * Body: { orderId, trackingNo, expressCompany, itemDesc?, logisticsType?, deliveryMode? }
 * payer.openid 使用订单表 _openid；logisticsType 默认 1 快递；deliveryMode 默认 1 统一发货
 */
app.post('/api/wechat/mp/upload-shipping', async (req, res) => {
  try {
    if (!assertMpOpsAuth(req, res)) return
    const { orderId, trackingNo, expressCompany, itemDesc } = req.body || {}
    const logisticsType = parseInt(String(req.body && req.body.logisticsType != null ? req.body.logisticsType : 1), 10) || 1
    const deliveryMode = parseInt(String(req.body && req.body.deliveryMode != null ? req.body.deliveryMode : 1), 10) || 1
    if (!orderId || !trackingNo || !expressCompany) {
      return res.status(400).json(error('缺少必填：orderId, trackingNo, expressCompany'))
    }
    const orderResult = await callCloudFunction('order', {
      action: 'getOrderForPayment',
      orderId
    })
    if (!orderResult.success || !orderResult.data) {
      return res.status(400).json(error(orderResult.error || '订单不存在'))
    }
    const order = orderResult.data
    const payerOpenid = order._openid != null ? String(order._openid).trim() : ''
    if (!payerOpenid) {
      return res.status(400).json(error('订单缺少用户 openid（_openid）'))
    }
    if (order.status !== 'paid' && order.status !== 'shipped') {
      return res.status(400).json(error(`订单状态不可录入发货: ${order.status}`))
    }
    const txId = order.pay_transaction_id != null ? String(order.pay_transaction_id).trim() : ''
    if (!txId) {
      return res.status(400).json(error('订单缺少微信支付 transaction_id，无法用支付单维度发货'))
    }
    const desc = (itemDesc && String(itemDesc).trim()) || '商品*1'
    const token = await getMiniProgramAccessToken()
    const apiPath = `/wxa/sec/order/upload_shipping_info?access_token=${encodeURIComponent(token)}`
    const payload = {
      order_key: {
        order_number_type: 2,
        transaction_id: txId
      },
      logistics_type: logisticsType,
      delivery_mode: deliveryMode,
      shipping_list: [
        {
          tracking_no: String(trackingNo).trim(),
          express_company: String(expressCompany).trim(),
          item_desc: desc.slice(0, 120)
        }
      ],
      upload_time: rfc3339ShanghaiWithMs(),
      payer: { openid: payerOpenid }
    }
    const wxRes = await wxOpenHttpsJson('POST', apiPath, payload)
    if (wxRes.errcode !== undefined && wxRes.errcode !== 0) {
      return res.status(400).json(error(wxRes.errmsg || `微信接口错误 errcode=${wxRes.errcode}`))
    }
    return res.json(success({ wx: wxRes, orderId, transaction_id: order.pay_transaction_id }))
  } catch (e) {
    console.error('[wechat/mp] upload-shipping', e)
    return res.status(500).json(error(e.message || String(e)))
  }
})

// ==================== 顺丰物流接口 ====================
// 环境变量需配置：
//   SF_CLIENT_CODE        - 顺丰顾客编码（默认沙箱 ZJGSDLMFI66J）
//   SF_CHECKWORD_DEV      - 沙箱校验码
//   SF_CHECKWORD_PROD     - 生产校验码
//   SF_IS_PROD            - true/false 是否生产环境
//   SF_SENDER_COMPANY     - 发件公司
//   SF_SENDER_CONTACT     - 发件人
//   SF_SENDER_TEL         - 发件电话
//   SF_SENDER_PROVINCE    - 发件省份
//   SF_SENDER_CITY        - 发件城市
//   SF_SENDER_COUNTY      - 发件区县
//   SF_SENDER_ADDRESS     - 发件详细地址
//   WECHAT_MP_OPS_SECRET  - 运维密钥（同微信发货接口鉴权）

/**
 * POST /api/sf/order
 * 顺丰下单接口：管理员发货时调用，生成顺丰运单并更新数据库
 * Body: { orderId, d_contact, d_tel, d_province, d_city, d_county, d_address, cargoName?, cargoCount?, cargoUnit?, remark? }
 */
app.post('/api/sf/order', async (req, res) => {
  try {
    if (!assertMpOpsAuth(req, res)) return
    const { orderId, d_contact, d_tel, d_province, d_city, d_county, d_address, cargoName, cargoCount, cargoUnit, remark } = req.body || {}
    if (!orderId || !d_contact || !d_tel || !d_address) {
      return res.status(400).json(error('缺少必填参数: orderId, d_contact, d_tel, d_address'))
    }

    const orderResult = await callCloudFunction('order', {
      action: 'getOrderForPayment',
      orderId
    })
    if (!orderResult.success || !orderResult.data) {
      return res.status(400).json(error(orderResult.error || '订单不存在'))
    }
    const order = orderResult.data
    if (order.status !== 'paid') {
      return res.status(400).json(error(`当前订单状态不可发货: ${order.status}`))
    }

    const sfOrderId = order.order_no || `SA${orderId}`
    const sfExpress = getSfExpress()
    const sfResult = await sfExpress.sfOrder({
      orderid: sfOrderId,
      d_contact,
      d_tel,
      d_province: d_province || '',
      d_city: d_city || '',
      d_county: d_county || '',
      d_address,
      cargoName: cargoName || 'Sravx剪刀',
      cargoCount: cargoCount || 1,
      cargoUnit: cargoUnit || '件',
      remark: remark || ''
    })

    if (!sfResult.success) {
      return res.json(error(sfResult.errorMsg || `顺丰下单失败(code=${sfResult.errorCode})`))
    }

    const mailno = sfResult.mailno || ''
    const waybillToken = `${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    const shipResult = await callCloudFunction('order', {
      action: 'ship',
      orderId,
      expressCompany: 'SF',
      expressNo: mailno,
      waybillToken
    })

    if (!shipResult || !shipResult.success) {
      console.error('[SF] 更新发货状态失败:', shipResult && shipResult.error)
    }

    // 同时上传发货信息到微信订单中心
    if (order.pay_transaction_id) {
      try {
        await sfRouteTraceToWechat(order, mailno);
      } catch (wxErr) {
        console.error('[SF] 同步微信物流失败:', wxErr && wxErr.message)
      }
    }

    return res.json(success({
      mailno,
      orderid: sfOrderId,
      waybillToken,
      shipStatus: shipResult
    }))
  } catch (e) {
    console.error('[SF] /api/sf/order error:', e)
    return res.status(500).json(error(e.message || String(e)))
  }
})

async function sfRouteTraceToWechat(order, mailno) {
  if (!order.pay_transaction_id) return
  try {
    const token = await getMiniProgramAccessToken()
    const apiPath = `/wxa/sec/order/upload_shipping_info?access_token=${encodeURIComponent(token)}`
    const payload = {
      order_key: { order_number_type: 2, transaction_id: String(order.pay_transaction_id).trim() },
      logistics_type: 1,
      delivery_mode: 1,
      shipping_list: [{ tracking_no: String(mailno).trim(), express_company: 'SF', item_desc: 'Sravx剪刀*1' }],
      upload_time: rfc3339ShanghaiWithMs(),
      payer: { openid: order._openid ? String(order._openid).trim() : '' }
    }
    const wxRes = await wxOpenHttpsJson('POST', apiPath, payload)
    console.log('[SF] 同步微信物流结果:', JSON.stringify(wxRes))
  } catch (e) {
    console.error('[SF] 同步微信物流异常:', e && e.message)
  }
}

/**
 * POST /api/sf/route
 * 查询顺丰物流轨迹
 * Body: { trackingNumber, trackingType? }
 *   trackingType: 1=按顺丰运单号, 2=按客户订单号
 */
app.post('/api/sf/route', async (req, res) => {
  try {
    if (!assertMpOpsAuth(req, res)) return
    const { trackingNumber, trackingType } = req.body || {}
    if (!trackingNumber) {
      return res.status(400).json(error('缺少 trackingNumber'))
    }
    const sfExpress = getSfExpress()
    const result = await sfExpress.sfRoute(trackingType || 1, trackingNumber)
    return res.json(success(result))
  } catch (e) {
    console.error('[SF] /api/sf/route error:', e)
    return res.status(500).json(error(e.message || String(e)))
  }
})

/**
 * POST /api/sf/cancel
 * 取消顺丰运单
 * Body: { orderid, mailno }
 */
app.post('/api/sf/cancel', async (req, res) => {
  try {
    if (!assertMpOpsAuth(req, res)) return
    const { orderid, mailno } = req.body || {}
    if (!orderid) {
      return res.status(400).json(error('缺少 orderid'))
    }
    const sfExpress = getSfExpress()
    const result = await sfExpress.sfCancel(orderid, mailno || '')
    return res.json(success(result))
  } catch (e) {
    console.error('[SF] /api/sf/cancel error:', e)
    return res.status(500).json(error(e.message || String(e)))
  }
})

/**
 * GET /db-check - 数据库连接检查（已弃用，改用云函数）
 */
app.get('/db-check', (req, res) => {
  res.json({ 
    success: false, 
    message: '数据库连接已弃用，请使用云函数处理数据库操作',
    cloudFunction: 'order',
    action: 'updatePaymentStatus'
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Payment API server running on port ${PORT}`)
})
