document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
  setupEventListeners();
});

function loadSettings() {
  chrome.storage.local.get(['qrSettings'], (result) => {
    const settings = result.qrSettings || {
      size: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: 'H'
    };
    
    document.getElementById('qrSize').value = settings.size;
    document.getElementById('qrColorDark').value = settings.colorDark;
    document.getElementById('qrColorLight').value = settings.colorLight;
    document.getElementById('qrCorrectLevel').value = settings.correctLevel;
  });
}

function saveSettings() {
  const settings = {
    size: parseInt(document.getElementById('qrSize').value),
    colorDark: document.getElementById('qrColorDark').value,
    colorLight: document.getElementById('qrColorLight').value,
    correctLevel: document.getElementById('qrCorrectLevel').value
  };
  
  chrome.storage.local.set({qrSettings: settings}, () => {
    alert('设置已保存');
  });
}

function loadHistory() {
  chrome.storage.local.get(['qrHistory'], (result) => {
    const history = result.qrHistory || [];
    const historyList = document.getElementById('historyList');
    
    if (history.length === 0) {
      historyList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无历史记录</div>';
      return;
    }
    
    historyList.innerHTML = history.map((item, index) => `
      <div class="history-item">
        <div class="content">${escapeHtml(item.content)}</div>
        <div class="time">${formatTime(item.timestamp)}</div>
        <div class="actions">
          <button class="btn-primary" onclick="copyContent('${escapeForJs(item.content)}')">复制</button>
          <button class="btn-danger" onclick="deleteItem(${index})">删除</button>
        </div>
      </div>
    `).join('');
  });
}

function copyContent(content) {
  navigator.clipboard.writeText(content).then(() => {
    alert('已复制到剪贴板');
  });
}

function deleteItem(index) {
  chrome.storage.local.get(['qrHistory'], (result) => {
    const history = result.qrHistory || [];
    history.splice(index, 1);
    chrome.storage.local.set({qrHistory: history}, () => {
      loadHistory();
    });
  });
}

function clearHistory() {
  if (confirm('确定要清空所有历史记录吗？')) {
    chrome.storage.local.set({qrHistory: []}, () => {
      loadHistory();
    });
  }
}

function setupEventListeners() {
  document.getElementById('saveStyleBtn').addEventListener('click', saveSettings);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeForJs(text) {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}
