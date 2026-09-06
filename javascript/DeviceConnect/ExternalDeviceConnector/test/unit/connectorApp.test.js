// ConnectorApp はソケットファクトリを注入できるため、モックフレームワーク不要
const { ConnectorApp } = require('../../connectorApp');
const { DEVICE_REQUEST, DEVICE_DATA, MAIN_REQUEST, MAIN_DATA, MAIN_NO_DATA } = require('../../events');

// mock.calls から指定イベント名のコールバックを取り出すヘルパー
function getCallback(mockFn, eventName) {
  const call = mockFn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

// listen() を即座に成功させるフェイク HTTP サーバー（MainRequestServer.start() が即解決する）
function createFakeHttpServer() {
  return {
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    listen: vi.fn((port, cb) => cb()),
  };
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
let app, mockExternalDeviceConnection, mockMainServer, fakeCreateExternalDeviceClient, fakeCreateHttpServer, fakeCreateSocketServer;

async function setupApp() {
  // 外部デバイスのモックを用意
  // 呼ばれたか、どんな引数で呼ばれたかを記録しつつ、実際には mockExternalDeviceConnection を返す Vitest のモック関数を定義
  // (vi -> Vitest のグローバルオブジェクト)
  mockExternalDeviceConnection = { on: vi.fn(), emit: vi.fn() };
  fakeCreateExternalDeviceClient = vi.fn(() => mockExternalDeviceConnection);

  // メインプロセスのモックを用意
  mockMainServer = { on: vi.fn() };
  fakeCreateHttpServer = vi.fn(() => createFakeHttpServer());
  fakeCreateSocketServer = vi.fn(() => mockMainServer);

  // テスト用のダミーオブジェクトを作成して ConnectorApp を開始
  app = new ConnectorApp(CONFIG_WITHOUT_SAVE_FILE, {
    createExternalDeviceClient: fakeCreateExternalDeviceClient,
    createHttpServer: fakeCreateHttpServer,
    createSocketServer: fakeCreateSocketServer,
  });
  await app.start();
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

  it('指定した mainPort で HTTP サーバーを起動する', () => {
    const fakeHttpServer = fakeCreateHttpServer.mock.results[0].value;
    expect(fakeHttpServer.listen).toHaveBeenCalledWith(CONFIG_WITHOUT_SAVE_FILE.mainPort, expect.any(Function));
    expect(fakeCreateSocketServer).toHaveBeenCalledWith(fakeHttpServer);
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
  // MAIN_NO_DATA・複数件受信時の挙動・連続リクエストの詳細は mainRequestServer.test.js / latestDeviceDataCache.test.js に移設
});

describe('ConnectorApp: メインプロセスとの通信用サーバー起動失敗', () => {
  afterEach(teardownApp);

  it('listener 起動失敗時は start() が reject し、外部デバイス接続や保存スケジューラーは開始しない', async () => {
    const failingHttpServer = {
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      listen: vi.fn(),
    };
    const fakeCreateExternalDeviceClientForFailure = vi.fn();
    const fakeCreateDataWriterForFailure = vi.fn();

    const appWithFailingServer = new ConnectorApp(CONFIG_WITH_SAVE_FILE, {
      createExternalDeviceClient: fakeCreateExternalDeviceClientForFailure,
      createHttpServer: vi.fn(() => failingHttpServer),
      createSocketServer: vi.fn(() => ({ on: vi.fn() })),
      createDataWriter: fakeCreateDataWriterForFailure,
    });

    // 前提: start() は Promise を返す
    const startPromise = appWithFailingServer.start();

    // 起動中に HTTP サーバーが listen 失敗によるエラー発火した状況を起こすための準備
    const onError = getCallback(failingHttpServer.once, 'error');
    onError(new Error('EADDRINUSE'));

    // Promise が reject される期待を設定し、reject 理由を対象とする検証ラッパーを変数に受け取る(ここでは何も検証していない)
    // expect(startPromise) -> startPromise を検証対象として Vitest に渡す
    const rejectedAssertion = expect(startPromise).rejects;

    // 検証ラッパーにマッチャーを適用することで、Error オブジェクトのプロパティを検証
    await rejectedAssertion.toMatchObject({ kind: 3 });

    // listen 失敗なら外部デバイス接続や保存スケジューラーは開始されていないことを確認
    expect(fakeCreateExternalDeviceClientForFailure).not.toHaveBeenCalled();
    expect(fakeCreateDataWriterForFailure).not.toHaveBeenCalled();
    expect(appWithFailingServer._deviceConnection).toBeNull();
    expect(appWithFailingServer._deviceDataSaveScheduler).toBeNull();
  });
});

describe('ConnectorApp: ファイル保存設定なし', () => {
  afterEach(teardownApp);

  it('saveFile 未定義時はファイル書き込みを開始しない', async () => {
    vi.useFakeTimers();

    const mockConn = { on: vi.fn(), emit: vi.fn() };
    const mockServer = { on: vi.fn() };
    const mockWriter = { writeBatch: vi.fn() };
    const fakeCreateDataWriter = vi.fn(() => mockWriter);

    // saveFile が未定義の ConnectorApp を作成
    const appNoFile = new ConnectorApp(CONFIG_WITHOUT_SAVE_FILE, {
      createExternalDeviceClient: vi.fn(() => mockConn),
      createHttpServer: vi.fn(() => createFakeHttpServer()),
      createSocketServer: vi.fn(() => mockServer),
      createDataWriter: fakeCreateDataWriter,
    });
    await appNoFile.start();

    // タイマを進めてもファイル作成処理が呼ばれないことを確認
    vi.advanceTimersByTime(2000);
    expect(fakeCreateDataWriter).not.toHaveBeenCalled();
    expect(mockWriter.writeBatch).not.toHaveBeenCalled();
  });
});

describe('ConnectorApp: 外部デバイスデータのファイル保存機能', () => {
  // 保存失敗時のリトライ・複数フラッシュサイクル・多重実行防止の詳細は deviceDataSaveScheduler.test.js を参照
  let appWithFile, mockConn, mockServer, mockWriter, fakeCreateDataWriter;

  // テスト毎に saveFile が設定された ConnectorApp を作成して start() する
  beforeEach(async () => {
    vi.useFakeTimers();
    mockConn = { on: vi.fn(), emit: vi.fn() };
    mockServer = { on: vi.fn() };
    mockWriter = { writeBatch: vi.fn() };
    fakeCreateDataWriter = vi.fn(() => mockWriter);
    appWithFile = new ConnectorApp(CONFIG_WITH_SAVE_FILE, {
      createExternalDeviceClient: vi.fn(() => mockConn),
      createHttpServer: vi.fn(() => createFakeHttpServer()),
      createSocketServer: vi.fn(() => mockServer),
      createDataWriter: fakeCreateDataWriter,
    });
    await appWithFile.start();
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
