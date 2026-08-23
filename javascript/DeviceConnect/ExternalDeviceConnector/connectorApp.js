const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
const FLUSH_INTERVAL_MS = 500;
const {
  DEVICE_REQUEST,
  DEVICE_DATA,
  MAIN_REQUEST,
  MAIN_DATA,
  MAIN_NO_DATA
} = require('./events');
const { DeviceDataBuffer } = require('./deviceDataBuffer');
const { DeviceDataWriter } = require('./deviceDataWriter');
const { DevicePoller } = require('./devicePoller');

class ConnectorApp {
  // コンストラクタ第 2 引数
  //  -> createExternalDeviceClient / createServer / createDataWriter テスト時にフェイクファクトリを注入できるようにする
  //     省略時は本番想定、デフォルト設定を使用
  constructor(
    config,
    {
      createExternalDeviceClient = clientIo,
      createServer = (port) => new Server(port),
      createDataWriter = (filePath) => new DeviceDataWriter(filePath)
    } = {}
  ) {
    this.config = config;
    this._createExternalDeviceClient = createExternalDeviceClient;
    this._createServer = createServer;
    this.externalDeviceConnection = null;
    this.server = null;
    this._buffer = new DeviceDataBuffer();    // 外部デバイスから受信したデータを蓄積するキュー
    this._poller = new DevicePoller(config.pollIntervalMs);    // 外部デバイスへのポーリング
    this._writer = config.dataFilePath ? createDataWriter(config.dataFilePath) : null;
  }

  start() {
    this.externalDeviceConnection = this._createExternalDeviceClient(this.config.deviceUrl);

    // 外部デバイスとの接続完了時: ポーリングを開始する
    this.externalDeviceConnection.on('connect', () => {
      console.log('[connector] connected to device');
      this._poller.start(() => this.externalDeviceConnection.emit(DEVICE_REQUEST));
    });

    // 外部デバイスとの切断時: ポーリングを停止する
    this.externalDeviceConnection.on('disconnect', () => {
      console.log('[connector] disconnected from device');
      this._poller.stop();
    });

    // 外部デバイスからのデータ受け取り: バッファへ格納する
    this.externalDeviceConnection.on(DEVICE_DATA, (data) => {
      console.log(`[connector] received: ${JSON.stringify(data)}`);
      this._buffer.update(data);
    });

    // メインプロセスとの接続を受ける準備
    this.server = this._createServer(this.config.mainPort);

    // 一定間隔でバッファの未保存データをまとめてファイルへ書き込む
    if (this._writer) {
      this._flushTimer = setInterval(() => this._flushPending(), FLUSH_INTERVAL_MS);
    }

    // メインプロセスからの接続受理時
    this.server.on('connection', (socket) => {
      console.log('[connector] main process connected');

      // メインプロセスからの要求にはバッファの最新 1 件を即時返却する
      socket.on(MAIN_REQUEST, () => {
        const item = this._buffer.latest();

        // バッファが空の場合はデータなしイベントを返却
        if (item === null) {
          socket.emit(MAIN_NO_DATA);
          return;
        }

        // バッファにデータがある場合は最新データを返却
        socket.emit(MAIN_DATA, { data: item.data, updatedAt: item.updatedAt.toISOString() });
      });
    });

    console.log(`[connector] listening for main process on ${this.config.mainPort}`);
  }

  // バッファのファイル未保存データをまとめてファイルへ書き込み、成功分をバッファに通知する
  _flushPending() {
    const pending = this._buffer.getDataPendingFileSave();
    if (pending.length === 0) return;

    try {
      this._writer.writeBatch(pending);              // 書き込み
      this._buffer.markFileSaved(pending.length);    // 書き込み成功データ件数をバッファに通知
    } catch (err) {
      // 書き込み失敗時は書き込み成功データ件数を増やさない
      console.error('[connector] write failed:', err);
    }
  }
}

module.exports = { ConnectorApp };
