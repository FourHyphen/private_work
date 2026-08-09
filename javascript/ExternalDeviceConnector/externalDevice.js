// 外部デバイスのダミー実装（socket.io サーバー）
// Connector からの取得要求に応じてデータを返す。
const { Server } = require('socket.io');
const { DEVICE_REQUEST, DEVICE_DATA } = require('./events');

const PORT = 9001;
const io = new Server(PORT);

let seq = 0;

io.on('connection', (socket) => {
  console.log('[device] connector connected');

  socket.on(DEVICE_REQUEST, () => {
    const data = { seq: seq++, value: Math.round(Math.random() * 100), at: Date.now() };
    socket.emit(DEVICE_DATA, data);
  });
});

console.log(`[device] listening on ${PORT}`);
