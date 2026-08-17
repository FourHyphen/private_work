// ExternalDeviceConnector 本体（メインプロセスからサブプロセスとして起動される）
// - 外部デバイスへ socket.io-client で接続し、pollIntervalMs 間隔でポーリングして最新データをバッファに保持する
// - メインプロセスからの要求にはバッファの値を即時返却する（外部デバイスへの再要求は行わない）
const { ConnectorConfig } = require('./connectorConfig');
const { ConnectorApp } = require('./connectorApp');

try {
  // 入力検証
  const config = ConnectorConfig.fromArgv(process.argv);

  // 実行開始
  const app = new ConnectorApp(config);
  app.start();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
