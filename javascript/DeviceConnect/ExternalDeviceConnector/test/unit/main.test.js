const { main } = require('../../main');

// fromArgv の戻り値/例外をテストごとに差し替えられるフェイク ConnectorConfig
function createFakeConnectorConfig(configOrError) {
  return {
    fromArgv: vi.fn(() => {
      if (configOrError instanceof Error) {
        throw configOrError;
      }
      return configOrError;
    }),
  };
}

const FAKE_CONFIG = { mainPort: 4000 };

describe('main(): 起動通知', () => {
  let sendSpy, exitSpy;

  beforeEach(() => {
    sendSpy = vi.fn();
    exitSpy = vi.fn();
    process.send = sendSpy;
    process.exit = exitSpy;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.send;
    vi.restoreAllMocks();
  });

  it('ConnectorApp.start() が resolve するまで ready を送らない', async () => {
    // start() を意図的に未完了のままにするためのモックを作成
    let resolveStart;

    // startMock -> ConnectorApp.start() のモック
    // Promise の resolve 関数を resolveStart 変数に紐づけることで、resolveStart を実行することで resolve となる Promise を作る
    const startMock = vi.fn(() => new Promise((resolve) => { resolveStart = resolve; }));

    // createApp -> ConnectorApp のコンストラクタのモック
    const createApp = vi.fn(() => ({ start: startMock }));

    // 前提: main は async 定義。これで Promise を受け取る
    const mainPromise = main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    // start() が未解決の間はマイクロタスクを流しても ready を送らない
    await Promise.resolve();
    await Promise.resolve();
    expect(sendSpy).not.toHaveBeenCalled();

    // start() を resolve で解決
    resolveStart();
    await mainPromise;

    // ready が一度だけ送信されることを確認
    expect(sendSpy).toHaveBeenCalledWith({ type: 'ready' });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('argv 検証失敗時は startup-error を一度送ってコード 1 で終了する', async () => {
    // argv 検証失敗をシミュレート
    const createApp = vi.fn();
    const error = new Error('invalid config');
    error.kind = 1;

    await main({ connectorConfig: createFakeConnectorConfig(error), createApp });

    // argv 検証失敗時のメッセージ確認
    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 1, reason: 'invalid config' });

    // 終了コードを確認
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('起動失敗時は ready を送らず、startup-error を一度送ってコード 3 で終了する', async () => {
    // 起動失敗（ポート使用中）をシミュレート
    const error = new Error('port in use');
    error.kind = 3;
    const createApp = vi.fn(() => ({ start: vi.fn(() => Promise.reject(error)) }));

    await main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    // ready を送信しない
    expect(sendSpy).not.toHaveBeenCalledWith({ type: 'ready' });

    // ポート使用中を一度のみ送信
    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 3, reason: 'port in use' });
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // 終了コードの確認
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('保存先ディレクトリ作成失敗時は ready を送らず、startup-error を一度送ってコード 2 で終了する', async () => {
    // start() を即時 reject で失敗させる
    const error = new Error('Failed to create save directory');
    error.kind = 2;    // 保存先ディレクトリ作成失敗
    const createApp = vi.fn(() => ({ start: vi.fn(() => Promise.reject(error)) }));

    await main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    // ready が送信されていない
    expect(sendSpy).not.toHaveBeenCalledWith({ type: 'ready' });

    // 保存先ディレクトリ作成失敗を一度のみ送信
    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 2, reason: 'Failed to create save directory' });
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // 終了コードの確認
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('kind を持たないエラーはコード 99 にフォールバックする', async () => {
    // start() を即時 reject で失敗させる
    const createApp = vi.fn(() => ({ start: vi.fn(() => Promise.reject(new Error('unexpected'))) }));

    await main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    // start() が reject すなわち失敗時の挙動を確認
    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 99, reason: 'unexpected' });
    expect(exitSpy).toHaveBeenCalledWith(99);
  });

  it('実行中に書き込みハングエラーが発生した場合は save-write-hang を送信してコード 4 で終了する', async () => {
    const hangError = new Error('Save file write hang detected');
    hangError.kind = 4;
    hangError.type = 'save-write-hang';

    const createApp = vi.fn(() => ({
      start: vi.fn().mockResolvedValue(undefined),             // 起動は正常成功とする
      waitUntilFatal: vi.fn().mockRejectedValue(hangError),    // waitUntilFatal を即時 reject で確定させる
    }));

    await main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    // 正常起動時の ready メッセージを確認
    expect(sendSpy).toHaveBeenCalledWith({ type: 'ready' });

    // 書き込みハングエラー発生時の挙動を確認
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'save-write-hang',
      kind: 4,
      reason: 'Save file write hang detected',
    });
    expect(exitSpy).toHaveBeenCalledWith(4);
  });
});
