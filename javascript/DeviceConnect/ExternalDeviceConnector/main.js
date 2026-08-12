// ExternalDeviceConnector 本体（メインプロセスからサブプロセスとして起動される）
// - 外部デバイスへ socket.io-client で接続し、メインプロセスからの要求都度データを取得して返す
// - データは蓄積せず、要求 1 件につき最新の 1 件を返すパススルー構造
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
