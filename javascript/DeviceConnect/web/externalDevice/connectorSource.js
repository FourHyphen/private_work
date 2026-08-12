// Connector 経路アダプタ: サブプロセス起動 + socket.io でリクエスト都度データ取得
const { spawn } = require('child_process');
const path = require('path');
const { io: clientIo } = require('socket.io-client');
const { MAIN_REQUEST, MAIN_DATA } = require('../../ExternalDeviceConnector/events');

class ConnectorSource {
  // 接続はコンストラクタではなく start() 内で行う（未使用時に副作用を出さない）
  constructor(config) {
    this._config = config;           // { deviceUrl, mainPort, requestIntervalMs }
    this._child = null;
    this._conn = null;
    this._requestTimer = null;
  }

  async start(onSamples, onError = console.error) {
    const mainPath = path.join(__dirname, '../../ExternalDeviceConnector/main.js');
    this._child = spawn('node', [mainPath, JSON.stringify(this._config)], { stdio: 'inherit' });
    this._child.on('exit', (code) => onError(new Error(`connector exited: ${code}`)));

    this._conn = clientIo(`http://localhost:${this._config.mainPort}`);
    this._conn.on('connect_error', onError);

    this._conn.on('connect', () => {
      this._requestTimer = setInterval(
        () => this._conn.emit(MAIN_REQUEST),
        this._config.requestIntervalMs
      );
    });

    // ConnectorApp はデータを蓄積しないので、受信したデータをそのまま 1 件転送する
    this._conn.on(MAIN_DATA, (data) => {
      onSamples([normalize(data)]);
    });
  }

  async stop() {
    clearInterval(this._requestTimer);
    this._requestTimer = null;
    this._conn?.close();
    this._child?.kill();
  }
}

// Connector のデバイスデータ { seq, value, at } を共通形状へ変換（腐敗防止層）
function normalize(raw) {
  return {
    online: true,
    deviceName: 'CONNECTOR',
    data: { seq: raw.seq, value: raw.value },
    timestamp: new Date(raw.at).toISOString(),
  };
}

module.exports = ConnectorSource;
