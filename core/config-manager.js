import { DEFAULT_SETTINGS, QR_CORRECT_LEVELS, MESSAGE_TYPES } from './constants.js';
import { logger } from './logger.js';
import { storageManager } from './storage-manager.js';
import { errorHandler, AppError, ERROR_TYPES } from './error-handler.js';

class ConfigManager {
  constructor() {
    this.currentSettings = null;
    this.listeners = new Map();
    this.init();
  }

  async init() {
    try {
      this.currentSettings = await storageManager.getSettings();
      this.validateSettings(this.currentSettings);
      this.applySettings(this.currentSettings);
      logger.info('ConfigManager initialized with settings:', this.currentSettings);
    } catch (error) {
      logger.error('Failed to initialize ConfigManager', error);
      this.currentSettings = { ...DEFAULT_SETTINGS };
    }
  }

  async loadSettings() {
    try {
      const settings = await storageManager.getSettings();
      this.currentSettings = this.mergeWithDefaults(settings);
      this.validateSettings(this.currentSettings);
      this.notifyListeners('settingsLoaded', this.currentSettings);
      return this.currentSettings;
    } catch (error) {
      logger.error('Failed to load settings', error);
      throw errorHandler.handleError(new AppError(
        'Failed to load settings',
        ERROR_TYPES.STORAGE_ERROR,
        4001,
        { error }
      ));
    }
  }

  async saveSettings(newSettings) {
    try {
      this.validateSettings(newSettings);
      const mergedSettings = { ...this.currentSettings, ...newSettings };
      
      await storageManager.saveSettings(mergedSettings);
      this.currentSettings = mergedSettings;
      this.applySettings(mergedSettings);
      this.notifyListeners('settingsSaved', mergedSettings);
      
      logger.info('Settings saved:', mergedSettings);
      return mergedSettings;
    } catch (error) {
      logger.error('Failed to save settings', error);
      throw errorHandler.handleError(new AppError(
        'Failed to save settings',
        ERROR_TYPES.STORAGE_ERROR,
        4002,
        { newSettings, error }
      ));
    }
  }

  async resetSettings() {
    try {
      const defaultSettings = { ...DEFAULT_SETTINGS };
      await storageManager.saveSettings(defaultSettings);
      this.currentSettings = defaultSettings;
      this.applySettings(defaultSettings);
      this.notifyListeners('settingsReset', defaultSettings);
      
      logger.info('Settings reset to defaults');
      return defaultSettings;
    } catch (error) {
      logger.error('Failed to reset settings', error);
      throw errorHandler.handleError(new AppError(
        'Failed to reset settings',
        ERROR_TYPES.STORAGE_ERROR,
        4003,
        { error }
      ));
    }
  }

  getSettings() {
    return { ...this.currentSettings };
  }

  getSetting(key) {
    return this.currentSettings[key];
  }

  async setSetting(key, value) {
    const newSettings = { [key]: value };
    return await this.saveSettings(newSettings);
  }

  mergeWithDefaults(settings) {
    return {
      ...DEFAULT_SETTINGS,
      ...settings
    };
  }

  validateSettings(settings) {
    const errors = [];
    
    if (!settings) {
      throw new AppError(
        'Settings object is null or undefined',
        ERROR_TYPES.VALIDATION_ERROR,
        4101,
        { settings }
      );
    }

    if (typeof settings.size !== 'number' || settings.size < 100 || settings.size > 1000) {
      errors.push('Size must be between 100 and 1000');
    }

    if (!this.isValidColor(settings.colorDark)) {
      errors.push('Invalid colorDark value');
    }

    if (!this.isValidColor(settings.colorLight)) {
      errors.push('Invalid colorLight value');
    }

    if (!Object.values(QR_CORRECT_LEVELS).includes(settings.correctLevel)) {
      errors.push('Invalid correctLevel value');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Settings validation failed',
        ERROR_TYPES.VALIDATION_ERROR,
        4102,
        { errors, settings }
      );
    }
  }

  isValidColor(color) {
    if (typeof color !== 'string') {
      return false;
    }
    
    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i;
    return colorRegex.test(color);
  }

  applySettings(settings) {
    try {
      if (typeof document !== 'undefined') {
        this.applyToDOM(settings);
      }
    } catch (error) {
      logger.warn('Failed to apply settings to DOM', error);
    }
  }

  applyToDOM(settings) {
    const root = document.documentElement;
    if (root) {
      root.style.setProperty('--qr-size', `${settings.size}px`);
      root.style.setProperty('--qr-color-dark', settings.colorDark);
      root.style.setProperty('--qr-color-light', settings.colorLight);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  exportSettings() {
    return JSON.stringify(this.currentSettings, null, 2);
  }

  async importSettings(settingsJson) {
    try {
      const settings = JSON.parse(settingsJson);
      this.validateSettings(settings);
      await this.saveSettings(settings);
      logger.info('Settings imported successfully');
      return settings;
    } catch (error) {
      logger.error('Failed to import settings', error);
      throw errorHandler.handleError(new AppError(
        'Failed to import settings',
        ERROR_TYPES.VALIDATION_ERROR,
        4201,
        { settingsJson, error }
      ));
    }
  }

  async downloadSettings() {
    try {
      const settingsJson = this.exportSettings();
      const blob = new Blob([settingsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'qr-settings.json';
      link.click();
      URL.revokeObjectURL(url);
      logger.info('Settings exported successfully');
    } catch (error) {
      logger.error('Failed to export settings', error);
      throw errorHandler.handleError(error);
    }
  }

  async uploadSettings(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const settings = await this.importSettings(event.target.result);
          resolve(settings);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => {
        errorHandler.handleError(new AppError(
          'Failed to read settings file',
          ERROR_TYPES.VALIDATION_ERROR,
          4202,
          { error }
        ));
        reject(error);
      };
      reader.readAsText(file);
    });
  }

  destroy() {
    this.listeners.clear();
    logger.info('ConfigManager destroyed');
  }
}

const configManager = new ConfigManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ConfigManager, configManager };
}
