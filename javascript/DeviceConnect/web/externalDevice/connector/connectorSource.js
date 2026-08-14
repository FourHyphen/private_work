// Connector 経路アダプタ: サブプロセス起動 + socket.io でリクエスト都度データ取得
const { spawn } = require('child_process');
const path = require('path');
const { io: clientIo } = require('socket.io-client');
const { MAIN_REQUEST, MAIN_DATA } = require('../../../ExternalDeviceConnector/events');

class ConnectorSource {
  // 接続はコンストラクタではなく start() 内で行う（未使用時に副作用を出さない）
  constructor(config) {
    this._config = config;    // { deviceUrl, externalDeviceConnectorServerPort, requestIntervalMs }
    this._child = null;
    this._edcConnection = null;    // ExternalDeviceConnector との接続管理(edc = ExternalDeviceConnector の頭文字)
    this._requestTimer = null;
  }

  // onSamples = 外部デバイスデータ取得成功時に実行する処理
  // onError = ExternalDeviceDataSource との接続失敗時に実行する処理
  async start(onSamples, onError = console.error) {
    // ExternalDeviceConnector 実行準備
    const edcPath = path.join(__dirname, '../../../ExternalDeviceConnector/main.js');
    const connectorRuntimeConfig = {
      deviceUrl: this._config.deviceUrl,
      mainPort: this._config.externalDeviceConnectorServerPort,
    };

    // ExternalDeviceConnector をサブプロセスとして起動
    this._child = spawn('node', [edcPath, JSON.stringify(connectorRuntimeConfig)], { stdio: 'inherit' });

    // サブプロセス終了を検知する
    this._child.on('exit', (code) => onError(new Error(`connector exited: ${code}`)));

    // ExternalDeviceConnector との接続確立
    // (ExternalDeviceConnector はローカルホスト実行前提なので localhost 決め打ち)
    this._edcConnection = clientIo(`http://localhost:${this._config.externalDeviceConnectorServerPort}`);
    this._edcConnection.on('connect_error', onError);    // 接続失敗時に呼ばれるコールバック設定

    // 接続確立後、requestIntervalMs ごとに MAIN_REQUEST を送信する
    this._edcConnection.on('connect', () => {
      this._requestTimer = setInterval(
        () => this._edcConnection.emit(MAIN_REQUEST),
        this._config.requestIntervalMs
      );
    });

    // ExternalDeviceConnector はデータを蓄積しないので、受信したデータをそのまま 1 件転送する
    this._edcConnection.on(MAIN_DATA, (data) => {
      onSamples([normalize(data)]);
    });
  }

  async stop() {
    clearInterval(this._requestTimer);
    this._requestTimer = null;
    this._edcConnection?.close();
    this._child?.kill();
  }
}

// ExternalDeviceConnector のデバイスデータ { seq, value, at } を共通形状へ変換（腐敗防止層）
function normalize(raw) {
  return {
    online: true,
    deviceName: 'ExternalDeviceConnector',
    data: { seq: raw.seq, value: raw.value },
    timestamp: new Date(raw.at).toISOString(),
  };
}

module.exports = ConnectorSource;
