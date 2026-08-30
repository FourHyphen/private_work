const { PendingFileSaveQueue } = require('./pendingFileSaveQueue');

const FLUSH_INTERVAL_MS = 500;

class DeviceDataSaveScheduler {
  constructor(writer) {
    this._queue = new PendingFileSaveQueue();
    this._writer = writer;
    this._flushTimer = null;
    this._isFlushing = false;    // ファイル書き込み処理が重複実行されないよう制御
  }

  start() {
    if (this._flushTimer !== null) {
      return;
    }

    // 一定間隔でキューの未保存データをまとめてファイルへ書き込む
    this._flushTimer = setInterval(() => this._flushPending(), FLUSH_INTERVAL_MS);
  }

  // キューにファイル保存したいデータを追加する
  enqueue(data) {
    this._queue.add(data);
  }

  // 保存待ちキューの未保存データをまとめてファイルへ書き込み、成功分をキューから削除する
  async _flushPending() {
    // 前回の書き込み処理がまだ終わっていない場合はスキップ(同一データの多重書き込みを防止)
    if (this._isFlushing) {
      return;
    }

    // 未保存データを取得
    const pending = this._queue.pending();
    if (pending.length === 0) {
      return;
    }

    try {
      this._isFlushing = true;

      // 処理失敗すると Promise は rejected となる、await は rejected となった Promise を受け取ると例外 throw する
      await this._writer.writeBatch(pending);    // 書き込み
      this._queue.markSaved(pending.length);     // 書き込み開始時点の件数だけキューから削除
    } catch (err) {
      // 書き込み失敗時は書き込み成功データ件数を増やさないことで次回処理時にリトライする
      console.error('[connector] write failed:', err);
    } finally {
      this._isFlushing = false;
    }
  }
}

module.exports = { DeviceDataSaveScheduler };
