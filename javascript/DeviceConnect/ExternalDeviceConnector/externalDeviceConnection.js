const { io: clientIo } = require('socket.io-client');
const { DEVICE_REQUEST, DEVICE_DATA } = require('./events');
const { DevicePoller } = require('./devicePoller');

// 外部デバイスとの接続を管理する
class ExternalDeviceConnection {
  constructor(config, { createExternalDeviceClient = clientIo } = {}) {
    this.config = config;
    this._createExternalDeviceClient = createExternalDeviceClient;
    this._client = null;
    this._poller = new DevicePoller(config.pollIntervalMs);
    this._onDataCallback = null;
  }

  start() {
    this._client = this._createExternalDeviceClient(this.config.deviceUrl);

    // 外部デバイスとの接続完了時: ポーリングを開始する
    this._client.on('connect', () => {
      console.log('[connector] connected to device');
      this._poller.start(() => this._client.emit(DEVICE_REQUEST));
    });

    // 外部デバイスとの切断時: ポーリングを停止する
    this._client.on('disconnect', () => {
      console.log('[connector] disconnected from device');
      this._poller.stop();
    });

    // 外部デバイスからのデータ受け取り: 登録されたコールバックを呼ぶ
    // (コールバック: データのキャッシュ更新と保存キュー登録を想定)
    this._client.on(DEVICE_DATA, (data) => {
      console.log(`[connector] received: ${JSON.stringify(data)}`);
      if (this._onDataCallback) {
        this._onDataCallback(data);
      }
    });
  }

  onData(callback) {
    this._onDataCallback = callback;
  }
}

module.exports = { ExternalDeviceConnection };
