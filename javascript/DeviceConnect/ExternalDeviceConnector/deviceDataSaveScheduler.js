const { PendingFileSaveQueue } = require('./pendingFileSaveQueue');

const FLUSH_INTERVAL_MS = 500;
const DEFAULT_WRITE_TIMEOUT_MS = 30000;

class DeviceDataSaveScheduler {
  constructor(writer, { onHang = null, writeTimeoutMs = DEFAULT_WRITE_TIMEOUT_MS } = {}) {
    this._queue = new PendingFileSaveQueue();
    this._writer = writer;
    this._onHang = onHang;
    this._writeTimeoutMs = writeTimeoutMs;
    this._flushTimer = null;
    this._hangTimer = null;
    this._isFlushing = false;    // Scheduler が書き込みの直列化を担い、重複実行を防ぐ
    this._isHung = false;        // 書き込み処理が一定時間経っても終わらない場合はハングとする
  }

  // 定期的な保存開始
  start() {
    if (this._flushTimer !== null || this._isHung) {
      return;
    }

    // 一定間隔でキューの未保存データをまとめてファイルへ書き込む
    this._flushTimer = setInterval(() => this._flushPending(), FLUSH_INTERVAL_MS);
  }

  // 定期的な保存終了
  stop() {
    this._deleteFlushTimer();
    this._deleteHangTimer();
  }

  // キューにファイル保存したいデータを追加する
  enqueue(data) {
    if (this._isHung) {
      return;
    }
    this._queue.add(data);
  }

  // 保存待ちキューの未保存データをまとめてファイルへ書き込み、成功分をキューから削除する
  async _flushPending() {
    // 前回の書き込み処理がまだ終わっていない場合やハング状態の場合はスキップ
    if (this._isFlushing || this._isHung) {
      return;
    }

    // 未保存データを取得
    const pending = this._queue.pending();
    if (pending.length === 0) {
      return;
    }

    this._isFlushing = true;

    // 書き込み処理が一定時間経っても終わらない場合はハングしたと見なす
    this._hangTimer = setTimeout(() => {
      this._handleHang();
    }, this._writeTimeoutMs);

    try {
      // 処理失敗すると Promise は rejected となる、await は rejected となった Promise を受け取ると例外 throw する
      await this._writer.writeBatch(pending);    // 書き込み
      if (this._isHung) {
        return;
      }
      this._queue.markSaved(pending.length);     // 書き込み開始時点の件数だけキューから削除
    } catch (err) {
      if (this._isHung) {
        return;
      }

      // 書き込み失敗時は書き込み成功データ件数を増やさないことで次回処理時にリトライする
      console.error('[connector] write failed:', err);
    } finally {
      this._deleteHangTimer();

      if (!this._isHung) {
        this._isFlushing = false;
      }
    }
  }

  _handleHang() {
    if (this._isHung) {
      return;
    }

    this._isHung = true;
    this._deleteHangTimer();
    this._deleteFlushTimer();

    console.error('[connector] write hang detected');

    if (typeof this._onHang === 'function') {
      this._onHang(new Error('Save file write hang detected'));
    }
  }

  // ハングタイマーが動作中であれば停止して破棄する
  _deleteHangTimer() {
    if (this._hangTimer !== null) {
      clearTimeout(this._hangTimer);
      this._hangTimer = null;
    }
  }

  // フラッシュタイマーが動作中であれば停止して破棄する
  _deleteFlushTimer() {
    if (this._flushTimer !== null) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }
}

module.exports = { DeviceDataSaveScheduler };
