// Connector 経路アダプタ: サブプロセス起動 + socket.io でリクエスト都度データ取得
const { spawn } = require('child_process');
const path = require('path');
const { io: clientIo } = require('socket.io-client');
const { MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA, MAIN_DATA_OVERSIZED } = require('../../../ExternalDeviceConnector/events');

class ConnectorSource {
  // 接続はコンストラクタではなく start() 内で行う（未使用時に副作用を出さない）
  constructor(config) {
    this._config = config;    // { deviceUrl, externalDeviceConnectorServerPort, requestIntervalMs, pollIntervalMs, maxDeviceDataBytes?, saveFile? }
    this._child = null;
    this._edcConnection = null;    // ExternalDeviceConnector との接続管理(edc = ExternalDeviceConnector の頭文字)
    this._requestTimer = null;
  }

  // resolve -> ExternalDeviceConnector から ready を受信したとき
  // reject -> ExternalDeviceConnector との接続確立に失敗したとき
  async start(
    onSamples,                 // 外部デバイスデータ取得成功時に実行する処理
    onStatus = () => {},       // 異常ではない状態変化（例: データ未取得）を通知する処理
    onWarning = () => {},      // 処理は継続できる異常（例: データサイズ超過による破棄）を通知する処理
    onError = console.error    // ExternalDeviceConnector との接続失敗時に実行する処理
  ) {
    // ExternalDeviceConnector 実行準備
    const edcPath = path.join(__dirname, '../../../ExternalDeviceConnector/main.js');
    const connectorRuntimeConfig = {
      deviceUrl: this._config.deviceUrl,
      mainPort: this._config.externalDeviceConnectorServerPort,
      pollIntervalMs: this._config.pollIntervalMs,
      maxDeviceDataBytes: this._config.maxDeviceDataBytes,
      saveFile: this._config.saveFile,
    };

    // ExternalDeviceConnector をサブプロセスとして起動（IPC で ready/startup-error を受信するため 'ipc' を有効化）
    this._child = spawn('node', [edcPath, JSON.stringify(connectorRuntimeConfig)], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    let readyReceived = false;

    // ready/startup-error を待つハンドシェイク（start() の Promise 解決/拒否はこれに従う）
    // (ready = ExternalDeviceConnector で 本プロセスと疎通可能になった通知)
    const handshake = new Promise((resolve, reject) => {
      this._child.on('message', (msg) => {
        const result = determineConnectorAvailability(msg);
        if (result.ok === true) {
          readyReceived = true;
          resolve();
        } else if (result.ok === false) {
          reject(new Error(result.reason));
        }
      });

      // ready/startup-error を受信する前にサブプロセスが終了した場合は reject
      this._child.once('exit', (code) => {
        if (!readyReceived) {
          reject(buildExitBeforeReadyError(code));
        }
      });
    });

    // ready 受信後のサブプロセス異常終了を検知する
    this._child.on('exit', (code) => {
      if (readyReceived) {
        onError(new Error(`connector exited: ${code}`));
      }
    });

    // ExternalDeviceConnector との接続確立
    // (ExternalDeviceConnector はローカルホスト実行前提なので localhost 決め打ち)
    this._edcConnection = clientIo(`http://localhost:${this._config.externalDeviceConnectorServerPort}`);
    this._edcConnection.on('connect_error', onError);    // 接続失敗時に呼ばれるコールバック設定

    // 接続確立後、requestIntervalMs ごとに MAIN_REQUEST を送信する
    // (これにより最新 1 件が返ってくる想定)
    this._edcConnection.on('connect', () => {
      this._requestTimer = setInterval(
        () => this._edcConnection.emit(MAIN_REQUEST),
        this._config.requestIntervalMs
      );
    });

    // ExternalDeviceConnector から受信したデータ(1 件)
    //  -> onSamples イベントに転送
    this._edcConnection.on(MAIN_DATA, (data) => {
      onSamples([normalize(data)]);
    });

    // Connector とは通信できているが、外部デバイスからまだデータを取得できていない状態
    //  -> onStatus イベントに転送
    this._edcConnection.on(MAIN_NO_DATA, () => {
      console.log('[connector] no data in buffer');
      onStatus(buildNoDataStatus());
    });

    // 直近受信データがサイズ超過で破棄された状態
    //  -> 以前に正常受信したデータがあれば onSamples へも転送しつつ、onWarning で警告する
    this._edcConnection.on(MAIN_DATA_OVERSIZED, ({ data, updatedAt }) => {
      console.log('[connector] latest device data was oversized and discarded');
      if (data !== null) {
        onSamples([normalize({ data, updatedAt })]);
      }

      onWarning(buildOversizedWarning());
    });

    // ExternalDeviceConnector との接続成否が確定するまで待つ
    await handshake;
  }

  async stop() {
    clearInterval(this._requestTimer);
    this._requestTimer = null;
    this._edcConnection?.close();
    this._child?.kill();
  }
}

// MAIN_DATA のペイロード { data: { seq, value }, updatedAt } を共通形状へ変換（腐敗防止層）
function normalize({ data, updatedAt }) {
  return {
    online: true,
    deviceName: 'ExternalDeviceConnector',
    data: { seq: data.seq, value: data.value },
    timestamp: updatedAt,
  };
}

// MAIN_NO_DATA 受信時に onStatus へ渡す状態オブジェクトを組み立てる
function buildNoDataStatus() {
  return {
    type: 'no-data',
    message: 'Connector is connected, but no data has been received from the external device',
  };
}

// MAIN_DATA_OVERSIZED 受信時に onWarning へ渡す警告オブジェクトを組み立てる
function buildOversizedWarning() {
  return {
    type: 'data-oversized',
    message: '[connector] latest device data was oversized and discarded',
  };
}

// IPC で受信したメッセージが ready/startup-error のどちらかを判定する
// (ready: 成功, startup-error: 失敗, それ以外: 未確定)
function determineConnectorAvailability(msg) {
  if (msg?.type === 'ready') {
    return { ok: true };
  }

  if (msg?.type === 'startup-error') {
    return { ok: false, reason: msg.reason };
  }

  return { ok: null };
}

// ready 受信前にサブプロセスが終了した場合のエラーを組み立てる（kind は不明なので含めない）
function buildExitBeforeReadyError(code) {
  return new Error(`connector exited before ready: ${code}`);
}

module.exports = ConnectorSource;
module.exports.normalize = normalize;    // 単体テスト用
module.exports.buildNoDataStatus = buildNoDataStatus;    // 単体テスト用
module.exports.buildOversizedWarning = buildOversizedWarning;    // 単体テスト用
module.exports.determineConnectorAvailability = determineConnectorAvailability;    // 単体テスト用
module.exports.buildExitBeforeReadyError = buildExitBeforeReadyError;    // 単体テスト用
