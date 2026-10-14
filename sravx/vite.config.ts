import { defineConfig, type ProxyOptions } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { CATALOG_PROXY_PREFIX, allowedCatalogRequest } from './common/catalog-transport.mjs'

// Production uses /api on the site's origin. Preview mirrors the existing
// read-only dev proxy; it must not forward business writes or credentials.
const catalogProxy: ProxyOptions = {
  target: 'https://api.sravxpet.com', changeOrigin: true,
  rewrite: path => path.replace(/^\/sravx-catalog/, ''),
  bypass(req, res) {
    const url = req.url || ''
    const path = url.startsWith('/api/') ? CATALOG_PROXY_PREFIX + url : url
    if (!allowedCatalogRequest(path, req.method)) {
      res.statusCode = 403
      res.end('Only public catalog GET requests are allowed')
      return false
    }
  },
  configure(proxy) {
    proxy.on('proxyReq', request => {
      request.removeHeader('authorization')
      request.removeHeader('cookie')
    })
  }
}

export default defineConfig({
  plugins: [uni()],
  // Only the website uses curated showcase assets. Keep mini-program output unchanged.
  publicDir: process.env.UNI_PLATFORM === 'h5' ? 'public' : '__static__',
  preview: { proxy: { '/api': catalogProxy } },
  server: {
    proxy: {
      [CATALOG_PROXY_PREFIX]: catalogProxy
    }
  }
})
