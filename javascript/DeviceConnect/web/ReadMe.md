# 環境構築手順
## Node.js LTS インストール
```
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --scope user
```
インストール後は VSCode 再起動して PATH 更新を適用する

## プロジェクト依存パッケージインストール
```
cd <package.json 配置フォルダ>
npm install
```
結果は `node_modules` フォルダにインストールされる

# デバッグ実行
package.json からデバッグ実行する

# 全体構成
```mermaid
flowchart TB
    subgraph Client["クライアント層 (ブラウザ)"]
        Browser["index.html / app.js<br/>画面表示・Socket.IO 接続"]
    end

    subgraph ServerLayer["サーバー層 (Node.js)"]
        Server["server/src/index.js<br/>Express + Socket.IO"]
        Factory["createDeviceSource()<br/>唯一の経路切替点"]
    end

    subgraph DriverPath["現状経路 (deviceSource=driver)"]
        CDS["currentDriverSource.js"]
        Driver["externalDevice/index.js<br/>ドライバ生成"]
        Dummy["dummy.js (疑似)"]
        Real["real.js (実機)"]
    end

    subgraph ConnectorPath["Connector 経路 (deviceSource=connector)"]
        CS["connectorSource.js"]
        Sub["ExternalDeviceConnector<br/>(subprocess)"]
    end

    subgraph ExternalHardware["外部デバイス物理"]
        Device["外部デバイス本体"]
    end

    Setting["setting.json<br/>deviceSource / connector 設定"]

    Browser <-->|"Socket.IO (status)"| Server
    Server --> Factory
    Factory -->|"driver"| CDS
    Factory -->|"connector"| CS
    CDS --> Driver
    Driver --> Dummy
    Driver --> Real
    Real -->|"通信"| Device
    CS -->|"spawn + Socket.IO"| Sub
    Sub -->|"通信"| Device
    Setting -.->|"切替設定"| Factory
```

## setting.json 設定項目

| キー | 値 | 説明 |
|------|----|------|
| `deviceSource` | `"driver"` / `"connector"` | 取得経路スイッチ。`connector` の場合は ExternalDeviceConnector を使用する |
| `userWebClientListenPort` | 例: `8082` | ユーザー Web ブラウザからの接続を待ち受けるポート番号 |
| `externalDeviceMode` | `"dummy"` / `"real"` | `driver` 経路のみ有効。疑似デバイス or 実機 |
| `externalDeviceUrl` | 例: `"http://192.168.0.10:9600"` | `real` モード時の外部デバイス接続先 URL |
| `requestIntervalMs` | ミリ秒 | 外部デバイスデータを取得するポーリング間隔 |
| `connector.deviceUrl` | URL | `connector` 経路のみ有効。ExternalDeviceConnector が接続する外部デバイス URL |
| `connector.externalDeviceConnectorServerPort` | 例: `9002` | ExternalDeviceConnector がサーバーとして Listen するポート |

# メッセージ遷移
## ユーザー Web ブラウザ接続時と接続解除時
```mermaid
sequenceDiagram
	participant User as ユーザー
	participant Browser as Webブラウザ
	participant Server as Node.js/Expressサーバー

	User->>Browser: 画面を開く
	Browser->>Server: GET /
	Server-->>Browser: index.html
	Browser->>Server: GET /app.js
	Server-->>Browser: app.js
	Browser->>Server: GET /socket.io/socket.io.js
	Server-->>Browser: Socket.IO client script
	Browser->>Server: Socket.IO 接続開始
	Server-->>Browser: connection確立
	Browser->>Browser: 接続状態を画面表示
	Server-->>Browser: status イベント送信
	Browser->>Browser: 受信データを画面表示
	User->>Browser: タブを閉じる(またはページ離脱)
	Browser--xServer: Socket.IO 切断
	Server->>Server: clients から socket.id を削除
	Server->>Server: 切断ログを出力
```

## 外部デバイスのデータ取得してユーザー Web ブラウザに表示

### driver 経路（deviceSource=driver）

```mermaid
sequenceDiagram
    participant Server as Node.js/Expressサーバー
    participant CDS as CurrentDriverSource
    participant Device as 外部デバイス
    participant Browser as Webブラウザ

    Server->>CDS: deviceSource.start(onSamples, onError)
    CDS->>Device: driver.connect()
    loop requestIntervalMs ごと
        CDS->>Device: driver.readStatus()
        Device-->>CDS: ステータスデータ
        CDS->>Server: onSamples([sample])
        Server->>Server: buffer に追加
    end
    Note over Server: buffer が 10件に達したら
    Server-->>Browser: status イベント送信 (10サンプル)
    Browser->>Browser: 受信データを画面表示
```

### connector 経路（deviceSource=connector）

```mermaid
sequenceDiagram
    participant Server as Node.js/Expressサーバー
    participant CS as ConnectorSource
    participant Conn as ConnectorApp (subprocess)
    participant Device as 外部デバイス
    participant Browser as Webブラウザ

    Server->>CS: deviceSource.start(onSamples, onError)
    CS->>Conn: spawn node main.js
    CS->>Conn: Socket.IO 接続
    loop requestIntervalMs ごと
        CS->>Conn: MAIN_REQUEST
        Conn->>Device: DEVICE_REQUEST
        Device-->>Conn: DEVICE_DATA
        Conn-->>CS: MAIN_DATA
        CS->>CS: normalize(data)
        CS->>Server: onSamples([normalizedSample])
        Server->>Server: buffer に追加
    end
    Note over Server: buffer が 10件に達したら
    Server-->>Browser: status イベント送信 (10サンプル)
    Browser->>Browser: 受信データを画面表示
```
