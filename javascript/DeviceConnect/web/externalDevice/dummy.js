class DummyExternalDeviceDriver {
  async connect() {}

  async disconnect() {}

  async readStatus() {
    return {
      online: true,
      deviceName: 'DEVICE-001-DUMMY',
      data: { counter: Math.floor(Math.random() * 100) }
    };
  }
}

module.exports = DummyExternalDeviceDriver;
