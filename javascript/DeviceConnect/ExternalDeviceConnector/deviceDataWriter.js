const fs = require('fs');
const path = require('path');

class DeviceDataWriter {
  constructor(filePath) {
    this._filePath = filePath;
    this._writeQueue = Promise.resolve(); // 書き込み処理直列化: Promise の then によるチェーンをキューとして扱う

    // ファイル保存先ディレクトリが存在しない場合は作成する
    // TODO: 失敗時は複数回リトライし、それでも失敗するならファイルシステムに問題ありとして最上位に例外送出する
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  // 複数件まとめてファイルに書き込み。前の書き込みが完了してから開始することで順序を保証する
  // async をつけたメソッドは必ず Promise を返す
  //  -> このメソッドの戻り値は appendFile の完了を待つ Promise
  //     呼び出し側はこのメソッドを await 付きで実行することで Promise の完了を待てる
  // Promise は pending / fulfilled(成功) / rejected(失敗) の 3 状態を持つ
  async writeBatch(items) {
    if (items.length === 0) return;

    const line = items.map(item =>
      JSON.stringify({ data: item.data, updatedAt: item.updatedAt.toISOString() })
    ).join('\n') + '\n';

    // 非同期なので書き込み順序を保証。1 つ前の書き込みが完了してから次の書き込みを行う
    // then で呼び出しをチェーンする(Promise が fulfilled になると then のコールバックが呼ばれる)
    const writePromise = this._writeQueue.then(() => fs.promises.appendFile(this._filePath, line));

    // 失敗しても次の書き込みがキューで詰まらないよう、キュー自体は常に fulfilled に保つ
    // (Promise が rejected になると catch のコールバックが呼ばれる)
    this._writeQueue = writePromise.catch(() => {});
    await writePromise;
  }
}

module.exports = { DeviceDataWriter };
