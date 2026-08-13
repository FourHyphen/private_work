const { validateArgs } = require('../../server/src/validateArgs');

describe('validateArgs', () => {
  let errorSpy;

  beforeEach(() => {
    // console.error をモック化してテスト中に実際のエラーメッセージを出力しないようにする
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // モックを元に戻す
    errorSpy.mockRestore();
  });

  describe('argv[2] が未指定の場合', () => {
    it('false を返す', () => {
      validateArgs(['node', 'index.js']);
      expect(validateArgs(['node', 'index.js'])).toBe(false);
    });

    it('argv[2] が null の場合も false を返す', () => {
      expect(validateArgs(['node', 'index.js', null])).toBe(false);
    });
  });

  describe('argv[2] が指定された場合', () => {
    it('true を返す', () => {
      expect(validateArgs(['node', 'index.js', '/path/to/setting.json'])).toBe(true);
    });
  });
});
