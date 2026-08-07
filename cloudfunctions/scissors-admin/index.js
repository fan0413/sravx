/**
 * 剪刀管理云函数（管理员）- 使用 wx-server-sdk 数据库
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, ...params } = event

  // 简单的管理员验证（实际项目中应使用更安全的验证方式）
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 管理员 openid 列表（实际项目中应存储在数据库或配置中）
  const adminOpenids = []

  try {
    // 添加剪刀记录
    if (action === 'add') {
      const { sn, model, warrantyMonths = 12 } = params

      if (!sn) return { success: false, error: '请输入序列号' }

      // 检查序列号是否已存在
      const existRes = await db.collection('scissors')
        .where({ sn: sn })
        .count()
      if (existRes.total > 0) {
        return { success: false, error: '序列号已存在' }
      }

      const res = await db.collection('scissors').add({
        data: {
          sn,
          model: model || '',
          warranty_months: warrantyMonths,
          is_bound: false,
          created_at: new Date()
        }
      })

      return { success: true, data: { id: res._id } }
    }

    // 批量添加剪刀
    if (action === 'batchAdd') {
      const { scissorsList } = params

      if (!scissorsList || !Array.isArray(scissorsList)) {
        return { success: false, error: '请提供剪刀列表' }
      }

      const results = []
      for (const item of scissorsList) {
        try {
          // 检查是否已存在
          const existRes = await db.collection('scissors')
            .where({ sn: item.sn })
            .count()
          if (existRes.total > 0) {
            results.push({ sn: item.sn, success: false, error: '已存在' })
            continue
          }

          await db.collection('scissors').add({
            data: {
              sn: item.sn,
              model: item.model || '',
              warranty_months: item.warrantyMonths || 12,
              is_bound: false,
              created_at: new Date()
            }
          })
          results.push({ sn: item.sn, success: true })
        } catch (e) {
          results.push({ sn: item.sn, success: false, error: e.message })
        }
      }

      return { success: true, data: results }
    }

    // 获取剪刀列表
    if (action === 'list') {
      const { page = 1, pageSize = 20, keyword } = params
      const offset = (parseInt(page) - 1) * parseInt(pageSize)

      let query = db.collection('scissors')
      if (keyword) {
        query = query.where({
          sn: db.RegExp({ regexp: keyword, options: 'i' })
        })
      }

      const countRes = await query.count()
      const listRes = await query
        .orderBy('created_at', 'desc')
        .skip(offset)
        .limit(parseInt(pageSize))
        .get()

      return {
        success: true,
        data: {
          list: listRes.data || [],
          total: countRes.total
        }
      }
    }

    // 获取剪刀详情
    if (action === 'detail') {
      const { sn } = params

      if (!sn) return { success: false, error: '请输入序列号' }

      const scissorsRes = await db.collection('scissors')
        .where({ sn: sn })
        .limit(1)
        .get()

      if (!scissorsRes.data || scissorsRes.data.length === 0) {
        return { success: false, error: '剪刀不存在' }
      }

      // 获取绑定用户信息
      let bindUser = null
      if (scissorsRes.data[0].is_bound) {
        const bindRes = await db.collection('user_scissors')
          .where({ sn: sn })
          .limit(1)
          .get()
        if (bindRes.data && bindRes.data.length > 0) {
          const userRes = await db.collection('users')
            .where({ openid: bindRes.data[0].openid })
            .limit(1)
            .get()
          bindUser = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null
        }
      }

      return {
        success: true,
        data: {
          ...scissorsRes.data[0],
          bindUser: bindUser
        }
      }
    }

    // 删除剪刀
    if (action === 'delete') {
      const { sn } = params

      if (!sn) return { success: false, error: '请输入序列号' }

      const scissorsRes = await db.collection('scissors')
        .where({ sn: sn })
        .limit(1)
        .get()

      if (!scissorsRes.data || scissorsRes.data.length === 0) {
        return { success: false, error: '剪刀不存在' }
      }

      // 删除剪刀记录
      await db.collection('scissors')
        .where({ sn: sn })
        .remove()

      // 删除绑定记录
      await db.collection('user_scissors')
        .where({ sn: sn })
        .remove()

      return { success: true, data: { message: '删除成功' } }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Scissors-admin error:', error)
    return { success: false, error: error.message }
  }
}
