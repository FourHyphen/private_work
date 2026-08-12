const path = require('path');
const DummyExternalDeviceDriver = require('./dummy');
const RealExternalDeviceDriver = require('./real');

const setting = require(path.join(__dirname, '../setting.json'));

function createExternalDeviceDriver() {
  if (setting.externalDeviceMode === 'real') {
    return new RealExternalDeviceDriver({
      host: setting.externalDeviceHost,
      port: setting.externalDevicePort
    });
  }
  return new DummyExternalDeviceDriver();
}

module.exports = createExternalDeviceDriver;
