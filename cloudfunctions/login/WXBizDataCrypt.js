/**
 * 微信数据解密工具类
 * 用于解密手机号等敏感数据
 */

const crypto = require('crypto')

class WXBizDataCrypt {
  constructor(sessionKey) {
    this.sessionKey = sessionKey
  }

  decryptData(encryptedData, iv) {
    // AES-128-CBC 解密
    const sessionKey = Buffer.from(this.sessionKey, 'base64')
    const encryptedDataBuffer = Buffer.from(encryptedData, 'base64')
    const ivBuffer = Buffer.from(iv, 'base64')

    try {
      // 使用 crypto.createDecipheriv 解密
      const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, ivBuffer)
      
      // 设置自动 padding 为 true，pkcs7padding 会自动处理
      decipher.setAutoPadding(true)
      
      let decrypted = decipher.update(encryptedDataBuffer, null, 'utf8')
      decrypted += decipher.final('utf8')
      
      return JSON.parse(decrypted)
    } catch (err) {
      console.error('Decrypt error:', err)
      throw new Error('Illegal Buffer')
    }
  }
}

module.exports = WXBizDataCrypt
