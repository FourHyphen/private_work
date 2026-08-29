const { ConfigSaveFile } = require('./configSaveFile');

// 入力データを検証し、使用可能な形で格納する
class ConnectorConfig {
  constructor({ deviceUrl, mainPort, pollIntervalMs, saveFile }) {
    if (typeof deviceUrl !== 'string') {
      throw new TypeError('[connector] invalid config: deviceUrl must be a string');
    }

    if (!Number.isInteger(mainPort) || mainPort <= 0) {
      throw new TypeError('[connector] invalid config: mainPort must be a positive integer');
    }

    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new TypeError('[connector] invalid config: pollIntervalMs must be a positive integer');
    }

    // saveFile は省略可能
    this._saveFile = null;
    if (saveFile !== undefined && saveFile !== null) {
      if (typeof saveFile.dataFilePath !== 'string' || saveFile.dataFilePath === '') {
        throw new TypeError('[connector] invalid config: dataFilePath must be a non-empty string');
      }

      if (!Number.isInteger(saveFile.rotationKb) || saveFile.rotationKb <= 0) {
        throw new TypeError('[connector] invalid config: rotationKb must be a positive integer');
      }

      if (!Number.isInteger(saveFile.maxSaveFileNum) || saveFile.maxSaveFileNum <= 0) {
        throw new TypeError('[connector] invalid config: maxSaveFileNum must be a positive integer');
      }

      // saveFile に問題なければインスタンス化
      this._saveFile = new ConfigSaveFile(saveFile.dataFilePath, saveFile.rotationKb, saveFile.maxSaveFileNum);
      Object.freeze(this._saveFile);
    }

    this._deviceUrl = deviceUrl;
    this._mainPort = mainPort;
    this._pollIntervalMs = pollIntervalMs;

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

  get pollIntervalMs() {
    return this._pollIntervalMs;
  }

  get saveFile() {
    return this._saveFile;
  }
}

module.exports = { ConnectorConfig };
