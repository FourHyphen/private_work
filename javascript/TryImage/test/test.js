const assert = require('assert');
const main = require('../main');
const testMain = require('./testCommon'); 

async function testApplyFilter() {
    const { applyFilter } = main;

    // 3x3 pixel
    const imageBuffer = [
        1, 2, 3, 1, 2, 3, 1, 2, 3,    // (R, G, B), (R, G, B), (R, G, B)
        1, 2, 3, 1, 2, 3, 1, 2, 3,    // (R, G, B), (R, G, B), (R, G, B)
        1, 2, 3, 1, 2, 3, 1, 2, 3     // (R, G, B), (R, G, B), (R, G, B)
    ];

    const kernel = [
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
    ];

    const result = await applyFilter(imageBuffer, kernel, /* width = */ 3, /* height = */ 3);

    // 比較可能なよう、sharp インスタンスから画素値バッファ取得
    const actual = await result.raw().toBuffer();

    // 期待値を作成(中心のみカーネル適用、他は 0)
    const expected = Buffer.alloc(3 * 3 * 3);    // 3x3 pixels, 3 channels (RGB)
    const center = (1 * 3 + 1) * 3;
    expected[center] = 45;
    expected[center + 1] = 90;
    expected[center + 2] = 135;

    assert.deepEqual(actual, expected, 'testApplyFilter(): actual should be expected');
}

function testApplyKernel() {
    const { applyKernel } = main;

    // 3x3 pixel
    const imageBuffer = [
        1, 2, 3, 1, 2, 3, 1, 2, 3,    // (R, G, B), (R, G, B), (R, G, B)
        1, 2, 3, 1, 2, 3, 1, 2, 3,    // (R, G, B), (R, G, B), (R, G, B)
        1, 2, 3, 1, 2, 3, 1, 2, 3     // (R, G, B), (R, G, B), (R, G, B)
    ];

    const kernel = [
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
    ];

    const actual = applyKernel(imageBuffer, 1, 1, kernel, /* kernelSize = */ 1, /* width = */ 3);

    assert.equal(actual.r, 45, 'testApplyKernel(): actual.r should be 45');
    assert.equal(actual.g, 45 * 2, 'testApplyKernel(): actual.g should be 90');
    assert.equal(actual.b, 45 * 3, 'testApplyKernel(): actual.b should be 135');
}

function testToByte() {
    const { toByte } = main;
    assert.equal(toByte(256), 255, 'testToByte(): toByte(256) should be 255');
    assert.equal(toByte(-1), 0, 'testToByte(): toByte(-1) should be 0');
    assert.equal(toByte(128.7), 129, 'testToByte(): toByte(128.7) should be 129');
}

if (require.main === module) {
    const testArray = [testApplyFilter, testApplyKernel, testToByte];
    testMain(testArray).catch(console.error);
}
