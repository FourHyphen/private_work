const { DeviceDataBuffer } = require('../../deviceDataBuffer');

describe('DeviceDataBuffer', () => {
  it('未更新時は get() が null を返し hasData が false', () => {
    const buffer = new DeviceDataBuffer();
    expect(buffer.get()).toBeNull();
    expect(buffer.hasData).toBe(false);
  });

  it('update(data) 後に get() が { data, updatedAt } を返し updatedAt は Date', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });

    const result = buffer.get();
    expect(result.data).toEqual({ value: 42 });
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('update() 後に hasData が true になる', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    expect(buffer.hasData).toBe(true);
  });

  it('複数回 update() すると最新のデータで上書きされる', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    expect(buffer.get().data).toEqual({ value: 2 });
  });
});
