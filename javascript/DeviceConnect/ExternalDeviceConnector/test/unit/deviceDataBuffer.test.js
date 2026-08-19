const { DeviceDataBuffer, MAX_BUFFER_SIZE } = require('../../deviceDataBuffer');

describe('DeviceDataBuffer', () => {
  it('未更新時は get() が null を返し hasData が false', () => {
    const buffer = new DeviceDataBuffer();
    expect(buffer.get()).toBeNull();
    expect(buffer.hasData).toBe(false);
  });

  it('update(data) 後に get() が [{ data, updatedAt }] を返し updatedAt は Date', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });

    const result = buffer.get();
    expect(result).toHaveLength(1);
    expect(result[0].data).toEqual({ value: 42 });
    expect(result[0].updatedAt).toBeInstanceOf(Date);
  });

  it('update() 後に hasData が true になる', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    expect(buffer.hasData).toBe(true);
  });

  it('get() 後にキューが空になる（drain）', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.get();
    expect(buffer.get()).toBeNull();
    expect(buffer.hasData).toBe(false);
  });

  it('複数回 update() すると全件が受信順に蓄積される', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.update({ value: 3 });

    const result = buffer.get();
    expect(result).toHaveLength(3);
    expect(result[0].data).toEqual({ value: 1 });
    expect(result[1].data).toEqual({ value: 2 });
    expect(result[2].data).toEqual({ value: 3 });
  });

  it('get() 後の update() では新しいデータのみ返す', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.get();
    buffer.update({ value: 2 });

    const result = buffer.get();
    expect(result).toHaveLength(1);
    expect(result[0].data).toEqual({ value: 2 });
  });

  it('MAX_BUFFER_SIZE 超過時に最古を削除して最新を追加する（FIFO）', () => {
    const buffer = new DeviceDataBuffer();
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }
    buffer.update({ value: MAX_BUFFER_SIZE });

    const result = buffer.get();
    expect(result).toHaveLength(MAX_BUFFER_SIZE);
    expect(result[0].data).toEqual({ value: 1 });
    expect(result[MAX_BUFFER_SIZE - 1].data).toEqual({ value: MAX_BUFFER_SIZE });
  });
});
