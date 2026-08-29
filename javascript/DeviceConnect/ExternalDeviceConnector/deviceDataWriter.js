const fs = require('fs');
const path = require('path');

class DeviceDataWriter {
  // now はテスト用に現在時刻を固定するためのオプション。デフォルトは現在時刻を返す関数
  constructor(saveFile, { now = () => new Date() } = {}) {
    this._filePath = saveFile.dataFilePath;
    this._rotationBytes = saveFile.rotationKb * 1024;
    this._maxSaveFileNum = saveFile.maxSaveFileNum;
    this._now = now;
    this._writeQueue = Promise.resolve(); // 書き込み処理直列化: Promise の then によるチェーンをキューとして扱う

    // ファイル保存先ディレクトリが存在しない場合は作成する
    // TODO: 失敗時は複数回リトライし、それでも失敗するならファイルシステムに問題ありとして最上位に例外送出する
    fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
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
    const writePromise = this._writeQueue.then(() => this._writeCore(line));

    // 失敗しても次の書き込みがキューで詰まらないよう、キュー自体は常に fulfilled に保つ
    // (Promise が rejected になると catch のコールバックが呼ばれる)
    this._writeQueue = writePromise.catch(() => {});
    await writePromise;
  }

  async _writeCore(line) {
    // 必要に応じてローテーションする
    if (await this._needRotate()) {
      await this._rotate();
    }

    // 書き込み
    await fs.promises.appendFile(this._filePath, line);
  }

  async _needRotate() {
    // ローテーションが必要かをファイルサイズ基準で判断
    try {
      const stat = await fs.promises.stat(this._filePath);
      return (stat.size >= this._rotationBytes);
    } catch (err) {
      // ENOENT = Error NO ENTry = ファイルが存在しない場合のエラーコード
      if (err.code !== 'ENOENT') {
        throw err;
      }

      // ファイルが存在しない場合はローテーション不要なのでエラーは潰して問題なし
      return false;
    }
  }

  async _rotate() {
    const backupFiles = await this._getBackupFilesSorted();
    const dir = path.dirname(this._filePath);

    // maxSaveFileNum をファイル数最大値とする
    // これ以上にローテーションする場合、ファイル数最大値 - 1 になるまで削除してから作成する
    while (backupFiles.length >= this._maxSaveFileNum - 1 && backupFiles.length > 0) {
      // ソート済みのため先頭 = 最古
      const oldest = backupFiles.shift();
      try {
        // unlink: 非同期ファイル削除
        await fs.promises.unlink(path.join(dir, oldest));
      } catch (err) {
        // ファイルが存在しない場合はローテーション不要なだけで問題なし
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }

    // ローテーションでのファイル保持が不要でかつ最新ファイルがファイルサイズ超過の場合
    //  -> 最新ファイルを削除して新規作成する
    if (this._maxSaveFileNum <= 1) {
      await fs.promises.unlink(this._filePath);
      return;
    }

    const timestampStr = formatTimestamp(this._now());
    const targetPath = this._getRotatedFilePath(timestampStr);
    await fs.promises.rename(this._filePath, targetPath);
  }

  // data_20260829_153000.log や data_20260829_153000_1.log をリストアップしてソートして返す
  // 存在しない場合は空配列を返す
  async _getBackupFilesSorted() {    
    const dir = path.dirname(this._filePath);
    const ext = path.extname(this._filePath);
    const base = path.basename(this._filePath, ext);
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedBase}_\\d{8}_\\d{6}(?:_\\d+)?${escapedExt}$`);

    try {
      const files = await fs.promises.readdir(dir);
      return files.filter(f => pattern.test(f)).sort();
    } catch {
      return [];
    }
  }

  _getRotatedFilePath(timestampStr) {
    // 基本形: data_20260829_153000.log
    const dir = path.dirname(this._filePath);
    const ext = path.extname(this._filePath);
    const base = path.basename(this._filePath, ext);
    let candidate = `${base}_${timestampStr}${ext}`;

    // 1 秒立たずにローテーションする場合は連番対処: data_20260829_153000_1.log, data_20260829_153000_2.log ...
    // 連番は 1 から始める
    let counter = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${base}_${timestampStr}_${counter}${ext}`;
      counter++;
    }
    return path.join(dir, candidate);
  }
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

module.exports = { DeviceDataWriter };
