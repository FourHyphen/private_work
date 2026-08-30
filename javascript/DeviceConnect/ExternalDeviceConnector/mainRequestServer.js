const { Server } = require('socket.io');
const {
  MAIN_REQUEST,
  MAIN_DATA,
  MAIN_NO_DATA
} = require('./events');

// メインプロセスとの接続を管理する
class MainRequestServer {
  // latestCache: LatestDeviceDataCache のインスタンス
  // options:
  //   - createServer: (port) => Server のファクトリ関数（テスト時にフェイク注入可能）
  constructor(mainPort, { createServer = (port) => new Server(port) } = {}, latestCache) {
    this._mainPort = mainPort;
    this._createServer = createServer;
    this._latestCache = latestCache;
    this._server = null;
  }

  start() {
    // メインプロセスとの接続を受ける準備
    this._server = this._createServer(this._mainPort);

    // メインプロセスからの接続受理時
    this._server.on('connection', (socket) => {
      console.log('[connector] main process connected');

      // メインプロセスからの要求には最新キャッシュを即時返却する
      socket.on(MAIN_REQUEST, () => {
        const item = this._latestCache.latest();

        // 最新キャッシュが空の場合はデータなしイベントを返却
        if (item === null) {
          socket.emit(MAIN_NO_DATA);
          return;
        }

        // 最新キャッシュがある場合はそのデータを返却
        socket.emit(MAIN_DATA, { data: item.data, updatedAt: item.updatedAt.toISOString() });
      });
    });

    console.log(`[connector] listening for main process on ${this._mainPort}`);
  }
}

module.exports = { MainRequestServer };
