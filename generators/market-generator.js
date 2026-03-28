const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require('fs');

// 🔥 1. مسارات الصور الثابتة (موجودة بنفس الملف كما طلبت) 🔥
const MARKET_DIR = path.join(process.cwd(), 'empress-assets', 'images', 'market');

const TREND_PATHS = {
    up: path.join(MARKET_DIR, 'up_trend.png'),
    down: path.join(MARKET_DIR, 'down_trend.png'),
    neutral: path.join(MARKET_DIR, 'neutral_trend.png')
};

// 🔥 2. نظام الكاش للذاكرة العشوائية (للسرعة الفائقة)
const ASSETS_CACHE = new Map();
let trendImages = { up: null, down: null, neutral: null };

// دالة تحميل صورة واحدة وحفظها في الكاش
async function loadAndCacheImage(key, imgPath) {
    if (ASSETS_CACHE.has(key)) return ASSETS_CACHE.get(key);
    try {
        if (fs.existsSync(imgPath)) {
            const img = await loadImage(imgPath);
            ASSETS_CACHE.set(key, img);
            return img;
        }
    } catch (e) {
        console.error(`[Market Image Error] فشل تحميل: ${imgPath}`);
    }
    return null;
}

// دالة جلب صورة الأصل (اللوغو)
async function getAssetImage(item) {
    const localPath = path.join(MARKET_DIR, `${item.id.toLowerCase()}.png`);
    let img = await loadAndCacheImage(item.id, localPath);
    
    // إذا لم يجد الصورة محلياً، يجلبها من الرابط ويحفظها بالكاش
    if (!img && item.image) {
        if (ASSETS_CACHE.has(item.id + "_url")) return ASSETS_CACHE.get(item.id + "_url");
        try {
            img = await loadImage(item.image);
            ASSETS_CACHE.set(item.id + "_url", img);
        } catch (e) {}
    }
    return img;
}

// دالة جلب آفتار المستخدم
async function getUserAvatar(url) {
    if (!url) return null;
    if (ASSETS_CACHE.has(url)) return ASSETS_CACHE.get(url);
    try {
        const img = await loadImage(url);
        ASSETS_CACHE.set(url, img);
        return img;
    } catch (e) { return null; }
}

function formatPriceText(price) {
    if (isNaN(price)) return '0';
    return Number(price).toLocaleString();
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'undefined') radius = 5;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function drawSciFiPanel(ctx, x, y, width, height, borderColor, glowColor) {
    const cut = 25; 
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - cut);
    ctx.lineTo(x + width - cut, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + cut);
    ctx.closePath();

    ctx.fillStyle = 'rgba(8, 12, 22, 0.9)';
    ctx.fill();

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    ctx.shadowBlur = 0; 
    
    ctx.beginPath();
    ctx.moveTo(x + 5, y + cut + 10);
    ctx.lineTo(x + 5, y + height - 10);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.stroke();
}

function drawSparkline(ctx, x, y, width, height, isUp, isDown, color) {
    ctx.beginPath();
    let currentY = isUp ? y + height : (isDown ? y : y + height / 2);
    ctx.moveTo(x, currentY);

    const points = 6;
    const stepX = width / points;

    for (let i = 1; i <= points; i++) {
        let randomFluctuation = (Math.random() - 0.5) * 20; 
        if (isUp) currentY -= (height / points) + randomFluctuation;
        else if (isDown) currentY += (height / points) + randomFluctuation;
        else currentY += randomFluctuation;
        currentY = Math.max(y, Math.min(currentY, y + height)); 
        ctx.lineTo(x + (i * stepX), currentY);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// 🎨 اللوحة الرئيسية (تمت برمجة السرعة القصوى هنا)
exports.drawMarketGrid = async function drawMarketGrid(items, timeRemaining, currentPage, totalPages, userAvatarUrl) {
    const CANVAS_WIDTH = 1280;
    const CANVAS_HEIGHT = 960;
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    const FONT_FAMILY = '"Arial", sans-serif';

    // 🔥 جلب كل الصور (لوغوهات + أسهم + أفتار) في نفس اللحظة (Parallel Fetching) للسرعة الفائقة 🔥
    const [avatarImg, ...loadedAssets] = await Promise.all([
        getUserAvatar(userAvatarUrl),
        ...items.map(item => getAssetImage(item))
    ]);

    // التأكد من تحميل صور الأسهم
    if (!trendImages.up) trendImages.up = await loadAndCacheImage('trend_up', TREND_PATHS.up);
    if (!trendImages.down) trendImages.down = await loadAndCacheImage('trend_down', TREND_PATHS.down);
    if (!trendImages.neutral) trendImages.neutral = await loadAndCacheImage('trend_neutral', TREND_PATHS.neutral);

    // 1️⃣ رسم الخلفية
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#04070d'); 
    bgGradient.addColorStop(0.5, '#0a1224'); 
    bgGradient.addColorStop(1, '#020408'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
    for (let x = 20; x < CANVAS_WIDTH; x += 40) {
        for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
            ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // 2️⃣ رسم الهيدر
    ctx.fillStyle = 'rgba(0, 255, 255, 0.03)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 100);
    
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(CANVAS_WIDTH, 100); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = "right";
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 42px ${FONT_FAMILY}`;
    ctx.fillText('سوق الاستثمارات', CANVAS_WIDTH - 50, 65);

    ctx.textAlign = "left";
    ctx.font = `bold 24px ${FONT_FAMILY}`;
    ctx.fillStyle = '#00ffff'; 
    ctx.fillText(`التحديث القادم: ${timeRemaining}`, 160, 62);

    // رسم الأفتار
    if (avatarImg) {
        const ax = 50, ay = 10, asize = 80;
        ctx.save();
        ctx.beginPath(); ctx.arc(ax + asize/2, ay + asize/2, asize/2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        ctx.drawImage(avatarImg, ax, ay, asize, asize);
        ctx.restore();
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ax + asize/2, ay + asize/2, asize/2, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    }

    // 3️⃣ رسم الكروت (بدون أي await داخل اللوب للسرعة الصاروخية)
    const CARD_WIDTH = 370;
    const CARD_HEIGHT = 230;
    const GAP_X = 35;
    const GAP_Y = 35;
    const START_X = 50;
    const START_Y = 150;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = START_X + col * (CARD_WIDTH + GAP_X);
        const y = START_Y + row * (CARD_HEIGHT + GAP_Y);

        const changePercent = Number(item.lastChangePercent || item.lastchangepercent || 0);
        const currentPrice = Number(item.currentPrice || item.currentprice || item.price || 0);
        const isUp = changePercent > 0.01;
        const isDown = changePercent < -0.01;

        const mainColor = isUp ? '#00ff88' : (isDown ? '#ff0055' : '#00ccff');
        const glowColor = isUp ? 'rgba(0, 255, 136, 0.6)' : (isDown ? 'rgba(255, 0, 85, 0.6)' : 'rgba(0, 204, 255, 0.6)');
        const borderColor = isUp ? 'rgba(0, 255, 136, 0.8)' : (isDown ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 204, 255, 0.8)');

        drawSciFiPanel(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, borderColor, glowColor);
        drawSparkline(ctx, x + 20, y + Math.floor(CARD_HEIGHT * 0.7), CARD_WIDTH - 40, 50, isUp, isDown, mainColor);

        // صورة اللوغو (تم جلبها مسبقاً)
        const assetImg = loadedAssets[i];
        if (assetImg) {
            ctx.shadowColor = glowColor; ctx.shadowBlur = 15;
            ctx.drawImage(assetImg, x + 15, y + 15, 100, 100);
            ctx.shadowBlur = 0;
        }

        // صورة السهم 
        const trendImg = isUp ? trendImages.up : (isDown ? trendImages.down : trendImages.neutral);
        if (trendImg) {
            ctx.drawImage(trendImg, x + CARD_WIDTH - 90, y + 15, 75, 75);
        }

        ctx.textAlign = "left";
        const cleanName = (item.name || "").replace(/<a?:.+?:\d+>/g, '').replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿]/gu, '').trim();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 24px ${FONT_FAMILY}`;
        ctx.fillText(cleanName, x + 125, y + 50);
        
        ctx.fillStyle = isUp ? 'rgba(0, 255, 136, 0.15)' : (isDown ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 204, 255, 0.15)');
        roundRect(ctx, x + 125, y + 65, 100, 30, 5, true);
        ctx.strokeStyle = mainColor; ctx.lineWidth = 1; ctx.stroke();
        
        ctx.fillStyle = mainColor;
        ctx.font = `bold 18px ${FONT_FAMILY}`;
        const sign = changePercent > 0 ? '+' : '';
        ctx.fillText(`${sign}${(changePercent * 100).toFixed(2)}%`, x + 135, y + 87);

        ctx.textAlign = "center";
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 36px ${FONT_FAMILY}`;
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 10;
        ctx.fillText(`${formatPriceText(currentPrice)}`, x + CARD_WIDTH / 2, y + 155);
        ctx.shadowBlur = 0;
    }

    if (totalPages > 1) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, CANVAS_HEIGHT - 60, CANVAS_WIDTH, 60);
        ctx.textAlign = "center";
        ctx.font = `bold 22px ${FONT_FAMILY}`;
        ctx.fillStyle = '#00ffff';
        ctx.fillText(`صفحة [ ${currentPage + 1} / ${totalPages} ]`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
    }

    return canvas.toBuffer();
};

// 🎨 2. رسم بطاقة التفاصيل (تم تسريعها أيضاً)
exports.drawMarketDetail = async function drawMarketDetail(item, userQuantity, currentPrice, changePercent) {
    const CANVAS_WIDTH = 900;
    const CANVAS_HEIGHT = 450;
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    const FONT_FAMILY = '"Arial", sans-serif';

    const isUp = changePercent > 0.01;
    const isDown = changePercent < -0.01;

    const mainColor = isUp ? '#00ff88' : (isDown ? '#ff0055' : '#00ccff');
    const glowColor = isUp ? 'rgba(0, 255, 136, 0.6)' : (isDown ? 'rgba(255, 0, 85, 0.6)' : 'rgba(0, 204, 255, 0.6)');
    const borderColor = isUp ? 'rgba(0, 255, 136, 0.8)' : (isDown ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 204, 255, 0.8)');

    const bgGradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#04070d'); 
    bgGradient.addColorStop(1, '#0a1224'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawSciFiPanel(ctx, 20, 20, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40, borderColor, glowColor);

    // التأكد من تحميل صور الأسهم
    if (!trendImages.up) trendImages.up = await loadAndCacheImage('trend_up', TREND_PATHS.up);
    if (!trendImages.down) trendImages.down = await loadAndCacheImage('trend_down', TREND_PATHS.down);
    if (!trendImages.neutral) trendImages.neutral = await loadAndCacheImage('trend_neutral', TREND_PATHS.neutral);

    const assetImg = await getAssetImage(item);
    if (assetImg) {
        ctx.globalAlpha = 0.1;
        ctx.drawImage(assetImg, 50, 50, 350, 350); 
        ctx.globalAlpha = 1.0;
        ctx.shadowColor = glowColor; ctx.shadowBlur = 25;
        ctx.drawImage(assetImg, 50, 100, 200, 200); 
        ctx.shadowBlur = 0;
    }

    ctx.textAlign = "left";
    const cleanName = (item.name || "").replace(/<a?:.+?:\d+>/g, '').replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿]/gu, '').trim();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 48px ${FONT_FAMILY}`;
    ctx.fillText(cleanName, 300, 100);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `22px ${FONT_FAMILY}`;
    ctx.fillText(item.description || 'أصل استثماري في بورصة الإمبراطورية.', 300, 140);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    roundRect(ctx, 300, 170, 250, 90, 10, true);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `18px ${FONT_FAMILY}`;
    ctx.fillText('السعر الحالي للوحدة:', 320, 200);
    ctx.fillStyle = mainColor;
    ctx.font = `bold 38px ${FONT_FAMILY}`;
    ctx.fillText(`${formatPriceText(currentPrice)}`, 320, 245);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    roundRect(ctx, 570, 170, 250, 90, 10, true);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `18px ${FONT_FAMILY}`;
    ctx.fillText('التغير في الفترة الأخيرة:', 590, 200);
    
    const sign = changePercent > 0 ? '+' : '';
    ctx.fillStyle = mainColor;
    ctx.font = `bold 38px ${FONT_FAMILY}`;
    ctx.fillText(`${sign}${(changePercent * 100).toFixed(2)}%`, 590, 245);

    const trendImg = isUp ? trendImages.up : (isDown ? trendImages.down : trendImages.neutral);
    if (trendImg) {
        ctx.drawImage(trendImg, 750, 185, 60, 60);
    }

    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
    roundRect(ctx, 300, 280, 520, 80, 10, true);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.stroke();
    
    ctx.fillStyle = '#00ffff';
    ctx.font = `bold 26px ${FONT_FAMILY}`;
    ctx.fillText(`الرصيد المملوك في المحفظة: ${userQuantity.toLocaleString()} وحدة`, 320, 330);

    return canvas.toBuffer();
};

// شحن الكاش أول ما يشتغل الملف
(async () => {
    try {
        if (!trendImages.up) trendImages.up = await loadAndCacheImage('trend_up', TREND_PATHS.up);
        if (!trendImages.down) trendImages.down = await loadAndCacheImage('trend_down', TREND_PATHS.down);
        if (!trendImages.neutral) trendImages.neutral = await loadAndCacheImage('trend_neutral', TREND_PATHS.neutral);
    } catch(e){}
})();
