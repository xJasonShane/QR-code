let qrcode = null;
let currentQRContent = '';

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded');
  if (typeof QRCode === 'undefined') {
    console.error('QRCode library not loaded');
    return;
  }
  console.log('QRCode library is available');
  initQRCode();
  
  setTimeout(() => {
    loadCurrentUrl();
    loadHistory();
    setupEventListeners();
  }, 100);
});

function initQRCode() {
  const container = document.getElementById('qrcode');
  if (!container) {
    console.error('QRCode container not found');
    return;
  }
  try {
    qrcode = new QRCode(container, {
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    console.log('QRCode initialized successfully');
  } catch (error) {
    console.error('Failed to initialize QRCode:', error);
  }
}

function loadCurrentUrl() {
  try {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError);
        return;
      }
      if (tabs && tabs.length > 0 && tabs[0]) {
        const url = tabs[0].url;
        console.log('Current tab URL:', url);
        const urlInput = document.getElementById('currentUrl');
        if (urlInput) {
          urlInput.value = url;
          generateQRCode(url);
        } else {
          console.error('URL input element not found');
        }
      } else {
        console.error('No active tab found, tabs:', tabs);
      }
    });
  } catch (error) {
    console.error('Error in loadCurrentUrl:', error);
  }
  
  try {
    chrome.tabs.getCurrent((tab) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting current tab:', chrome.runtime.lastError);
        return;
      }
      if (tab && tab.url) {
        console.log('Current tab (getCurrent) URL:', tab.url);
        const urlInput = document.getElementById('currentUrl');
        if (urlInput && !urlInput.value) {
          urlInput.value = tab.url;
          generateQRCode(tab.url);
        }
      }
    });
  } catch (error) {
    console.error('Error in getCurrent:', error);
  }
}

function generateQRCode(content) {
  if (!content) {
    console.warn('No content provided for QR code');
    return;
  }
  if (!qrcode) {
    console.error('QRCode not initialized');
    return;
  }
  try {
    currentQRContent = content;
    qrcode.makeCode(content);
    console.log('QR code generated for:', content);
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

function saveQRCode() {
  const container = document.getElementById('qrcode');
  const canvas = container.querySelector('canvas');
  
  if (canvas) {
    const link = document.createElement('a');
    link.download = 'qrcode_' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    saveToHistory(currentQRContent);
  }
}

function saveToHistory(content) {
  chrome.storage.local.get(['qrHistory'], (result) => {
    const history = result.qrHistory || [];
    history.unshift({
      content: content,
      timestamp: Date.now()
    });
    chrome.storage.local.set({qrHistory: history.slice(0, 100)}, () => {
      loadHistory();
    });
  });
}

function loadHistory() {
  chrome.storage.local.get(['qrHistory'], (result) => {
    const history = result.qrHistory || [];
    const historyList = document.getElementById('historyList');
    
    historyList.innerHTML = history.map(item => `
      <div class="history-item">
        <div class="content">${escapeHtml(item.content)}</div>
        <div class="time">${formatTime(item.timestamp)}</div>
      </div>
    `).join('');
  });
}

function setupEventListeners() {
  document.getElementById('generateBtn').addEventListener('click', () => {
    const customText = document.getElementById('customText').value.trim();
    if (customText) {
      generateQRCode(customText);
    } else {
      const currentUrl = document.getElementById('currentUrl').value;
      generateQRCode(currentUrl);
    }
  });
  
  document.getElementById('saveBtn').addEventListener('click', saveQRCode);
  
  document.getElementById('scanBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'toggleSelectionMode'});
      window.close();
    });
  });
  
  document.getElementById('optionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('customText').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('generateBtn').click();
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}
