function validateArgs(argv) {
  if (argv[2] == null) {
    console.error('[validateArgs] 設定ファイルのパスを引数で指定してください');
    return false;
  }

  return true;
}

module.exports = { validateArgs };
