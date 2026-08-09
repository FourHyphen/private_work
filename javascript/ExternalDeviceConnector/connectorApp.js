const { Server } = require('socket.io');
const { io: clientIo } = require('socket.io-client');
const {
  DEVICE_REQUEST,
  DEVICE_DATA,
  MAIN_REQUEST,
  MAIN_DATA
} = require('./events');

class ConnectorApp {
  // externalDeviceClient / createServer はテスト時にフェイクファクトリを注入できる
  constructor(config, { createExternalDeviceClient = clientIo, createServer = (port) => new Server(port) } = {}) {
    this.config = config;
    this._createExternalDeviceClient = createExternalDeviceClient;
    this._createServer = createServer;
    this.externalDeviceConnection = null;
    this.server = null;
    // 外部デバイスへの取得要求元（未応答のメインプロセス socket）
    this._pendingMainSocket = null;
  }

  start() {
    this.externalDeviceConnection = this._createExternalDeviceClient(this.config.deviceUrl);

    // 外部デバイスとの接続完了時
    this.externalDeviceConnection.on('connect', () => {
      console.log('[connector] connected to device');
    });

    // 外部デバイスからのデータ受け取り: 要求元のメインプロセスへそのまま返す
    this.externalDeviceConnection.on(DEVICE_DATA, (data) => {
      console.log(`[connector] received: ${JSON.stringify(data)}`);
      if (this._pendingMainSocket) {
        this._pendingMainSocket.emit(MAIN_DATA, data);
        this._pendingMainSocket = null;
      }
    });

    // メインプロセスとの接続を受ける準備
    this.server = this._createServer(this.config.mainPort);

    // メインプロセスからの接続受理時
    this.server.on('connection', (socket) => {
      console.log('[connector] main process connected');

      // メインプロセスからの要求を契機に外部デバイスへ取得要求する
      socket.on(MAIN_REQUEST, () => {
        this._pendingMainSocket = socket;
        this.externalDeviceConnection.emit(DEVICE_REQUEST);
      });
    });

    console.log(`[connector] listening for main process on ${this.config.mainPort}`);
  }
}

module.exports = { ConnectorApp };