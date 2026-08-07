const app = getApp()
const api = require('./api')

function hasPhoneAuthorized() {
  const userInfo = (app.globalData && app.globalData.userInfo) || {}
  return !!userInfo.phone
}

function makeError(message, code) {
  const err = new Error(message)
  err.code = code
  err.userMessage = message
  return err
}

function requirePhoneDetail(detail = {}) {
  if (detail.errMsg !== 'getPhoneNumber:ok') {
    throw makeError('请授权手机号后继续使用', 'PHONE_AUTH_DENIED')
  }

  const hasCode = !!detail.code
  const hasCloudID = !!detail.cloudID
  const hasEncryptedData = !!(detail.encryptedData && detail.iv)
  if (!hasCode && !hasCloudID && !hasEncryptedData) {
    throw makeError('未获取到手机号授权凭证，请重试', 'PHONE_AUTH_EMPTY')
  }
}

async function loginWithPhoneDetail(detail = {}, options = {}) {
  requirePhoneDetail(detail)

  const data = {
    code: detail.code,
    encryptedData: detail.encryptedData,
    iv: detail.iv,
    cloudID: detail.cloudID
  }
  if (options.profile) {
    data.profile = options.profile
  }

  if (options.loadingTitle) {
    wx.showLoading({ title: options.loadingTitle, mask: true })
  }

  try {
    const loginRes = await api.login(data)
    if (!loginRes || !loginRes.phone) {
      throw makeError('手机号绑定失败，请重新授权', 'PHONE_AUTH_NO_PHONE')
    }

    if (app && typeof app.setUserInfo === 'function') {
      const current = (app.globalData && app.globalData.userInfo) || {}
      app.setUserInfo({
        ...current,
        openid: loginRes.openid,
        unionid: loginRes.unionid || current.unionid,
        userId: loginRes.userId || current.userId,
        phone: loginRes.phone,
        username: loginRes.username || current.username,
        nickname: loginRes.username || current.nickname,
        avatar: loginRes.avatar || current.avatar,
        gender: loginRes.gender || current.gender,
        birthday: loginRes.birthday || current.birthday,
        occupation: loginRes.occupation || current.occupation,
        needsProfileSetup: loginRes.needsProfileSetup !== undefined ? loginRes.needsProfileSetup : current.needsProfileSetup,
        isNewUser: loginRes.isNewUser !== undefined ? loginRes.isNewUser : current.isNewUser,
        memberLevel: loginRes.memberLevel || current.memberLevel,
        points: loginRes.points !== undefined ? loginRes.points : current.points,
        totalPoints: loginRes.totalPoints !== undefined ? loginRes.totalPoints : current.totalPoints
      })
    }

    return loginRes
  } finally {
    if (options.loadingTitle) {
      wx.hideLoading()
    }
  }
}

function showRequiredToast(message) {
  wx.showToast({
    title: message || '请先授权手机号',
    icon: 'none'
  })
}

module.exports = {
  hasPhoneAuthorized,
  loginWithPhoneDetail,
  showRequiredToast
}
