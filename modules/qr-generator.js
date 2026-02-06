import { QR_CORRECT_LEVELS, PERFORMANCE_METRICS, MESSAGE_TYPES } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { storageManager } from '../core/storage-manager.js';
import { errorHandler, AppError, ERROR_TYPES } from '../core/error-handler.js';
import { configManager } from '../core/config-manager.js';

class QRGenerator {
  constructor() {
    this.qrcodeInstance = null;
    this.container = null;
    this.currentContent = '';
    this.isInitialized = false;
  }

  async initialize(containerId) {
    try {
      if (typeof QRCode === 'undefined') {
        throw new AppError(
          'QRCode library not loaded',
          ERROR_TYPES.RUNTIME_ERROR,
          5001,
          { containerId }
        );
      }

      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        throw new AppError(
          `Container element not found: ${containerId}`,
          ERROR_TYPES.VALIDATION_ERROR,
          5002,
          { containerId }
        );
      }

      const settings = await configManager.loadSettings();
      
      this.qrcodeInstance = new QRCode(this.container, {
        width: settings.size,
        height: settings.size,
        colorDark: settings.colorDark,
        colorLight: settings.colorLight,
        correctLevel: QRCode.CorrectLevel[settings.correctLevel]
      });

      this.isInitialized = true;
      logger.info('QRGenerator initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize QRGenerator', error);
      throw errorHandler.handleError(error);
    }
  }

  async generate(content, options = {}) {
    const startTime = performance.now();
    
    try {
      if (!this.isInitialized) {
        throw new AppError(
          'QRGenerator not initialized',
          ERROR_TYPES.RUNTIME_ERROR,
          5003
        );
      }

      if (!content || typeof content !== 'string') {
        throw new AppError(
          'Invalid content for QR code generation',
          ERROR_TYPES.VALIDATION_ERROR,
          5004,
          { content, type: typeof content }
        );
      }

      const settings = await configManager.loadSettings();
      const mergedOptions = {
        size: options.size || settings.size,
        colorDark: options.colorDark || settings.colorDark,
        colorLight: options.colorLight || settings.colorLight,
        correctLevel: options.correctLevel || settings.correctLevel
      };

      this.currentContent = content;
      
      this.qrcodeInstance.makeCode(content);
      
      await storageManager.logPerformance(
        PERFORMANCE_METRICS.QR_GENERATION_TIME,
        startTime
      );
      
      await storageManager.saveToHistory(content);
      
      logger.info('QR code generated successfully:', {
        content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        options: mergedOptions,
        duration: performance.now() - startTime
      });
      
      return {
        success: true,
        content,
        options: mergedOptions,
        duration: performance.now() - startTime
      };
    } catch (error) {
      logger.error('Failed to generate QR code', error);
      throw errorHandler.handleError(new AppError(
        'QR code generation failed',
        ERROR_TYPES.RUNTIME_ERROR,
        5005,
        { content, error }
      ));
    }
  }

  async updateSettings(newSettings) {
    try {
      if (!this.isInitialized) {
        logger.warn('QRGenerator not initialized, cannot update settings');
        return false;
      }

      await configManager.saveSettings(newSettings);
      
      this.qrcodeInstance.clear();
      
      const settings = await configManager.loadSettings();
      this.qrcodeInstance = new QRCode(this.container, {
        width: settings.size,
        height: settings.size,
        colorDark: settings.colorDark,
        colorLight: settings.colorLight,
        correctLevel: QRCode.CorrectLevel[settings.correctLevel]
      });

      if (this.currentContent) {
        this.qrcodeInstance.makeCode(this.currentContent);
      }

      logger.info('QRGenerator settings updated:', newSettings);
      return true;
    } catch (error) {
      logger.error('Failed to update QRGenerator settings', error);
      throw errorHandler.handleError(error);
    }
  }

  async clear() {
    try {
      if (!this.isInitialized) {
        logger.warn('QRGenerator not initialized, cannot clear');
        return false;
      }

      this.qrcodeInstance.clear();
      this.currentContent = '';
      
      logger.info('QRGenerator cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear QRGenerator', error);
      throw errorHandler.handleError(error);
    }
  }

  async getCanvas() {
    try {
      if (!this.isInitialized) {
        throw new AppError(
          'QRGenerator not initialized',
          ERROR_TYPES.RUNTIME_ERROR,
          5006
        );
      }

      const canvas = this.container.querySelector('canvas');
      
      if (!canvas) {
        throw new AppError(
          'Canvas element not found',
          ERROR_TYPES.RUNTIME_ERROR,
          5007
        );
      }

      return canvas;
    } catch (error) {
      logger.error('Failed to get canvas', error);
      throw errorHandler.handleError(error);
    }
  }

  async downloadImage(filename = null) {
    try {
      const canvas = await this.getCanvas();
      
      const link = document.createElement('a');
      link.download = filename || `qrcode_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      logger.info('QR code image downloaded:', link.download);
      return true;
    } catch (error) {
      logger.error('Failed to download QR code image', error);
      throw errorHandler.handleError(new AppError(
        'Failed to download QR code image',
        ERROR_TYPES.RUNTIME_ERROR,
        5008,
        { error }
      ));
    }
  }

  async copyImage() {
    try {
      const canvas = await this.getCanvas();
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      logger.info('QR code image copied to clipboard');
      return true;
    } catch (error) {
      logger.error('Failed to copy QR code image', error);
      throw errorHandler.handleError(new AppError(
        'Failed to copy QR code image',
        ERROR_TYPES.RUNTIME_ERROR,
        5009,
        { error }
      ));
    }
  }

  async copyText() {
    try {
      if (!this.currentContent) {
        throw new AppError(
          'No content to copy',
          ERROR_TYPES.VALIDATION_ERROR,
          5010
        );
      }

      await navigator.clipboard.writeText(this.currentContent);
      
      logger.info('QR code text copied to clipboard');
      return true;
    } catch (error) {
      logger.error('Failed to copy QR code text', error);
      throw errorHandler.handleError(new AppError(
        'Failed to copy QR code text',
        ERROR_TYPES.RUNTIME_ERROR,
        5011,
        { error }
      ));
    }
  }

  getCurrentContent() {
    return this.currentContent;
  }

  isReady() {
    return this.isInitialized;
  }

  destroy() {
    try {
      if (this.qrcodeInstance) {
        this.qrcodeInstance.clear();
      }
      
      this.container = null;
      this.qrcodeInstance = null;
      this.currentContent = '';
      this.isInitialized = false;
      
      logger.info('QRGenerator destroyed');
    } catch (error) {
      logger.error('Failed to destroy QRGenerator', error);
    }
  }
}

const qrGenerator = new QRGenerator();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QRGenerator, qrGenerator };
}
