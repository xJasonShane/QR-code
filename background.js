chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanQR') {
    sendResponse({status: 'scanning'});
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'scan_qr') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'toggleSelectionMode'});
    });
  }
});
