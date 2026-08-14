class ExternalDeviceDataPayload {
  static createStatusForInitialSync(samples, connectedClients) {
    return {
      samples,
      connectedClients,
    };
  }

  static createStatusForLiveUpdate(buffer, clients) {
    return this.createStatusForInitialSync(buffer.flush(), clients.size);
  }
}

module.exports = ExternalDeviceDataPayload;
