import { STORAGE_KEYS, HISTORY_LIMIT, PERFORMANCE_METRICS, MESSAGE_TYPES } from './constants.js';
import { logger } from './logger.js';
import { errorHandler, AppError, ERROR_TYPES } from './error-handler.js';

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5000;
    this.pendingOperations = new Map();
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async get(key, defaultValue = null) {
    const startTime = performance.now();
    
    try {
      const cachedValue = this.cache.get(key);
      if (cachedValue !== undefined) {
        logger.debug(`Cache hit for key: ${key}`);
        return cachedValue;
      }

      const result = await this.getFromStorage(key);
      const value = result !== undefined ? result : defaultValue;
      
      this.cache.set(key, value);
      setTimeout(() => this.cache.delete(key), this.cacheTimeout);
      
      this.logPerformance(STORAGE_KEYS.STORAGE_READ_TIME, startTime);
      logger.debug(`Retrieved value for key: ${key}`);
      
      return value;
    } catch (error) {
      logger.error(`Failed to get value for key: ${key}`, error);
      throw errorHandler.handleError(new AppError(
        `Storage get failed for key: ${key}`,
        ERROR_TYPES.STORAGE_ERROR,
        2001,
        { key, error }
      ));
    }
  }

  async getFromStorage(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key]);
        }
      });
    });
  }

  async set(key, value) {
    const startTime = performance.now();
    
    try {
      await this.setWithRetry(key, value);
      
      this.cache.set(key, value);
      setTimeout(() => this.cache.delete(key), this.cacheTimeout);
      
      this.logPerformance(STORAGE_KEYS.STORAGE_WRITE_TIME, startTime);
      logger.debug(`Set value for key: ${key}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to set value for key: ${key}`, error);
      throw errorHandler.handleError(new AppError(
        `Storage set failed for key: ${key}`,
        ERROR_TYPES.STORAGE_ERROR,
        2002,
        { key, value, error }
      ));
    }
  }

  async setWithRetry(key, value, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const data = {};
      data[key] = value;
      
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          if (retryCount < this.maxRetries) {
            logger.warn(`Storage set retry ${retryCount + 1} for key: ${key}`);
            setTimeout(() => {
              this.setWithRetry(key, value, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, this.retryDelay * (retryCount + 1));
          } else {
            reject(chrome.runtime.lastError);
          }
        } else {
          resolve();
        }
      });
    });
  }

  async remove(key) {
    try {
      await this.removeFromStorage(key);
      this.cache.delete(key);
      logger.debug(`Removed value for key: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove value for key: ${key}`, error);
      throw errorHandler.handleError(new AppError(
        `Storage remove failed for key: ${key}`,
        ERROR_TYPES.STORAGE_ERROR,
        2003,
        { key, error }
      ));
    }
  }

  async removeFromStorage(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async clear() {
    try {
      await this.clearStorage();
      this.cache.clear();
      logger.info('Storage cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear storage', error);
      throw errorHandler.handleError(new AppError(
        'Storage clear failed',
        ERROR_TYPES.STORAGE_ERROR,
        2004,
        { error }
      ));
    }
  }

  async clearStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async getBytesInUse() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.getBytesInUse((bytesInUse) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(bytesInUse);
        }
      });
    });
  }

  async getHistory() {
    const history = await this.get(STORAGE_KEYS.QR_HISTORY, []);
    return Array.isArray(history) ? history : [];
  }

  async saveToHistory(content) {
    try {
      const history = await this.getHistory();
      const newEntry = {
        content,
        timestamp: Date.now(),
        id: this.generateId()
      };
      
      history.unshift(newEntry);
      
      if (history.length > HISTORY_LIMIT) {
        history.length = HISTORY_LIMIT;
      }
      
      await this.set(STORAGE_KEYS.QR_HISTORY, history);
      logger.info('Saved to history:', newEntry);
      
      return newEntry;
    } catch (error) {
      logger.error('Failed to save to history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to save to history',
        ERROR_TYPES.STORAGE_ERROR,
        2005,
        { content, error }
      ));
    }
  }

  async deleteFromHistory(index) {
    try {
      const history = await this.getHistory();
      
      if (index >= 0 && index < history.length) {
        const deletedItem = history.splice(index, 1)[0];
        await this.set(STORAGE_KEYS.QR_HISTORY, history);
        logger.info('Deleted from history:', deletedItem);
        return deletedItem;
      } else {
        throw new AppError(
          'Invalid history index',
          ERROR_TYPES.VALIDATION_ERROR,
          3001,
          { index, historyLength: history.length }
        );
      }
    } catch (error) {
      logger.error('Failed to delete from history', error);
      throw errorHandler.handleError(error);
    }
  }

  async clearHistory() {
    try {
      await this.set(STORAGE_KEYS.QR_HISTORY, []);
      logger.info('History cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to clear history',
        ERROR_TYPES.STORAGE_ERROR,
        2006,
        { error }
      ));
    }
  }

  async getSettings() {
    const settings = await this.get(STORAGE_KEYS.QR_SETTINGS, null);
    return settings || {};
  }

  async saveSettings(settings) {
    try {
      await this.set(STORAGE_KEYS.QR_SETTINGS, settings);
      logger.info('Settings saved:', settings);
      return true;
    } catch (error) {
      logger.error('Failed to save settings', error);
      throw errorHandler.handleError(new AppError(
        'Failed to save settings',
        ERROR_TYPES.STORAGE_ERROR,
        2007,
        { settings, error }
      ));
    }
  }

  async logPerformance(metric, startTime) {
    try {
      const duration = performance.now() - startTime;
      const stats = await this.get(STORAGE_KEYS.PERFORMANCE_STATS, {});
      
      if (!stats[metric]) {
        stats[metric] = {
          count: 0,
          total: 0,
          min: Infinity,
          max: 0,
          avg: 0
        };
      }
      
      const metricStats = stats[metric];
      metricStats.count++;
      metricStats.total += duration;
      metricStats.min = Math.min(metricStats.min, duration);
      metricStats.max = Math.max(metricStats.max, duration);
      metricStats.avg = metricStats.total / metricStats.count;
      
      await this.set(STORAGE_KEYS.PERFORMANCE_STATS, stats);
      logger.debug(`Performance logged: ${metric} = ${duration}ms`);
    } catch (error) {
      logger.error('Failed to log performance', error);
    }
  }

  async getPerformanceStats() {
    return await this.get(STORAGE_KEYS.PERFORMANCE_STATS, {});
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  clearCache() {
    this.cache.clear();
    logger.debug('Storage cache cleared');
  }

  getCacheSize() {
    return this.cache.size;
  }
}

const storageManager = new StorageManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageManager, storageManager };
}
