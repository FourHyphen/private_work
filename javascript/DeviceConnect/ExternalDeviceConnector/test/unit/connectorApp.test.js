// ConnectorApp はソケットファクトリを注入できるため、モックフレームワーク不要
const { ConnectorApp } = require('../../connectorApp');
const { DEVICE_REQUEST, DEVICE_DATA, MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA } = require('../../events');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

const CONFIG = {
    deviceUrl: 'http://localhost:3001',
    mainPort: 4000,
    pollIntervalMs: 500
};

// Vitest テスト群(vi -> Vitest のグローバルオブジェクト)
describe('ConnectorApp.start()', () => {
  let app, mockExternalDeviceConnection, mockMainServer, fakeCreateExternalDeviceClient, fakeCreateServer;

  // 各テスト実施前に実行される処理
  beforeEach(() => {
    // 外部デバイスのモックを用意
    // 呼ばれたか、どんな引数で呼ばれたかを記録しつつ、実際には mockDevice を返す Vitest のモック関数を fakeSocketClient として定義
    mockExternalDeviceConnection = { on: vi.fn(), emit: vi.fn() };
    fakeCreateExternalDeviceClient = vi.fn(() => mockExternalDeviceConnection);

    // メインプロセスのモックを用意
    mockMainServer = { on: vi.fn() };
    fakeCreateServer = vi.fn(() => mockMainServer);

    // テスト用のダミーオブジェクトを作成して ConnectorApp を開始
    app = new ConnectorApp(CONFIG, {
      createExternalDeviceClient: fakeCreateExternalDeviceClient,
      createServer: fakeCreateServer,
    });
    app.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('指定した deviceUrl に接続する', () => {
    expect(fakeCreateExternalDeviceClient).toHaveBeenCalledWith(CONFIG.deviceUrl);
  });

  it('指定した mainPort を使用して Server を起動する', () => {
    expect(fakeCreateServer).toHaveBeenCalledWith(CONFIG.mainPort);
  });

  it('connect 時にポーリングを開始し一定間隔で DEVICE_REQUEST を送信する', () => {
    vi.useFakeTimers();

    // connect イベントのコールバックでポーリングを開始する
    getCallback(mockExternalDeviceConnection.on, 'connect')();

    // pollIntervalMs 経過ごとに DEVICE_REQUEST が emit される
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);

    mockExternalDeviceConnection.emit.mockClear();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('DEVICE_DATA 受信時にバッファを更新する', () => {
    // 外部デバイスからデータを受信したらバッファへ格納する
    getCallback(mockExternalDeviceConnection.on, DEVICE_DATA)({ value: 42 });

    // メインプロセスとの接続環境を再現して要求する
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    expect(mockClientSocket.emit).toHaveBeenCalledWith(
      MAIN_DATA,
      expect.arrayContaining([expect.objectContaining({ data: { value: 42 } })])
    );
  });

  it('MAIN_REQUEST 受信時にバッファの値を { data, updatedAt } で返す', () => {
    // 外部デバイスからデータを受信してバッファへ格納する
    getCallback(mockExternalDeviceConnection.on, DEVICE_DATA)({ value: 42 });

    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_DATA);
    expect(call).toBeDefined();
    const payload = call[1];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].data).toEqual({ value: 42 });
    // updatedAt は ISO8601 文字列であること
    expect(typeof payload[0].updatedAt).toBe('string');
    expect(new Date(payload[0].updatedAt).toISOString()).toBe(payload[0].updatedAt);
  });

  it('MAIN_REQUEST 受信時にバッファが空なら MAIN_NO_DATA を返す', () => {
    // 起動直後を想定: DEVICE_DATA 未受信でメインプロセスが要求する
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_NO_DATA);
    expect(mockClientSocket.emit).not.toHaveBeenCalledWith(MAIN_DATA, expect.anything());
  });

  it('複数回 DEVICE_DATA を受信すると全件が蓄積されて返す', () => {
    // DEVICE_DATA を複数回受信したら全件が配列で返る
    const onData = getCallback(mockExternalDeviceConnection.on, DEVICE_DATA);
    onData({ value: 1 });
    onData({ value: 2 });

    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_DATA);
    expect(call[1]).toHaveLength(2);
    expect(call[1][0].data).toEqual({ value: 1 });
    expect(call[1][1].data).toEqual({ value: 2 });
  });

  it('MAIN_REQUEST 返却後はキューが空になる（drain）', () => {
    const onData = getCallback(mockExternalDeviceConnection.on, DEVICE_DATA);
    onData({ value: 1 });

    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    getCallback(mockClientSocket.on, MAIN_REQUEST)();
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA, expect.any(Array));

    mockClientSocket.emit.mockClear();
    getCallback(mockClientSocket.on, MAIN_REQUEST)();
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_NO_DATA);
  });

  it('disconnect 時にポーリングを停止し DEVICE_REQUEST を送信しなくなる', () => {
    vi.useFakeTimers();

    getCallback(mockExternalDeviceConnection.on, 'connect')();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);

    // 切断後はタイマーを進めても送信されない
    getCallback(mockExternalDeviceConnection.on, 'disconnect')();
    mockExternalDeviceConnection.emit.mockClear();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs * 3);
    expect(mockExternalDeviceConnection.emit).not.toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('再接続（connect）時にポーリングを再開する', () => {
    vi.useFakeTimers();

    const onConnect = getCallback(mockExternalDeviceConnection.on, 'connect');
    const onDisconnect = getCallback(mockExternalDeviceConnection.on, 'disconnect');

    onConnect();
    onDisconnect();
    mockExternalDeviceConnection.emit.mockClear();

    // 再接続でポーリングが再度動作する
    onConnect();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('connect が連続して呼ばれてもタイマーが多重化しない', () => {
    vi.useFakeTimers();

    const onConnect = getCallback(mockExternalDeviceConnection.on, 'connect');
    onConnect();
    onConnect();

    // 1 間隔で DEVICE_REQUEST は 1 回だけ
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    const deviceRequestCalls = mockExternalDeviceConnection.emit.mock.calls.filter(
      ([name]) => name === DEVICE_REQUEST
    );
    expect(deviceRequestCalls).toHaveLength(1);
  });
});
