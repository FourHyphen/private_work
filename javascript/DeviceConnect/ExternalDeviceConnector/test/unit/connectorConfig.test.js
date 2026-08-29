const { ConnectorConfig } = require('../../connectorConfig');

const VALID_WITHOUT_DATAFILEPATH = {
  deviceUrl: 'http://localhost:3001',
  mainPort: 4000,
  pollIntervalMs: 500
};

const VALID_WITH_DATAFILEPATH = {
  deviceUrl: 'http://localhost:3001',
  mainPort: 4000,
  pollIntervalMs: 500,
  saveFile: {
    dataFilePath: '/path/to/file.jsonl',
    rotationKb: 1024,
    maxSaveFileNum: 5
  }
};

describe('ConnectorConfig: 設定値を保持する', () => {
  it('有効な設定値を保持する', () => {
    const config = new ConnectorConfig(VALID_WITHOUT_DATAFILEPATH);
    expect(config.deviceUrl).toBe(VALID_WITHOUT_DATAFILEPATH.deviceUrl);
    expect(config.mainPort).toBe(VALID_WITHOUT_DATAFILEPATH.mainPort);
    expect(config.pollIntervalMs).toBe(VALID_WITHOUT_DATAFILEPATH.pollIntervalMs);
  });

  it('dataFilePath を省略した場合は saveFile を null として保持する', () => {
    const config = new ConnectorConfig(VALID_WITHOUT_DATAFILEPATH);
    expect(config.saveFile).toBeNull();
  });

  it('ファイル保存周りの指定値を保持する', () => {
    const config = new ConnectorConfig({ ...VALID_WITH_DATAFILEPATH });
    expect(config.saveFile.dataFilePath).toBe('/path/to/file.jsonl');
    expect(config.saveFile.rotationKb).toBe(1024);
    expect(config.saveFile.maxSaveFileNum).toBe(5);
  });
});

describe('ConnectorConfig: 設定値を検証する', () => {
  it.each([
    ['数値', 123],
    ['null', null]
  ])('deviceUrl が%sの場合は TypeError を送出する', (_, deviceUrl) => {
    expect(() => new ConnectorConfig({ ...VALID_WITHOUT_DATAFILEPATH, deviceUrl })).toThrow(TypeError);
  });

  it.each([
    ['0', 0],
    ['負の数', -1],
    ['小数', 3.5],
    ['文字列', '4000']
  ])('mainPort が%sの場合は TypeError を送出する', (_, mainPort) => {
    expect(() => new ConnectorConfig({ ...VALID_WITHOUT_DATAFILEPATH, mainPort })).toThrow(TypeError);
  });

  it.each([
    ['省略', undefined],
    ['0', 0],
    ['負の数', -1],
    ['小数', 3.5],
    ['文字列', '1000']
  ])('pollIntervalMs が%sの場合は TypeError を送出する', (_, pollIntervalMs) => {
    expect(() => new ConnectorConfig({ ...VALID_WITHOUT_DATAFILEPATH, pollIntervalMs })).toThrow(TypeError);
  });

  it('saveFile が空文字列の場合は TypeError を送出する', () => {
    expect(() => new ConnectorConfig({ ...VALID_WITHOUT_DATAFILEPATH,
                                     saveFile: '' }))
                                     .toThrow(TypeError);
  });

  it.each([
    ['省略', undefined],
    ['0', 0],
    ['負の数', -1],
    ['文字列', '1000']
  ])('saveFile が定義されていてかつ rotationKb が%sな場合は TypeError を送出する', (_, rotationKb) => {
    expect(() => new ConnectorConfig({ ...VALID_WITH_DATAFILEPATH, saveFile: { ...VALID_WITH_DATAFILEPATH.saveFile, rotationKb } })).toThrow(TypeError);
  });

  it.each([
    ['省略', undefined],
    ['0', 0],
    ['負の数', -1],
    ['文字列', '1000']
  ])('dataFilePath が定義されていてかつ maxSaveFileNum が%sな場合は TypeError を送出する', (_, maxSaveFileNum) => {
    expect(() => new ConnectorConfig({ ...VALID_WITH_DATAFILEPATH, saveFile: { ...VALID_WITH_DATAFILEPATH.saveFile, maxSaveFileNum } })).toThrow(TypeError);
  });
});

describe('ConnectorConfig: JSON 引数から設定を生成する', () => {
  const validWithoutDataFilePathJson = JSON.stringify(VALID_WITHOUT_DATAFILEPATH);
  const validWithDataFilePathJson = JSON.stringify(VALID_WITH_DATAFILEPATH);

  it('ファイル保存指定なしの場合の有効な JSON オブジェクトを変換する', () => {
    const config = ConnectorConfig.fromArgv(['node', 'main.js', validWithoutDataFilePathJson]);
    expect(config.deviceUrl).toBe(VALID_WITHOUT_DATAFILEPATH.deviceUrl);
    expect(config.mainPort).toBe(VALID_WITHOUT_DATAFILEPATH.mainPort);
    expect(config.pollIntervalMs).toBe(VALID_WITHOUT_DATAFILEPATH.pollIntervalMs);
  });

  it('ファイル保存指定ありの場合の有効な JSON オブジェクトを変換する', () => {
    const config = ConnectorConfig.fromArgv(['node', 'main.js', validWithDataFilePathJson]);
    expect(config.deviceUrl).toBe(VALID_WITH_DATAFILEPATH.deviceUrl);
    expect(config.mainPort).toBe(VALID_WITH_DATAFILEPATH.mainPort);
    expect(config.pollIntervalMs).toBe(VALID_WITH_DATAFILEPATH.pollIntervalMs);
    expect(config.saveFile.dataFilePath).toBe(VALID_WITH_DATAFILEPATH.saveFile.dataFilePath);
    expect(config.saveFile.rotationKb).toBe(VALID_WITH_DATAFILEPATH.saveFile.rotationKb);
    expect(config.saveFile.maxSaveFileNum).toBe(VALID_WITH_DATAFILEPATH.saveFile.maxSaveFileNum);
  });

  it('JSON 引数がない場合は Error を送出する', () => {
    // argv[2] が存在することを正とする
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js'])).toThrow(Error);
  });

  it('argv が配列でない場合は Error を送出する', () => {
    // argv が配列であることを正とする
    expect(() => ConnectorConfig.fromArgv(null)).toThrow(Error);
  });

  it('JSON として不正な場合は Error を送出する', () => {
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', 'not-json'])).toThrow(Error);
  });

  it.each([
    ['文字列', '"string"'],
    ['null', 'null'],
    ['配列', '[1,2,3]']
  ])('JSON が%sの場合は TypeError を送出する', (_, json) => {
    expect(() => ConnectorConfig.fromArgv(['node', 'main.js', json])).toThrow(TypeError);
  });
});
