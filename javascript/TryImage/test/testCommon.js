// 実行例: testMain(testArray).catch(console.error);
async function testMain(testArray) {
    const results = await Promise.all(testArray.map(fn => executeTest(fn)));

    const successCount = results.filter(r => r === true).length;
    const failureCount = results.filter(r => r === false).length;
    console.log('success: ' + successCount);
    console.log('failure: ' + failureCount);

    if (successCount === results.length) {
        console.log('All tests passed.');
    } else {
        console.log('Some tests failed !');
    }
}

async function executeTest(func) {
    try {
        await func();
        console.log(`${func.name} passed`);
        return true;
    } catch (error) {
        console.error(`${func.name} failed: `, error.message);
        return false;
    }
}

module.exports = testMain;
