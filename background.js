import { MESSAGE_TYPES } from './core/constants.js';
import { logger } from './core/logger.js';
import { errorHandler, AppError, ERROR_TYPES } from './core/error-handler.js';

class BackgroundService {
  constructor() {
    this.messageHandlers = new Map();
    this.commandHandlers = new Map();
    this.init();
  }

  init() {
    this.setupMessageHandlers();
    this.setupCommandHandlers();
    this.setupInstallListener();
    this.setupStartupListener();
    logger.info('BackgroundService initialized');
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const startTime = performance.now();
      
      try {
        logger.debug(`Received message: ${request.action}`, { request, sender });
        
        const handler = this.messageHandlers.get(request.action);
        
        if (handler) {
          const result = handler(request, sender);
          const duration = performance.now() - startTime;
          
          logger.debug(`Message handled: ${request.action} in ${duration}ms`);
          
          sendResponse(result);
        } else {
          logger.warn(`Unknown message action: ${request.action}`);
          sendResponse({ 
            status: 'error', 
            error: 'Unknown action',
            action: request.action 
          });
        }
      } catch (error) {
        logger.error('Error handling message:', error);
        sendResponse({ 
          status: 'error', 
          error: error.message,
          action: request.action 
        });
      }
      
      return true;
    });
  }

  setupCommandHandlers() {
    chrome.commands.onCommand.addListener((command) => {
      const startTime = performance.now();
      
      try {
        logger.debug(`Received command: ${command}`);
        
        const handler = this.commandHandlers.get(command);
        
        if (handler) {
          handler();
          const duration = performance.now() - startTime;
          logger.debug(`Command handled: ${command} in ${duration}ms`);
        } else {
          logger.warn(`Unknown command: ${command}`);
        }
      } catch (error) {
        logger.error('Error handling command:', error);
        errorHandler.handleError(error);
      }
    });
  }

  setupInstallListener() {
    chrome.runtime.onInstalled.addListener((details) => {
      logger.info('Extension installed/updated:', details);
      
      if (details.reason === 'install') {
        this.handleInstall();
      } else if (details.reason === 'update') {
        this.handleUpdate(details.previousVersion);
      }
    });
  }

  setupStartupListener() {
    chrome.runtime.onStartup.addListener(() => {
      logger.info('Extension started up');
    });
  }

  handleInstall() {
    logger.info('First time installation');
    this.initializeDefaultSettings();
    this.showWelcomeNotification();
  }

  handleUpdate(previousVersion) {
    logger.info(`Extension updated from ${previousVersion} to ${chrome.runtime.getManifest().version}`);
  }

  async initializeDefaultSettings() {
    try {
      const existingSettings = await chrome.storage.local.get('qrSettings');
      
      if (!existingSettings.qrSettings) {
        const defaultSettings = {
          size: 200,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: 'H'
        };
        
        await chrome.storage.local.set({ qrSettings: defaultSettings });
        logger.info('Default settings initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize default settings:', error);
      errorHandler.handleError(error);
    }
  }

  showWelcomeNotification() {
    const options = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.svg'),
      title: '快识二维码',
      message: '感谢安装！点击图标开始使用',
      buttons: [
        {
          title: '开始使用',
          iconUrl: chrome.runtime.getURL('icons/icon48.svg')
        }
      ]
    };
    
    chrome.notifications.create('', options, (notificationId) => {
      if (chrome.runtime.lastError) {
        logger.error('Failed to create welcome notification:', chrome.runtime.lastError);
      } else {
        logger.info('Welcome notification created:', notificationId);
      }
    });
  }

  registerMessageHandler(action, handler) {
    this.messageHandlers.set(action, handler);
    logger.debug(`Registered message handler for: ${action}`);
  }

  registerCommandHandler(command, handler) {
    this.commandHandlers.set(command, handler);
    logger.debug(`Registered command handler for: ${command}`);
  }

  unregisterMessageHandler(action) {
    this.messageHandlers.delete(action);
    logger.debug(`Unregistered message handler for: ${action}`);
  }

  unregisterCommandHandler(command) {
    this.commandHandlers.delete(command);
    logger.debug(`Unregistered command handler for: ${command}`);
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new AppError(
          'No active tab found',
          ERROR_TYPES.RUNTIME_ERROR,
          1001
        );
      }
      
      logger.debug('Current tab retrieved:', tab);
      return tab;
    } catch (error) {
      logger.error('Failed to get current tab:', error);
      throw errorHandler.handleError(error);
    }
  }

  async sendMessageToTab(tabId, message) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      logger.debug(`Message sent to tab ${tabId}:`, message);
      return response;
    } catch (error) {
      logger.error('Failed to send message to tab:', error);
      throw errorHandler.handleError(new AppError(
        'Failed to send message to tab',
        ERROR_TYPES.RUNTIME_ERROR,
        1002,
        { tabId, message, error }
      ));
    }
  }

  async openOptionsPage() {
    try {
      await chrome.runtime.openOptionsPage();
      logger.info('Options page opened');
    } catch (error) {
      logger.error('Failed to open options page:', error);
      throw errorHandler.handleError(error);
    }
  }

  async getPerformanceStats() {
    try {
      const result = await chrome.storage.local.get('performanceStats');
      return result.performanceStats || {};
    } catch (error) {
      logger.error('Failed to get performance stats:', error);
      throw errorHandler.handleError(error);
    }
  }

  async clearPerformanceStats() {
    try {
      await chrome.storage.local.remove('performanceStats');
      logger.info('Performance stats cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear performance stats:', error);
      throw errorHandler.handleError(error);
    }
  }

  destroy() {
    this.messageHandlers.clear();
    this.commandHandlers.clear();
    logger.info('BackgroundService destroyed');
  }
}

const backgroundService = new BackgroundService();

backgroundService.registerMessageHandler(MESSAGE_TYPES.GET_CURRENT_TAB, async (request, sender) => {
  try {
    const tab = await backgroundService.getCurrentTab();
    return { 
      status: 'success', 
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title
      }
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
});

backgroundService.registerMessageHandler(MESSAGE_TYPES.GET_TAB_INFO, async (request, sender) => {
  try {
    const tab = await backgroundService.getCurrentTab();
    return { 
      status: 'success', 
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      }
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
});

backgroundService.registerCommandHandler('scan_qr', async () => {
  try {
    const tab = await backgroundService.getCurrentTab();
    await backgroundService.sendMessageToTab(tab.id, { 
      action: MESSAGE_TYPES.TOGGLE_SELECTION_MODE 
    });
    logger.info('Scan QR command executed');
  } catch (error) {
    logger.error('Failed to execute scan QR command:', error);
  }
});

backgroundService.registerCommandHandler('_execute_action', async () => {
  try {
    logger.info('Execute action command triggered');
  } catch (error) {
    logger.error('Failed to execute action command:', error);
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BackgroundService, backgroundService };
}
