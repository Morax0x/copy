const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require('fs');

const imageAssetsDir = path.join(process.cwd(), 'empress-assets', 'images', 'market');

// الكاش للصور
const ASSETS_CACHE = new Map();
let trendImages = { up: null, down: null, neutral: null };

async function preloadGlobalAssets() {
    try {
        if (!fs.existsSync(imageAssetsDir)) return;
        trendImages.up = await loadImage(path.join(imageAssetsDir, 'up_trend.png')).catch(()=>{});
        trendImages.down = await loadImage(path.join(imageAssetsDir, 'down_trend.png')).catch(()=>{});
        trendImages.neutral = await loadImage(path.join(imageAssetsDir, 'neutral_trend.png')).catch(()=>{});
    } catch (e) { console.error("[Market Preload Error]:", e.message); }
}

async function getAssetImage(item) {
    if (ASSETS_CACHE.has(item.id)) return ASSETS_CACHE.get(item.id);
    
    // محاولة جلب الصورة المحلية أولاً
    const imgPath = path.join(imageAssetsDir, `${item.id.toLowerCase()}.png`);
    if (fs.existsSync(imgPath)) {
        const img = await loadImage(imgPath).catch(()=>{});
        if (img) { ASSETS_CACHE.set(item.id, img); return img; }
    }
    
    // إذا لم تتوفر الصورة المحلية، نجلبها من الرابط في الجيسون
    if (item.image) {
        const img = await loadImage(item.image).catch(()=>{});
        if (img) { ASSETS_CACHE.set(item.id, img); return img; }
    }
    
    return null;
}

function formatPriceText(price) {
    if (isNaN(price)) return '0 Mora';
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

exports.drawMarketGrid = async function drawMarketGrid(items, timeRemaining, currentPage, totalPages) {
    const CANVAS_WIDTH = 1200;
    const CANVAS_HEIGHT = 900;
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    const FONT_FAMILY = '"Arial", sans-serif';

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#0a0f1e'); 
    bgGradient.addColorStop(1, '#020408'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.strokeStyle = 'rgba(0, 162, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
    for (let y = 0; y < CANVAS_HEIGHT; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 90);
    ctx.strokeStyle = 'rgba(0, 162, 255, 0.1)';
    ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(CANVAS_WIDTH, 90); ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 35px ${FONT_FAMILY}`;
    ctx.fillText('✥ سوق الاستثمار الإمبراطوري ✥', CANVAS_WIDTH - 40, 55);

    ctx.textAlign = "left";
    ctx.font = `24px ${FONT_FAMILY}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`🕒 التحديث القادم خلال: ${timeRemaining}`, 40, 55);

    const CARD_WIDTH = 360;
    const CARD_HEIGHT = 220;
    const GAP_X = 30;
    const GAP_Y = 30;
    const START_X = 40;
    const START_Y = 130;

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

        const mainColor = isUp ? '#1ddb2a' : (isDown ? '#db1d2a' : '#888888');
        const glowColor = isUp ? 'rgba(29, 219, 42, 0.1)' : (isDown ? 'rgba(219, 29, 42, 0.1)' : 'rgba(136, 136, 136, 0.05)');

        ctx.fillStyle = 'rgba(20, 30, 50, 0.7)';
        roundRect(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, 20, true);
        
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(${isUp ? '29, 219, 42' : (isDown ? '219, 29, 42' : '136, 136, 136')}, 0.2)`;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, 20, false, true);
        ctx.shadowBlur = 0; 

        const assetImg = await getAssetImage(item);
        if (assetImg) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
            ctx.drawImage(assetImg, x + 25, y + 25, 70, 70);
            ctx.shadowBlur = 0;
        }

        const trendImg = isUp ? trendImages.up : (isDown ? trendImages.down : trendImages.neutral);
        if (trendImg) {
            ctx.drawImage(trendImg, x + CARD_WIDTH - 95, y + 25, 70, 70);
        }

        ctx.textAlign = "right";
        const cleanName = (item.name || "").replace(/<a?:.+?:\d+>/g, '').trim();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 28px ${FONT_FAMILY}`;
        ctx.fillText(cleanName.split(' ')[0], x + CARD_WIDTH - 25, y + 130);

        ctx.fillStyle = mainColor;
        ctx.font = `22px ${FONT_FAMILY}`;
        const sign = changePercent > 0 ? '+' : '';
        ctx.fillText(`${sign}${(changePercent * 100).toFixed(2)}%`, x + CARD_WIDTH - 25, y + 160);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        roundRect(ctx, x + 15, y + CARD_HEIGHT - 65, CARD_WIDTH - 30, 50, 10, true);

        ctx.textAlign = "left";
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `18px ${FONT_FAMILY}`;
        ctx.fillText('السعر الحالي', x + 30, y + CARD_HEIGHT - 35);

        ctx.textAlign = "right";
        ctx.fillStyle = mainColor;
        ctx.font = `bold 26px ${FONT_FAMILY}`;
        ctx.fillText(`${formatPriceText(currentPrice)} Mora`, x + CARD_WIDTH - 30, y + CARD_HEIGHT - 33);
    }

    if (totalPages > 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
        ctx.fillRect(0, CANVAS_HEIGHT - 60, CANVAS_WIDTH, 60);
        ctx.textAlign = "center";
        ctx.font = `20px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillText(`صفحة ${currentPage + 1} من ${totalPages}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
    }

    return canvas.toBuffer();
};

preloadGlobalAssets();
