let isSelectionMode = false;
let selectionBox = null;
let startX, startY;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleSelectionMode') {
    toggleSelectionMode();
    sendResponse({status: 'ok'});
  }
});

function toggleSelectionMode() {
  isSelectionMode = !isSelectionMode;
  
  if (isSelectionMode) {
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
    showNotification('框选模式已开启，请框选二维码');
  } else {
    document.body.style.cursor = 'default';
    document.removeEventListener('mousedown', startSelection);
    document.removeEventListener('mousemove', updateSelection);
    document.removeEventListener('mouseup', endSelection);
    if (selectionBox) {
      selectionBox.remove();
      selectionBox = null;
    }
  }
}

function startSelection(e) {
  if (!isSelectionMode) return;
  startX = e.clientX;
  startY = e.clientY;
  
  if (!selectionBox) {
    selectionBox = document.createElement('div');
    selectionBox.style.cssText = 'position:fixed;border:2px solid #00ff00;background:rgba(0,255,0,0.1);pointer-events:none;z-index:999999;';
    document.body.appendChild(selectionBox);
  }
  
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
}

function updateSelection(e) {
  if (!isSelectionMode || !selectionBox) return;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function endSelection(e) {
  if (!isSelectionMode || !selectionBox) return;
  
  const rect = selectionBox.getBoundingClientRect();
  captureAndRecognize(rect);
  
  selectionBox.remove();
  selectionBox = null;
}

function captureAndRecognize(rect) {
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  
  html2canvas(document.body).then(capturedCanvas => {
    ctx.drawImage(capturedCanvas, rect.left, rect.top, rect.width, rect.height, 0, 0, rect.width, rect.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      showNotification('识别成功: ' + code.data);
      saveToHistory(code.data);
    } else {
      showNotification('未识别到二维码');
    }
  });
}

function saveToHistory(content) {
  chrome.storage.local.get(['qrHistory'], (result) => {
    const history = result.qrHistory || [];
    history.unshift({
      content: content,
      timestamp: Date.now()
    });
    chrome.storage.local.set({qrHistory: history.slice(0, 100)});
  });
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#333;color:#fff;padding:15px 20px;border-radius:8px;z-index:9999999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}
