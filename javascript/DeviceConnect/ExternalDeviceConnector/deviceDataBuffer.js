// 外部デバイスから受信した最新データを保持する
class DeviceDataBuffer {
  constructor() {
    this._data = null;
    this._updatedAt = null;
  }

  update(data) {
    this._data = data;
    this._updatedAt = new Date();
  }

  // 未受信時は null、受信済みなら { data, updatedAt(Date) } を返す
  get() {
    if (this._updatedAt === null) {
      return null;
    }
    return { data: this._data, updatedAt: this._updatedAt };
  }

  get hasData() {
    return this._updatedAt !== null;
  }
}

module.exports = { DeviceDataBuffer };
