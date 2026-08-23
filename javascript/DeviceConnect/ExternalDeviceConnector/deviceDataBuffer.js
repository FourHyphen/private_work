const MAX_BUFFER_SIZE = 288_000;    // 最大件数: ポーリング間隔 100ms で 8時間分のデータ蓄積を想定

class DeviceDataBuffer {
  constructor() {
    this._queue = [];

    // キュー全体のうち、どこから先がファイル未保存データか(0 だと 0 より先が未保存なので全件未保存)
    this._fileSaveIndex = 0;
  }

  // キューが最大件数を超える場合は最古のデータを削除（FIFO）してからキューに追加
  // TODO: バッファへの追加であることが明確になるようにメソッド名を add に変更する
  update(data) {
    if (this._queue.length >= MAX_BUFFER_SIZE) {
      this._queue.shift();

      // 最古のデータが消えたらファイル未保存位置インデックスを補正
      if (this._fileSaveIndex > 0) {
        this._fileSaveIndex--;
      }
    }

    this._queue.push({ data, updatedAt: new Date() });
  }

  // ファイル未保存のデータをすべて返す（消費しない）
  getDataPendingFileSave() {
    // _fileSaveIndex より前は保存済み扱い、以降は未保存扱い
    return this._queue.slice(this._fileSaveIndex);
  }

  // バッファデータのうちファイル保存済み件数を記録する
  markFileSaved(count) {
    this._fileSaveIndex = Math.min(this._fileSaveIndex + count, this._queue.length);
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
