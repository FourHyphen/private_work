const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
const FLUSH_INTERVAL_MS = 500;
const {
  DEVICE_DATA
} = require('./events');
const { LatestDeviceDataCache } = require('./latestDeviceDataCache');
const { PendingFileSaveQueue } = require('./pendingFileSaveQueue');
const { DeviceDataWriter } = require('./deviceDataWriter');
const { ExternalDeviceConnection } = require('./externalDeviceConnection');
const { MainRequestServer } = require('./mainRequestServer');

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
    this._latestCache = new LatestDeviceDataCache();           // main:request へ即時返却する最新 1 件を管理
    this._pendingQueue = new PendingFileSaveQueue();           // ファイル未保存データのキュー
    this._writer = config.saveFile ? createDataWriter(config.saveFile) : null;
    this._isFlushing = false;    // ファイル書き込み処理が重複実行されないよう制御
  }

  start() {
    // 外部デバイスとの接続を開始し、ポーリングでデータを受け取る
    // onData コールバックにはキャッシュ更新＆保存キュー登録を設定
    this._deviceConnection = new ExternalDeviceConnection(this.config, {
      createExternalDeviceClient: this._createExternalDeviceClient,
    });

    this._deviceConnection.onData((data) => {
      this._latestCache.update(data);
      if (this._writer) {
        this._pendingQueue.add(data);
      }
    });

    this._deviceConnection.start();

    // メインプロセスとの接続を受ける
    this._mainRequestServer = new MainRequestServer(this.config.mainPort, {
      createServer: this._createServer
    }, this._latestCache);
    this._mainRequestServer.start();

    // 一定間隔でバッファの未保存データをまとめてファイルへ書き込む
    if (this._writer) {
      this._flushTimer = setInterval(() => this._flushPending(), FLUSH_INTERVAL_MS);
    }
  }

  // 保存待ちキューの未保存データをまとめてファイルへ書き込み、成功分をキューから削除する
  async _flushPending() {
    // 前回の書き込み処理がまだ終わっていない場合はスキップ(同一データの多重書き込みを防止)
    if (this._isFlushing) {
      return;
    }

    // 未保存データを取得
    const pending = this._pendingQueue.pending();
    if (pending.length === 0) return;

    try {
      this._isFlushing = true;

      // 処理失敗すると Promise は rejected となる、await は rejected となった Promise を受け取ると例外 throw する
      await this._writer.writeBatch(pending);          // 書き込み
      this._pendingQueue.markSaved(pending.length);    // 書き込み開始時点の件数だけキューから削除
    } catch (err) {
      // 書き込み失敗時は書き込み成功データ件数を増やさないことで次回処理時にリトライする
      console.error('[connector] write failed:', err);
    } finally {
      this._isFlushing = false;
    }
  }
}

module.exports = { ConnectorApp };
