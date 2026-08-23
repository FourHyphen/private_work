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

  it('update(data) でキューに入れるデータは { data, updatedAt(Date 型) } である', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });

    const result = buffer.latest();
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

    // バッファを満杯にする
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }

    // 超過分
    buffer.update({ value: MAX_BUFFER_SIZE });

    // バッファ件数が MAX_BUFFER_SIZE を超過していないことを確認
    expect(buffer._queue.length).toBe(MAX_BUFFER_SIZE);

    // 最新のデータ期待値は FIFO なので MAX_BUFFER_SIZE
    const result = buffer.latest();
    expect(result.data).toEqual({ value: MAX_BUFFER_SIZE });
  });
});

describe('DeviceDataBuffer.getDataPendingFileSave()', () => {
  it('空バッファで空配列を返す', () => {
    const buffer = new DeviceDataBuffer();
    expect(buffer.getDataPendingFileSave()).toEqual([]);
  });

  it('追加された全データを返す', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    const pending = buffer.getDataPendingFileSave();
    expect(pending).toHaveLength(2);
    expect(pending[0].data).toEqual({ value: 1 });
    expect(pending[1].data).toEqual({ value: 2 });
  });

  it('返したデータは次回呼び出しでも再度返される（消費されない）', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    expect(buffer.getDataPendingFileSave()).toHaveLength(1);
    expect(buffer.getDataPendingFileSave()).toHaveLength(1);
  });

  it('latest() の返す値に影響しない', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.getDataPendingFileSave();
    expect(buffer.latest().data).toEqual({ value: 2 });
  });

  it('MAX_BUFFER_SIZE 超過で最古が溢れても pending は残存するデータを返す', () => {
    const buffer = new DeviceDataBuffer();

    // バッファ満杯まで格納
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }

    // 超過分
    buffer.update({ value: MAX_BUFFER_SIZE });

    // バッファ超過していないことを確認
    const pending = buffer.getDataPendingFileSave();
    expect(pending).toHaveLength(MAX_BUFFER_SIZE);

    // FIFO のため最新データは i = 0 でなく i = 1
    expect(pending[0].data).toEqual({ value: 1 });

    // 最新データは超過分として入れた MAX_BUFFER_SIZE
    expect(pending[pending.length - 1].data).toEqual({ value: MAX_BUFFER_SIZE });
  });
});

describe('DeviceDataBuffer.markFileSaved()', () => {
  it('count 分だけ _fileSaveIndex が進む', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.markFileSaved(2);
    expect(buffer.getDataPendingFileSave()).toHaveLength(0);
  });

  it('count が queue 長を超えても _fileSaveIndex は queue 長に留まる', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.markFileSaved(999);
    expect(buffer._fileSaveIndex).toBe(1);
  });

  it('markFileSaved 後に追加したデータは再び pending に現れる', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.markFileSaved(1);
    buffer.update({ value: 2 });
    const pending = buffer.getDataPendingFileSave();
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toEqual({ value: 2 });
  });

  it('latest() に影響しない', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.markFileSaved(2);
    expect(buffer.latest().data).toEqual({ value: 2 });
  });

  it('MAX_BUFFER_SIZE 超過で先頭が溢れると _fileSaveIndex が補正される', () => {
    const buffer = new DeviceDataBuffer();
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }
    // 全件保存済みにしてからバッファ超過させる
    buffer.markFileSaved(MAX_BUFFER_SIZE);
    buffer.update({ value: MAX_BUFFER_SIZE });

    // 溢れた分だけ _fileSaveIndex が補正されて超過しないこと
    expect(buffer._fileSaveIndex).toBe(MAX_BUFFER_SIZE - 1);
  });
});
