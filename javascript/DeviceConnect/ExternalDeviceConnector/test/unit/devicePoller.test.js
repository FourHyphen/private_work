const { DevicePoller } = require('../../devicePoller');

describe('DevicePoller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start(emitFn) 後、intervalMs 経過ごとに emitFn が呼ばれる', () => {
    vi.useFakeTimers();
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();

    poller.start(emitFn);

    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(2);
  });

  it('stop() 後はタイマーを進めても emitFn が呼ばれない', () => {
    vi.useFakeTimers();
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();

    poller.start(emitFn);
    poller.stop();
    emitFn.mockClear();

    vi.advanceTimersByTime(500 * 3);
    expect(emitFn).not.toHaveBeenCalled();
  });

  it('start() -> stop() -> start() の再開でポーリングが再度動作する', () => {
    vi.useFakeTimers();
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();

    poller.start(emitFn);
    poller.stop();
    emitFn.mockClear();

    poller.start(emitFn);
    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(1);
  });

  it('start() を連続で呼んでもタイマーが多重化しない', () => {
    vi.useFakeTimers();
    const poller = new DevicePoller(500);
    const emitFn = vi.fn();

    poller.start(emitFn);
    poller.start(emitFn);

    vi.advanceTimersByTime(500);
    expect(emitFn).toHaveBeenCalledTimes(1);
  });
});
