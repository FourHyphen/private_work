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

  it('起動失敗時は ready を送らず、startup-error を一度送ってコード 3 で終了する', async () => {
    const error = new Error('port in use');
    error.kind = 3;
    const createApp = vi.fn(() => ({ start: vi.fn(() => Promise.reject(error)) }));

    await main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    expect(sendSpy).not.toHaveBeenCalledWith({ type: 'ready' });
    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 3, reason: 'port in use' });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('argv 検証失敗時は startup-error とコード 1 を維持する', async () => {
    const createApp = vi.fn();

    await main({ connectorConfig: createFakeConnectorConfig(new Error('invalid config')), createApp });

    expect(createApp).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 1, reason: 'invalid config' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('kind を持たないエラーはコード 1 にフォールバックする', async () => {
    const createApp = vi.fn(() => ({ start: vi.fn(() => Promise.reject(new Error('unexpected'))) }));

    await main({ connectorConfig: createFakeConnectorConfig(FAKE_CONFIG), createApp });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'startup-error', kind: 1, reason: 'unexpected' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
