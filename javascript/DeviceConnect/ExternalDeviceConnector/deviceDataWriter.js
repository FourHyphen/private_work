const fs = require('fs');

class DeviceDataWriter {
  constructor(filePath) {
    this._filePath = filePath;
  }

  write(item) {
    const line = JSON.stringify({ data: item.data, updatedAt: item.updatedAt.toISOString() }) + '\n';
    fs.appendFileSync(this._filePath, line);
  }
}

module.exports = { DeviceDataWriter };
