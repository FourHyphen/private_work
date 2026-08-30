const { MainRequestServer } = require('../../mainRequestServer');
const { MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA } = require('../../events');
const { LatestDeviceDataCache } = require('../../latestDeviceDataCache');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

const MAIN_PORT = 4000;

describe('MainRequestServer: 初期化', () => {
  it('指定した mainPort を使用して Server を起動する', () => {
    const mockServer = { on: vi.fn() };
    const fakeCreateServer = vi.fn(() => mockServer);
    const latestCache = new LatestDeviceDataCache();
    const server = new MainRequestServer(MAIN_PORT, { createServer: fakeCreateServer }, latestCache);

    server.start();

    expect(fakeCreateServer).toHaveBeenCalledWith(MAIN_PORT);
  });
});

describe('MainRequestServer: メインプロセスへのデータ応答', () => {
  it('キャッシュにデータがある場合は MAIN_DATA で { data, updatedAt } を返す', () => {
    const mockServer = { on: vi.fn() };
    const fakeCreateServer = vi.fn(() => mockServer);
    const latestCache = new LatestDeviceDataCache();

    // キャッシュにデータを格納
    latestCache.update({ value: 42 });

    const server = new MainRequestServer(MAIN_PORT, { createServer: fakeCreateServer }, latestCache);
    server.start();

    // メインプロセスとの接続を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockServer.on, 'connection')(mockClientSocket);

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
    const mockServer = { on: vi.fn() };
    const fakeCreateServer = vi.fn(() => mockServer);
    const latestCache = new LatestDeviceDataCache();

    const server = new MainRequestServer(MAIN_PORT, { createServer: fakeCreateServer }, latestCache);
    server.start();

    // メインプロセスとの接続を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // emit() 呼び出し履歴のうち MAIN_NO_DATA 呼び出し情報を取得
    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_NO_DATA);
    expect(call).toBeDefined();
  });
});
