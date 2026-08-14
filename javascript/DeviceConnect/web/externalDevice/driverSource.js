// 既存ドライバを Connector 経路のインタフェースと合わせるためのラッパークラス
class DriverSource {
  constructor(driver, { intervalMs = 100 } = {}) {
    this._driver = driver;
    this._intervalMs = intervalMs;
    this._timer = null;
  }

  async start(onSamples, onError = console.error) {
    await this._driver.connect();
    this._timer = setInterval(async () => {
      try {
        const sample = await this._driver.readStatus();
        onSamples([sample]);    // 1 件でも配列で渡し、バッチ経路と口を揃える
      } catch (err) {
        onError(err);
      }
    }, this._intervalMs);
  }

  async stop() {
    clearInterval(this._timer);
    this._timer = null;
    await this._driver.disconnect();
  }
}

module.exports = DriverSource;
