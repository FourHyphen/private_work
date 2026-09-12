const { DeviceDataSaveScheduler } = require('../../deviceDataSaveScheduler');

describe('DeviceDataSaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('start() で定期的に pending データを writeBatch に渡す', async () => {
    const writer = { writeBatch: vi.fn() };
    const scheduler = new DeviceDataSaveScheduler(writer);
    scheduler.start();

    scheduler.enqueue({ data: { value: 42 }, updatedAt: new Date() });
    await vi.advanceTimersByTimeAsync(500);

    expect(writer.writeBatch).toHaveBeenCalledTimes(1);
    const payload = writer.writeBatch.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0].data).toEqual({ value: 42 });
    expect(payload[0].updatedAt).toBeInstanceOf(Date);
  });

  it('writeBatch() が失敗してもエラーを処理し、未保存データを維持する', async () => {
    const writer = { writeBatch: vi.fn() };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('write failed');

    // 初回実行時はエラー、2 回目は成功するようにモック
    writer.writeBatch
      .mockImplementationOnce(() => { throw error; })
      .mockImplementationOnce(() => {});

    const scheduler = new DeviceDataSaveScheduler(writer);
    scheduler.start();
    scheduler.enqueue({ data: { value: 99 } });

    // 書き込み失敗してもクラッシュしない
    await vi.advanceTimersByTimeAsync(500);
    expect(consoleError).toHaveBeenCalledWith('[connector] write failed:', error);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    // 2 回目で書き込み成功させる
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(2);

    // 2 回目で成功したデータが初回に失敗したデータと同じであれば、未保存データが維持されたとみなす
    const retried = writer.writeBatch.mock.calls[1][0];
    expect(retried).toHaveLength(1);
    expect(retried[0].data).toEqual({ value: 99 });
  });

  it('複数フラッシュサイクルで未保存データのみが writeBatch される', async () => {
    const writer = { writeBatch: vi.fn() };
    const scheduler = new DeviceDataSaveScheduler(writer);
    scheduler.start();
    scheduler.enqueue({ data: { value: 1 } });
    scheduler.enqueue({ data: { value: 2 } });

    // 1 回目のフラッシュで 2 件まとめて書き込まれる
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledOnce();
    expect(writer.writeBatch.mock.calls[0][0]).toHaveLength(2);

    // 2 回目のフラッシュでは pending がないため writeBatch は呼ばれない
    writer.writeBatch.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).not.toHaveBeenCalled();

    // 新規データ追加後の 3 回目フラッシュの場合は 1 件のみ書き込まれる
    scheduler.enqueue({ data: { value: 3 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledOnce();
    expect(writer.writeBatch.mock.calls[0][0]).toHaveLength(1);
    expect(writer.writeBatch.mock.calls[0][0][0].data).toEqual({ value: 3 });
  });

  it('書き込み中に次のタイマが来ても重複実行しない', async () => {
    let resolveWrite;
    const writer = {
      writeBatch: vi.fn(() => new Promise((resolve) => {
        resolveWrite = resolve;
      }))
    };

    const scheduler = new DeviceDataSaveScheduler(writer);
    scheduler.start();
    scheduler.enqueue({ data: { value: 1 } });

    // 1 回目フラッシュを発火（writeBatch は未完了のまま pending）
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    // writeBatch 未完了中に 2 回目フラッシュインターバルが来ても呼ばれない
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    // writeBatch を完了させ、その後は pending データなし → 次フラッシュで呼ばれない
    resolveWrite();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);
  });

  it('書き込みがタイムアウトした場合、一度だけハングを通知して以後の保存を停止する', async () => {
    // writeBatch() の完了を外部から制御するモック
    let resolveWrite;
    const writer = {
      writeBatch: vi.fn(() => new Promise((resolve) => {
        resolveWrite = resolve;
      }))
    };

    const onHang = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // データを 1 つキューにセット
    const scheduler = new DeviceDataSaveScheduler(writer, { onHang, writeTimeoutMs: 1000 });
    scheduler.start();
    scheduler.enqueue({ data: { value: 1 } });

    // 1 回目フラッシュを発火（writeBatch は未完了、タイムアウトしていない)
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);
    expect(onHang).not.toHaveBeenCalled();

    // タイムアウト
    await vi.advanceTimersByTimeAsync(1000);

    // ハング通知が一度だけ呼ばれることを確認
    expect(onHang).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[connector] write hang detected');

    // 以降の書き込みが行われないことを確認
    // (1) いったん書き込み成功させる
    resolveWrite();
    await Promise.resolve();

    // (2) 新規データをセット
    scheduler.enqueue({ data: { value: 2 } });

    // (3) 時間を進めても書き込みが行われず、エラー通知もしないことを確認
    await vi.advanceTimersByTimeAsync(2000);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);
    expect(onHang).toHaveBeenCalledTimes(1);
  });

  it('書き込みが成功した場合、ハングを通知しない', async () => {
    const writer = {
      writeBatch: vi.fn().mockResolvedValue(undefined)
    };
    const onHang = vi.fn();

    const scheduler = new DeviceDataSaveScheduler(writer, { onHang, writeTimeoutMs: 1000 });
    scheduler.start();
    scheduler.enqueue({ data: { value: 1 } });

    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(onHang).not.toHaveBeenCalled();
  });

  it('書き込みが失敗した場合、ハングを通知せず次回リトライする', async () => {
    const writer = {
      writeBatch: vi.fn()
        .mockRejectedValueOnce(new Error('write error'))    // 処理失敗時は reject(タイムアウト時はハングなので resolve も reject もしない)
        .mockResolvedValueOnce(undefined)                   // 処理成功
    };
    const onHang = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // データを  1 つキューにセット
    const scheduler = new DeviceDataSaveScheduler(writer, { onHang, writeTimeoutMs: 1000 });
    scheduler.start();
    scheduler.enqueue({ data: { value: 1 } });

    // 1 回目書き込み: 失敗
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    // 2 回目書き込み: 成功なのでハング時処理を実行してないことを確認
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(2);
    expect(onHang).not.toHaveBeenCalled();
  });

  it('stop() でタイマーが解除される', async () => {
    const writer = { writeBatch: vi.fn() };
    const scheduler = new DeviceDataSaveScheduler(writer);
    scheduler.start();
    scheduler.enqueue({ data: { value: 1 } });

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(writer.writeBatch).not.toHaveBeenCalled();
  });
});
