// ExternalDeviceConnection のテスト
const { ExternalDeviceConnection } = require('../../externalDeviceConnection');
const { DEVICE_REQUEST, DEVICE_DATA } = require('../../events');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

const CONFIG = {
  deviceUrl: 'http://localhost:3001',
  pollIntervalMs: 500
};

let connection, mockExternalDeviceClient, fakeCreateExternalDeviceClient;

function setupConnection() {
  // 外部デバイスのモックを用意
  mockExternalDeviceClient = { on: vi.fn(), emit: vi.fn() };
  fakeCreateExternalDeviceClient = vi.fn(() => mockExternalDeviceClient);

  // ExternalDeviceConnection を生成して開始
  connection = new ExternalDeviceConnection(CONFIG, {
    createExternalDeviceClient: fakeCreateExternalDeviceClient,
  });
  connection.start();
}

function teardownConnection() {
  vi.useRealTimers();
  vi.restoreAllMocks();
}

describe('ExternalDeviceConnection: 初期化', () => {
  beforeEach(setupConnection);
  afterEach(teardownConnection);

  it('指定した deviceUrl に接続する', () => {
    expect(fakeCreateExternalDeviceClient).toHaveBeenCalledWith(CONFIG.deviceUrl);
  });

  it('接続されたクライアントに connect/disconnect/DEVICE_DATA のリスナーを登録する', () => {
    expect(mockExternalDeviceClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockExternalDeviceClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockExternalDeviceClient.on).toHaveBeenCalledWith(DEVICE_DATA, expect.any(Function));
  });
});

describe('ExternalDeviceConnection: デバイス接続制御', () => {
  beforeEach(setupConnection);
  afterEach(teardownConnection);

  it('connect 時にポーリングを開始し一定間隔で DEVICE_REQUEST を送信する', () => {
    vi.useFakeTimers();

    // connect イベントのコールバックを実行
    getCallback(mockExternalDeviceClient.on, 'connect')();

    // pollIntervalMs 経過ごとに DEVICE_REQUEST が emit される
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceClient.emit).toHaveBeenCalledWith(DEVICE_REQUEST);

    mockExternalDeviceClient.emit.mockClear();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceClient.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('disconnect 時にポーリングを停止し DEVICE_REQUEST を送信しなくなる', () => {
    vi.useFakeTimers();

    // 外部デバイスと接続
    getCallback(mockExternalDeviceClient.on, 'connect')();

    // 接続中はポーリングが動作することを確認
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceClient.emit).toHaveBeenCalledWith(DEVICE_REQUEST);

    // 外部デバイスとの接続解除
    getCallback(mockExternalDeviceClient.on, 'disconnect')();

    // 切断後はタイマーを進めてもポーリングの emit がない
    mockExternalDeviceClient.emit.mockClear();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs * 3);
    expect(mockExternalDeviceClient.emit).not.toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('再接続（connect）時にポーリングを再開する', () => {
    vi.useFakeTimers();

    const onConnect = getCallback(mockExternalDeviceClient.on, 'connect');
    const onDisconnect = getCallback(mockExternalDeviceClient.on, 'disconnect');

    // 最初の接続と切断
    onConnect();
    onDisconnect();

    mockExternalDeviceClient.emit.mockClear();

    // 再接続でポーリングが再度動作
    onConnect();
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    expect(mockExternalDeviceClient.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('連続 connect 後もポーリング周期あたりの DEVICE_REQUEST は1回に保たれる', () => {
    vi.useFakeTimers();

    const onConnect = getCallback(mockExternalDeviceClient.on, 'connect');

    // 外部デバイスとの接続が連続して呼ばれた場合を再現
    onConnect();
    onConnect();

    // 1 間隔で DEVICE_REQUEST は 1 回だけ
    vi.advanceTimersByTime(CONFIG.pollIntervalMs);
    const deviceRequestCalls = mockExternalDeviceClient.emit.mock.calls.filter(
      ([name]) => name === DEVICE_REQUEST
    );
    expect(deviceRequestCalls).toHaveLength(1);
  });
});

describe('ExternalDeviceConnection: データ受信通知', () => {
  beforeEach(setupConnection);
  afterEach(teardownConnection);

  it('DEVICE_DATA 受信時に onData で登録されたコールバックが呼ばれる', () => {
    const mockCallback = vi.fn();
    connection.onData(mockCallback);

    // DEVICE_DATA イベントのコールバックを実行
    const onData = getCallback(mockExternalDeviceClient.on, DEVICE_DATA);
    const testData = { value: 42 };
    onData(testData);

    // 登録されたコールバックが呼ばれていることを確認
    expect(mockCallback).toHaveBeenCalledWith(testData);
  });

  it('複数回 DEVICE_DATA を受信するたびにコールバックが呼ばれる', () => {
    const mockCallback = vi.fn();
    connection.onData(mockCallback);

    const onData = getCallback(mockExternalDeviceClient.on, DEVICE_DATA);

    // 複数回データを受信
    onData({ value: 1 });
    onData({ value: 2 });
    onData({ value: 3 });

    // コールバックが毎回呼ばれている
    expect(mockCallback).toHaveBeenCalledTimes(3);
    expect(mockCallback).toHaveBeenNthCalledWith(1, { value: 1 });
    expect(mockCallback).toHaveBeenNthCalledWith(2, { value: 2 });
    expect(mockCallback).toHaveBeenNthCalledWith(3, { value: 3 });
  });

  it('onData コールバック未設定時は DEVICE_DATA 受信時に例外が発生しない', () => {
    // onData を呼び出していない（コールバック未設定）
    const onData = getCallback(mockExternalDeviceClient.on, DEVICE_DATA);

    // 例外が発生しないことを確認
    expect(() => {
      onData({ value: 42 });
    }).not.toThrow();
  });
});
