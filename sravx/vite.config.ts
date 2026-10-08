import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { CATALOG_PROXY_PREFIX, allowedCatalogRequest } from './common/catalog-transport.mjs'

export default defineConfig({
  plugins: [uni()],
  server: {
    proxy: {
      [CATALOG_PROXY_PREFIX]: {
        target: 'https://api.sravxpet.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/sravx-catalog/, ''),
        bypass(req, res) {
          if (!allowedCatalogRequest(req.url, req.method)) {
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
    }
  }
})
