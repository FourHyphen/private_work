// 唯一の分岐点: setting.json / 環境変数で取得経路を切り替える
const createExternalDeviceDriver = require('./index');       // 既存
const CurrentDriverSource = require('./currentDriverSource');
const ConnectorSource = require('./connectorSource');
const setting = require('../setting.json');

function createDeviceSource() {
  const source = process.env.DEVICE_SOURCE ?? setting.deviceSource ?? 'driver';

  switch (source) {
    case 'connector':
      return new ConnectorSource(setting.connector);
    case 'driver':
      return new CurrentDriverSource(createExternalDeviceDriver());
    default:
      throw new Error(`unknown deviceSource: ${source}`);
  }
}

module.exports = createDeviceSource;
