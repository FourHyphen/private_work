class ExternalDeviceDataBuffer {
  #buffer = [];

  push(deviceData) {
    this.#buffer.push({ ...deviceData, timestamp: new Date().toISOString() });
  }

  get isReady() { return this.#buffer.length >= 10; }

  flush() { return this.#buffer.splice(0, 10); }

  snapshot() { return [...this.#buffer]; }
}

class ExternalDeviceDataPayload {
  constructor(samples, connectedClients) {
    this.samples = samples;
    this.connectedClients = connectedClients;
  }

  static fromBuffer(buffer, clients) {
    return new ExternalDeviceDataPayload(buffer.flush(), clients.size);
  }
}

module.exports = {
  ExternalDeviceDataBuffer,
  ExternalDeviceDataPayload
};
