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
  //  -> createExternalDeviceClient / createHttpServer / createSocketServer / createDataWriter / createSaveScheduler テスト時にフェイクファクトリを注入できるようにする
  //     省略時は本番想定、デフォルト設定を使用
  constructor(
    config,
    {
      createExternalDeviceClient = clientIo,
      createHttpServer = () => http.createServer(),
      createSocketServer = (httpServer) => new Server(httpServer),
      createDataWriter = (saveFile) => new DeviceDataWriter(saveFile),
      createSaveScheduler = (writer, options) => new DeviceDataSaveScheduler(writer, options),
    } = {}
  ) {
    this.config = config;
    this._createExternalDeviceClient = createExternalDeviceClient;
    this._createHttpServer = createHttpServer;
    this._createSocketServer = createSocketServer;
    this._createDataWriter = createDataWriter;
    this._createSaveScheduler = createSaveScheduler;
    this._deviceConnection = null;
    this._mainRequestServer = null;
    this._latestCache = null;
    this._deviceDataSaveScheduler = null;
    this._fatalSettled = false;
    this._fatalPromise = new Promise((resolve, reject) => {
      this._resolveFatal = resolve;
      this._rejectFatal = reject;
    });
    // unhandled rejection の警告を防ぎつつ、呼び出し側が await できるようにする
    this._fatalPromise.catch(() => {});
  }

  waitUntilFatal() {
    return this._fatalPromise;
  }

  // 致命的なエラーが発生するなどした場合にそのことを本クラスに通知する窓口
  // 目的: start() が一通り成功した後に発生したエラーを main.js の catch に渡す
  reportFatal(error) {
    if (this._fatalSettled) {
      return;
    }

    this._fatalSettled = true;
    this._rejectFatal(error);
  }

  // 各種処理停止
  // TODO: 各種処理を停止する(ハング時に停止処理を実行できるかは要検討)
  stop() {
    if (this._fatalSettled) {
      return;
    }

    if (this._deviceDataSaveScheduler) {
      this._deviceDataSaveScheduler.stop();
    }

    this._fatalSettled = true;
    this._resolveFatal();
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
      await dataWriter.prepareSaveFile();
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
      this._deviceDataSaveScheduler = this._createSaveScheduler(dataWriter, {
        // main.js の catch を通すよう、直接例外送出せず reportFatal() を実行すること
        onHang: (err) => {
          const error = new Error(err?.message || 'Save file write hang detected');
          error.kind = 4;
          error.type = 'save-write-hang';
          this.reportFatal(error);
        },
      });
      this._deviceDataSaveScheduler.start();
    }

    // 外部デバイスとの接続を開始し、ポーリングでデータを受け取る
    // onData コールバックにはキャッシュ更新と保存スケジューラーへのキュー登録を設定
    this._deviceConnection = new ExternalDeviceConnection(this.config, {
      createExternalDeviceClient: this._createExternalDeviceClient,
    });

    // 受信の時点で JSON オブジェクトであることに注意
    this._deviceConnection.onData((data) => {
      this._latestCache.update(data);
      this._mainRequestServer.markDataReceived();

      // 保存スケジューラーのキューに追加してファイル保存されるようにする
      // (LatestCache 側でのデータ編集内容を取り込むため latest() で取得)
      if (this._deviceDataSaveScheduler) {
        this._deviceDataSaveScheduler.enqueue(this._latestCache.latest());
      }
    });

    // サイズ超過データ受信時の処理を設定
    this._deviceConnection.onDataOversized(() => {
      this._mainRequestServer.markDataOversized();
    });

    this._deviceConnection.start();
  }
}

module.exports = { ConnectorApp };
