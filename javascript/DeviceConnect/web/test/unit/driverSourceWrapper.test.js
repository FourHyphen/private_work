const DriverSourceWrapper = require('../../externalDevice/driverSourceWrapper');

function createFakeDriver({ connect, readStatus } = {}) {
  return {
    connect: connect ?? vi.fn().mockResolvedValue(undefined),
    readStatus: readStatus ?? vi.fn().mockResolvedValue({ value: 1 }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DriverSourceWrapper.start', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connect() を呼び、インターバル経過ごとに readStatus() の結果を onSamples([sample]) で渡す', async () => {
    const sample = { value: 42 };
    const driver = createFakeDriver({ readStatus: vi.fn().mockResolvedValue(sample) });
    const wrapper = new DriverSourceWrapper(driver, { intervalMs: 100 });
    const onSamples = vi.fn();

    await wrapper.start(onSamples, () => {}, () => {}, () => {});
    expect(driver.connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(onSamples).toHaveBeenCalledWith([sample]);
  });

  it('readStatus() が reject した場合、onError が呼ばれ err.type が無ければ driver-error を付与し、既にある場合は上書きしない', async () => {
    const errWithoutType = new Error('boom');
    const errWithType = Object.assign(new Error('already typed'), { type: 'custom-error' });
    const readStatus = vi.fn().mockRejectedValueOnce(errWithoutType).mockRejectedValueOnce(errWithType);
    const driver = createFakeDriver({ readStatus });
    const wrapper = new DriverSourceWrapper(driver, { intervalMs: 100 });
    const onError = vi.fn();

    await wrapper.start(() => {}, () => {}, () => {}, onError);

    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'driver-error' }));

    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'custom-error' }));
  });

  it('driver.connect() が reject した場合、start() の Promise も reject される', async () => {
    const driver = createFakeDriver({ connect: vi.fn().mockRejectedValue(new Error('connect failed')) });
    const wrapper = new DriverSourceWrapper(driver, { intervalMs: 100 });

    await expect(wrapper.start(() => {}, () => {}, () => {}, () => {})).rejects.toThrow('connect failed');
  });
});
