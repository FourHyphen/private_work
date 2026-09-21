class RGB {
    constructor(r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
    }
}

const sharp = require('sharp');

async function main() {
    // 画像読み込み
    let { width, height, data: image } = await loadImage('test/test001.jpg');

    // カーネルを 2 次元配列にすると異様に遅くなったため 1 次元配列にすること
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];

    // フィルタ適用
    const filteredImage = await filter(image, kernel, width, height);

    // フィルタ適用後の画像保存
    await writeImage(filteredImage);

    return 0;
}

async function loadImage(path) {
    const image = sharp(path);
    const metadata = await image.metadata();    // sharp インスタンスには width / height が存在しない
    return {
        width: metadata.width,
        height: metadata.height,
        data: await image.raw().toBuffer()    // [R, G, B, R, G, B, ...]
    };
}

async function filter(imageBuffer, kernel, width, height) {
    // return filterSharp(imageBuffer, kernel);
    return await applyFilter(imageBuffer, kernel, width, height);
}

async function applyFilter(imageBuffer, kernel, width, height) {
    let filtered = new Array(width * height).fill(new RGB(0, 0, 0));
    const kernelSize = Math.floor(Math.sqrt(kernel.length) / 2);

    // 開発環境では 3840 x 2560 全画素探索のみで 1.5s 程度かかった
    const start = performance.now();
    for (let y = kernelSize; y < height - kernelSize; y++) {
        for (let x = kernelSize; x < width - kernelSize; x++) {
            const index = y * width + x;
            filtered[index] = applyKernel(imageBuffer, x, y, kernel, kernelSize, width);
        }
    }
    const end = performance.now();
    console.log(`Filter time: ${end - start} ms`);

    return toSharp(filtered, width, height);
}

function applyKernel(imageBuffer, x, y, kernel, kernelSize, width) {
    let r = 0;
    let g = 0;
    let b = 0;
    let kernelIndex = 0;

    for(let ky = -kernelSize; ky <= kernelSize; ky++) {
        for(let kx = -kernelSize; kx <= kernelSize; kx++) {
            // カーネルを 2 次元配列にするとここでカーネルインデックス計算が必要、これが異様に遅くなった
            const imageIndex = ((y + ky) * width + (x + kx)) * 3;
            r += imageBuffer[imageIndex] * kernel[kernelIndex];
            g += imageBuffer[imageIndex + 1] * kernel[kernelIndex];
            b += imageBuffer[imageIndex + 2] * kernel[kernelIndex];
            kernelIndex++;
        }
    }

    return new RGB(toByte(r), toByte(g), toByte(b));
}

function toByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

// 前提: imageArray は RGB クラスインスタンスで全て埋めてある
function toSharp(imageArray, width, height) {
    let buffer = Buffer.alloc(width * height * 3);    // 3 = rgb channels
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            buffer[index * 3] = imageArray[index].r;
            buffer[index * 3 + 1] = imageArray[index].g;
            buffer[index * 3 + 2] = imageArray[index].b;
        }
    }

    return new sharp(buffer, {
        raw: {
            width: width,
            height: height,
            channels: 3
        }
    });
}

// 最速で実行するにはこれで十分
// function filterSharp(image, kernel) {
//     return image.convolve({
//         width: kernel[0].length,
//         height: kernel.length,
//         kernel: kernel.flat()
//     });
// }

async function writeImage(image) {
    return await image.toFile('test/output.jpg');
}

if (require.main === module) {
    // CommonJS ではトップレベルの await 使用不可
    main().catch(console.error);
}

module.exports = {
    applyFilter,
    applyKernel,
    toByte,
    toSharp
}
