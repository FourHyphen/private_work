const connectionEl = document.getElementById('connection');
const statusEl = document.getElementById('status');

const socket = io();

socket.on('connect', () => {
  connectionEl.textContent = 'connected';
  connectionEl.style.background = '#dcfce7';
  connectionEl.style.color = '#166534';
});

socket.on('disconnect', () => {
  connectionEl.textContent = 'disconnected';
  connectionEl.style.background = '#fee2e2';
  connectionEl.style.color = '#b91c1c';
});

socket.on('status', (payload) => {
  statusEl.textContent = JSON.stringify(payload.samples, null, 2);
});