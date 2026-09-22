const connectionEl = document.getElementById('connection');
const statusEl = document.getElementById('status');

const socket = io();

// Web サーバー接続時
socket.on('connect', () => {
  connectionEl.textContent = 'connected';
  connectionEl.style.background = '#dcfce7';
  connectionEl.style.color = '#166534';
});

// Web サーバーとの接続解除を Web ブラウザが検知したとき
socket.on('disconnect', () => {
  connectionEl.textContent = 'disconnected';
  connectionEl.style.background = '#fee2e2';
  connectionEl.style.color = '#b91c1c';
});

// status イベント受信時
socket.on('status', (payload) => {
  statusEl.textContent = JSON.stringify(payload.samples, null, 2);
});

// device-status イベント受信時
socket.on('device-status', (status) => {
  // Connector とは通信できているが外部デバイスのデータ未取得の場合
  if (status.type === 'no-data') {
    statusEl.textContent = status.message;
  }
});

// device-data-oversized イベント受信時（直近データがサイズ超過で破棄された）
socket.on('device-data-oversized', (warning) => {
  statusEl.textContent = warning.message;
});
