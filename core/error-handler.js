import { ERROR_TYPES, MESSAGE_TYPES } from './constants.js';
import { logger } from './logger.js';

class AppError extends Error {
  constructor(message, type, code, details) {
    super(message);
    this.name = 'AppError';
    this.type = type || ERROR_TYPES.UNKNOWN_ERROR;
    this.code = code || 0;
    this.details = details || null;
    this.timestamp = Date.now();
    this.stack = new Error().stack;
  }

  toJSON() {
    return {
      message: this.message,
      type: this.type,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

class ErrorHandler {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 50;
    this.errorCallbacks = [];
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    window.addEventListener('error', (event) => {
      this.handleError(new AppError(
        event.message,
        ERROR_TYPES.RUNTIME_ERROR,
        1001,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        }
      ));
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new AppError(
        'Unhandled promise rejection',
        ERROR_TYPES.RUNTIME_ERROR,
        1002,
        {
          reason: event.reason
        }
      ));
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === MESSAGE_TYPES.LOG_ERROR) {
        this.handleError(new AppError(
          message.error.message,
          message.error.type,
          message.error.code,
          message.error.details
        ));
      }
    });
  }

  handleError(error) {
    if (!error) {
      return;
    }

    const appError = error instanceof AppError 
      ? error 
      : new AppError(
          error.message || 'Unknown error',
          ERROR_TYPES.UNKNOWN_ERROR,
          0,
          { originalError: error }
        );

    this.addToHistory(appError);
    this.logError(appError);
    this.notifyCallbacks(appError);
    this.tryRecovery(appError);

    return appError;
  }

  addToHistory(error) {
    this.errorHistory.push(error);
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  logError(error) {
    const logData = {
      type: error.type,
      code: error.code,
      timestamp: new Date(error.timestamp).toISOString(),
      details: error.details
    };

    switch (error.type) {
      case ERROR_TYPES.NETWORK_ERROR:
        logger.error('Network Error:', logData);
        break;
      case ERROR_TYPES.STORAGE_ERROR:
        logger.error('Storage Error:', logData);
        break;
      case ERROR_TYPES.PERMISSION_ERROR:
        logger.error('Permission Error:', logData);
        break;
      case ERROR_TYPES.VALIDATION_ERROR:
        logger.warn('Validation Error:', logData);
        break;
      case ERROR_TYPES.RUNTIME_ERROR:
        logger.error('Runtime Error:', logData);
        break;
      default:
        logger.error('Unknown Error:', logData);
    }
  }

  notifyCallbacks(error) {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        logger.error('Error in error callback:', callbackError);
      }
    });
  }

  onError(callback) {
    if (typeof callback === 'function') {
      this.errorCallbacks.push(callback);
    }
  }

  offError(callback) {
    const index = this.errorCallbacks.indexOf(callback);
    if (index > -1) {
      this.errorCallbacks.splice(index, 1);
    }
  }

  tryRecovery(error) {
    switch (error.type) {
      case ERROR_TYPES.STORAGE_ERROR:
        this.tryStorageRecovery(error);
        break;
      case ERROR_TYPES.PERMISSION_ERROR:
        this.tryPermissionRecovery(error);
        break;
      case ERROR_TYPES.NETWORK_ERROR:
        this.tryNetworkRecovery(error);
        break;
    }
  }

  tryStorageRecovery(error) {
    logger.info('Attempting storage recovery');
    try {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          logger.error('Storage recovery failed:', chrome.runtime.lastError);
        } else {
          logger.info('Storage recovery successful');
        }
      });
    } catch (recoveryError) {
      logger.error('Storage recovery error:', recoveryError);
    }
  }

  tryPermissionRecovery(error) {
    logger.info('Checking permissions');
    chrome.permissions.contains({
      permissions: ['activeTab', 'storage', 'tabs']
    }, (result) => {
      if (!result) {
        logger.warn('Missing required permissions');
      }
    });
  }

  tryNetworkRecovery(error) {
    logger.info('Network error detected, waiting before retry');
    setTimeout(() => {
      logger.info('Network recovery timeout completed');
    }, 5000);
  }

  createError(type, message, code, details) {
    return new AppError(message, type, code, details);
  }

  wrapAsync(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error);
        throw error;
      }
    };
  }

  wrapSync(fn) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(error);
        throw error;
      }
    };
  }

  getErrorHistory() {
    return [...this.errorHistory];
  }

  clearErrorHistory() {
    this.errorHistory = [];
    logger.info('Error history cleared');
  }

  exportErrors() {
    const errors = this.getErrorHistory();
    const exportData = {
      exportTime: new Date().toISOString(),
      totalErrors: errors.length,
      errors: errors.map(error => error.toJSON())
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  downloadErrorReport() {
    try {
      const errorsJson = this.exportErrors();
      const blob = new Blob([errorsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `error_report_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      logger.info('Error report exported successfully');
    } catch (error) {
      logger.error('Failed to export error report:', error);
    }
  }
}

const errorHandler = new ErrorHandler();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AppError, ErrorHandler, errorHandler };
}
