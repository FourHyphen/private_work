const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
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
  // externalDeviceClient / createServer / createDataWriter はテスト時にフェイクファクトリを注入できる
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

    // 外部デバイスからのデータ受け取り: バッファへ格納しファイルへ追記する
    this.externalDeviceConnection.on(DEVICE_DATA, (data) => {
      console.log(`[connector] received: ${JSON.stringify(data)}`);
      this._buffer.update(data);

      // TODO: ファイル IO は重いのである程度まとめて書き込む
      this._writer?.write(this._buffer.latest());
    });

    // メインプロセスとの接続を受ける準備
    this.server = this._createServer(this.config.mainPort);

    // メインプロセスからの接続受理時
    this.server.on('connection', (socket) => {
      console.log('[connector] main process connected');

      // メインプロセスからの要求にはバッファの最新 1 件を即時返却する
      socket.on(MAIN_REQUEST, () => {
        const item = this._buffer.latest();
        if (item === null) {
          socket.emit(MAIN_NO_DATA);
          return;
        }

        socket.emit(MAIN_DATA, { data: item.data, updatedAt: item.updatedAt.toISOString() });
      });
    });

    console.log(`[connector] listening for main process on ${this.config.mainPort}`);
  }
}

module.exports = { ConnectorApp };
