const MAX_PENDING_QUEUE_SIZE = 288_000;    // 最大件数: ポーリング間隔 100ms で 8時間分のデータ蓄積を想定

class PendingFileSaveQueue {
  constructor() {
    this._queue = [];
  }

  // キューが最大件数を超える場合は最古のデータを破棄（FIFO）してから追加する
  add(data) {
    if (this._queue.length >= MAX_PENDING_QUEUE_SIZE) {
      this._queue.shift();
    }
    this._queue.push({ data, updatedAt: new Date() });
  }

  // 未保存項目のスナップショットを返す（キューは消費しない）
  pending() {
    return this._queue.slice();
  }

  // 先頭から成功件数分を削除する
  markSaved(count) {
    this._queue.splice(0, count);
  }
}

module.exports = { PendingFileSaveQueue, MAX_PENDING_QUEUE_SIZE };
