const { DevicePoller } = require('../../devicePoller');

describe('DevicePoller', () => {
  // 各テスト実行後に行われる処理
  afterEach(() => {
    vi.useRealTimers();
  });

  it('開始すると指定した間隔ごとにコールバックが呼ばれる', () => {
    vi.useFakeTimers();

    // ポーリング開始
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();
    poller.start(emitFn);

    // interval だけタイマーを進めたとき、ポーリングする処理が 1 回呼ばれることを確認
    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(1);

    // ポーリングなので次も呼び出されることを確認
    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(2);
  });

  it('停止するとコールバックが呼ばれなくなる', () => {
    vi.useFakeTimers();

    // ポーリング開始
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();
    poller.start(emitFn);

    // ポーリング終了
    poller.stop();

    // ポーリング終了後は interval 以上に経過しても処理が呼ばれないことを確認
    vi.advanceTimersByTime(1500);
    expect(emitFn).not.toHaveBeenCalled();
  });

  it('停止後に再開するとポーリングが再開する', () => {
    vi.useFakeTimers();

    // ポーリング開始 -> 停止 -> 再度開始
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();
    poller.start(emitFn);
    poller.stop();
    emitFn.mockClear();
    poller.start(emitFn);

    // ポーリング中なので interval 経過後に処理が呼ばれるのが期待値
    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(1);
  });

  it('開始中に再度開始してもコールバックの呼び出しが重複しない', () => {
    vi.useFakeTimers();

    // ポーリング開始処理を複数回実行
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();
    poller.start(emitFn);
    poller.start(emitFn);

    // ポーリングの多重実行とならず、1 回だけ呼ばれるのが期待値
    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(1);
  });
});
