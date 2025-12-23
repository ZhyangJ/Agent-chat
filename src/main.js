import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 【新增：导入路由配置】
import router from './router'

// 【新增：导入Element Plus组件库】
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// 创建Vue应用实例
const app = createApp(App)

// 【新增：使用路由】
app.use(router)

// 【新增：使用Element Plus组件库】
app.use(ElementPlus)

// 挂载应用
app.mount('#app')
