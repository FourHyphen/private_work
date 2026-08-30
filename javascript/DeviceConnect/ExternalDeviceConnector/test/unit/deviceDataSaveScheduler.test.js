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

    scheduler.enqueue({ value: 42 });
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

    writer.writeBatch
      .mockImplementationOnce(() => { throw error; })
      .mockImplementationOnce(() => {});

    const scheduler = new DeviceDataSaveScheduler(writer);
    scheduler.start();
    scheduler.enqueue({ value: 99 });

    await vi.advanceTimersByTimeAsync(500);
    expect(consoleError).toHaveBeenCalledWith('[connector] write failed:', error);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(2);
    const retried = writer.writeBatch.mock.calls[1][0];
    expect(retried).toHaveLength(1);
    expect(retried[0].data).toEqual({ value: 99 });
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
    scheduler.enqueue({ value: 1 });

    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);

    resolveWrite();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(writer.writeBatch).toHaveBeenCalledTimes(1);
  });
});
