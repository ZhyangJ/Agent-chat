<script setup>
// 导入Element Plus图标（仅保留 AI 对话相关）
import { 
  Setting,
  ChatRound
} from '@element-plus/icons-vue'
</script>

<template>
  <div class="app-container">
    <!-- 使用Element Plus的Container布局组件 -->
    <el-container style="height: 100vh;">
      <!-- 侧边栏 -->
      <el-aside width="200px" style="background-color: #001529;">
        <!-- 系统标题 -->
        <div class="logo-container">
          <h1 class="logo-text">历史对话</h1>
        </div>
        
        <!-- 使用Element Plus的Menu组件实现导航菜单 -->
        <el-menu
          default-active="/"
          class="sidebar-menu"
          background-color="#001529"
          text-color="#fff"
          active-text-color="#ffd04b"
          router
        >
          <el-menu-item index="/">
            <template #title>
              <el-icon><ChatRound /></el-icon>
              <span>AI对话</span>
            </template>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <!-- 主内容区 -->
      <el-container>
        <!-- 顶部导航栏 -->
        <el-header style="background-color: #fff; border-bottom: 1px solid #e6e6e6; display: flex; align-items: center; padding: 0 20px;">
          <!-- 左侧占位元素 -->
          <div style="flex: 1;"></div>
          
          <!-- 标题居中 -->
          <h2>AI Agent</h2>
          
          <!-- 右侧占位元素 -->
          <div style="flex: 1;"></div>
          
        </el-header>
        
        <!-- 路由视图区域 -->
        <el-main style="padding: 20px;">
          <!-- 使用RouterView组件显示当前路由对应的组件 -->
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: Arial, sans-serif;
}

.app-container {
  height: 100%;
}

/* 侧边栏样式 */
.logo-container {
  padding: 0;
  height: 60px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid #1f2d3d;
}

.logo-text {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  text-align: center;
}

.sidebar-menu {
  border-right: none;
}

/* 顶部导航栏样式 */
.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 主内容区域样式 */
.el-main {
  background-color: #f5f7fa;
}
</style>

<style scoped>
/* 组件特定样式 */
.el-dropdown-link {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>
