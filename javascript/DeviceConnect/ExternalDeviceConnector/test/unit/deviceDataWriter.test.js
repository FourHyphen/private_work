const fs = require('fs');
const os = require('os');
const path = require('path');
const { DeviceDataWriter } = require('../../deviceDataWriter');

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

  it('存在しない保存先ディレクトリでもディレクトリが作成され、1件のデータを保存できる', () => {
    const filePath = path.join(tempDir, 'nested', 'data.jsonl');
    const writer = new DeviceDataWriter(filePath);
    const item = { data: { value: 42 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') };
    writer.write(item);

    expect(readRecords(filePath)).toEqual([
      { data: { value: 42 }, updatedAt: '2026-08-22T10:00:00.000Z' },
    ]);
  });

  it('複数件のデータを順序どおり既存ファイルへ追記する', () => {
    // 既存ファイルを作成
    const filePath = path.join(tempDir, 'data.jsonl');
    fs.writeFileSync(filePath, '{"data":{"value":0},"updatedAt":"2026-08-22T09:59:59.000Z"}\n');

    // 追記
    const writer = new DeviceDataWriter(filePath);
    const items = [
      { data: { value: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') },
      { data: { value: 2 }, updatedAt: new Date('2026-08-22T10:00:00.100Z') },
    ];
    writer.writeBatch(items);

    // 追記後のファイル内容を確認
    expect(readRecords(filePath)).toEqual([
      { data: { value: 0 }, updatedAt: '2026-08-22T09:59:59.000Z' },
      { data: { value: 1 }, updatedAt: '2026-08-22T10:00:00.000Z' },
      { data: { value: 2 }, updatedAt: '2026-08-22T10:00:00.100Z' },
    ]);
  });

  it('空のデータを渡しても既存ファイルの内容を変更しない', () => {
    // 既存ファイルを作成
    const filePath = path.join(tempDir, 'data.jsonl');
    const initialContent = '{"data":{"value":42},"updatedAt":"2026-08-22T10:00:00.000Z"}\n';
    fs.writeFileSync(filePath, initialContent);

    // 空データで書き込み実行
    const writer = new DeviceDataWriter(filePath);
    writer.writeBatch([]);

    // 既存ファイルの中身に変更がないことを確認
    expect(fs.readFileSync(filePath, 'utf8')).toBe(initialContent);
  });
});
