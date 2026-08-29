const fs = require('fs');
const os = require('os');
const path = require('path');
const { DeviceDataWriter } = require('../../deviceDataWriter');

const SAVE_FILE = {
  dataFilePath: '',    // どのファイルでテストするかを明確化するため、DeviceDataWriter インスタンス生成時に指定する
  rotationKb: 1024,
  maxSaveFileNum: 5
}

describe('DeviceDataWriter', () => {
  let tempDir;
  const readRecords = filePath => fs.readFileSync(filePath, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line));

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-data-writer-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('存在しない保存先ディレクトリでもディレクトリが作成される', () => {
    const filePath = path.join(tempDir, 'nested', 'data.jsonl');
    new DeviceDataWriter({ ...SAVE_FILE, dataFilePath: filePath });
    expect(fs.existsSync(path.dirname(filePath))).toBe(true);
  });

  it('複数件のデータを順序どおり既存ファイルへ追記する', async () => {
    // 既存ファイルを作成
    const filePath = path.join(tempDir, 'data.jsonl');
    fs.writeFileSync(filePath, '{"data":{"value":0},"updatedAt":"2026-08-22T09:59:59.000Z"}\n');

    // 追記
    const writer = new DeviceDataWriter({ ...SAVE_FILE, dataFilePath: filePath });
    const items = [
      { data: { value: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') },
      { data: { value: 2 }, updatedAt: new Date('2026-08-22T10:00:00.100Z') },
    ];
    await writer.writeBatch(items);

    // 追記後のファイル内容を確認
    expect(readRecords(filePath)).toEqual([
      { data: { value: 0 }, updatedAt: '2026-08-22T09:59:59.000Z' },
      { data: { value: 1 }, updatedAt: '2026-08-22T10:00:00.000Z' },
      { data: { value: 2 }, updatedAt: '2026-08-22T10:00:00.100Z' },
    ]);
  });

  it('空のデータを渡しても既存ファイルの内容を変更しない', async () => {
    // 既存ファイルを作成
    const filePath = path.join(tempDir, 'data.jsonl');
    const initialContent = '{"data":{"value":42},"updatedAt":"2026-08-22T10:00:00.000Z"}\n';
    fs.writeFileSync(filePath, initialContent);

    // 空データで書き込み実行
    const writer = new DeviceDataWriter({ ...SAVE_FILE, dataFilePath: filePath });
    await writer.writeBatch([]);

    // 既存ファイルの中身に変更がないことを確認
    expect(fs.readFileSync(filePath, 'utf8')).toBe(initialContent);
  });

  it('await せずに複数の writeBatch を呼んでも呼び出し順にファイルへ書き込む', async () => {
    const filePath = path.join(tempDir, 'data.jsonl');
    const writer = new DeviceDataWriter({ ...SAVE_FILE, dataFilePath: filePath });

    // await せずに並行呼び出し
    const p1 = writer.writeBatch([{ data: { seq: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') }]);
    const p2 = writer.writeBatch([{ data: { seq: 2 }, updatedAt: new Date('2026-08-22T10:00:00.100Z') }]);
    const p3 = writer.writeBatch([{ data: { seq: 3 }, updatedAt: new Date('2026-08-22T10:00:00.200Z') }]);
    await Promise.all([p1, p2, p3]);

    const records = readRecords(filePath);
    expect(records).toHaveLength(3);
    expect(records[0].data.seq).toBe(1);
    expect(records[1].data.seq).toBe(2);
    expect(records[2].data.seq).toBe(3);
  });
});
