const { ConnectorConfig } = require('../../connectorConfig');

const VALID = {
  deviceUrl: 'http://localhost:3001',
  mainPort: 4000,
  pollIntervalMs: 500
};

describe('ConnectorConfig: 設定値を保持する', () => {
  it('有効な設定値を保持する', () => {
    const config = new ConnectorConfig(VALID);
    expect(config.deviceUrl).toBe(VALID.deviceUrl);
    expect(config.mainPort).toBe(VALID.mainPort);
    expect(config.pollIntervalMs).toBe(VALID.pollIntervalMs);
  });

  it('dataFilePath を省略した場合は null として保持する', () => {
    const config = new ConnectorConfig(VALID);
    expect(config.dataFilePath).toBeNull();
  });

  it('dataFilePath の指定値を保持する', () => {
    const config = new ConnectorConfig({ ...VALID, dataFilePath: '/path/to/file.jsonl' });
    expect(config.dataFilePath).toBe('/path/to/file.jsonl');
  });
});

describe('ConnectorConfig: 設定値を検証する', () => {
  it.each([
    ['数値', 123],
    ['null', null]
  ])('deviceUrl が%sの場合は TypeError を送出する', (_, deviceUrl) => {
    expect(() => new ConnectorConfig({ ...VALID, deviceUrl })).toThrow(TypeError);
  });

  it.each([
    ['0', 0],
    ['負の数', -1],
    ['小数', 3.5],
    ['文字列', '4000']
  ])('mainPort が%sの場合は TypeError を送出する', (_, mainPort) => {
    expect(() => new ConnectorConfig({ ...VALID, mainPort })).toThrow(TypeError);
  });

  it.each([
    ['省略', undefined],
    ['0', 0],
    ['負の数', -1],
    ['小数', 3.5],
    ['文字列', '1000']
  ])('pollIntervalMs が%sの場合は TypeError を送出する', (_, pollIntervalMs) => {
    expect(() => new ConnectorConfig({ ...VALID, pollIntervalMs })).toThrow(TypeError);
  });

  it('dataFilePath が空文字列の場合は TypeError を送出する', () => {
    expect(() => new ConnectorConfig({ ...VALID, dataFilePath: '' })).toThrow(TypeError);
  });
});

describe('ConnectorConfig: JSON 引数から設定を生成する', () => {
  const validJson = JSON.stringify(VALID);

  it('有効な JSON オブジェクトを変換する', () => {
    const config = ConnectorConfig.fromArgv(['node', 'main.js', validJson]);
    expect(config.deviceUrl).toBe(VALID.deviceUrl);
    expect(config.mainPort).toBe(VALID.mainPort);
    expect(config.pollIntervalMs).toBe(VALID.pollIntervalMs);
  });

  it('JSON 引数がない場合は Error を送出する', () => {
    // argv[2] が存在することを正とする
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js'])).toThrow(TypeError);
  });

  it('argv が配列でない場合は Error を送出する', () => {
    // argv が配列であることを正とする
    expect(() => ConnectorConfig.fromArgv(null)).toThrow(TypeError);
  });

  it('JSON として不正な場合は Error を送出する', () => {
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', 'not-json'])).toThrow(TypeError);
  });

  it.each([
    ['文字列', '"string"'],
    ['null', 'null'],
    ['配列', '[1,2,3]']
  ])('JSON が%sの場合は TypeError を送出する', (_, json) => {
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', json])).toThrow(TypeError);
  });
});
