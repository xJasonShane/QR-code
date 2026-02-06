import { LOG_LEVELS, APP_CONFIG } from './constants.js';

class Logger {
  constructor() {
    this.currentLevel = LOG_LEVELS.INFO;
    this.logHistory = [];
    this.maxHistorySize = 1000;
    this.isProduction = false;
    this.init();
  }

  init() {
    this.isProduction = this.detectEnvironment();
    this.currentLevel = this.getLogLevel();
    this.setupErrorHandlers();
    this.info(`${APP_CONFIG.NAME} v${APP_CONFIG.VERSION} Logger initialized`);
  }

  detectEnvironment() {
    try {
      return chrome.runtime.getManifest().name.includes('Production');
    } catch (error) {
      return false;
    }
  }

  getLogLevel() {
    try {
      const savedLevel = localStorage.getItem('logLevel');
      if (savedLevel !== null) {
        return parseInt(savedLevel, 10);
      }
    } catch (error) {
      this.warn('Failed to get log level from storage', error);
    }
    return LOG_LEVELS.INFO;
  }

  setLogLevel(level) {
    if (level >= LOG_LEVELS.DEBUG && level <= LOG_LEVELS.FATAL) {
      this.currentLevel = level;
      try {
        localStorage.setItem('logLevel', level.toString());
      } catch (error) {
        this.warn('Failed to save log level to storage', error);
      }
      this.info(`Log level changed to ${this.getLevelName(level)}`);
    }
  }

  getLevelName(level) {
    const names = {
      [LOG_LEVELS.DEBUG]: 'DEBUG',
      [LOG_LEVELS.INFO]: 'INFO',
      [LOG_LEVELS.WARN]: 'WARN',
      [LOG_LEVELS.ERROR]: 'ERROR',
      [LOG_LEVELS.FATAL]: 'FATAL'
    };
    return names[level] || 'UNKNOWN';
  }

  setupErrorHandlers() {
    window.addEventListener('error', (event) => {
      this.fatal('Global error caught', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.fatal('Unhandled promise rejection', {
        reason: event.reason
      });
    });
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelName = this.getLevelName(level);
    const prefix = `[${timestamp}] [${levelName}]`;
    
    let formattedMessage = `${prefix} ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        formattedMessage += ` ${JSON.stringify(data, null, 2)}`;
      } else {
        formattedMessage += ` ${data}`;
      }
    }
    
    return formattedMessage;
  }

  addToHistory(level, message, data) {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      data
    };
    
    this.logHistory.push(logEntry);
    
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  shouldLog(level) {
    return level >= this.currentLevel;
  }

  logToConsole(level, message, data) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    switch (level) {
      case LOG_LEVELS.DEBUG:
        console.debug(formattedMessage);
        break;
      case LOG_LEVELS.INFO:
        console.info(formattedMessage);
        break;
      case LOG_LEVELS.WARN:
        console.warn(formattedMessage);
        break;
      case LOG_LEVELS.ERROR:
      case LOG_LEVELS.FATAL:
        console.error(formattedMessage);
        break;
    }
  }

  debug(message, data) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      this.addToHistory(LOG_LEVELS.DEBUG, message, data);
      this.logToConsole(LOG_LEVELS.DEBUG, message, data);
    }
  }

  info(message, data) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      this.addToHistory(LOG_LEVELS.INFO, message, data);
      this.logToConsole(LOG_LEVELS.INFO, message, data);
    }
  }

  warn(message, data) {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      this.addToHistory(LOG_LEVELS.WARN, message, data);
      this.logToConsole(LOG_LEVELS.WARN, message, data);
    }
  }

  error(message, data) {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      this.addToHistory(LOG_LEVELS.ERROR, message, data);
      this.logToConsole(LOG_LEVELS.ERROR, message, data);
    }
  }

  fatal(message, data) {
    if (this.shouldLog(LOG_LEVELS.FATAL)) {
      this.addToHistory(LOG_LEVELS.FATAL, message, data);
      this.logToConsole(LOG_LEVELS.FATAL, message, data);
    }
  }

  getHistory() {
    return [...this.logHistory];
  }

  clearHistory() {
    this.logHistory = [];
    this.info('Log history cleared');
  }

  exportLogs() {
    const logs = this.getHistory();
    const exportData = {
      app: APP_CONFIG.NAME,
      version: APP_CONFIG.VERSION,
      exportTime: new Date().toISOString(),
      logs
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  downloadLogs() {
    try {
      const logsJson = this.exportLogs();
      const blob = new Blob([logsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${APP_CONFIG.NAME}_logs_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.info('Logs exported successfully');
    } catch (error) {
      this.error('Failed to export logs', error);
    }
  }
}

const logger = new Logger();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger, logger };
}
