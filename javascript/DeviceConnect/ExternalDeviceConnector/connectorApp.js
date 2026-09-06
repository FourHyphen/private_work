const http = require('http');
const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
const { LatestDeviceDataCache } = require('./latestDeviceDataCache');
const { DeviceDataWriter } = require('./deviceDataWriter');
const { ExternalDeviceConnection } = require('./externalDeviceConnection');
const { MainRequestServer } = require('./mainRequestServer');
const { DeviceDataSaveScheduler } = require('./deviceDataSaveScheduler');

class ConnectorApp {
  // コンストラクタ第 2 引数
  //  -> createExternalDeviceClient / createHttpServer / createSocketServer / createDataWriter テスト時にフェイクファクトリを注入できるようにする
  //     省略時は本番想定、デフォルト設定を使用
  constructor(
    config,
    {
      createExternalDeviceClient = clientIo,
      createHttpServer = () => http.createServer(),
      createSocketServer = (httpServer) => new Server(httpServer),
      createDataWriter = (saveFile) => new DeviceDataWriter(saveFile),
    } = {}
  ) {
    this.config = config;
    this._createExternalDeviceClient = createExternalDeviceClient;
    this._createHttpServer = createHttpServer;
    this._createSocketServer = createSocketServer;
    this._createDataWriter = createDataWriter;
    this._deviceConnection = null;
    this._mainRequestServer = null;
    this._latestCache = null;
    this._deviceDataSaveScheduler = null;
  }

  // mainPort の listener が利用可能になるまで解決しない
  // listener 起動に失敗した場合は reject し、外部デバイス接続・保存スケジューラーを開始しない
  async start() {
    // メインプロセスに返却する最新データ管理
    this._latestCache = new LatestDeviceDataCache();

    // 受信した外部デバイスデータを定期的にファイル保存する場合(任意)のファイル保存先ディレクトリ作成
    // 失敗した場合はこの時点で処理終了(例外送出)
    let dataWriter = null;
    if (this.config.saveFile) {
      dataWriter = this._createDataWriter(this.config.saveFile);
      await dataWriter.prepareDirectory();
    }

    // メインプロセスとの接続を受ける（listener 起動を他の初期化より先に完了させる）
    this._mainRequestServer = new MainRequestServer(this.config.mainPort, {
      createHttpServer: this._createHttpServer,
      createSocketServer: this._createSocketServer,
    }, this._latestCache);
    await this._mainRequestServer.start();    // listen 成功を確認してから次に進む(失敗時は例外送出想定)

    // 受信した外部デバイスデータを定期的にファイル保存する(任意)
    // 開始直後に受信したデータを保存するため、外部デバイス接続開始前にこちらを開始すること
    if (this.config.saveFile) {
      this._deviceDataSaveScheduler = new DeviceDataSaveScheduler(dataWriter);
      this._deviceDataSaveScheduler.start();
    }

    // 外部デバイスとの接続を開始し、ポーリングでデータを受け取る
    // onData コールバックにはキャッシュ更新と保存スケジューラーへのキュー登録を設定
    this._deviceConnection = new ExternalDeviceConnection(this.config, {
      createExternalDeviceClient: this._createExternalDeviceClient,
    });

    this._deviceConnection.onData((data) => {
      this._latestCache.update(data);

      // 保存スケジューラーのキューに追加してファイル保存されるようにする
      // (LatestCache 側でのデータ編集内容を取り込むため latest() で取得)
      if (this._deviceDataSaveScheduler) {
        this._deviceDataSaveScheduler.enqueue(this._latestCache.latest());
      }
    });

    this._deviceConnection.start();
  }
}

module.exports = { ConnectorApp };
