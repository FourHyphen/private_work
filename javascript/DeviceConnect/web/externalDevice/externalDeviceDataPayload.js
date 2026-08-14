class ExternalDeviceDataPayload {
  constructor(samples, connectedClients) {
    this.samples = samples;
    this.connectedClients = connectedClients;
  }

  static fromBuffer(buffer, clients) {
    return new ExternalDeviceDataPayload(buffer.flush(), clients.size);
  }
}

module.exports = ExternalDeviceDataPayload;
