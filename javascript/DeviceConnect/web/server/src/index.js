// 引数チェック、NG なら処理終了
const { validateArgs } = require('./validateArgs');
if (!validateArgs(process.argv)) {
  process.exit(1);
}

// 設定ファイル読み込み
const { loadSetting } = require('./loadSetting');
const setting = loadSetting(process.argv[2]);

// 外部デバイスからのデータ受信接続準備
const createDeviceSource = require('../../externalDevice/createDeviceSource');
const deviceSource = createDeviceSource(setting);

// 外部デバイスからのデータの扱い準備
const ExternalDeviceDataBuffer = require('../../externalDevice/externalDeviceDataBuffer');
const ExternalDeviceDataPayload = require('../../externalDevice/externalDeviceDataPayload');
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
const clientDir = path.join(__dirname, '../../client');    // Web ブラウザに渡す Web ページ関連ファイル格納フォルダ
app.use(express.static(clientDir));

// ユーザー Web ブラウザとの接続、切断などのイベント定義
io.on('connection', (socket) => {
  clients.add(socket.id);
  console.log(`Client connected: ${socket.id}`);

  // 接続してきたブラウザに現在の情報を送る
  socket.emit(
    'status',
    ExternalDeviceDataPayload.createStatusForInitialSync(externalDeviceDataBuffer.snapshot(), clients.size)
  );

  // ユーザー Web ブラウザ側で切断したときの通知を受け取ったとき
  socket.on('disconnect', () => {
    clients.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// requestIntervalMs ごとに外部デバイスデータ取得、一定程度たまったらユーザー Web ブラウザに送信
// サーバーとしてクライアント Web ブラウザを待ち受け開始
server.listen(userWebClientListenPort, async () => {
  // 外部デバイスからのデータ取得経路を開始
  await deviceSource.start(
    // onSamples = 外部デバイスデータ取得成功時に実行する処理
    (samples) => {
      // 外部デバイスデータをバッファに追加
      for (const s of samples) externalDeviceDataBuffer.push(s);

      // 送る条件を満たしていれば ユーザー Web ブラウザに送信
      while (externalDeviceDataBuffer.isReady) {
        io.emit('status', ExternalDeviceDataPayload.createStatusForLiveUpdate(externalDeviceDataBuffer, clients));
      }
    },
    (err) => {
      console.error(err);
      io.emit('device-error', err.message);
    }
  );

  console.log(`Server listening on http://localhost:${userWebClientListenPort}`);
});

// 終了時処理が複数回走らないようにする
let isShuttingDown = false;

// 終了時処理
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}, shutting down...`);

  // 外部デバイスの取得経路を終了
  try {
    await deviceSource.stop();
  } catch (err) {
    console.error('Failed to stop device source:', err);
  }

  // ユーザー Web ブラウザとの接続経路およびサーバーを終了
  try {
    io.close();
    server.close();
  } catch (err) {
    console.error('Failed to close server:', err);
  }

  process.exit(0);
}

// 終了時に取得経路を後始末する
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
