const net = require('net');

class RealExternalDeviceDriver {
  constructor({ host, port }) {
    this.host = host;
    this.port = port;
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port });
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });
  }

  async disconnect() {
    this.socket?.destroy();
  }

  // TODO: デバイス固有プロトコル（Modbus TCP / Omron FINS / Mitsubishi MC など）を実装
  async readStatus() {
    throw new Error('readStatus not implemented: fill in device-specific protocol');
  }
}

module.exports = RealExternalDeviceDriver;
