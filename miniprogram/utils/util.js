const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatDate = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}-${formatNumber(month)}-${formatNumber(day)}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const calcWarrantyRemain = activationDate => {
  const WARRANTY_YEARS = 2
  const activation = new Date(activationDate)
  const expiry = new Date(activation)
  expiry.setFullYear(expiry.getFullYear() + WARRANTY_YEARS)
  const now = new Date()
  const diffMs = expiry - now
  if (diffMs <= 0) return '已过保'
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays > 365) {
    const years = Math.floor(diffDays / 365)
    const days = diffDays % 365
    return `${years}年${days}天`
  }
  return `${diffDays}天`
}

const generateMockProducts = () => [
  { id: '1', name: 'Sravx Pro 7" 专业理发剪', price: 1299, image: '/images/logo.png', tag: '新品', desc: '钴合金刀刃 · 人体工学设计' },
  { id: '2', name: 'Sravx Air 6" 轻量飞剪', price: 899, image: '/images/logo.png', tag: '热销', desc: '航空铝手柄 · 仅68g' },
  { id: '3', name: 'Sravx Elite 打薄剪 30齿', price: 699, image: '/images/logo.png', tag: '', desc: 'VG-10钢 · 精密30齿' },
  { id: '4', name: 'Sravx Studio 平剪套装', price: 2399, image: '/images/logo.png', tag: '套装', desc: '含6"/7"平剪各一 · 皮质收纳' },
  { id: '5', name: 'Sravx Care 养护套装', price: 199, image: '/images/logo.png', tag: '', desc: '润滑油+鹿皮+调节工具' },
  { id: '6', name: 'Sravx X 限定联名款', price: 1899, image: '/images/logo.png', tag: '限定', desc: '大马士革纹理 · 全球限量500' }
]

const generateCategories = () => [
  { id: 'new', name: '新品' },
  { id: 'scissors', name: '理发剪' },
  { id: 'thinning', name: '打薄剪' },
  { id: 'razor', name: '剃刀' },
  { id: 'set', name: '套装' },
  { id: 'accessory', name: '配件' },
  { id: 'care', name: '养护' }
]

module.exports = {
  formatTime,
  formatDate,
  formatNumber,
  calcWarrantyRemain,
  generateMockProducts,
  generateCategories
};
