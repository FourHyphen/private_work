const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadSetting } = require('../../server/src/loadSetting');

const EXAMPLE_SETTING_JSON_PATH = path.resolve(__dirname, '../../example/setting.json');

describe('loadSetting', () => {
  describe('ファイルパスが指定された場合', () => {
    let tmpFile;

    beforeAll(() => {
      const customSetting = {
        deviceSource: 'connector',
        userWebClientListenPort: 9090,
        requestIntervalMs: 200,
        externalDeviceMode: 'real',
        externalDeviceUrl: 'http://10.0.0.1:9600',
        connector: { deviceUrl: 'http://10.0.0.1:9001', externalDeviceConnectorServerPort: 9003 },
      };
      tmpFile = path.join(os.tmpdir(), `setting-test-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(customSetting), 'utf-8');
    });

    afterAll(() => {
      fs.unlinkSync(tmpFile);
    });

    it('指定されたファイルを読み込んで返す', () => {
      const setting = loadSetting(tmpFile);
      expect(setting.deviceSource).toBe('connector');
      expect(setting.userWebClientListenPort).toBe(9090);
    });
  });

  describe('エラーケース', () => {
    it('指定したファイルが存在しない場合は Error を送出する', () => {
      expect(() => loadSetting('/nonexistent/path/setting.json')).toThrow(Error);
    });

    it('指定したファイルが JSON でない場合は Error を送出する', () => {
      let tmpFile;
      try {
        tmpFile = path.join(os.tmpdir(), `setting-invalid-${Date.now()}.json`);
        fs.writeFileSync(tmpFile, 'not-json', 'utf-8');
        expect(() => loadSetting(tmpFile)).toThrow(Error);
      } finally {
        if (tmpFile) fs.unlinkSync(tmpFile);
      }
    });
  });
});

describe('validateSetting — 必須パラメーター検証', () => {
  const { validateSetting } = require('../../server/src/loadSetting');

  const VALID = {
    deviceSource: 'driver',
    userWebClientListenPort: 8082,
    requestIntervalMs: 100,
    externalDeviceMode: 'dummy',
    externalDeviceUrl: 'http://192.168.0.10:9600',
    connector: {
      deviceUrl: 'http://localhost:9001',
      externalDeviceConnectorServerPort: 9002,
    },
  };

  it('有効な設定はエラーを送出しない', () => {
    expect(() => validateSetting(VALID)).not.toThrow();
  });

  describe('deviceSource', () => {
    it.each([undefined, null, 123, 'unknown'])(
      '不正値 %s の場合は Error を送出する',
      (val) => {
        expect(() => validateSetting({ ...VALID, deviceSource: val })).toThrow(Error);
      }
    );
  });

  describe('userWebClientListenPort', () => {
    it.each([undefined, null, 0, -1, 65536, 3.5, '8082'])(
      '不正値 %s の場合は Error を送出する',
      (val) => {
        expect(() => validateSetting({ ...VALID, userWebClientListenPort: val })).toThrow(Error);
      }
    );
  });

  describe('requestIntervalMs', () => {
    it.each([undefined, null, 0, -1, '100'])(
      '不正値 %s の場合は Error を送出する',
      (val) => {
        expect(() => validateSetting({ ...VALID, requestIntervalMs: val })).toThrow(Error);
      }
    );
  });

  describe('externalDeviceMode', () => {
    it.each([undefined, null, 'unknown', 123])(
      '不正値 %s の場合は Error を送出する',
      (val) => {
        expect(() => validateSetting({ ...VALID, externalDeviceMode: val })).toThrow(Error);
      }
    );
  });

  describe('externalDeviceUrl', () => {
    it.each([undefined, null, 123, 'not-a-url'])(
      '不正値 %s の場合は Error を送出する',
      (val) => {
        expect(() => validateSetting({ ...VALID, externalDeviceUrl: val })).toThrow(Error);
      }
    );
  });

  describe('connector', () => {
    it('deviceSource が driver の場合は connector を省略してもエラーを送出しない', () => {
      const { connector: _, ...withoutConnector } = VALID;
      expect(() => validateSetting(withoutConnector)).not.toThrow();
    });

    it('deviceSource が connector の場合は connector が未定義なら Error を送出する', () => {
      const { connector: _, ...withoutConnector } = VALID;
      expect(() => validateSetting({ ...withoutConnector, deviceSource: 'connector' })).toThrow(Error);
    });

    describe('connector.deviceUrl', () => {
      it.each([undefined, null, 123, 'not-a-url'])(
        '不正値 %s の場合は Error を送出する',
        (val) => {
          expect(() => validateSetting({ ...VALID, deviceSource: 'connector', connector: { ...VALID.connector, deviceUrl: val } })).toThrow(Error);
        }
      );
    });

    describe('connector.externalDeviceConnectorServerPort', () => {
      it.each([undefined, null, 0, -1, 65536, 3.5, '9002'])(
        '不正値 %s の場合は Error を送出する',
        (val) => {
          expect(() => validateSetting({ ...VALID, deviceSource: 'connector', connector: { ...VALID.connector, externalDeviceConnectorServerPort: val } })).toThrow(Error);
        }
      );
    });
  });
});

describe('例である setting.json がバリデーションを通過すること', () => {
  it('loadSetting がエラーなく設定を返す', () => {
    expect(() => loadSetting(EXAMPLE_SETTING_JSON_PATH)).not.toThrow();
  });
});
