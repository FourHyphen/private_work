const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
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
    this._createDataWriter = createDataWriter;
    this._deviceConnection = null;
    this._mainRequestServer = null;
    this._latestCache = null;
    this._deviceDataSaveScheduler = null;
  }

  start() {
    // メインプロセスに返却する最新データ管理
    this._latestCache = new LatestDeviceDataCache();

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
      createServer: this._createServer,
    }, this._latestCache);
    this._mainRequestServer.start();

    // 受信した外部デバイスデータを定期的にファイル保存する
    // (ファイル保存は任意のため機能有効の場合のみ)
    if (this.config.saveFile) {
      this._deviceDataSaveScheduler = new DeviceDataSaveScheduler(
        this._createDataWriter(this.config.saveFile)
      );
    }

    if (this._deviceDataSaveScheduler) {
      this._deviceDataSaveScheduler.start();
    }
  }
}

module.exports = { ConnectorApp };
