const { DeviceDataBuffer, MAX_BUFFER_SIZE } = require('../../deviceDataBuffer');

describe('DeviceDataBuffer', () => {
  it('データがない場合は最新データなしを返す', () => {
    const buffer = new DeviceDataBuffer();
    expect(buffer.latest()).toBeNull();    // 空データでなく null を返す仕様
  });

  it('最新データを取得してもデータは保持される', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });
    buffer.latest();
    expect(buffer.latest()).not.toBeNull();
  });

  it('追加したデータは値と更新時刻を持つ', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 42 });

    const result = buffer.latest();
    expect(result.data).toEqual({ value: 42 });
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('複数のデータから最新のものを返す', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.update({ value: 3 });

    const result = buffer.latest();
    expect(result.data).toEqual({ value: 3 });
  });

  it('容量を超えて追加すると最古のデータを破棄して最新データを保持する', () => {
    const buffer = new DeviceDataBuffer();

    // バッファを満杯にする
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }

    // 超過分
    buffer.update({ value: MAX_BUFFER_SIZE });

    // 未保存データの件数が MAX_BUFFER_SIZE を超過していないことを確認
    expect(buffer.getDataPendingFileSave()).toHaveLength(MAX_BUFFER_SIZE);

    // 最新のデータ期待値は FIFO なので MAX_BUFFER_SIZE
    const result = buffer.latest();
    expect(result.data).toEqual({ value: MAX_BUFFER_SIZE });
  });
});

describe('DeviceDataBuffer.getDataPendingFileSave()', () => {
  it('未保存データがない場合は空配列を返す', () => {
    const buffer = new DeviceDataBuffer();
    expect(buffer.getDataPendingFileSave()).toEqual([]);
  });

  it('未保存データを追加順に返す', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    const pending = buffer.getDataPendingFileSave();
    expect(pending).toHaveLength(2);
    expect(pending[0].data).toEqual({ value: 1 });
    expect(pending[1].data).toEqual({ value: 2 });
  });

  it('未保存データを取得してもデータは保持される', () => {
    // 仕様: ファイル保存前ならバッファは削除されない
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    expect(buffer.getDataPendingFileSave()).toHaveLength(1);
    expect(buffer.getDataPendingFileSave()).toHaveLength(1);
  });

  it('未保存データを取得しても最新データを取得できる', () => {
    // 仕様: ファイル保存前ならバッファは削除されない
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.getDataPendingFileSave();
    expect(buffer.latest().data).toEqual({ value: 2 });
  });

  it('容量超過時は破棄されなかった未保存データを返す', () => {
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
  it('保存済みとして記録したデータは未保存データに含まれない', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.markFileSaved(2);
    expect(buffer.getDataPendingFileSave()).toHaveLength(0);
  });

  it('追加済み件数を超えて保存済みにしてもデータを壊さない', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });

    // 予期しない件数を設定
    buffer.markFileSaved(999);

    // 全件保存済み扱いとなることを確認
    expect(buffer.getDataPendingFileSave()).toEqual([]);

    // その後に追加したデータは正しく未保存となっていることを確認
    buffer.update({ value: 2 });
    expect(buffer.getDataPendingFileSave()).toHaveLength(1);
  });

  it('保存済みとして記録した後に追加したデータは未保存として返す', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.markFileSaved(1);
    buffer.update({ value: 2 });
    const pending = buffer.getDataPendingFileSave();
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toEqual({ value: 2 });
  });

  it('保存済みとして記録しても最新データを取得できる', () => {
    const buffer = new DeviceDataBuffer();
    buffer.update({ value: 1 });
    buffer.update({ value: 2 });
    buffer.markFileSaved(2);
    expect(buffer.latest().data).toEqual({ value: 2 });
  });

  it('保存済みデータが容量超過で破棄されても新規データを未保存として返す', () => {
    const buffer = new DeviceDataBuffer();
    for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
      buffer.update({ value: i });
    }
    // 全件保存済みにしてからバッファ超過させる
    buffer.markFileSaved(MAX_BUFFER_SIZE);
    buffer.update({ value: MAX_BUFFER_SIZE });

    // 保存済みデータが溢れても、新規データは未保存として取得できること
    const pending = buffer.getDataPendingFileSave();
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toEqual({ value: MAX_BUFFER_SIZE });
  });
});
