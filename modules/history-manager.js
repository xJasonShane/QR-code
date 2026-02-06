import { MESSAGE_TYPES } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { storageManager } from '../core/storage-manager.js';
import { errorHandler, AppError, ERROR_TYPES } from '../core/error-handler.js';

class HistoryManager {
  constructor() {
    this.listeners = new Map();
    this.searchQuery = '';
    this.filterType = 'all';
    this.sortBy = 'timestamp';
    this.sortOrder = 'desc';
  }

  async getAll() {
    try {
      const history = await storageManager.getHistory();
      const filteredAndSorted = this.filterAndSort(history);
      
      logger.debug(`Retrieved ${filteredAndSorted.length} history items`);
      return filteredAndSorted;
    } catch (error) {
      logger.error('Failed to get history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to get history',
        ERROR_TYPES.STORAGE_ERROR,
        8001,
        { error }
      ));
    }
  }

  async add(content, metadata = {}) {
    try {
      if (!content || typeof content !== 'string') {
        throw new AppError(
          'Invalid content for history item',
          ERROR_TYPES.VALIDATION_ERROR,
          8101,
          { content, type: typeof content }
        );
      }

      const newItem = {
        content,
        timestamp: Date.now(),
        id: this.generateId(),
        type: this.detectContentType(content),
        ...metadata
      };

      const history = await storageManager.getHistory();
      history.unshift(newItem);
      
      if (history.length > 100) {
        history.length = 100;
      }

      await storageManager.set('qrHistory', history);
      
      this.notifyListeners('historyAdded', newItem);
      logger.info('Added to history:', newItem);
      
      return newItem;
    } catch (error) {
      logger.error('Failed to add to history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to add to history',
        ERROR_TYPES.STORAGE_ERROR,
        8102,
        { content, error }
      ));
    }
  }

  async delete(id) {
    try {
      const history = await storageManager.getHistory();
      const index = history.findIndex(item => item.id === id);
      
      if (index === -1) {
        throw new AppError(
          'History item not found',
          ERROR_TYPES.VALIDATION_ERROR,
          8201,
          { id }
        );
      }

      const deletedItem = history.splice(index, 1)[0];
      await storageManager.set('qrHistory', history);
      
      this.notifyListeners('historyDeleted', { id, item: deletedItem });
      logger.info('Deleted from history:', deletedItem);
      
      return deletedItem;
    } catch (error) {
      logger.error('Failed to delete from history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to delete from history',
        ERROR_TYPES.STORAGE_ERROR,
        8202,
        { id, error }
      ));
    }
  }

  async deleteByIndex(index) {
    try {
      const history = await storageManager.getHistory();
      
      if (index < 0 || index >= history.length) {
        throw new AppError(
          'Invalid history index',
          ERROR_TYPES.VALIDATION_ERROR,
          8203,
          { index, historyLength: history.length }
        );
      }

      const deletedItem = history.splice(index, 1)[0];
      await storageManager.set('qrHistory', history);
      
      this.notifyListeners('historyDeleted', { index, item: deletedItem });
      logger.info('Deleted from history by index:', deletedItem);
      
      return deletedItem;
    } catch (error) {
      logger.error('Failed to delete from history by index', error);
      throw errorHandler.handleError(new AppError(
        'Failed to delete from history by index',
        ERROR_TYPES.STORAGE_ERROR,
        8204,
        { index, error }
      ));
    }
  }

  async clear() {
    try {
      await storageManager.clearHistory();
      
      this.notifyListeners('historyCleared', {});
      logger.info('History cleared');
      
      return true;
    } catch (error) {
      logger.error('Failed to clear history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to clear history',
        ERROR_TYPES.STORAGE_ERROR,
        8301,
        { error }
      ));
    }
  }

  async search(query) {
    try {
      this.searchQuery = query.toLowerCase();
      const history = await this.getAll();
      
      const results = history.filter(item => 
        item.content.toLowerCase().includes(this.searchQuery) ||
        (item.type && item.type.toLowerCase().includes(this.searchQuery))
      );
      
      logger.debug(`Search returned ${results.length} results for query: ${query}`);
      return results;
    } catch (error) {
      logger.error('Failed to search history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to search history',
        ERROR_TYPES.RUNTIME_ERROR,
        8401,
        { query, error }
      ));
    }
  }

  async export(format = 'json') {
    try {
      const history = await this.getAll();
      
      if (format === 'json') {
        return this.exportAsJson(history);
      } else if (format === 'csv') {
        return this.exportAsCsv(history);
      } else if (format === 'txt') {
        return this.exportAsTxt(history);
      } else {
        throw new AppError(
          'Unsupported export format',
          ERROR_TYPES.VALIDATION_ERROR,
          8501,
          { format }
        );
      }
    } catch (error) {
      logger.error('Failed to export history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to export history',
        ERROR_TYPES.RUNTIME_ERROR,
        8502,
        { format, error }
      ));
    }
  }

  async import(data, format = 'json') {
    try {
      let items = [];
      
      if (format === 'json') {
        items = this.importFromJson(data);
      } else if (format === 'csv') {
        items = this.importFromCsv(data);
      } else if (format === 'txt') {
        items = this.importFromTxt(data);
      } else {
        throw new AppError(
          'Unsupported import format',
          ERROR_TYPES.VALIDATION_ERROR,
          8601,
          { format }
        );
      }

      const history = await storageManager.getHistory();
      history.unshift(...items);
      
      if (history.length > 100) {
        history.length = 100;
      }

      await storageManager.set('qrHistory', history);
      
      this.notifyListeners('historyImported', { count: items.length });
      logger.info(`Imported ${items.length} items to history`);
      
      return items;
    } catch (error) {
      logger.error('Failed to import history', error);
      throw errorHandler.handleError(new AppError(
        'Failed to import history',
        ERROR_TYPES.RUNTIME_ERROR,
        8602,
        { format, error }
      ));
    }
  }

  setFilter(type) {
    this.filterType = type;
    logger.debug(`Filter type set to: ${type}`);
  }

  setSort(by, order = 'desc') {
    this.sortBy = by;
    this.sortOrder = order;
    logger.debug(`Sort set to: ${by} ${order}`);
  }

  filterAndSort(history) {
    let filtered = history;
    
    if (this.filterType !== 'all') {
      filtered = filtered.filter(item => item.type === this.filterType);
    }
    
    if (this.searchQuery) {
      filtered = filtered.filter(item => 
        item.content.toLowerCase().includes(this.searchQuery)
      );
    }
    
    if (this.sortBy === 'timestamp') {
      filtered.sort((a, b) => {
        const comparison = a.timestamp - b.timestamp;
        return this.sortOrder === 'desc' ? -comparison : comparison;
      });
    } else if (this.sortBy === 'content') {
      filtered.sort((a, b) => {
        const comparison = a.content.localeCompare(b.content);
        return this.sortOrder === 'desc' ? -comparison : comparison;
      });
    }
    
    return filtered;
  }

  detectContentType(content) {
    if (this.isUrl(content)) {
      return 'url';
    } else if (this.isEmail(content)) {
      return 'email';
    } else if (this.isPhoneNumber(content)) {
      return 'phone';
    } else {
      return 'text';
    }
  }

  isUrl(content) {
    try {
      new URL(content);
      return true;
    } catch {
      return false;
    }
  }

  isEmail(content) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(content);
  }

  isPhoneNumber(content) {
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(content);
  }

  exportAsJson(history) {
    const exportData = {
      exportTime: new Date().toISOString(),
      totalItems: history.length,
      items: history
    };
    return JSON.stringify(exportData, null, 2);
  }

  exportAsCsv(history) {
    const headers = 'id,content,timestamp,type\n';
    const rows = history.map(item => 
      `${item.id},"${item.content.replace(/"/g, '""')}",${item.timestamp},${item.type}`
    );
    return headers + rows.join('\n');
  }

  exportAsTxt(history) {
    return history.map(item => 
      `[${new Date(item.timestamp).toLocaleString('zh-CN')}] ${item.content}`
    ).join('\n');
  }

  importFromJson(data) {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed.items) ? parsed.items : [];
  }

  importFromCsv(data) {
    const lines = data.split('\n');
    const items = [];
    
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns.length >= 2) {
        items.push({
          content: columns[1].replace(/""/g, '"'),
          timestamp: parseInt(columns[2]) || Date.now(),
          type: columns[3] || 'text',
          id: columns[0] || this.generateId()
        });
      }
    }
    
    return items;
  }

  importFromTxt(data) {
    const lines = data.split('\n');
    const items = [];
    
    lines.forEach(line => {
      const match = line.match(/\[([^\]]+)\]\s*(.+)/);
      if (match) {
        items.push({
          content: match[2],
          timestamp: new Date(match[1]).getTime(),
          type: 'text',
          id: this.generateId()
        });
      }
    });
    
    return items;
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

  async getStatistics() {
    try {
      const history = await this.getAll();
      
      const stats = {
        total: history.length,
        byType: {},
        byDate: {},
        recent: history.slice(0, 10)
      };
      
      history.forEach(item => {
        if (!stats.byType[item.type]) {
          stats.byType[item.type] = 0;
        }
        stats.byType[item.type]++;
        
        const date = new Date(item.timestamp).toLocaleDateString('zh-CN');
        if (!stats.byDate[date]) {
          stats.byDate[date] = 0;
        }
        stats.byDate[date]++;
      });
      
      logger.debug('History statistics calculated:', stats);
      return stats;
    } catch (error) {
      logger.error('Failed to get history statistics', error);
      throw errorHandler.handleError(error);
    }
  }

  destroy() {
    this.listeners.clear();
    logger.info('HistoryManager destroyed');
  }
}

const historyManager = new HistoryManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HistoryManager, historyManager };
}
