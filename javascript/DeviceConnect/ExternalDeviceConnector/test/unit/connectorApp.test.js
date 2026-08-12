// ConnectorApp はソケットファクトリを注入できるため、モックフレームワーク不要
const { ConnectorApp } = require('../../connectorApp');
const { DEVICE_REQUEST, DEVICE_DATA, MAIN_REQUEST, MAIN_DATA } = require('../../events');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

const CONFIG = {
    deviceUrl: 'http://localhost:3001',
    mainPort: 4000
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

  it('指定した deviceUrl に接続する', () => {
    expect(fakeCreateExternalDeviceClient).toHaveBeenCalledWith(CONFIG.deviceUrl);
  });

  it('指定した mainPort を使用して Server を起動する', () => {
    expect(fakeCreateServer).toHaveBeenCalledWith(CONFIG.mainPort);
  });

  it('connect 時にポーリングを行わず DEVICE_REQUEST を送信しない', () => {
    // タイマーを進めても、connect だけでは外部デバイスへ取得要求しないことを確認する
    vi.useFakeTimers();    // タイマー処理偽造

    // connect イベントのコールバックが登録されていれば実行する
    const onConnect = getCallback(mockExternalDeviceConnection.on, 'connect');
    if (onConnect) onConnect();

    // タイマーを十分に進めても DEVICE_REQUEST が送信されないことを確認
    vi.advanceTimersByTime(5000);
    expect(mockExternalDeviceConnection.emit).not.toHaveBeenCalledWith(DEVICE_REQUEST);

    // 通常タイマーに戻す
    vi.useRealTimers();
  });

  it('MAIN_REQUEST 受信時に外部デバイスへ DEVICE_REQUEST を送信する', () => {
    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求を受け取ったときに外部デバイスへ取得要求する
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('DEVICE_DATA 受信時に最新データを MAIN_DATA で返す', () => {
    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求を契機に外部デバイスへ取得要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // 外部デバイスからデータを受信したら、そのデータをメインプロセスへ返す
    getCallback(mockExternalDeviceConnection.on, DEVICE_DATA)({ value: 42 });

    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA, { value: 42 });
  });

  it('外部デバイスのデータを内部に蓄積しない', () => {
    // DEVICE_DATA を複数回受信してもデータを蓄積しないことを確認
    const onData = getCallback(mockExternalDeviceConnection.on, DEVICE_DATA);
    onData({ value: 1 });
    onData({ value: 2 });

    expect(app.store).toBeUndefined();
  });
});
