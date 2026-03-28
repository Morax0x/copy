const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const EMOJI_MORA = '<:mora:1435647151349698621>'; 

const fs = require('fs');

// 🔥 الكاش للصور الأساسية (للتسريع الجذري) 🔥
const ASSETS_CACHE = new Map();
let baseBackground = null;
let trendImages = { up: null, down: null, neutral: null };
const imageAssetsDir = path.join(process.cwd(), 'empress-assets', 'images', 'market');

// دالة تحميل الصور الأساسية مرة واحدة عند بدء التشغيل
async function preloadGlobalAssets() {
    try {
        if (!fs.existsSync(imageAssetsDir)) {
            console.error(`⚠️ [Preload Error]: Market Assets directory not found at: ${imageAssetsDir}`);
            return;
        }

        // تحميل الصور الـ Trend
        trendImages.up = await loadImage(path.join(imageAssetsDir, 'up_trend.png')).catch(()=>{});
        trendImages.down = await loadImage(path.join(imageAssetsDir, 'down_trend.png')).catch(()=>{});
        trendImages.neutral = await loadImage(path.join(imageAssetsDir, 'neutral_trend.png')).catch(()=>{});

        // (اختياري) تحميل خلفية فخمة للسوق إذا وجدت، وإلا سنرسم خلفية ملونة
        if (fs.existsSync(path.join(imageAssetsDir, 'market_bg.png'))) {
            baseBackground = await loadImage(path.join(imageAssetsDir, 'market_bg.png')).catch(()=>{});
        }

    } catch (e) { console.error("[Market Preload Error]:", e.message); }
}

// دالة جلب صورة الأصل مع كاش
async function getAssetImage(id) {
    if (ASSETS_CACHE.has(id)) return ASSETS_CACHE.get(id);
    const imgPath = path.join(imageAssetsDir, `${id.toLowerCase()}.png`);
    if (fs.existsSync(imgPath)) {
        const img = await loadImage(imgPath).catch(()=>{});
        if (img) ASSETS_CACHE.set(id, img);
        return img;
    }
    return null;
}

// دالة تنسيق السعر بدون الإيموجي (للصورة فقط)
function formatPriceText(price) {
    if (isNaN(price)) return '0 Mora';
    return Number(price).toLocaleString();
}

// 🔥🔥 دالة الرسم الرئيسية (سريعة وخفيفة) 🔥🔥
async function drawMarketGrid(items, timeRemaining, currentPage, totalPages) {
    // إعدادات الكانفاس (خفيفة لسرعة الإرسال)
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 680;
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");

    // 1️⃣ رسم الخلفية (إما صورة أو تدرج ملون)
    if (baseBackground) {
        ctx.drawImage(baseBackground, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        // خلفية داكنة واحترافية (مثل شاشة التداول)
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        gradient.addColorStop(0, '#10141e'); 
        gradient.addColorStop(1, '#080a10');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // رسم شبكة خفيفة كديكور
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < CANVAS_WIDTH; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
        for (let y = 0; y < CANVAS_HEIGHT; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }
    }

    // 2️⃣ رسم العناوين (توقيت التحديث)
    ctx.textAlign = "right";
    ctx.font = 'bold 22px "Arial", "sans-serif"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(`سيتم تحديث الأسعار بعد: ${timeRemaining}`, CANVAS_WIDTH - 25, 45);

    // 3️⃣ رسم الأصول (الشبكة 3x3)
    const TILE_WIDTH = 240;
    const TILE_HEIGHT = 160;
    const GAP_X = 20;
    const GAP_Y = 25;
    const START_X = 25;
    const START_Y = 80;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = START_X + col * (TILE_WIDTH + GAP_X);
        const y = START_Y + row * (TILE_HEIGHT + GAP_Y);

        // -- رسم مربع الأصل (خلفية كرت)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'; 
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        roundRect(ctx, x, y, TILE_WIDTH, TILE_HEIGHT, 15, true);
        ctx.shadowBlur = 0; // إيقاف الظل

        // -- جلب البيانات وحالة السهم
        const currentPrice = Number(item.currentPrice || item.currentprice);
        const changePercent = Number(item.lastChangePercent || item.lastchangepercent);
        const priceFormatted = formatPriceText(currentPrice);

        // -- رسم أيقونة الأصل
        const assetImg = await getAssetImage(item.id);
        if (assetImg) {
            ctx.drawImage(assetImg, x + 15, y + 15, 60, 60);
        }

        // -- رسم السهم (Trend)
        let trendImg = trendImages.neutral;
        if (changePercent > 0.01) trendImg = trendImages.up;
        else if (changePercent < -0.01) trendImg = trendImages.down;
        
        if (trendImg) {
            ctx.drawImage(trendImg, x + TILE_WIDTH - 65, y + 15, 50, 50);
        }

        // -- رسم النصوص (السعر والاسم)
        ctx.textAlign = "center";
        
        // اسم الأصل
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Arial", "sans-serif"';
        ctx.fillText(item.name.split(' ')[0], x + TILE_WIDTH / 2, y + 105);

        // السعر الحالي
        // تلوين السعر حسب حالة السوق لسهولة العرض
        ctx.fillStyle = changePercent > 0.01 ? '#1ddb2a' : (changePercent < -0.01 ? '#db1d2a' : '#ffffff');
        ctx.font = '28px "Arial", "sans-serif"';
        ctx.fillText(`${priceFormatted} Mora`, x + TILE_WIDTH / 2, y + 140);
    }

    // 4️⃣ رسم ترقيم الصفحات (أسفل)
    if (totalPages > 1) {
        ctx.textAlign = "center";
        ctx.font = '20px "Arial", "sans-serif"';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText(`صفحة ${currentPage + 1} من ${totalPages}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
    }

    // إرجاع الصورة كـ Buffer
    return canvas.toBuffer();
}

// دالة مساعدة لرسم مربعات بزوايا دائرية
function roundRect(ctx, x, y, width, height, radius, fill) {
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
}

// 🔥 تنفيذ تحميل الصور عند تحميل الملف 🔥
preloadGlobalAssets();

module.exports = { drawMarketGrid };
