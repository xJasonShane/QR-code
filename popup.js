import { MESSAGE_TYPES, NOTIFICATION_DURATION, NOTIFICATION_TYPES } from './core/constants.js';
import { logger } from './core/logger.js';
import { errorHandler } from './core/error-handler.js';
import { storageManager } from './core/storage-manager.js';
import { configManager } from './core/config-manager.js';
import { qrGenerator } from './modules/qr-generator.js';
import { historyManager } from './modules/history-manager.js';

class PopupController {
  constructor() {
    this.isInitialized = false;
    this.currentTab = null;
    this.currentUrl = '';
    this.debounceTimers = new Map();
    this.debounceDelay = 300;
  }

  async init() {
    try {
      logger.info('PopupController initializing...');
      
      await this.checkLibraries();
      await this.initializeQRGenerator();
      await this.loadCurrentTab();
      await this.loadSettings();
      await this.loadHistory();
      this.setupEventListeners();
      
      this.isInitialized = true;
      logger.info('PopupController initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PopupController', error);
      this.showError('初始化失败，请刷新重试');
      errorHandler.handleError(error);
    }
  }

  async checkLibraries() {
    if (typeof QRCode === 'undefined') {
      throw new Error('QRCode library not loaded');
    }
    logger.debug('All required libraries loaded');
  }

  async initializeQRGenerator() {
    try {
      await qrGenerator.initialize('qrcode');
      logger.debug('QRGenerator initialized');
    } catch (error) {
      logger.error('Failed to initialize QRGenerator', error);
      throw error;
    }
  }

  async loadCurrentTab() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: MESSAGE_TYPES.GET_CURRENT_TAB 
      });
      
      if (response.status === 'success' && response.tab) {
        this.currentTab = response.tab;
        this.currentUrl = response.tab.url;
        
        const urlInput = document.getElementById('currentUrl');
        if (urlInput) {
          urlInput.value = this.currentUrl;
          await this.generateQRCode(this.currentUrl);
        }
        
        logger.debug('Current tab loaded:', this.currentTab);
      } else {
        logger.warn('Failed to get current tab:', response.error);
        this.showError('无法获取当前页面信息');
      }
    } catch (error) {
      logger.error('Failed to load current tab', error);
      throw error;
    }
  }

  async loadSettings() {
    try {
      const settings = await configManager.loadSettings();
      this.updateSettingsUI(settings);
      logger.debug('Settings loaded:', settings);
    } catch (error) {
      logger.error('Failed to load settings', error);
      throw error;
    }
  }

  async loadHistory() {
    try {
      const history = await historyManager.getAll();
      this.renderHistory(history);
      logger.debug(`History loaded: ${history.length} items`);
    } catch (error) {
      logger.error('Failed to load history', error);
      this.showError('加载历史记录失败');
    }
  }

  setupEventListeners() {
    const urlInput = document.getElementById('currentUrl');
    const generateBtn = document.getElementById('generateBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyTextBtn = document.getElementById('copyTextBtn');
    const copyImageBtn = document.getElementById('copyImageBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historySearch = document.getElementById('historySearch');
    const settingsBtn = document.getElementById('settingsBtn');

    if (urlInput) {
      urlInput.addEventListener('input', this.debounce(this.handleUrlInput.bind(this), this.debounceDelay));
      urlInput.addEventListener('keypress', this.handleUrlKeypress.bind(this));
    }

    if (generateBtn) {
      generateBtn.addEventListener('click', this.handleGenerate.bind(this));
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', this.handleDownload.bind(this));
    }

    if (copyTextBtn) {
      copyTextBtn.addEventListener('click', this.handleCopyText.bind(this));
    }

    if (copyImageBtn) {
      copyImageBtn.addEventListener('click', this.handleCopyImage.bind(this));
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', this.handleClearHistory.bind(this));
    }

    if (historySearch) {
      historySearch.addEventListener('input', this.debounce(this.handleHistorySearch.bind(this), this.debounceDelay));
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', this.handleOpenSettings.bind(this));
    }

    logger.debug('Event listeners setup completed');
  }

  debounce(fn, delay) {
    return (...args) => {
      const key = fn.toString();
      
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key));
      }
      
      this.debounceTimers.set(key, setTimeout(() => {
        fn.apply(this, args);
        this.debounceTimers.delete(key);
      }, delay));
    };
  }

  async handleUrlInput(event) {
    const value = event.target.value.trim();
    
    if (value !== this.currentUrl) {
      this.currentUrl = value;
      logger.debug('URL input changed:', value);
    }
  }

  async handleUrlKeypress(event) {
    if (event.key === 'Enter') {
      await this.handleGenerate();
    }
  }

  async handleGenerate() {
    try {
      const url = document.getElementById('currentUrl').value.trim();
      
      if (!url) {
        this.showWarning('请输入要生成二维码的内容');
        return;
      }

      logger.info('Generating QR code for:', url);
      await this.generateQRCode(url);
      this.showSuccess('二维码生成成功');
    } catch (error) {
      logger.error('Failed to generate QR code', error);
      this.showError('生成二维码失败');
      errorHandler.handleError(error);
    }
  }

  async generateQRCode(content) {
    try {
      await qrGenerator.generate(content);
      logger.debug('QR code generated successfully');
    } catch (error) {
      logger.error('Failed to generate QR code', error);
      throw error;
    }
  }

  async handleDownload() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `qrcode_${timestamp}.png`;
      
      await qrGenerator.downloadImage(filename);
      this.showSuccess('二维码已下载');
    } catch (error) {
      logger.error('Failed to download QR code', error);
      this.showError('下载失败');
      errorHandler.handleError(error);
    }
  }

  async handleCopyText() {
    try {
      await qrGenerator.copyText();
      this.showSuccess('二维码内容已复制到剪贴板');
    } catch (error) {
      logger.error('Failed to copy QR code text', error);
      this.showError('复制失败');
      errorHandler.handleError(error);
    }
  }

  async handleCopyImage() {
    try {
      await qrGenerator.copyImage();
      this.showSuccess('二维码图片已复制到剪贴板');
    } catch (error) {
      logger.error('Failed to copy QR code image', error);
      this.showError('复制失败');
      errorHandler.handleError(error);
    }
  }

  async handleClearHistory() {
    try {
      if (confirm('确定要清空所有历史记录吗？')) {
        await historyManager.clear();
        await this.loadHistory();
        this.showSuccess('历史记录已清空');
      }
    } catch (error) {
      logger.error('Failed to clear history', error);
      this.showError('清空历史记录失败');
      errorHandler.handleError(error);
    }
  }

  async handleHistorySearch(event) {
    try {
      const query = event.target.value.trim();
      const history = await historyManager.search(query);
      this.renderHistory(history);
      logger.debug(`History search: ${query}, results: ${history.length}`);
    } catch (error) {
      logger.error('Failed to search history', error);
      errorHandler.handleError(error);
    }
  }

  async handleOpenSettings() {
    try {
      await chrome.runtime.openOptionsPage();
      logger.info('Opening options page');
    } catch (error) {
      logger.error('Failed to open options page', error);
      this.showError('打开设置页面失败');
      errorHandler.handleError(error);
    }
  }

  updateSettingsUI(settings) {
    logger.debug('Updating settings UI:', settings);
  }

  renderHistory(history) {
    const container = document.getElementById('historyList');
    
    if (!container) {
      logger.warn('History container not found');
      return;
    }

    if (history.length === 0) {
      container.innerHTML = '<div class="history-empty">暂无历史记录</div>';
      return;
    }

    container.innerHTML = history.map((item, index) => `
      <div class="history-item" data-index="${index}">
        <div class="history-content" title="${this.escapeHtml(item.content)}">
          ${this.escapeHtml(item.content.length > 50 ? item.content.substring(0, 50) + '...' : item.content)}
        </div>
        <div class="history-meta">
          <span class="history-time">${this.formatTime(item.timestamp)}</span>
          <button class="history-copy" data-index="${index}" title="复制内容">复制</button>
          <button class="history-delete" data-index="${index}" title="删除">删除</button>
        </div>
      </div>
    `).join('');

    this.setupHistoryItemListeners(container);
    logger.debug(`History rendered: ${history.length} items`);
  }

  setupHistoryItemListeners(container) {
    const copyButtons = container.querySelectorAll('.history-copy');
    const deleteButtons = container.querySelectorAll('.history-delete');
    const historyItems = container.querySelectorAll('.history-item');

    copyButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        const index = parseInt(event.target.dataset.index);
        await this.handleHistoryCopy(index);
      });
    });

    deleteButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        const index = parseInt(event.target.dataset.index);
        await this.handleHistoryDelete(index);
      });
    });

    historyItems.forEach(item => {
      item.addEventListener('click', async (event) => {
        if (event.target.classList.contains('history-copy') || 
            event.target.classList.contains('history-delete')) {
          return;
        }
        
        const index = parseInt(event.currentTarget.dataset.index);
        await this.handleHistoryItemClick(index);
      });
    });
  }

  async handleHistoryCopy(index) {
    try {
      const history = await historyManager.getAll();
      const item = history[index];
      
      if (item) {
        await navigator.clipboard.writeText(item.content);
        this.showSuccess('已复制到剪贴板');
        logger.debug('History item copied:', item);
      }
    } catch (error) {
      logger.error('Failed to copy history item', error);
      this.showError('复制失败');
      errorHandler.handleError(error);
    }
  }

  async handleHistoryDelete(index) {
    try {
      await historyManager.deleteByIndex(index);
      await this.loadHistory();
      this.showSuccess('已删除');
    } catch (error) {
      logger.error('Failed to delete history item', error);
      this.showError('删除失败');
      errorHandler.handleError(error);
    }
  }

  async handleHistoryItemClick(index) {
    try {
      const history = await historyManager.getAll();
      const item = history[index];
      
      if (item) {
        const urlInput = document.getElementById('currentUrl');
        urlInput.value = item.content;
        this.currentUrl = item.content;
        await this.generateQRCode(item.content);
        logger.debug('History item selected:', item);
      }
    } catch (error) {
      logger.error('Failed to select history item', error);
      errorHandler.handleError(error);
    }
  }

  showNotification(message, type = NOTIFICATION_TYPES.INFO, duration = NOTIFICATION_DURATION.MEDIUM) {
    const notification = document.getElementById('notification');
    
    if (!notification) {
      logger.warn('Notification element not found');
      return;
    }

    notification.textContent = message;
    notification.className = `notification notification-${type}`;
    notification.style.display = 'block';

    setTimeout(() => {
      notification.style.display = 'none';
    }, duration);

    logger.debug(`Notification shown: ${message}`);
  }

  showSuccess(message) {
    this.showNotification(message, NOTIFICATION_TYPES.SUCCESS, NOTIFICATION_DURATION.MEDIUM);
  }

  showError(message) {
    this.showNotification(message, NOTIFICATION_TYPES.ERROR, NOTIFICATION_DURATION.LONG);
  }

  showWarning(message) {
    this.showNotification(message, NOTIFICATION_TYPES.WARNING, NOTIFICATION_DURATION.MEDIUM);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} 分钟前`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)} 小时前`;
    } else if (diff < 604800000) {
      return `${Math.floor(diff / 86400000)} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  }

  destroy() {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    logger.info('PopupController destroyed');
  }
}

let popupController;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    popupController = new PopupController();
    await popupController.init();
  } catch (error) {
    logger.error('Failed to initialize popup:', error);
    errorHandler.handleError(error);
  }
});

window.addEventListener('unload', () => {
  if (popupController) {
    popupController.destroy();
  }
});
