// ConnectorApp はソケットファクトリを注入できるため、モックフレームワーク不要
const { ConnectorApp } = require('../../connectorApp');
const { DEVICE_REQUEST, DEVICE_DATA, MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA } = require('../../events');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

const CONFIG_WITHOUT_SAVE_FILE = {
  deviceUrl: 'http://localhost:3001',
  mainPort: 4000,
  pollIntervalMs: 500
};

const CONFIG_WITH_SAVE_FILE = {
  ...CONFIG_WITHOUT_SAVE_FILE,
  saveFile: {
    dataFilePath: '/path/to/file.jsonl',
    rotationKb: 1024,
    maxSaveFileNum: 5
  }
};

// トップ階層の describe 間で共有する状態と、その初期化/後始末処理
let app, mockExternalDeviceConnection, mockMainServer, fakeCreateExternalDeviceClient, fakeCreateServer;

function setupApp() {
  // 外部デバイスのモックを用意
  // 呼ばれたか、どんな引数で呼ばれたかを記録しつつ、実際には mockExternalDeviceConnection を返す Vitest のモック関数を定義
  // (vi -> Vitest のグローバルオブジェクト)
  mockExternalDeviceConnection = { on: vi.fn(), emit: vi.fn() };
  fakeCreateExternalDeviceClient = vi.fn(() => mockExternalDeviceConnection);

  // メインプロセスのモックを用意
  mockMainServer = { on: vi.fn() };
  fakeCreateServer = vi.fn(() => mockMainServer);

  // テスト用のダミーオブジェクトを作成して ConnectorApp を開始
  app = new ConnectorApp(CONFIG_WITHOUT_SAVE_FILE, {
    createExternalDeviceClient: fakeCreateExternalDeviceClient,
    createServer: fakeCreateServer,
  });
  app.start();
}

function teardownApp() {
  vi.useRealTimers();
  vi.restoreAllMocks();
}

describe('ConnectorApp: 初期化', () => {
  beforeEach(setupApp);
  afterEach(teardownApp);

  it('指定した deviceUrl に接続する', () => {
    expect(fakeCreateExternalDeviceClient).toHaveBeenCalledWith(CONFIG_WITHOUT_SAVE_FILE.deviceUrl);
  });

  it('指定した mainPort を使用して Server を起動する', () => {
    expect(fakeCreateServer).toHaveBeenCalledWith(CONFIG_WITHOUT_SAVE_FILE.mainPort);
  });
});

describe('ConnectorApp: デバイスポーリング制御', () => {
  beforeEach(setupApp);
  afterEach(teardownApp);

  it('connect 時にポーリングを開始し一定間隔で DEVICE_REQUEST を送信する', () => {
    vi.useFakeTimers();

    // connect イベントのコールバックでポーリングを開始する
    getCallback(mockExternalDeviceConnection.on, 'connect')();

    // pollIntervalMs 経過ごとに DEVICE_REQUEST が emit される
    vi.advanceTimersByTime(CONFIG_WITHOUT_SAVE_FILE.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);

    mockExternalDeviceConnection.emit.mockClear();    // 初回タイマ進行の履歴を空にして次のタイマ処理検証に影響しないようにする
    vi.advanceTimersByTime(CONFIG_WITHOUT_SAVE_FILE.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('disconnect 時にポーリングを停止し DEVICE_REQUEST を送信しなくなる', () => {
    vi.useFakeTimers();

    // 外部デバイスとの接続
    getCallback(mockExternalDeviceConnection.on, 'connect')();

    // 接続中はポーリングが動作することを確認する
    vi.advanceTimersByTime(CONFIG_WITHOUT_SAVE_FILE.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);

    // 外部デバイスとの接続解除
    getCallback(mockExternalDeviceConnection.on, 'disconnect')();

    // 切断後はタイマーを進めても送信されないことを確認する
    mockExternalDeviceConnection.emit.mockClear();
    vi.advanceTimersByTime(CONFIG_WITHOUT_SAVE_FILE.pollIntervalMs * 3);
    expect(mockExternalDeviceConnection.emit).not.toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('再接続（connect）時にポーリングを再開する', () => {
    vi.useFakeTimers();

    // 外部デバイスと接続してすぐ解除
    const onConnect = getCallback(mockExternalDeviceConnection.on, 'connect');
    const onDisconnect = getCallback(mockExternalDeviceConnection.on, 'disconnect');
    onConnect();
    onDisconnect();

    mockExternalDeviceConnection.emit.mockClear();

    // 再接続でポーリングが再度動作する
    onConnect();
    vi.advanceTimersByTime(CONFIG_WITHOUT_SAVE_FILE.pollIntervalMs);
    expect(mockExternalDeviceConnection.emit).toHaveBeenCalledWith(DEVICE_REQUEST);
  });

  it('連続 connect 後もポーリング周期あたりの DEVICE_REQUEST は1回に保たれる', () => {
    vi.useFakeTimers();

    // 外部デバイスとの接続が連続して呼ばれた場合を再現
    const onConnect = getCallback(mockExternalDeviceConnection.on, 'connect');
    onConnect();
    onConnect();

    // 1 間隔で DEVICE_REQUEST は 1 回だけ
    vi.advanceTimersByTime(CONFIG_WITHOUT_SAVE_FILE.pollIntervalMs);
    const deviceRequestCalls = mockExternalDeviceConnection.emit.mock.calls.filter(
      ([name]) => name === DEVICE_REQUEST
    );
    expect(deviceRequestCalls).toHaveLength(1);
  });
});

describe('ConnectorApp: メインプロセスへのデータ応答', () => {
  beforeEach(setupApp);
  afterEach(teardownApp);

  it('DEVICE_DATA 受信後の MAIN_REQUEST で { data, updatedAt } を返す', () => {
    // 外部デバイスからデータを受信してバッファへ格納する
    getCallback(mockExternalDeviceConnection.on, DEVICE_DATA)({ value: 42 });

    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // emit() 呼び出し履歴のうち最初の MAIN_DATA 呼び出し情報を取得
    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_DATA);
    expect(call).toBeDefined();

    // 配列ではなく単体オブジェクトであること
    const payload = call[1];
    expect(Array.isArray(payload)).toBe(false);
    expect(payload.data).toEqual({ value: 42 });

    // updatedAt は ISO8601 文字列であること
    expect(typeof payload.updatedAt).toBe('string');
    expect(new Date(payload.updatedAt).toISOString()).toBe(payload.updatedAt);
  });

  it('MAIN_REQUEST 受信時にバッファが空なら MAIN_NO_DATA を返す', () => {
    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // 起動直後を想定: DEVICE_DATA 未受信でメインプロセスからの要求が来た場合、MAIN_NO_DATA を返す
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_NO_DATA);
    expect(mockClientSocket.emit).not.toHaveBeenCalledWith(MAIN_DATA, expect.anything());
  });

  it('複数回 DEVICE_DATA を受信しても最新 1 件のみを返す', () => {
    // 外部デバイスから 2 回データ受信した状況を再現
    const onData = getCallback(mockExternalDeviceConnection.on, DEVICE_DATA);
    onData({ value: 1 });
    onData({ value: 2 });

    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // emit() 呼び出し履歴のうち最初の MAIN_DATA 呼び出し情報を取得
    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_DATA);
    expect(call[1].data).toEqual({ value: 2 });    // call[1] = emit() の第 2 引数 = 送信された payload
  });

  it('同一データに対する連続 MAIN_REQUEST で毎回 MAIN_DATA を返す', () => {
    // 外部デバイスから 1 回データ受信した状況を再現
    const onData = getCallback(mockExternalDeviceConnection.on, DEVICE_DATA);
    onData({ value: 1 });

    // メインプロセスとの接続環境を再現
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockMainServer.on, 'connection')(mockClientSocket);

    // メインプロセスからのデータ要求
    getCallback(mockClientSocket.on, MAIN_REQUEST)();

    // 外部デバイスデータありの応答が返ったことを確認
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA, expect.anything());

    mockClientSocket.emit.mockClear();
    // 2 回目のメインプロセスからのデータ要求でもデータを返す（MAIN_NO_DATA を返さない）
    getCallback(mockClientSocket.on, MAIN_REQUEST)();
    expect(mockClientSocket.emit).toHaveBeenCalledWith(MAIN_DATA, expect.anything());
  });
});

describe('ConnectorApp: ファイル保存設定なし', () => {
  afterEach(teardownApp);

  it('saveFile 未定義時はファイル書き込みを開始しない', () => {
    vi.useFakeTimers();

    const mockConn = { on: vi.fn(), emit: vi.fn() };
    const mockServer = { on: vi.fn() };
    const mockWriter = { writeBatch: vi.fn() };
    const fakeCreateDataWriter = vi.fn(() => mockWriter);

    // saveFile が未定義の ConnectorApp を作成
    const appNoFile = new ConnectorApp(CONFIG_WITHOUT_SAVE_FILE, {
      createExternalDeviceClient: vi.fn(() => mockConn),
      createServer: vi.fn(() => mockServer),
      createDataWriter: fakeCreateDataWriter,
    });
    appNoFile.start();

    // タイマを進めてもファイル作成処理が呼ばれないことを確認
    vi.advanceTimersByTime(2000);
    expect(fakeCreateDataWriter).not.toHaveBeenCalled();
    expect(mockWriter.writeBatch).not.toHaveBeenCalled();
  });
});

describe('ConnectorApp: 外部デバイスデータのファイル保存機能', () => {
  let appWithFile, mockConn, mockServer, mockWriter, fakeCreateDataWriter;

  // テスト毎に saveFile が設定された ConnectorApp を作成して start() する
  beforeEach(() => {
    vi.useFakeTimers();
    mockConn = { on: vi.fn(), emit: vi.fn() };
    mockServer = { on: vi.fn() };
    mockWriter = { writeBatch: vi.fn() };
    fakeCreateDataWriter = vi.fn(() => mockWriter);
    appWithFile = new ConnectorApp(CONFIG_WITH_SAVE_FILE, {
      createExternalDeviceClient: vi.fn(() => mockConn),
      createServer: vi.fn(() => mockServer),
      createDataWriter: fakeCreateDataWriter,
    });
    appWithFile.start();
  });

  // 各テスト終了時にタイマを戻してモックをリセット
  afterEach(teardownApp);

  it('config.saveFile がある場合、初回フラッシュで受信データを書き込む', () => {
    expect(fakeCreateDataWriter).toHaveBeenCalledWith(CONFIG_WITH_SAVE_FILE.saveFile);

    // 外部デバイスからデータ受信
    getCallback(mockConn.on, DEVICE_DATA)({ value: 42 });

    // フラッシュ前は writeBatch は呼ばれない
    expect(mockWriter.writeBatch).not.toHaveBeenCalled();

    // 初回フラッシュで writeBatch が呼ばれる
    vi.advanceTimersByTime(500);
    expect(mockWriter.writeBatch).toHaveBeenCalledOnce();

    // writeBatch() 呼び出し内容を確認する
    const written = mockWriter.writeBatch.mock.calls[0][0];
    expect(written).toHaveLength(1);
    expect(written[0].data).toEqual({ value: 42 });
    expect(written[0].updatedAt).toBeInstanceOf(Date);
  });

  it('writeBatch() が失敗してもエラーを処理し、受信データを保持する', () => {
    const error = new Error('write failed');
    mockWriter.writeBatch
      .mockImplementationOnce(() => { throw error; })
      .mockImplementationOnce(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCallback(mockConn.on, DEVICE_DATA)({ value: 42 });

    // フラッシュ失敗してもクラッシュしない
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('[connector] write failed:', error);
    expect(mockWriter.writeBatch).toHaveBeenCalledTimes(1);

    // 失敗したデータは消えずに次回再試行されることを確認する
    // (1) 初回フラッシュ試行データを取得
    const firstPayload = mockWriter.writeBatch.mock.calls[0][0];
    expect(firstPayload).toHaveLength(1);
    expect(firstPayload[0].data).toEqual({ value: 42 });

    // (2) タイマを進めて次のフラッシュを実行
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(mockWriter.writeBatch).toHaveBeenCalledTimes(2);

    // (3) 2 回目のフラッシュ試行データが初回と同じであることを確認する
    const secondPayload = mockWriter.writeBatch.mock.calls[1][0];
    expect(secondPayload).toEqual(firstPayload);
  });

  it('複数フラッシュサイクルで未保存データのみが writeBatch される', async () => {
    const onData = getCallback(mockConn.on, DEVICE_DATA);
    onData({ value: 1 });
    onData({ value: 2 });

    // 1 回目のフラッシュで 2 件まとめて書き込まれる
    await vi.advanceTimersByTimeAsync(500);    // タイマー処理で発生した Promise の継続処理も実行する
    expect(mockWriter.writeBatch).toHaveBeenCalledOnce();
    expect(mockWriter.writeBatch.mock.calls[0][0]).toHaveLength(2);

    // 2 回目のフラッシュでは pending がないため writeBatch は呼ばれない
    mockWriter.writeBatch.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(mockWriter.writeBatch).not.toHaveBeenCalled();

    // 新規データ追加後の 3 回目フラッシュの場合は 1 件のみ書き込まれる
    onData({ value: 3 });
    await vi.advanceTimersByTimeAsync(500);
    expect(mockWriter.writeBatch).toHaveBeenCalledOnce();
    expect(mockWriter.writeBatch.mock.calls[0][0]).toHaveLength(1);
    expect(mockWriter.writeBatch.mock.calls[0][0][0].data).toEqual({ value: 3 });
  });

  it('writeBatch() が完了するまで次のフラッシュをスキップし、完了後は保存済みデータを再送しない', async () => {
    // writeBatch の完了を手動制御できる Promise を用意
    let resolveWrite;
    mockWriter.writeBatch.mockImplementationOnce(
      () => new Promise(resolve => { resolveWrite = resolve; })
    );

    getCallback(mockConn.on, DEVICE_DATA)({ value: 1 });

    // 1 回目フラッシュを発火（writeBatch は未完了のまま pending）
    vi.advanceTimersByTime(500);
    expect(mockWriter.writeBatch).toHaveBeenCalledTimes(1);

    // writeBatch 未完了中に 2 回目フラッシュインターバルが来ても呼ばれない
    vi.advanceTimersByTime(500);
    expect(mockWriter.writeBatch).toHaveBeenCalledTimes(1);

    // writeBatch を完了させ、その後は pending データなし → 次フラッシュで呼ばれない
    resolveWrite();
    mockWriter.writeBatch.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(mockWriter.writeBatch).not.toHaveBeenCalled();
  });

  it('書き込み中に受信した新データは、MAIN_REQUEST へ即時反映され、書き込み完了後も欠落・重複なく再試行される', async () => {
    // writeBatch の完了を手動制御できる Promise を用意
    let resolveWrite;
    mockWriter.writeBatch.mockImplementationOnce(
      () => new Promise(resolve => { resolveWrite = resolve; })
    );

    getCallback(mockConn.on, DEVICE_DATA)({ value: 1 });

    // 1 回目フラッシュを発火（writeBatch は未完了のまま pending）
    vi.advanceTimersByTime(500);
    expect(mockWriter.writeBatch).toHaveBeenCalledTimes(1);

    // 書き込み中に新しいデータを受信する
    getCallback(mockConn.on, DEVICE_DATA)({ value: 2 });

    // 書き込み中でも MAIN_REQUEST には最新キャッシュ（value: 2）が即時反映される
    const mockClientSocket = { on: vi.fn(), emit: vi.fn() };
    getCallback(mockServer.on, 'connection')(mockClientSocket);
    getCallback(mockClientSocket.on, MAIN_REQUEST)();
    const call = mockClientSocket.emit.mock.calls.find(([name]) => name === MAIN_DATA);
    expect(call[1].data).toEqual({ value: 2 });

    // 進行中の書き込みを完了させる（開始時点の 1 件分のみ保存済みとして扱われる）
    resolveWrite();
    await Promise.resolve();

    // 次のフラッシュでは、書き込み中に追加された未保存データ（value: 2）だけが再送される
    mockWriter.writeBatch.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(mockWriter.writeBatch).toHaveBeenCalledOnce();
    const secondPayload = mockWriter.writeBatch.mock.calls[0][0];
    expect(secondPayload).toHaveLength(1);
    expect(secondPayload[0].data).toEqual({ value: 2 });
  });
});
