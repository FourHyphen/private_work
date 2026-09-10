const fs = require('fs');
const path = require('path');

// 制限: 同時呼び出しに対する書き込み順序を保証しない
// 本 PJ では DeviceDataSaveScheduler にその役割を移譲した。単体で利用する場合は書き込み順序制御に注意
class DeviceDataWriter {
  // now はテスト用に現在時刻を固定するためのオプション。デフォルトは現在時刻を返す関数
  constructor(saveFile, { now = () => new Date() } = {}) {
    this._filePath = saveFile.dataFilePath;
    this._rotationBytes = saveFile.rotationKb * 1024;
    this._maxSaveFileNum = saveFile.maxSaveFileNum;
    this._now = now;
  }

  // 保存先ディレクトリを作成し、実際にファイルに保存可能な状態か確認する
  async prepareSaveFile() {
    const directoryPath = path.dirname(this._filePath);
    let lastError;

    // 数回リトライし、全て NG の場合に全体的な失敗とする
    // 試行回数および待機時間は仕様に含めないため適宜変更可能
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await fs.promises.mkdir(directoryPath, { recursive: true });

        // ファイルを append モードで開ければ少なくとも権限があり、
        // ファイルシステムに最低限の問題ないとする
        const fileHandle = await fs.promises.open(this._filePath, 'a');
        await fileHandle.close();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await wait(500);
        }
      }
    }

    const error = new Error(`Failed to create save directory after 3 attempts: ${directoryPath}`);
    error.kind = 2;
    error.cause = lastError;
    throw error;
  }

  // 複数件まとめてファイルに書き込む
  // async をつけたメソッドは必ず Promise を返す
  //  -> このメソッドの戻り値は appendFile の完了を待つ Promise
  //     呼び出し側はこのメソッドを await 付きで実行することで Promise の完了を待てる
  // Promise は pending / fulfilled(成功) / rejected(失敗) の 3 状態を持つ
  async writeBatch(items) {
    if (items.length === 0) return;

    const line = items.map(item =>
      JSON.stringify({ data: item.data, updatedAt: item.updatedAt.toISOString() })
    ).join('\n') + '\n';

    await this._writeCore(line);
  }

  // 必要に応じてローテーションしてから書き込む
  async _writeCore(line) {
    if (await this._needRotate()) {
      await this._rotate();
    }

    await fs.promises.appendFile(this._filePath, line);
  }

  // ローテーションが必要かをファイルサイズ基準で判断
  async _needRotate() {
    try {
      const stat = await fs.promises.stat(this._filePath);
      return (stat.size >= this._rotationBytes);
    } catch (err) {
      // ENOENT = Error NO ENTry = ファイルが存在しない場合のエラーコード
      if (err.code === 'ENOENT') {
        // ファイルが存在しない場合はローテーション不要なのでエラーは潰して問題なし
        return false;
      } else {
        throw err;
      }
    }
  }

  // ローテーション実行
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
