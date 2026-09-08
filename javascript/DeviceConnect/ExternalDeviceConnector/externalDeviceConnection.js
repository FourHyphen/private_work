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
    this._onDataOversizedCallback = null;
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

    // 外部デバイスからのデータ受け取り: サイズ検証に成功したデータだけコールバックを呼ぶ
    // (コールバック: データのキャッシュ更新と保存キュー登録を想定)
    this._client.on(DEVICE_DATA, (data) => {
      const maxDeviceDataBytes = this.config.maxDeviceDataBytes;
      if (maxDeviceDataBytes !== undefined) {
        // データ検証
        const sizeValidationError = validateDeviceDataSize(data, maxDeviceDataBytes);
        if (sizeValidationError) {
          this._handleInvalidDeviceData(sizeValidationError, maxDeviceDataBytes);
          return;
        }
      }

      console.log('[connector] received device data');
      if (this._onDataCallback) {
        this._onDataCallback(data);
      }
    });
  }

  _handleInvalidDeviceData(sizeValidationError, maxDeviceDataBytes) {
    if (sizeValidationError.type === 'stringify failed') {
      // サイズ超過以外のエラーの場合
      console.warn(
        `[connector] discarded device data: stringify failed (maxDeviceDataBytes=${maxDeviceDataBytes}, error=${sizeValidationError.error.name})`
      );
    } else {
      // サイズ超過エラー
      console.warn(
        `[connector] discarded oversized device data (maxDeviceDataBytes=${maxDeviceDataBytes}, error=size exceeded)`
      );
    }

    // 不正データ受領時はまとめてサイズ超過に寄せる
    // (受信の時点で JSON としては正しいため、現在の検証での検証 NG となる理由はサイズ超過のみを想定)
    if (this._onDataOversizedCallback) {
      this._onDataOversizedCallback();
    }
  }

  onData(callback) {
    this._onDataCallback = callback;
  }

  onDataOversized(callback) {
    this._onDataOversizedCallback = callback;
  }
}

function validateDeviceDataSize(data, maxDeviceDataBytes) {
  let serializedData;
  try {
    serializedData = JSON.stringify(data);
  } catch (error) {
    // TODO: return code の ENUM 化
    return { type: 'stringify failed', error };
  }

  if (Buffer.byteLength(serializedData, 'utf8') > maxDeviceDataBytes) {
    return { type: 'size exceeded' };
  }

  return null;
}

module.exports = { ExternalDeviceConnection };
