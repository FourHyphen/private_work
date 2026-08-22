const MAX_BUFFER_SIZE = 288_000;    // 最大件数: ポーリング間隔 100ms で 8時間分のデータ蓄積を想定

class DeviceDataBuffer {
  constructor() {
    this._queue = [];
  }

  // キューが最大件数を超える場合は最古のデータを削除（FIFO）してからキューに追加
  // TODO: バッファへの追加であることが明確になるようにメソッド名を add に変更する
  update(data) {
    if (this._queue.length >= MAX_BUFFER_SIZE) {
      this._queue.shift();
    }

    this._queue.push({ data, updatedAt: new Date() });
  }

  // キューを消費せず最新 1 件を返す。キューが空なら null を返す。
  latest() {
    if (this._queue.length === 0) {
      return null;
    }
    return this._queue[this._queue.length - 1];
  }
}

module.exports = { DeviceDataBuffer, MAX_BUFFER_SIZE };
