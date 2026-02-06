import { PERFORMANCE_METRICS, MESSAGE_TYPES } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { storageManager } from '../core/storage-manager.js';
import { errorHandler, AppError, ERROR_TYPES } from '../core/error-handler.js';

class QRRecognizer {
  constructor() {
    this.isSelectionMode = false;
    this.selectionBox = null;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.html2canvasLoaded = false;
    this.recognitionHistory = [];
    this.maxHistorySize = 50;
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.loadHtml2Canvas();
    logger.info('QRRecognizer initialized');
  }

  async loadHtml2Canvas() {
    if (this.html2canvasLoaded) {
      return;
    }

    try {
      if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/html2canvas.min.js');
        script.onload = () => {
          this.html2canvasLoaded = true;
          logger.info('html2canvas loaded successfully');
        };
        script.onerror = (error) => {
          logger.error('Failed to load html2canvas', error);
          throw errorHandler.handleError(new AppError(
            'html2canvas library failed to load',
            ERROR_TYPES.NETWORK_ERROR,
            6001,
            { error }
          ));
        };
        document.head.appendChild(script);
      } else {
        this.html2canvasLoaded = true;
        logger.info('html2canvas already available');
      }
    } catch (error) {
      logger.error('Failed to load html2canvas', error);
      throw errorHandler.handleError(error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === MESSAGE_TYPES.TOGGLE_SELECTION_MODE) {
        this.toggleSelectionMode();
        sendResponse({ status: 'ok', isSelectionMode: this.isSelectionMode });
      } else if (request.action === MESSAGE_TYPES.START_SELECTION) {
        this.startSelection(request.x, request.y);
        sendResponse({ status: 'ok' });
      } else if (request.action === MESSAGE_TYPES.END_SELECTION) {
        this.endSelection();
        sendResponse({ status: 'ok' });
      } else if (request.action === MESSAGE_TYPES.RECOGNIZE_QR) {
        this.recognizeFromRect(request.rect).then(result => {
          sendResponse(result);
        }).catch(error => {
          sendResponse({ status: 'error', error: error.message });
        });
      }
    });
  }

  toggleSelectionMode() {
    this.isSelectionMode = !this.isSelectionMode;
    
    if (this.isSelectionMode) {
      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousedown', this.handleMouseDown.bind(this));
      document.addEventListener('mousemove', this.handleMouseMove.bind(this));
      document.addEventListener('mouseup', this.handleMouseUp.bind(this));
      this.showNotification('框选模式已开启，请框选二维码', 'info');
      logger.info('Selection mode enabled');
    } else {
      document.body.style.cursor = 'default';
      document.removeEventListener('mousedown', this.handleMouseDown.bind(this));
      document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
      document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
      this.removeSelectionBox();
      this.showNotification('框选模式已关闭', 'info');
      logger.info('Selection mode disabled');
    }
  }

  handleMouseDown(event) {
    if (!this.isSelectionMode) return;
    
    this.startX = event.clientX;
    this.startY = event.clientY;
    
    this.createSelectionBox();
    this.updateSelectionBox(this.startX, this.startY, this.startX, this.startY);
    
    logger.debug('Selection started at:', { x: this.startX, y: this.startY });
  }

  handleMouseMove(event) {
    if (!this.isSelectionMode || !this.selectionBox) return;
    
    this.currentX = event.clientX;
    this.currentY = event.clientY;
    
    const left = Math.min(this.startX, this.currentX);
    const top = Math.min(this.startY, this.currentY);
    const width = Math.abs(this.currentX - this.startX);
    const height = Math.abs(this.currentY - this.startY);
    
    this.updateSelectionBox(left, top, width, height);
  }

  handleMouseUp(event) {
    if (!this.isSelectionMode || !this.selectionBox) return;
    
    const rect = this.selectionBox.getBoundingClientRect();
    this.recognizeFromRect(rect);
    
    this.removeSelectionBox();
    this.isSelectionMode = false;
    document.body.style.cursor = 'default';
    document.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    
    logger.debug('Selection ended at:', rect);
  }

  createSelectionBox() {
    if (this.selectionBox) {
      this.selectionBox.remove();
    }
    
    this.selectionBox = document.createElement('div');
    this.selectionBox.style.cssText = `
      position: fixed;
      border: 2px solid #00ff00;
      background: rgba(0, 255, 0, 0.1);
      pointer-events: none;
      z-index: 999999;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
    `;
    document.body.appendChild(this.selectionBox);
  }

  updateSelectionBox(left, top, width, height) {
    if (!this.selectionBox) return;
    
    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }

  removeSelectionBox() {
    if (this.selectionBox) {
      this.selectionBox.remove();
      this.selectionBox = null;
    }
  }

  async recognizeFromRect(rect) {
    const startTime = performance.now();
    
    try {
      if (!this.html2canvasLoaded) {
        await this.loadHtml2Canvas();
      }

      if (typeof html2canvas === 'undefined') {
        throw new AppError(
          'html2canvas library not available',
          ERROR_TYPES.RUNTIME_ERROR,
          7001
        );
      }

      if (typeof jsQR === 'undefined') {
        throw new AppError(
          'jsQR library not available',
          ERROR_TYPES.RUNTIME_ERROR,
          7002
        );
      }

      const canvas = this.createCaptureCanvas(rect);
      const capturedCanvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false
      });

      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        capturedCanvas,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height
      );

      const imageData = ctx.getImageData(0, 0, rect.width, rect.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      await storageManager.logPerformance(
        PERFORMANCE_METRICS.QR_RECOGNITION_TIME,
        startTime
      );

      if (code) {
        const result = {
          success: true,
          data: code.data,
          location: {
            x: code.location?.topLeftCorner?.x || 0,
            y: code.location?.topLeftCorner?.y || 0
          },
          duration: performance.now() - startTime
        };

        this.addToRecognitionHistory(result);
        await storageManager.saveToHistory(code.data);
        
        this.showNotification(`识别成功: ${code.data.substring(0, 50)}${code.data.length > 50 ? '...' : ''}`, 'success');
        logger.info('QR code recognized successfully:', result);
        
        return result;
      } else {
        const result = {
          success: false,
          data: null,
          duration: performance.now() - startTime
        };

        this.showNotification('未识别到二维码', 'warning');
        logger.warn('QR code not recognized');
        
        return result;
      }
    } catch (error) {
      logger.error('Failed to recognize QR code', error);
      
      const result = {
        success: false,
        data: null,
        error: error.message,
        duration: performance.now() - startTime
      };

      this.showNotification('识别失败: ' + error.message, 'error');
      
      throw errorHandler.handleError(new AppError(
        'QR code recognition failed',
        ERROR_TYPES.RUNTIME_ERROR,
        7003,
        { error, rect }
      ));
    }
  }

  createCaptureCanvas(rect) {
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    return canvas;
  }

  addToRecognitionHistory(result) {
    const historyEntry = {
      ...result,
      timestamp: Date.now(),
      pageUrl: window.location.href
    };
    
    this.recognitionHistory.unshift(historyEntry);
    
    if (this.recognitionHistory.length > this.maxHistorySize) {
      this.recognitionHistory.pop();
    }
  }

  getRecognitionHistory() {
    return [...this.recognitionHistory];
  }

  clearRecognitionHistory() {
    this.recognitionHistory = [];
    logger.info('Recognition history cleared');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    
    const styles = {
      success: 'background: #4CAF50; color: white;',
      error: 'background: #f44336; color: white;',
      warning: 'background: #ff9800; color: white;',
      info: 'background: #2196F3; color: white;'
    };
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 9999999;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      ${styles[type]}
      max-width: 400px;
      word-wrap: break-word;
      animation: slideIn 0.3s ease-out;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    const duration = type === 'error' ? 5000 : 3000;
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, duration);
    
    logger.debug(`Notification shown: ${message}`);
  }

  destroy() {
    this.isSelectionMode = false;
    this.removeSelectionBox();
    document.body.style.cursor = 'default';
    document.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.recognitionHistory = [];
    logger.info('QRRecognizer destroyed');
  }
}

const qrRecognizer = new QRRecognizer();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QRRecognizer, qrRecognizer };
}
