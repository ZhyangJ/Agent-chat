// 导入路由模块
import { createRouter, createWebHistory } from 'vue-router'

// 导入视图组件（只保留 AI 对话）
import AIVIew from '../views/AIVIew.vue'

// 定义路由配置
const routes = [
  {
    path: '/',
    name: 'ai',
    component: AIVIew
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
