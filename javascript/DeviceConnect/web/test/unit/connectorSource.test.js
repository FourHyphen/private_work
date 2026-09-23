const ConnectorSource = require('../../externalDevice/connector/connectorSource');

describe('ConnectorSource.normalize', () => {
  it('{ data, updatedAt } を共通形状へ変換する（updatedAt はそのまま timestamp になる）', () => {
    const payload = { data: { seq: 1, value: 42 }, updatedAt: '2026-09-22T00:00:00.000Z' };

    const result = ConnectorSource.normalize(payload);

    expect(result).toEqual({
      online: true,
      deviceName: 'ExternalDeviceConnector',
      data: { seq: 1, value: 42 },
      timestamp: '2026-09-22T00:00:00.000Z',
    });
  });
});

describe('ConnectorSource.buildNoDataStatus', () => {
  it('type: no-data の状態オブジェクトを組み立てる', () => {
    const result = ConnectorSource.buildNoDataStatus();

    expect(result).toEqual({
      type: 'no-data',
      message: 'Connector is connected, but no data has been received from the external device',
    });
  });
});

describe('ConnectorSource.buildOversizedWarning', () => {
  it('type: data-oversized の警告オブジェクトを組み立てる', () => {
    const result = ConnectorSource.buildOversizedWarning();

    expect(result).toEqual({
      type: 'data-oversized',
      message: '[connector] latest device data was oversized and discarded',
    });
  });
});

describe('ConnectorSource.determineConnectorAvailability', () => {
  it('ready メッセージを成功と判定する', () => {
    const result = ConnectorSource.determineConnectorAvailability({ type: 'ready' });

    expect(result).toEqual({ ok: true });
  });

  it('startup-error メッセージを失敗と判定し、reason を含める', () => {
    const result = ConnectorSource.determineConnectorAvailability({ type: 'startup-error', reason: 'boom' });

    expect(result).toEqual({ ok: false, reason: 'boom' });
  });

  it('ready/startup-error 以外のメッセージは未確定として扱う', () => {
    const result = ConnectorSource.determineConnectorAvailability({ type: 'other' });

    expect(result).toEqual({ ok: null });
  });
});

describe('ConnectorSource.buildExitBeforeReadyError', () => {
  it('終了コードを含むエラーを組み立てる', () => {
    const result = ConnectorSource.buildExitBeforeReadyError(1);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('connector exited before ready: 1');
  });

  it('終了コードが null でもエラーメッセージを組み立てる', () => {
    const result = ConnectorSource.buildExitBeforeReadyError(null);

    expect(result.message).toBe('connector exited before ready: null');
  });
});
