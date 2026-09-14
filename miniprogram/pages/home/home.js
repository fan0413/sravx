const  preload  =  require('../../utils/preload')
const  share  =  require('../../utils/share')

const  SERVICE_FEATURES  =  [
  { key: 'custom', kicker: '专属工具配置', title: '定制服务', description: '根据你的使用习惯，选择更适合的专业工具配置。' },
  { key: 'protect', kicker: '工具服务计划', title: 'SRAVX Protect', description: '工具档案、保修状态与售后服务，集中查看。' },
  { key: 'apprentice', kicker: '专业成长支持', title: 'SRAVX 学徒支持', description: '为进阶中的宠物美容师，准备清晰的工具选择建议。' },
  { key: 'tradein', kicker: '换购服务', title: 'SRAVX 换购优惠', description: '旧工具换购权益，以后续官方活动规则为准。' }
]
const  HOME_SERIES  =  [
    {  key:  'basic',  name:  'Basic',  material:  '9Cr',  caption:  '入门专业款'  },
    {  key:  'pro',  name:  'Pro',  material:  '440C',  caption:  '专业主力款'  },
    {  key:  'master',  name:  'Master',  material:  'VG10',  caption:  '高阶专业款'  },
    {  key:  'accessories',  name:  '配件',  material:  '收纳与养护',  caption:  '专业工作配套'  }
]

function  matchesHomeSeries(product,  series)  {
    const  text  =  `${product.displayName  ||  ''}  ${product.name  ||  ''}  ${product.desc  ||  ''}  ${product.description  ||  ''}  ${product.series  ||  ''}  ${product.series_name  ||  ''}  ${product.category_name  ||  ''}`.toLowerCase()
    if  (series  ===  'accessories')  return  /(配件|套装|收纳|养护|保养|服务)/.test(text)
    return  text.includes(series)
}

function  buildHomeSeries(products)  {
    return  HOME_SERIES.map(series  =>  {
        const  matched  =  (products  ||  []).filter(product  =>  matchesHomeSeries(product,  series.key))
        return  {  ...series,  image:  (matched[0]  ||  {}).image  ||  '/images/logo.png',  productCount:  matched.length  }
    })
}
Page({
    data:  {
        banners:  [],
        products:  [],
        categories:  [],
        homeSeries:  [],
        serviceFeatures:  SERVICE_FEATURES,
        featureCurrent:  0,
        swiperCurrent:  0,
        navBarTop:  0,
        navBarHeight:  64,
        capsuleRight:  200,
        scrollPaddingTop:  0,
        loading:  true
    },

    onLoad()  {
        share.showShareMenu()
        this.initNavLayout()
        this.loadData()
    },

    initNavLayout()  {
        const  menuRect  =  wx.getMenuButtonBoundingClientRect()
        const  sysInfo  =  wx.getSystemInfoSync()
        const  ratio  =  750  /  sysInfo.screenWidth

        const  navBarTop  =  Math.ceil(menuRect.top  *  ratio)
        const  navBarHeight  =  Math.ceil(menuRect.height  *  ratio)
        const  capsuleRight  =  Math.ceil((sysInfo.screenWidth  -  menuRect.left  +  8)  *  ratio)
        const  scrollPaddingTop  =  Math.ceil((menuRect.bottom  +  12)  *  ratio)

        this.setData({  navBarTop,  navBarHeight,  capsuleRight,  scrollPaddingTop  })
    },

    applyHomeData(data)  {
        this.setData({
            banners:  data.banners  ||  [],
            products:  data.products  ||  [],
            categories:  data.categories  ||  [],
            homeSeries:  buildHomeSeries(data.products  ||  []),
            loading:  false
        })
    },

    refreshHomeInBackground()  {
        preload.preloadHome({  force:  true  }).then((fresh)  =>  {
            if  (fresh)  this.applyHomeData(fresh)
        })
    },

    async  loadData(options  =  {})  {
        const  cached  =  !options.force  &&  preload.getCachedHome()
        if  (cached)  {
            this.applyHomeData(cached)
            this.refreshHomeInBackground()
            return
        }

        try  {
            wx.showLoading({  title:  '加载中...',  mask:  true  })

            const  data  =  await  preload.preloadHome({  force:  true  })
            if  (!data)  throw  new  Error('加载失败')
            this.applyHomeData(data)

            wx.hideLoading()
        }  catch  (err)  {
            wx.hideLoading()
            console.error('Home  loadData  error:',  err)
            this.setData({  loading:  false  })
            wx.showToast({  title:  '加载失败',  icon:  'none'  })
        }
    },

    onShow()  {
        if  (typeof  this.getTabBar  ===  'function'  &&  this.getTabBar())  {
            this.getTabBar().setData({  active:  0  })
        }
    },

    onSwiperChange(e)  {
        this.setData({  swiperCurrent:  e.detail.current  })
    },

    onFeatureChange(e)  {
        this.setData({  featureCurrent:  e.detail.current  })
    },

    onSearchTap()  {
        wx.navigateTo({  url:  '/pages/search/search'  })
    },

    onBrowseTap()  {
        wx.navigateTo({  url:  '/pages/shop/shop'  })
    },

    onSeriesTap(e)  {
        const  series  =  e.currentTarget.dataset.series
        if  (!HOME_SERIES.some(item  =>  item.key  ===  series))  return
        wx.navigateTo({  url:  `/pages/shop/shop?series=${series}`  })
    },

    onProductTap(e)  {
        const  id  =  e.currentTarget.dataset.id
        wx.navigateTo({  url:  `/pages/productDetail/productDetail?id=${id}`  })
    },

    onPullDownRefresh()  {
        this.loadData({  force:  true  }).finally(()  =>  {
            wx.stopPullDownRefresh()
        })
    },

    onShareAppMessage()  {
        return  share.createShareAppMessage({
            title:  'Sravx',
            path:  '/pages/home/home'
        })
    },

    onShareTimeline()  {
        return  share.createShareTimeline({
            title:  'Sravx'
        })
    }
})
