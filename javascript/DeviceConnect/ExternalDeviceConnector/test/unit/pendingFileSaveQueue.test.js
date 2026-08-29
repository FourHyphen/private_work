const { PendingFileSaveQueue, MAX_PENDING_QUEUE_SIZE } = require('../../pendingFileSaveQueue');

describe('PendingFileSaveQueue', () => {
  it('追加順に未保存項目を返す', () => {
    const queue = new PendingFileSaveQueue();
    queue.add({ value: 1 });
    queue.add({ value: 2 });

    const pending = queue.pending();
    expect(pending).toHaveLength(2);
    expect(pending[0].data).toEqual({ value: 1 });
    expect(pending[1].data).toEqual({ value: 2 });
  });

  it('markSaved(count) は成功件数だけ先頭から削除する', () => {
    const queue = new PendingFileSaveQueue();
    queue.add({ value: 1 });
    queue.add({ value: 2 });
    queue.add({ value: 3 });

    queue.markSaved(2);

    const pending = queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toEqual({ value: 3 });
  });

  it('書き込み中に追加された項目は、進行中バッチの成功後も残る', () => {
    const queue = new PendingFileSaveQueue();
    queue.add({ value: 1 });
    queue.add({ value: 2 });

    // 書き込み開始時点のスナップショットを取得
    const pendingAtFlushStart = queue.pending();
    expect(pendingAtFlushStart).toHaveLength(2);

    // 書き込み中に新しいデータが追加される
    queue.add({ value: 3 });

    // 開始時点で取得した件数だけを保存済みとして削除する
    queue.markSaved(pendingAtFlushStart.length);

    const pending = queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toEqual({ value: 3 });
  });

  it('上限超過時は最古の保存待ち項目を破棄する', () => {
    const queue = new PendingFileSaveQueue();

    for (let i = 0; i < MAX_PENDING_QUEUE_SIZE; i++) {
      queue.add({ value: i });
    }

    // 超過分
    queue.add({ value: MAX_PENDING_QUEUE_SIZE });

    const pending = queue.pending();
    expect(pending).toHaveLength(MAX_PENDING_QUEUE_SIZE);

    // FIFO のため最古の 0 番目は破棄され、先頭は 1 に、末尾は MAX_PENDING_QUEUE_SIZE になる
    expect(pending[0].data).toEqual({ value: 1 });
    expect(pending[pending.length - 1].data).toEqual({ value: MAX_PENDING_QUEUE_SIZE });
  });
});
