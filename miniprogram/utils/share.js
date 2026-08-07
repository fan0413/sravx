const DEFAULT_TITLE = 'Sravx'
const DEFAULT_IMAGE = '/images/logo.png'

function showShareMenu() {
  if (typeof wx === 'undefined' || typeof wx.showShareMenu !== 'function') return
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  })
}

function getImageUrl(imageUrl) {
  return imageUrl || DEFAULT_IMAGE
}

function createShareAppMessage(options = {}) {
  return {
    title: options.title || DEFAULT_TITLE,
    path: options.path || '/pages/home/home',
    imageUrl: getImageUrl(options.imageUrl)
  }
}

function createShareTimeline(options = {}) {
  return {
    title: options.title || DEFAULT_TITLE,
    query: options.query || '',
    imageUrl: getImageUrl(options.imageUrl)
  }
}

module.exports = {
  DEFAULT_TITLE,
  DEFAULT_IMAGE,
  showShareMenu,
  createShareAppMessage,
  createShareTimeline
};
