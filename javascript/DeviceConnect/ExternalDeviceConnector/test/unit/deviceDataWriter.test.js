const fs = require('fs');
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
    tempDir = fs.mkdtempSync(path.join(__dirname, 'device-data-writer-'));
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

  describe('ファイルローテーション', () => {
    it('ファイルサイズがしきい値未満の場合はローテーションせず同一ファイルに追記される', async () => {
      const filePath = path.join(tempDir, 'data.jsonl');
      const writer = new DeviceDataWriter({ ...SAVE_FILE, dataFilePath: filePath, rotationKb: 1 });

      // 1KB 未満のデータを 2 回書き込む -> ローテーションが発生したら 1 行ずつ 2 ファイルできる
      await writer.writeBatch([{ data: { value: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') }]);
      await writer.writeBatch([{ data: { value: 2 }, updatedAt: new Date('2026-08-22T10:00:01.000Z') }]);

      // ローテーションが発生せず、1 ファイルに 2 件のデータが追記されていることを確認
      const files = fs.readdirSync(tempDir);
      expect(files).toEqual(['data.jsonl']);
      expect(readRecords(filePath)).toHaveLength(2);
    });

    it('ファイルサイズがしきい値以上になった場合、次の書き込み時にリネームされ新規ファイルに書き込まれる', async () => {
      const filePath = path.join(tempDir, 'data.jsonl');
      const writer = new DeviceDataWriter(
        { ...SAVE_FILE, dataFilePath: filePath, rotationKb: 1 },
        { now: () => new Date('2026-08-22T10:00:00') }
      );

      // rotationKb = 1 (1024 bytes) に対し、1024 bytes 以上のファイルを用意
      const largeStr = 'a'.repeat(1024);
      const firstDate = '2026-08-22T10:00:00.000Z';
      await writer.writeBatch([{ data: { largeStr }, updatedAt: new Date(firstDate) }]);
      expect(fs.statSync(filePath).size).toBeGreaterThanOrEqual(1024);

      // ローテーションを発生させる
      const secondDate = '2026-08-22T10:00:01.000Z';
      await writer.writeBatch([{ data: { value: 'new' }, updatedAt: new Date(secondDate) }]);

      const files = fs.readdirSync(tempDir).sort();
      expect(files).toEqual(['data.jsonl', 'data_20260822_100000.jsonl']);

      // ローテーション後のデータ連続性（ファイル分割）を確認
      expect(readRecords(path.join(tempDir, 'data_20260822_100000.jsonl'))).toEqual([
        { data: { largeStr }, updatedAt: firstDate },
      ]);
      expect(readRecords(filePath)).toEqual([
        { data: { value: 'new' }, updatedAt: secondDate },
      ]);
    });

    it('同一秒内で複数回ローテーションされた場合、連番が付与される', async () => {
      const filePath = path.join(tempDir, 'data.jsonl');
      const fixedTime = new Date('2026-08-22T10:00:00');
      const writer = new DeviceDataWriter(
        { ...SAVE_FILE, dataFilePath: filePath, rotationKb: 1, maxSaveFileNum: 5 },
        { now: () => fixedTime }
      );

      const largeStr = 'a'.repeat(1024);

      // 1回目書き込み（1024 bytes 以上）
      await writer.writeBatch([{ data: { largeStr, seq: 1 }, updatedAt: fixedTime }]);
      // 2回目書き込み -> 1回目ローテーション発生（data_20260822_100000.jsonl）
      await writer.writeBatch([{ data: { largeStr, seq: 2 }, updatedAt: fixedTime }]);
      // 3回目書き込み -> 2回目ローテーション発生（data_20260822_100000_1.jsonl）
      await writer.writeBatch([{ data: { seq: 3 }, updatedAt: fixedTime }]);

      const files = fs.readdirSync(tempDir).sort();
      expect(files).toEqual([
        'data.jsonl',
        'data_20260822_100000.jsonl',
        'data_20260822_100000_1.jsonl',
      ]);
    });

    it('maxSaveFileNum を超えてローテーションする場合、最も古いファイルを削除して最大ファイル数を維持する', async () => {
      const filePath = path.join(tempDir, 'data.jsonl');
      // maxSaveFileNum = 3: data.jsonl(最新) + バックアップ 2 ファイル = 最大 3 ファイル
      let mockTime = new Date('2026-08-22T10:00:00');
      const writer = new DeviceDataWriter(
        { ...SAVE_FILE, dataFilePath: filePath, rotationKb: 1, maxSaveFileNum: 3 },
        { now: () => mockTime }
      );

      const largeStr = 'a'.repeat(1024);

      // 1回目書き込み (10:00:00)
      const t1 = new Date('2026-08-22T10:00:00');
      mockTime = t1;
      await writer.writeBatch([{ data: { largeStr, file: 1 }, updatedAt: t1 }]);

      // 2回目書き込み -> 1つ目バックアップ (10:00:10 にリネーム)
      const t2 = new Date('2026-08-22T10:00:10');
      mockTime = t2;
      await writer.writeBatch([{ data: { largeStr, file: 2 }, updatedAt: t2 }]);

      // 3回目書き込み -> 2つ目バックアップ (10:00:10 連番 1 にリネーム)
      const t3 = new Date('2026-08-22T10:00:10');
      mockTime = t3;
      await writer.writeBatch([{ data: { largeStr, file: 3 }, updatedAt: t3 }]);

      let files = fs.readdirSync(tempDir).sort();
      expect(files).toEqual([
        'data.jsonl',
        'data_20260822_100010.jsonl',
        'data_20260822_100010_1.jsonl',
      ]);

      // 4回目書き込み -> 最も古い 10:00:10 のバックアップが削除され、10:00:30 が追加される
      const t4 = new Date('2026-08-22T10:00:30');
      mockTime = t4;
      await writer.writeBatch([{ data: { file: 4 }, updatedAt: t4 }]);

      files = fs.readdirSync(tempDir).sort();
      expect(files).toEqual([
        'data.jsonl',
        'data_20260822_100010_1.jsonl',
        'data_20260822_100030.jsonl',
      ]);

      expect(readRecords(path.join(tempDir, 'data_20260822_100010_1.jsonl'))).toEqual([
        { data: { largeStr, file: 2 }, updatedAt: t2.toISOString() },
      ]);
      expect(readRecords(path.join(tempDir, 'data_20260822_100030.jsonl'))).toEqual([
        { data: { largeStr, file: 3 }, updatedAt: t3.toISOString() },
      ]);
      expect(readRecords(filePath)).toEqual([
        { data: { file: 4 }, updatedAt: t4.toISOString() },
      ]);
    });

    it('maxSaveFileNum = 1 の場合はローテーション時にバックアップを残さず削除する', async () => {
      const filePath = path.join(tempDir, 'data.jsonl');
      const writer = new DeviceDataWriter(
        { ...SAVE_FILE, dataFilePath: filePath, rotationKb: 1, maxSaveFileNum: 1 }
      );

      const largeStr = 'a'.repeat(1024);
      await writer.writeBatch([{ data: { largeStr, val: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') }]);

      // ローテーション発生の条件を満たさせる
      await writer.writeBatch([{ data: { val: 2 }, updatedAt: new Date('2026-08-22T10:00:01.000Z') }]);

      // ファイルが 1 つのみであることを確認
      const files = fs.readdirSync(tempDir);
      expect(files).toEqual(['data.jsonl']);

      // ローテーションにより古いデータが削除され、新しいデータのみとなっていることを確認
      expect(readRecords(filePath)).toEqual([
        { data: { val: 2 }, updatedAt: '2026-08-22T10:00:01.000Z' },
      ]);
    });
  });
});
