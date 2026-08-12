// デモまたはテスト用に main.js をサブプロセスとして起動するエントリa
// - Connector へ socket.io-client で接続し、蓄積データを要求・受信する
const { spawn } = require('child_process');
const path = require('path');
const { io: clientIo } = require('socket.io-client');
const { MAIN_REQUEST, MAIN_DATA } = require('../events');

const connectorConfig = { deviceUrl: 'http://localhost:9001', mainPort: 9002 };
const CONNECTOR_URL = `http://localhost:${connectorConfig.mainPort}`;

// main.js をサブプロセスとして起動
const child = spawn('node', [path.join(__dirname, '..', 'main.js'), JSON.stringify(connectorConfig)], { stdio: 'inherit' });

child.on('exit', (code) => console.log(`[main] connector exited: ${code}`));

// Connector へ接続してデータを要求
const connector = clientIo(CONNECTOR_URL);

connector.on('connect', () => {
  console.log('[main] connected to connector');
  setInterval(() => connector.emit(MAIN_REQUEST), 3000);
});

connector.on(MAIN_DATA, (data) => {
  console.log(`[main] received ${data.length} records`);
});

// 終了時にサブプロセスも停止
process.on('SIGINT', () => {
  child.kill();
  process.exit(0);
});
