class ConfigSaveFile {
  constructor(dataFilePath, rotationKb, maxSaveFileNum) {
    this._dataFilePath = dataFilePath;
    this._rotationKb = rotationKb;
    this._maxSaveFileNum = maxSaveFileNum;
    Object.freeze(this);
  }

  get dataFilePath() {
    return this._dataFilePath;
  }

  get rotationKb() {
    return this._rotationKb;
  }

  get maxSaveFileNum() {
    return this._maxSaveFileNum;
  }
}

module.exports = { ConfigSaveFile };
