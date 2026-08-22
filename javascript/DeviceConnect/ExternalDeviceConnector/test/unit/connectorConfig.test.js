const { ConnectorConfig } = require('../../connectorConfig');

const VALID = {
  deviceUrl: 'http://localhost:3001',
  mainPort: 4000,
  pollIntervalMs: 500
};

describe('ConnectorConfig コンストラクタ', () => {
  it('有効な値を受け取った場合は変更不能な状態になっているインスタンスを生成する', () => {
    const config = new ConnectorConfig(VALID);
    expect(config.deviceUrl).toBe('http://localhost:3001');
    expect(config.mainPort).toBe(4000);
    expect(config.pollIntervalMs).toBe(500);
    expect(config.dataFilePath).toBeNull();
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('dataFilePath を省略した場合は null として保持する', () => {
    const config = new ConnectorConfig(VALID);
    expect(config.dataFilePath).toBeNull();
  });

  it('dataFilePath に有効な文字列を渡した場合はその値を保持する', () => {
    const config = new ConnectorConfig({ ...VALID, dataFilePath: '/path/to/file.jsonl' });
    expect(config.dataFilePath).toBe('/path/to/file.jsonl');
  });

  it('dataFilePath が空文字列の場合は TypeError を送出する', () => {
    expect(() => new ConnectorConfig({ ...VALID, dataFilePath: '' })).toThrow(TypeError);
  });

  it('deviceUrl が文字列でなければ TypeError を送出する', () => {
    expect(() => new ConnectorConfig({ ...VALID, deviceUrl: 123 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, deviceUrl: null })).toThrow(TypeError);
  });

  it('mainPort が正の整数でなければ TypeError を送出する', () => {
    expect(() => new ConnectorConfig({ ...VALID, mainPort: 0 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, mainPort: -1 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, mainPort: 3.5 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, mainPort: '4000' })).toThrow(TypeError);
  });

  it('pollIntervalMs を省略した場合は TypeError を送出する', () => {
    const { pollIntervalMs, ...withoutPoll } = VALID;
    expect(() => new ConnectorConfig(withoutPoll)).toThrow(TypeError);
  });

  it('pollIntervalMs が正の整数でなければ TypeError を送出する', () => {
    expect(() => new ConnectorConfig({ ...VALID, pollIntervalMs: 0 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, pollIntervalMs: -1 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, pollIntervalMs: 3.5 })).toThrow(TypeError);
    expect(() => new ConnectorConfig({ ...VALID, pollIntervalMs: '1000' })).toThrow(TypeError);
  });

  it('有効な pollIntervalMs を渡した場合はその値を保持する', () => {
    const config = new ConnectorConfig({ ...VALID, pollIntervalMs: 500 });
    expect(config.pollIntervalMs).toBe(500);
  });

});

describe('ConnectorConfig.fromArgv', () => {
  const validJson = JSON.stringify(VALID);

  it('有効な JSON 引数からインスタンスを生成する', () => {
    const config = ConnectorConfig.fromArgv(['node', 'main.js', validJson]);
    expect(config.deviceUrl).toBe(VALID.deviceUrl);
    expect(config.mainPort).toBe(VALID.mainPort);
  });

  it('引数が不足していれば Error を送出する', () => {
    // argv[2] が存在することを正とする
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js'])).toThrow(
      '[connector] config JSON argument is required'
    );
  });

  it('入力が不正なら Error を送出する', () => {
    // argv が配列であることを正とする
    expect(() => ConnectorConfig.fromArgv(null)).toThrow(
      '[connector] config JSON argument is required'
    );
  });

  it('引数が JSON 構文でないなら Error を送出する', () => {
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', 'not-json'])).toThrow(
      '[connector] invalid config: argument is not valid JSON'
    );
  });

  it('引数が JSON オブジェクトでない場合 TypeError を送出する', () => {
    // JSON 構文であるかのバリデーションとテストを分けておくことでどの段階で壊れたかを区別しやすくする
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', '"string"'])).toThrow(TypeError);
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', 'null'])).toThrow(TypeError);
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', '[1,2,3]'])).toThrow(TypeError);
  });
});
