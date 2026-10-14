import api from './api.js'; const KEY = 'sravx_user_info'
// Cached legacy profile is not proof of a valid server session.
function user() { return api.targetToken() ? uni.getStorageSync(KEY) || null : null } function save(value) { uni.setStorageSync(KEY, value); return value }
async function refresh(phoneData = {}) { return save(await api.login(phoneData)) } function requirePhone() { const current = user(); if (current && current.phone) return true; uni.showToast({ title: '请先授权手机号', icon: 'none' }); return false }
export default { user, save, refresh, requirePhone, logout() { uni.removeStorageSync(KEY); api.clearTargetSession() } }
