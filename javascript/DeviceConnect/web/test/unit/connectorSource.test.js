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
