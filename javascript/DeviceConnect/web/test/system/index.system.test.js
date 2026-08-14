const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { io } = require('socket.io-client');

const SERVER_ENTRY_POINT_RELATIVE_PATH = 'server/src/index.js';

describe('server/src/index.js system test', () => {
  it('設定ファイルを指定すると起動し、socket.io クライアントに status を返す', async () => {
    const cwd = path.resolve(__dirname, '../..');

    // 引数とする json の中身文字列を作成
    // 例として作成済みの json の設定を使いつつ、ポート番号を動的に設定
    const baseSettingPath = path.join(cwd, 'example/setting.json');
    const baseSetting = JSON.parse(fs.readFileSync(baseSettingPath, 'utf-8'));
    const port = await reservePort();    // 今使われていない空きポート番号を取得
    const setting = { ...baseSetting, userWebClientListenPort: port };

    // 引数とする json を作成
    const tmpSettingPath = path.join(os.tmpdir(), `web-system-setting-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(tmpSettingPath, JSON.stringify(setting), 'utf-8');

    // 子プロセスとして起動
    const indexPath = path.join(cwd, SERVER_ENTRY_POINT_RELATIVE_PATH);
    const child = spawn(process.execPath, [indexPath, tmpSettingPath], {
      cwd,    // 子プロセスの作業フォルダ
      stdio: ['ignore', 'pipe', 'pipe'],    // 標準入力を無視, 標準出力と標準エラー出力をパイプでこのプロセスから受け取れるよう設定
    });

    let socket;
    try {
      // プロセス開始して、サーバーが listen したら次に進む
      await waitForChildOutput(child, `Server listening on http://localhost:${port}`);

      // listen を確認したサーバーに接続
      socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        timeout: 5000,
      });

      // サーバーと確実に接続したら次に進む
      const status_payload = await waitForCompleteConnectServer(socket);

      // status イベントの payload の中身が期待通りかを確認
      expect(status_payload).toHaveProperty('samples');
      expect(Array.isArray(status_payload.samples)).toBe(true);
      expect(status_payload).toHaveProperty('connectedClients');
      expect(status_payload.connectedClients).toBeGreaterThanOrEqual(1);

      // 子プロセスを終了させる
      child.kill('SIGINT');
      const { code, signal } = await waitForExit(child);

      // 通常終了(code: 0)でも SIGINT(signal: SIGINT) による終了でも、終了していれば OK とする
      expect(code === 0 || signal === 'SIGINT').toBe(true);
    } finally {
      if (socket) {
        socket.disconnect();
      }

      if (!child.killed) {
        child.kill('SIGKILL');
      }

      if (fs.existsSync(tmpSettingPath)) {
        fs.unlinkSync(tmpSettingPath);
      }
    }
  }, 20000);

  it('設定ファイル引数なしの場合は終了コード 1 で終了する', async () => {
    const cwd = path.resolve(__dirname, '../..');
    const indexPath = path.join(cwd, SERVER_ENTRY_POINT_RELATIVE_PATH);

    const child = spawn(process.execPath, [indexPath], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const { code } = await waitForExit(child);
    expect(code).toBe(1);
  }, 10000);
});

// 今使われていない空きポート番号を 1 つ取得して返す
function reservePort() {
  return new Promise((resolve, reject) => {
    // 一時的な TCP サーバーを作成
    const server = net.createServer();
    server.once('error', reject);

    // OS に空きポートを割り当ててもらう
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      // OS がポートを自動割り当てした番号を空きポートとする
      if (!address || typeof address === 'string') {
        // サーバー閉じる(実際に値を返すのは close 側で行う)
        server.close(() => reject(new Error('Failed to reserve port')));
        return;
      }

      const { port } = address;

      // サーバー close 時の処理
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);    // await で待っている呼び出し元に空きポート番号を返す
      });
    });
  });
}

// 子プロセスの標準出力を監視して、指定した文字列が出るまで待つ
// needle -> 待つ文字列
function waitForChildOutput(child, needle, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let output = '';

    // 子プロセスが出力した内容を output に追加していき、needle が含まれるかをチェック
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(needle)) {
        cleanup();
        resolve(output);    // needle が含まれることを確認したので await での呼び出し元に返す
      }
    };

    // 子プロセスが終了した場合は失敗とする
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Process exited before ready (code=${code}, signal=${signal})\n${output}`));
    };

    // タイムアウトしたら失敗とする
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for output: ${needle}\n${output}`));
    }, timeoutMs);

    // 後始末、イベント監視を止める
    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    }

    // イベント監視開始
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', onExit);
  });
}

// socket.io サーバーと接続完了するまで待つ
// Returns: status イベントの payload
function waitForCompleteConnectServer(socket, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    // タイムアウト時は失敗とする
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for status event'));
    }, timeoutMs);

    // socket.io の statusイベント(状態変化時のイベント)受信をもって接続完了とする
    const onStatus = (payload) => {
      cleanup();
      resolve(payload);
    };

    // 接続失敗時は失敗とする
    const onConnectError = (err) => {
      cleanup();
      reject(err);
    };

    // イベント設定を解除
    function cleanup() {
      clearTimeout(timer);
      socket.off('status', onStatus);
      socket.off('connect_error', onConnectError);
    }

    // 1 度だけ有効なリスナーを設定
    socket.once('status', onStatus);
    socket.once('connect_error', onConnectError);
  });
}

// 子プロセスが終了するまで待つ
// Return: 通常終了時 -> { code: 0, signal: null }
//         シグナル終了時 -> { code: null, signal: 'SIGINT' }
function waitForExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    // exit イベント発生を捉えたら成功とする
    const onExit = (code, signal) => {
      cleanup();
      resolve({ code, signal });
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for process exit'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      child.off('exit', onExit);
    }

    child.once('exit', onExit);
  });
}
