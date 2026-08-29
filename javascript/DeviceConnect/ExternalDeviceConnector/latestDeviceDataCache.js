class LatestDeviceDataCache {
  constructor() {
    this._latest = null;
  }

  // 最新項目を上書きする
  update(data) {
    this._latest = { data, updatedAt: new Date() };
  }

  // 最新項目、まだ受信していなければ null を返す
  latest() {
    return this._latest;
  }
}

module.exports = { LatestDeviceDataCache };
