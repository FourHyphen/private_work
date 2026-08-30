const { LatestDeviceDataCache } = require('../../latestDeviceDataCache');
const { PendingFileSaveQueue } = require('../../pendingFileSaveQueue');

describe('LatestDeviceDataCache', () => {
  it('初期状態では latest() が null を返す', () => {
    const cache = new LatestDeviceDataCache();
    expect(cache.latest()).toBeNull();
  });

  it('データ追加後は追加した項目を返す', () => {
    const cache = new LatestDeviceDataCache();
    cache.update({ value: 42 });

    const result = cache.latest();
    expect(result.data).toEqual({ value: 42 });
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('複数回追加した場合は最後の項目を返す', () => {
    const cache = new LatestDeviceDataCache();
    // 外部デバイスから複数回データ受信しても最新 1 件のみを保持する
    cache.update({ value: 1 });
    cache.update({ value: 2 });
    cache.update({ value: 3 });

    expect(cache.latest().data).toEqual({ value: 3 });
  });

  it('保存待ちキューの保存成功・削除後も最新項目を返す', () => {
    const cache = new LatestDeviceDataCache();
    const queue = new PendingFileSaveQueue();

    cache.update({ value: 1 });
    queue.add({ value: 1 });

    // 保存待ちキュー側を保存済みとして全削除しても、最新キャッシュには影響しない
    // ※メインプロセス返却データとファイル保存データを同じキューで扱ったとき、
    //   キューを全件ファイル保存完了としてキュー全件削除するとメインプロセスに返すデータがなくなるというバグが発生した
    queue.markSaved(1);

    expect(cache.latest().data).toEqual({ value: 1 });
  });
});
