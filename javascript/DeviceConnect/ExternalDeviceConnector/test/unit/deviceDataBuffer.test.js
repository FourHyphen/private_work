const { DeviceDataBuffer, MAX_BUFFER_SIZE } = require('../../deviceDataBuffer');

describe('DeviceDataBuffer', () => {
  it('空キューで latest() が null を返す', () => {
    const buffer = new DeviceDataBuffer();
    expect(buffer.latest()).toBeNull();
  });

  it('latest() はキューを消費しない', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });
    buffer.latest();
    expect(buffer.latest()).not.toBeNull();
  });

  it('update(data) 後に latest() が { data, updatedAt } を返し updatedAt は Date', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });

    const result = buffer.latest();
    expect(result).not.toBeNull();
    expect(result.data).toEqual({ value: 42 });
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('複数件ある場合に最後の 1 件を返す', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.update({ value: 3 });

    const result = buffer.latest();
    expect(result.data).toEqual({ value: 3 });
  });

  it('MAX_BUFFER_SIZE 超過時に最古を削除して最新を追加する（FIFO）', () => {
    const buffer = new DeviceDataBuffer();
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }
    buffer.update({ value: MAX_BUFFER_SIZE });

    const result = buffer.latest();
    expect(result.data).toEqual({ value: MAX_BUFFER_SIZE });
  });
});
