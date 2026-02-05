let qrcode = null;
let currentQRContent = '';

document.addEventListener('DOMContentLoaded', () => {
  initQRCode();
  loadCurrentUrl();
  loadHistory();
  setupEventListeners();
});

function initQRCode() {
  const container = document.getElementById('qrcode');
  qrcode = new QRCode(container, {
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

function loadCurrentUrl() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      document.getElementById('currentUrl').value = tabs[0].url;
      generateQRCode(tabs[0].url);
    }
  });
}

function generateQRCode(content) {
  if (!content) return;
  
  currentQRContent = content;
  qrcode.makeCode(content);
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
