// 入力データを検証し、使用可能な形で格納する
class ConnectorConfig {
  constructor({ deviceUrl, mainPort }) {
    if (typeof deviceUrl !== 'string') {
      throw new TypeError('[connector] invalid config: deviceUrl must be a string');
    }

    if (!Number.isInteger(mainPort) || mainPort <= 0) {
      throw new TypeError('[connector] invalid config: mainPort must be a positive integer');
    }

    this._deviceUrl = deviceUrl;
    this._mainPort = mainPort;

    Object.freeze(this);
  }

  // コマンドライン引数を ConnectorConfig に変換する
  // 必要なものが揃っていなければ例外送出
  static fromArgv(argv = process.argv) {
    if (!Array.isArray(argv) || argv[2] === undefined) {
      throw new Error('[connector] config JSON argument is required');
    }

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(argv[2]);
    } catch {
      throw new Error('[connector] invalid config: argument is not valid JSON');
    }

    if (parsedConfig === null || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
      throw new TypeError('[connector] invalid config: config must be an object');
    }

    return new ConnectorConfig(parsedConfig);
  }

  get deviceUrl() {
    return this._deviceUrl;
  }

  get mainPort() {
    return this._mainPort;
  }
}

module.exports = { ConnectorConfig };
