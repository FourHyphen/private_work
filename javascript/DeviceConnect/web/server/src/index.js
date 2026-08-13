// 引数チェック、NG なら処理終了
const { validateArgs } = require('./validateArgs');
if (!validateArgs(process.argv)) {
  process.exit(1);
}

// 設定ファイル読み込み
const { loadSetting } = require('./loadSetting');
const setting = loadSetting(process.argv[2]);

// 外部デバイスとの接続準備
const createDeviceSource = require('../../externalDevice/createDeviceSource');
const deviceSource = createDeviceSource();
const { ExternalDeviceDataBuffer, ExternalDeviceDataPayload } = require('../../externalDevice/external_device_data');
const externalDeviceDataBuffer = new ExternalDeviceDataBuffer();

// Web サーバー準備
const http = require('http');
const express = require('express');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const userWebClientListenPort = setting.userWebClientListenPort;
const clients = new Set();        // ユーザー Web ブラウザ接続 socket.id 群を管理
const path = require('path');
const clientDir = path.join(__dirname, '../../client');

app.use(express.static(clientDir));

// ユーザー Web ブラウザとの接続、切断などのイベント定義
io.on('connection', (socket) => {
  clients.add(socket.id);
  console.log(`Client connected: ${socket.id}`);

  socket.emit('status', new ExternalDeviceDataPayload(externalDeviceDataBuffer.snapshot(), clients.size));

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// requestIntervalMs ごとに外部デバイスデータ取得、一定程度たまったらユーザー Web ブラウザに送信
// サーバーとしてクライアント Web ブラウザを待ち受け開始
server.listen(userWebClientListenPort, async () => {
  await deviceSource.start(
    (samples) => {
      for (const s of samples) externalDeviceDataBuffer.push(s);
      while (externalDeviceDataBuffer.isReady) {
        io.emit('status', ExternalDeviceDataPayload.fromBuffer(externalDeviceDataBuffer, clients));
      }
    },
    (err) => {
      console.error(err);
      io.emit('device-error', err.message);
    }
  );
  console.log(`Server listening on http://localhost:${userWebClientListenPort}`);
});

// 割り込み終了時に取得経路（タイマ・socket・サブプロセス）を後始末する
process.on('SIGINT', async () => {
  await deviceSource.stop();
  server.close();
  process.exit(0);
});
