const fs = require('fs');
const { DeviceDataWriter } = require('../../deviceDataWriter');

describe('DeviceDataWriter', () => {
  // DeviceDataWriter のコンストラクタでファイル保存先ディレクトリを作るため、テスト実行前にディレクトリを作らないようにする
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
  });

  // 各テスト実行後に行われる処理
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('コンストラクタでファイル保存先ディレクトリを作成する', () => {
    // ディレクトリ作成処理のモック化は beforeEach で行う前提で成り立つコードであることに注意
    new DeviceDataWriter('/path/to/file.jsonl');

    expect(fs.mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
  });

  it('write() が指定パスへ JSON Lines 形式で追記する', () => {
    // appendFileSync をモックして、実際のファイル書き込みを行わないようにする
    const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

    const writer = new DeviceDataWriter('/path/to/file.jsonl');
    const item = { data: { value: 42 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') };
    writer.write(item);

    // モック化した appendFileSync の呼び出し引数を確認
    expect(spy).toHaveBeenCalledWith(
      '/path/to/file.jsonl',
      '{"data":{"value":42},"updatedAt":"2026-08-22T10:00:00.000Z"}\n'
    );
  });

  it('複数回 write() すると行が増える', () => {
    // appendFileSync を配列追加にモック化
    const lines = [];
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_path, line) => {
      lines.push(line);
    });

    // 複数回の書き込みを再現
    const writer = new DeviceDataWriter('/path/to/file.jsonl');
    writer.write({ data: { value: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') });
    writer.write({ data: { value: 2 }, updatedAt: new Date('2026-08-22T10:00:00.100Z') });

    // 書き込み内容が反映されているかを確認
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('{"data":{"value":1},"updatedAt":"2026-08-22T10:00:00.000Z"}\n');
    expect(lines[1]).toBe('{"data":{"value":2},"updatedAt":"2026-08-22T10:00:00.100Z"}\n');
  });

  it('writeBatch() が複数アイテムを 1 回の appendFileSync で書き込む', () => {
    const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    const writer = new DeviceDataWriter('/path/to/file.jsonl');
    const items = [
      { data: { value: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') },
      { data: { value: 2 }, updatedAt: new Date('2026-08-22T10:00:00.100Z') },
    ];
    writer.writeBatch(items);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      '/path/to/file.jsonl',
      '{"data":{"value":1},"updatedAt":"2026-08-22T10:00:00.000Z"}\n{"data":{"value":2},"updatedAt":"2026-08-22T10:00:00.100Z"}\n'
    );
  });

  it('writeBatch() に空配列を渡すと appendFileSync を呼ばない', () => {
    const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    const writer = new DeviceDataWriter('/path/to/file.jsonl');
    writer.writeBatch([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
