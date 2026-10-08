// Hash changes within the same UniApp page do not run onLoad again.
export function catalogRoute(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#/, '').split('?')
  if (path !== '/pages/shop/index') return null
  const params = new URLSearchParams(query)
  const series = params.get('series')
  const tool = params.get('tool')
  return {
    series: ['basic', 'pro', 'master', 'accessories'].includes(series) ? series : 'all',
    tool: ['straight', 'curved', 'thinning', 'fishbone', 'texturizing', 'accessories', 'other'].includes(tool) ? tool : 'all'
  }
}
