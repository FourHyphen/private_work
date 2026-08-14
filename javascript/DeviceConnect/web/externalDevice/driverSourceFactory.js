const path = require('path');
const DummyDriverSource = require('./dummyDriverSource');
const RealDriverSource = require('./realDriverSource');

function DriverSourceFactory(setting) {
  if (setting.externalDeviceMode === 'real') {
    return new RealDriverSource({
      url: setting.externalDeviceUrl
    });
  }
  return new DummyDriverSource();
}

module.exports = DriverSourceFactory;
