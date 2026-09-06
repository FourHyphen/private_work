// ExternalDeviceConnector 本体（メインプロセスからサブプロセスとして起動される）
// - 外部デバイスへ socket.io-client で接続し、pollIntervalMs 間隔でポーリングして最新データをバッファに保持する
// - メインプロセスからの要求にはバッファの値を即時返却する（外部デバイスへの再要求は行わない）
const { ConnectorConfig } = require('./connectorConfig');
const { ConnectorApp } = require('./connectorApp');

async function main({
  connectorConfig = ConnectorConfig,
  createApp = (config) => new ConnectorApp(config),
} = {}) {
  try {
    // 入力検証
    const config = connectorConfig.fromArgv(process.argv);

    // 実行開始（mainPort の listener が利用可能になるまで解決しない）
    const app = createApp(config);
    await app.start();

    // IPC を使用してメインプロセスと疎通可能になったことを送信
    if (process.send) {    // IPC 未使用実行時は false
      process.send({ type: 'ready' });
    }
  } catch (error) {
    // kind を持たないエラーは終了コード 99 にフォールバック
    const kind = error?.kind ?? 99;

    if (process.send) {
      process.send({
        type: 'startup-error',
        kind,
        reason: String(error?.message ?? error),
      });
    }

    console.error(error instanceof Error ? error.message : error);
    process.exit(kind);
  }
}

// テストなどから読み込んだ場合は main を実行しない
if (require.main === module) {
  main();
}

// テストでの使用を想定
module.exports = { main };
