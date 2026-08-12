const { io } = require('socket.io-client');

class RealExternalDeviceDriver {
  constructor({ url }) {
    this.url = url;
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.url, { autoConnect: false });
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
      this.socket.connect();
    });
  }

  async disconnect() {
    this.socket?.disconnect();
  }

  // TODO: 実装
  async readStatus() {
    throw new Error('readStatus not implemented: fill in device-specific protocol');
  }
}

module.exports = RealExternalDeviceDriver;
