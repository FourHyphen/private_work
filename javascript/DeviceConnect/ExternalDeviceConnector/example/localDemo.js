// デモまたはテスト用に Connector(main.js) を経由して外部デバイス(ダミー)のデータを取得する流れを再現するファイル
const { spawn } = require('child_process');
const path = require('path');
const { io: clientIo } = require('socket.io-client');
const { MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA } = require('../events');

// ファイルにローテーション保存する設定
// ファイル保存しない場合は saveFile ブロックをまるごと削除すること
const connectorConfig = {
  deviceUrl: 'http://localhost:9001',
  mainPort: 9002,
  pollIntervalMs: 3000,
  saveFile: {
    dataFilePath: path.join(__dirname, 'device_data.log'),
    rotationKb: 1,
    maxSaveFileNum: 3
  }
};
const CONNECTOR_URL = `http://localhost:${connectorConfig.mainPort}`;

// 外部デバイス(ダミー)をサブプロセスとして起動
const device = spawn('node', [path.join(__dirname, 'externalDevice.js')], { stdio: 'inherit' });
device.on('exit', (code) => console.log(`[main] device exited: ${code}`));

// Connector(main.js)をサブプロセスとして起動
const child = spawn('node', [path.join(__dirname, '..', 'main.js'), JSON.stringify(connectorConfig)], { stdio: 'inherit' });
child.on('exit', (code) => console.log(`[main] connector exited: ${code}`));

// Connector に接続
const connector = clientIo(CONNECTOR_URL);

// 3s 毎に Connector を経由して外部デバイス(ダミー)にデータ要求
connector.on('connect', () => {
  console.log('[main] connected to connector');
  setInterval(() => connector.emit(MAIN_REQUEST), 3000);
});

// Connector からのデータ受信時
connector.on(MAIN_DATA, ({ data, updatedAt }) => {
  console.log(`[main] received: ${JSON.stringify(data)} (updatedAt: ${updatedAt})`);
});

// バッファが空（外部デバイス未受信）のとき
connector.on(MAIN_NO_DATA, () => {
  console.log('[main] no data buffered yet');
});

// 終了時にサブプロセスも停止
process.on('SIGINT', () => {
  child.kill();
  device.kill();
  process.exit(0);
});
