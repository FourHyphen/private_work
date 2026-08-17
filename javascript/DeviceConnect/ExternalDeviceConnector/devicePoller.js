// 外部デバイスへの取得要求を一定間隔で送信する
class DevicePoller {
  constructor(intervalMs) {
    this._intervalMs = intervalMs;
    this._timer = null;
  }

  // ポーリング開始。多重起動を避けるため既存タイマーをクリアしてから開始する
  start(emitFn) {
    this.stop();
    this._timer = setInterval(emitFn, this._intervalMs);
  }

  stop() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { DevicePoller };
