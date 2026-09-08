const { MainRequestServer } = require('../../mainRequestServer');
const { MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA, MAIN_DATA_OVERSIZED } = require('../../events');
const { LatestDeviceDataCache } = require('../../latestDeviceDataCache');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

// listen callback と error イベントを任意の順序で発火できるフェイク HTTP サーバー
function createFakeHttpServer() {
  return {
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    listen: vi.fn(),
  };
}

const MAIN_PORT = 4000;

describe('MainRequestServer: 初期化', () => {
  it('error 発火時は start() が kind: 3 のエラーで reject する', async () => {
    const fakeHttpServer = createFakeHttpServer();
    const latestCache = new LatestDeviceDataCache();
    const server = new MainRequestServer(
      MAIN_PORT,
      { createHttpServer: vi.fn(() => fakeHttpServer), createSocketServer: vi.fn(() => ({ on: vi.fn() })) },
      latestCache
    );

    const startPromise = server.start();
    const onError = getCallback(fakeHttpServer.once, 'error');
    onError(new Error('EADDRINUSE'));

    await expect(startPromise).rejects.toMatchObject({ kind: 3 });
  });
});

describe('MainRequestServer: メインプロセスへのデータ応答', () => {
  // listen 成功済みの MainRequestServer を作る（connection ハンドラー登録は listen 前に完了している）
  function startServer(latestCache) {
    const fakeHttpServer = createFakeHttpServer();
    const mockSocketServer = { on: vi.fn() };
    const server = new MainRequestServer(
      MAIN_PORT,
      { createHttpServer: vi.fn(() => fakeHttpServer), createSocketServer: vi.fn(() => mockSocketServer) },
      latestCache
    );
    server.start();
    return { mockSocketServer, server };
  }

  it('キャッシュにデータがある場合は MAIN_DATA で { data, updatedAt } を返す', () => {
    const latestCache = new LatestDeviceDataCache();

    // キャッシュにデータを格納
    latestCache.update({ value: 42 });

    const { mockSocketServer, server } = startServer(latestCache);

    // メインプロセスとの接続を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockSocketServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // emit() 呼び出し履歴のうち MAIN_DATA 呼び出し情報を取得
    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_DATA);
    expect(call).toBeDefined();

    // データペイロードを検証
    const payload = call[1];
    expect(Array.isArray(payload)).toBe(false);
    expect(payload.data).toEqual({ value: 42 });

    // updatedAt は ISO8601 文字列であること
    expect(typeof payload.updatedAt).toBe('string');
    expect(new Date(payload.updatedAt).toISOString()).toBe(payload.updatedAt);
  });

  it('キャッシュが空の場合は MAIN_NO_DATA を返す', () => {
    const latestCache = new LatestDeviceDataCache();

    const { mockSocketServer, server } = startServer(latestCache);

    // メインプロセスとの接続を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockSocketServer.on, 'connection')(mockClientSocket);

    // 起動直後を想定: DEVICE_DATA 未受信でメインプロセスからの要求が来た場合、MAIN_NO_DATA を返す
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // emit() 呼び出し履歴のうち MAIN_NO_DATA 呼び出し情報を取得
    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_NO_DATA);
    expect(call).toBeDefined();
  });

  it('同一データに対する連続 MAIN_REQUEST で毎回 MAIN_DATA を返す', () => {
    const latestCache = new LatestDeviceDataCache();

    // 外部デバイスから 1 回データ受信した状況を再現
    latestCache.update({ value: 1 });

    const { mockSocketServer, server } = startServer(latestCache);

    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockSocketServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // 外部デバイスデータありの応答が返ったことを確認
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA, expect.anything());

    mockClientSocket.emit.mockClear();
    // 2 回目のメインプロセスからのデータ要求でもデータを返す（MAIN_NO_DATA を返さない）
    getCallback(mockClientSocket.on, MAIN_REQUEST)();
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA, expect.anything());
  });

  it('直近受信が超過の場合はキャッシュの最新値とともに MAIN_DATA_OVERSIZED を返す', () => {
    // 正常データ受信したキャッシュを用意
    const latestCache = new LatestDeviceDataCache();
    latestCache.update({ value: 42 });

    // listen 成功済みの MainRequestServer
    const { mockSocketServer, server } = startServer(latestCache);

    // メインプロセスとの接続を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockSocketServer.on, 'connection')(mockClientSocket);

    // 直近受信データがサイズ超過だったと設定
    server.markDataOversized();

    // メインプロセスからのデータ要求
    const serverRequestCallback = getCallback(mockClientSocket.on, MAIN_REQUEST);
    serverRequestCallback();

    // 直近受信データがサイズ超過のため、oversized フラグ付きでキャッシュ内正常受信データを返すことを確認
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA_OVERSIZED, {
      data: { value: 42 },
      updatedAt: expect.any(String)
    });
  });
});
