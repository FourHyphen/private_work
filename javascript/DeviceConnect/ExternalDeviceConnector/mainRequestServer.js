const http = require('http');
const { Server } = require('socket.io');
const {
  MAIN_REQUEST,
  MAIN_DATA,
  MAIN_NO_DATA,
  MAIN_DATA_OVERSIZED
} = require('./events');

// メインプロセスとの接続を管理する
class MainRequestServer {
  // latestCache: LatestDeviceDataCache のインスタンス
  // options:
  //   - createHttpServer: () => http.Server のファクトリ関数（テスト時にフェイク注入可能）
  //   - createSocketServer: (httpServer) => Server のファクトリ関数（テスト時にフェイク注入可能）
  constructor(
    mainPort,
    {
      createHttpServer = () => http.createServer(),
      createSocketServer = (httpServer) => new Server(httpServer),
    } = {},
    latestCache
  ) {
    this._mainPort = mainPort;
    this._createHttpServer = createHttpServer;
    this._createSocketServer = createSocketServer;
    this._latestCache = latestCache;
    this._httpServer = null;
    this._server = null;
    this._latestReceiveStatus = 'none';    // TODO: status の ENUM 化
  }

  // return: 以下を設定した Promise
  //   resolve: mainPort の listen に成功した時点
  //   reject : bind/listen 失敗が確定
  start() {
    this._httpServer = this._createHttpServer();
    this._server = this._createSocketServer(this._httpServer);

    // メインプロセスからの接続受理時
    this._server.on('connection', (socket) => {
      console.log('[connector] main process connected');

      // メインプロセスからの要求には最新キャッシュを即時返却する
      socket.on(MAIN_REQUEST, () => {
        const item = this._latestCache.latest();

        // 一度も正常データを受信したことがない場合はデータなしイベントを返却
        if (this._latestReceiveStatus === 'none' && item === null) {
          socket.emit(MAIN_NO_DATA);
          return;
        }

        if (this._latestReceiveStatus === 'oversized') {
          socket.emit(MAIN_DATA_OVERSIZED, {
            data: item ? item.data : null,
            updatedAt: item ? item.updatedAt.toISOString() : null
          });
          return;
        }

        // 最新キャッシュがある場合はそのデータを返却
        socket.emit(MAIN_DATA, { data: item.data, updatedAt: item.updatedAt.toISOString() });
      });
    });

    return this._listen();
  }

  _listen() {
    return new Promise((resolve, reject) => {
      // listen の成否いずれか先に発生した方だけで完了させるためのフラグ
      let settled = false;

      const onError = (error) => {
        // すでに listen 成功して resolve していた場合は何もしない
        if (settled) {
          return;
        }
        settled = true;

        this._httpServer.off('error', onError);

        // 呼び出し元(main.js)が終了コードとしてそのまま使えるよう kind を付与する
        const startupError = new Error(
          `[connector] failed to listen for main process on ${this._mainPort}: ${error.message}`
        );
        startupError.kind = 3;
        startupError.cause = error;

        reject(startupError);
      };

      // listen 中のエラー発生を一度だけ拾う
      this._httpServer.once('error', onError);

      try {
        this._httpServer.listen(this._mainPort, () => {
          if (settled) {
            return;
          }
          settled = true;

          // 接続成功したらエラー発生を拾う必要なし
          this._httpServer.off('error', onError);
          console.log(`[connector] listening for main process on ${this._mainPort}`);

          resolve();
        });
      } catch (error) {
        onError(error);
      }
    });
  }

  markDataReceived() {
    this._latestReceiveStatus = 'normal';
  }

  markDataOversized() {
    this._latestReceiveStatus = 'oversized';
  }
}

module.exports = { MainRequestServer };
