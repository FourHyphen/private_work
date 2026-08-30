const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
const FLUSH_INTERVAL_MS = 500;
const {
  DEVICE_DATA
} = require('./events');
const { LatestDeviceDataCache } = require('./latestDeviceDataCache');
const { DeviceDataWriter } = require('./deviceDataWriter');
const { ExternalDeviceConnection } = require('./externalDeviceConnection');
const { MainRequestServer } = require('./mainRequestServer');
const { DeviceDataSaveScheduler } = require('./deviceDataSaveScheduler');

class ConnectorApp {
  // コンストラクタ第 2 引数
  //  -> createExternalDeviceClient / createServer / createDataWriter テスト時にフェイクファクトリを注入できるようにする
  //     省略時は本番想定、デフォルト設定を使用
  constructor(
    config,
    {
      createExternalDeviceClient = clientIo,
      createServer = (port) => new Server(port),
      createDataWriter = (saveFile) => new DeviceDataWriter(saveFile),
    } = {}
  ) {
    this.config = config;
    this._createExternalDeviceClient = createExternalDeviceClient;
    this._createServer = createServer;
    this._deviceConnection = null;
    this._mainRequestServer = null;
    this._latestCache = new LatestDeviceDataCache();    // main:request へ即時返却する最新 1 件を管理

    // ファイル保存は任意のため機能有効の場合のみインスタンス化
    this._deviceDataSaveScheduler = config.saveFile
      ? new DeviceDataSaveScheduler(createDataWriter(config.saveFile))
      : null;
  }

  start() {
    // 外部デバイスとの接続を開始し、ポーリングでデータを受け取る
    // onData コールバックにはキャッシュ更新と保存スケジューラーへのキュー登録を設定
    this._deviceConnection = new ExternalDeviceConnection(this.config, {
      createExternalDeviceClient: this._createExternalDeviceClient,
    });

    this._deviceConnection.onData((data) => {
      this._latestCache.update(data);

      // 保存スケジューラーのキューに追加してファイル保存されるようにする
      if (this._deviceDataSaveScheduler) {
        this._deviceDataSaveScheduler.enqueue(data);
      }
    });

    this._deviceConnection.start();

    // メインプロセスとの接続を受ける
    this._mainRequestServer = new MainRequestServer(this.config.mainPort, {
      createServer: this._createServer
    }, this._latestCache);
    this._mainRequestServer.start();

    // 受信した外部デバイスデータを定期的にファイル保存する
    if (this._deviceDataSaveScheduler) {
      this._deviceDataSaveScheduler.start();
    }
  }
}

module.exports = { ConnectorApp };
