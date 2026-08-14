const path = require('path');
const DummyExternalDeviceDriver = require('./dummy');
const RealExternalDeviceDriver = require('./real');

function createExternalDeviceDriver(setting) {
  if (setting.externalDeviceMode === 'real') {
    return new RealExternalDeviceDriver({
      url: setting.externalDeviceUrl
    });
  }
  return new DummyExternalDeviceDriver();
}

module.exports = createExternalDeviceDriver;
