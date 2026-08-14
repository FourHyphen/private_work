const createExternalDeviceDriver = require('./index');
const CurrentDriverSource = require('./currentDriverSource');
const ConnectorSource = require('./connectorSource');

// 設定オブジェクトの指示通りの経路を確立する
function createDeviceSource(setting) {
  const source = setting.deviceSource;

  switch (source) {
    // 想定: 外部デバイス接続に ExternalDeviceConnector 使用
    case 'connector':
      return new ConnectorSource({
        deviceUrl: setting.connector.deviceUrl,
        externalDeviceConnectorServerPort: setting.connector.externalDeviceConnectorServerPort,
        requestIntervalMs: setting.requestIntervalMs,
      });
    // 想定: このアプリから直接外部デバイスに接続
    case 'driver':
      return new CurrentDriverSource(createExternalDeviceDriver(setting), { intervalMs: setting.requestIntervalMs });
    // 想定外の場合
    default:
      throw new Error(`unknown deviceSource: ${source}`);
  }
}

module.exports = createDeviceSource;
