const fs = require('fs');

function loadSetting(filePath) {
  // ファイル読み込み
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(`[loadSetting] ファイルを読み込めません: ${filePath}`);
  }

  // json として解釈
  let setting;
  try {
    setting = JSON.parse(raw);
  } catch {
    throw new Error(`[loadSetting] JSON の解析に失敗しました: ${filePath}`);
  }

  // 設定内容の妥当性検証
  validateSetting(setting);

  return setting;
}

function validateSetting(s) {
  if (!['driver', 'connector'].includes(s?.deviceSource))
    throw new Error('[setting] deviceSource は "driver" または "connector" でなければなりません');

  if (!isValidPort(s?.userWebClientListenPort))
    throw new Error('[setting] userWebClientListenPort は 1〜65535 の整数でなければなりません');

  if (typeof s?.requestIntervalMs !== 'number' || s.requestIntervalMs <= 0)
    throw new Error('[setting] requestIntervalMs は正の数でなければなりません');

  if (!['dummy', 'real'].includes(s?.externalDeviceMode))
    throw new Error('[setting] externalDeviceMode は "dummy" または "real" でなければなりません');

  if (!isValidUrl(s?.externalDeviceUrl))
    throw new Error('[setting] externalDeviceUrl は有効な URL でなければなりません');

  if (!s?.connector || typeof s.connector !== 'object')
    throw new Error('[setting] connector オブジェクトが必要です');

  if (!isValidUrl(s.connector.deviceUrl))
    throw new Error('[setting] connector.deviceUrl は有効な URL でなければなりません');

  if (!isValidPort(s.connector.externalDeviceConnectorServerPort))
    throw new Error('[setting] connector.externalDeviceConnectorServerPort は 1〜65535 の整数でなければなりません');
}

function isValidPort(v) {
  return Number.isInteger(v) && v >= 1 && v <= 65535;
}

function isValidUrl(v) {
  if (typeof v !== 'string') return false;
  try { new URL(v); return true; } catch { return false; }
}

module.exports = { loadSetting, validateSetting };
