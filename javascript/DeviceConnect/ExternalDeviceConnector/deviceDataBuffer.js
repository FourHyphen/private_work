const MAX_BUFFER_SIZE = 288_000;    // 最大件数: ポーリング間隔 100ms で 8時間分のデータ蓄積を想定

class DeviceDataBuffer {
  constructor() {
    this._queue = [];
  }

  // キューが最大件数を超える場合は最古のデータを削除（FIFO）してからキューに追加
  update(data) {
    if (this._queue.length >= MAX_BUFFER_SIZE) {
      this._queue.shift();
    }

    this._queue.push({ data, updatedAt: new Date() });
  }

  // キューが空なら null を返す、1件以上なら全件返してキューを空にする（drain）
  get() {
    if (this._queue.length === 0) {
      return null;
    }

    const items = this._queue;
    this._queue = [];
    return items;
  }

  get hasData() {
    return this._queue.length > 0;
  }
}

module.exports = { DeviceDataBuffer, MAX_BUFFER_SIZE };
