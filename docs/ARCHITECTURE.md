# 快识二维码插件 - 架构设计文档

## 1. 项目概述

### 1.1 项目目标
开发一个功能完整、性能稳定、易于维护的 Chrome 扩展，提供二维码生成和识别功能。

### 1.2 核心功能
- 二维码生成（从当前页面 URL 或自定义文本）
- 二维码识别（通过框选页面区域）
- 历史记录管理
- 个性化设置
- 快捷键支持

## 2. 技术架构

### 2.1 整体架构
```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                     │
├─────────────────────────────────────────────────────────────┤
│  Background Service Worker (background.js)             │
│  - 消息路由                                          │
│  - 生命周期管理                                        │
│  - 状态管理                                            │
├─────────────────────────────────────────────────────────────┤
│  Popup (popup.js + popup.html)                        │
│  - QRCode 生成                                        │
│  - 用户交互                                            │
│  - 历史记录展示                                       │
├─────────────────────────────────────────────────────────────┤
│  Content Script (content.js)                           │
│  - 页面交互                                            │
│  - 二维码识别                                          │
│  - 框选功能                                            │
├─────────────────────────────────────────────────────────────┤
│  Options Page (options.js + options.html)                 │
│  - 设置管理                                            │
│  - 历史记录管理                                        │
├─────────────────────────────────────────────────────────────┤
│  Shared Modules (core/)                                 │
│  - Logger (日志模块)                                     │
│  - ErrorHandler (错误处理模块)                            │
│  - StorageManager (存储管理模块)                           │
│  - ConfigManager (配置管理模块)                            │
│  - PerformanceMonitor (性能监控模块)                        │
│  - Compatibility (兼容性适配层)                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 模块划分

#### 2.2.1 核心模块 (core/)
```
core/
├── logger.js              # 日志模块
├── error-handler.js       # 错误处理模块
├── storage-manager.js     # 存储管理模块
├── config-manager.js      # 配置管理模块
├── performance-monitor.js  # 性能监控模块
├── compatibility.js       # 兼容性适配层
└── constants.js          # 常量定义
```

#### 2.2.2 功能模块 (modules/)
```
modules/
├── qr-generator.js       # 二维码生成模块
├── qr-recognizer.js      # 二维码识别模块
├── history-manager.js     # 历史记录管理模块
├── selection-manager.js   # 框选管理模块
└── notification-manager.js # 通知管理模块
```

#### 2.2.3 UI 组件 (components/)
```
components/
├── popup/
│   ├── popup.js
│   └── popup.html
├── options/
│   ├── options.js
│   └── options.html
└── shared/
    └── styles.css
```

## 3. 通信机制

### 3.1 消息类型定义
```javascript
const MESSAGE_TYPES = {
  // Popup <-> Background
  GET_CURRENT_TAB: 'GET_CURRENT_TAB',
  GET_TAB_INFO: 'GET_TAB_INFO',
  
  // Background <-> Content
  TOGGLE_SELECTION_MODE: 'TOGGLE_SELECTION_MODE',
  START_SELECTION: 'START_SELECTION',
  END_SELECTION: 'END_SELECTION',
  RECOGNIZE_QR: 'RECOGNIZE_QR',
  
  // Storage Operations
  SAVE_HISTORY: 'SAVE_HISTORY',
  GET_HISTORY: 'GET_HISTORY',
  DELETE_HISTORY: 'DELETE_HISTORY',
  CLEAR_HISTORY: 'CLEAR_HISTORY',
  
  // Settings Operations
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  GET_SETTINGS: 'GET_SETTINGS',
  
  // Performance
  LOG_PERFORMANCE: 'LOG_PERFORMANCE',
  GET_PERFORMANCE_STATS: 'GET_PERFORMANCE_STATS'
};
```

### 3.2 通信流程
```
1. Popup -> Background: 请求当前标签页信息
2. Background -> Content: 触发框选模式
3. Content -> Background: 返回识别结果
4. Background -> Popup: 更新历史记录
5. Popup -> Background: 保存设置
```

## 4. 错误处理机制

### 4.1 错误类型定义
```javascript
const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};
```

### 4.2 错误处理策略
- 全局错误捕获
- 分类错误处理
- 用户友好的错误提示
- 错误日志记录
- 错误恢复机制

## 5. 性能优化策略

### 5.1 优化目标
- 首次加载时间 < 500ms
- 二维码生成时间 < 200ms
- 二维码识别时间 < 1s
- 内存占用 < 50MB

### 5.2 优化措施
- 懒加载资源
- 代码分割
- 缓存策略
- 防抖/节流
- Web Worker 处理密集任务

## 6. 兼容性适配

### 6.1 浏览器兼容性
- Chrome 88+
- Edge 88+
- 其他 Chromium 浏览器

### 6.2 页面兼容性
- 处理特殊页面（chrome://, about:blank 等）
- 处理 iframe 页面
- 处理 CSP 限制

## 7. 测试策略

### 7.1 单元测试
- 核心模块测试
- 功能模块测试
- 工具函数测试

### 7.2 集成测试
- 端到端测试
- 通信测试
- 用户流程测试

### 7.3 性能测试
- 加载性能测试
- 内存泄漏测试
- 响应时间测试

## 8. 部署计划

### 8.1 开发阶段
1. 核心模块开发
2. 功能模块开发
3. UI 组件开发
4. 集成测试

### 8.2 测试阶段
1. 单元测试
2. 集成测试
3. 用户验收测试

### 8.3 发布阶段
1. 代码审查
2. 文档完善
3. 发布到 Chrome Web Store
