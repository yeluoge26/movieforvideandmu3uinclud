import router from './router'
import { ElMessage } from 'element-plus'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { getToken } from '@/utils/auth'
import { isHttp } from '@/utils/validate'
import { isRelogin } from '@/utils/request'
import useUserStore from '@/store/modules/user'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'

NProgress.configure({ showSpinner: false });

const whiteList = ['/login', '/auth-redirect', '/bind', '/register'];

router.beforeEach((to, from, next) => {
  NProgress.start()
  if (getToken()) {
    to.meta.title && useSettingsStore().setTitle(to.meta.title)
    /* has token*/
    if (to.path === '/login') {
      next({ path: '/' })
      NProgress.done()
    } else {
      if (useUserStore().roles.length === 0) {
        isRelogin.show = true
        // 添加超时处理（10秒）
        const timeoutId = setTimeout(() => {
          isRelogin.show = false
          ElMessage.error('获取用户信息超时，请检查网络连接或后端服务')
          useUserStore().logOut().then(() => {
            next({ path: '/login', query: { redirect: to.fullPath } })
          }).catch(() => {
            next({ path: '/login', query: { redirect: to.fullPath } })
          })
        }, 10000)
        
        // 判断当前用户是否已拉取完user_info信息
        useUserStore().getInfo().then(() => {
          clearTimeout(timeoutId)
          isRelogin.show = false
          usePermissionStore().generateRoutes().then(accessRoutes => {
            // 根据roles权限生成可访问的路由表
            accessRoutes.forEach(route => {
              if (!isHttp(route.path)) {
                router.addRoute(route) // 动态添加可访问路由表
              }
            })
            next({ ...to, replace: true }) // hack方法 确保addRoutes已完成
          }).catch(err => {
            clearTimeout(timeoutId)
            isRelogin.show = false
            console.error('生成路由失败:', err)
            ElMessage.error('加载路由失败，请刷新页面重试')
            next({ path: '/login', query: { redirect: to.fullPath } })
          })
        }).catch(err => {
          clearTimeout(timeoutId)
          isRelogin.show = false
          console.error('获取用户信息失败:', err)
          const errorMsg = err?.message || err || '获取用户信息失败，请检查网络连接'
          ElMessage.error(errorMsg)
          useUserStore().logOut().then(() => {
            next({ path: '/login', query: { redirect: to.fullPath } })
          }).catch(() => {
            next({ path: '/login', query: { redirect: to.fullPath } })
          })
        })
      } else {
        next()
      }
    }
  } else {
    // 没有token
    if (whiteList.indexOf(to.path) !== -1) {
      // 在免登录白名单，直接进入
      next()
    } else {
      next(`/login?redirect=${to.fullPath}`) // 否则全部重定向到登录页
      NProgress.done()
    }
  }
})

router.afterEach(() => {
  NProgress.done()
})
