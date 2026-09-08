// 外部デバイスとメインプロセスの接続に使う socket イベント名（最小構成の共有定義）
module.exports = {
  // 外部デバイス <-> Connector
  DEVICE_REQUEST: 'device:request', // Connector -> 外部デバイス: データ取得要求
  DEVICE_DATA: 'device:data',       // 外部デバイス -> Connector: データ返却

  // メインプロセス <-> Connector
  MAIN_REQUEST: 'main:request',     // メインプロセス -> Connector: データ取得要求
  MAIN_DATA: 'main:data',           // Connector -> メインプロセス: 外部デバイスデータ返却
  MAIN_NO_DATA: 'main:nodata',       // Connector -> メインプロセス: バッファが空（未受信）
  MAIN_DATA_OVERSIZED: 'main:data-oversized' // Connector -> メインプロセス: 直近受信データがサイズ超過
};
