const fs = require('fs');
const path = require('path');

class DeviceDataWriter {
  constructor(filePath) {
    this._filePath = filePath;

    // ファイル保存先ディレクトリが存在しない場合は作成する
    // TODO: 失敗時は複数回リトライし、それでも失敗するならファイルシステムに問題ありとして最上位に例外送出する
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  write(item) {
    const line = JSON.stringify({ data: item.data, updatedAt: item.updatedAt.toISOString() }) + '\n';
    fs.appendFileSync(this._filePath, line);
  }
}

module.exports = { DeviceDataWriter };
