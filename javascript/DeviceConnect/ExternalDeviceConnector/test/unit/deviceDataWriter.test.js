const fs = require('fs');
const { DeviceDataWriter } = require('../../deviceDataWriter');

describe('DeviceDataWriter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('write() が指定パスへ JSON Lines 形式で追記する', () => {
    const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    const writer = new DeviceDataWriter('/path/to/file.jsonl');
    const item = { data: { value: 42 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') };

    writer.write(item);

    expect(spy).toHaveBeenCalledWith(
      '/path/to/file.jsonl',
      '{"data":{"value":42},"updatedAt":"2026-08-22T10:00:00.000Z"}\n'
    );
  });

  it('複数回 write() すると行が増える', () => {
    const lines = [];
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_path, line) => {
      lines.push(line);
    });

    const writer = new DeviceDataWriter('/path/to/file.jsonl');
    writer.write({ data: { value: 1 }, updatedAt: new Date('2026-08-22T10:00:00.000Z') });
    writer.write({ data: { value: 2 }, updatedAt: new Date('2026-08-22T10:00:00.100Z') });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('{"data":{"value":1},"updatedAt":"2026-08-22T10:00:00.000Z"}\n');
    expect(lines[1]).toBe('{"data":{"value":2},"updatedAt":"2026-08-22T10:00:00.100Z"}\n');
  });
});
