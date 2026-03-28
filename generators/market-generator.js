const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require('fs');

const imageAssetsDir = path.join(process.cwd(), 'empress-assets', 'images', 'market');

// 🔥 نظام الكاش السريع للأداء الأقصى
const ASSETS_CACHE = new Map();
let trendImages = { up: null, down: null, neutral: null };

async function preloadGlobalAssets() {
    try {
        if (!fs.existsSync(imageAssetsDir)) return;
        // تحميل صور الأسهم الحقيقية (Trends) التي أرفقتها
        trendImages.up = await loadImage(path.join(imageAssetsDir, 'up_trend.png')).catch(()=>{});
        trendImages.down = await loadImage(path.join(imageAssetsDir, 'down_trend.png')).catch(()=>{});
        trendImages.neutral = await loadImage(path.join(imageAssetsDir, 'neutral_trend.png')).catch(()=>{});
    } catch (e) { console.error("[Market Preload Error]:", e.message); }
}

async function getAssetImage(item) {
    if (ASSETS_CACHE.has(item.id)) return ASSETS_CACHE.get(item.id);
    const imgPath = path.join(imageAssetsDir, `${item.id.toLowerCase()}.png`);
    if (fs.existsSync(imgPath)) {
        const img = await loadImage(imgPath).catch(()=>{});
        if (img) { ASSETS_CACHE.set(item.id, img); return img; }
    }
    if (item.image) {
        const img = await loadImage(item.image).catch(()=>{});
        if (img) { ASSETS_CACHE.set(item.id, img); return img; }
    }
    return null;
}

// دالة لجلب ورسم آفتار المستخدم بشكل دائري
async function drawUserAvatar(ctx, url, x, y, size) {
    try {
        const avatarImg = await loadImage(url);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, x, y, size, size);
        ctx.restore();
        
        // تأثير توهج حول الآفتار
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    } catch (e) { }
}

function formatPriceText(price) {
    if (isNaN(price)) return '0';
    return Number(price).toLocaleString();
}

// دالة مساعدة لرسم مربعات بزوايا دائرية
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

// 🔷 دالة رسم الكروت المستقبلية (Sci-Fi Panel)
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
    
    // خط ديكور جانبي
    ctx.beginPath();
    ctx.moveTo(x + 5, y + cut + 10);
    ctx.lineTo(x + 5, y + height - 10);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.stroke();
}

// 📈 دالة رسم "مخطط بياني" هولوغرامي مصغر أسفل الكرت
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

// 🔥🔥 GOD MODE GRID GENERATOR v3 - الشغل الثقيل 🔥🔥
exports.drawMarketGrid = async function drawMarketGrid(items, timeRemaining, currentPage, totalPages, userAvatarUrl) {
    const CANVAS_WIDTH = 1280;
    const CANVAS_HEIGHT = 960;
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    const FONT_FAMILY = '"Arial", sans-serif'; 

    // 1️⃣ خلفية البورصة المستقبلية
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#04070d'); 
    bgGradient.addColorStop(0.5, '#0a1224'); 
    bgGradient.addColorStop(1, '#020408'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // شبكة نقاط هولوغرامية بالخلفية
    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
    for (let x = 20; x < CANVAS_WIDTH; x += 40) {
        for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
            ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // 2️⃣ الهيدر الهولوغرامي
    ctx.fillStyle = 'rgba(0, 255, 255, 0.03)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 100);
    
    // خط نيون علوي
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

    if (userAvatarUrl) {
        await drawUserAvatar(ctx, userAvatarUrl, 50, 10, 80);
    }

    // 3️⃣ الكروت المحسنة (The Sci-Fi Panels)
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

        // رسم المخطط البياني
        drawSparkline(ctx, x + 20, y + Math.floor(CARD_HEIGHT * 0.7), CARD_WIDTH - 40, 50, isUp, isDown, mainColor);

        // صورة اللوغو (تم تكبيرها بشكل ضخم صدق - 110x110)
        const assetImg = await getAssetImage(item);
        if (assetImg) {
            ctx.shadowColor = glowColor; ctx.shadowBlur = 15;
            // رسم اللوغو بحجم كبير في زاوية الكرت
            ctx.drawImage(assetImg, x + 15, y + 15, 110, 110);
            ctx.shadowBlur = 0;
        }

        // صورة اتجاه السهم (Trend) من ملفاتك
        const trendImg = isUp ? trendImages.up : (isDown ? trendImages.down : trendImages.neutral);
        if (trendImg) {
            ctx.drawImage(trendImg, x + CARD_WIDTH - 100, y + 15, 85, 85);
        }

        // --- النصوص الهولوغرامية ---
        ctx.textAlign = "left";
        const cleanName = item.name.trim();
        
        // اسم السهم كاملاً
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 26px ${FONT_FAMILY}`;
        // الإزاحة استناداً لحجم اللوغو الجديد
        ctx.fillText(cleanName, x + 135, y + 50);
        
        // شارة النسبة المئوية (Badge)
        ctx.fillStyle = isUp ? 'rgba(0, 255, 136, 0.15)' : (isDown ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 204, 255, 0.15)');
        ctx.beginPath(); ctx.roundRect(x + 135, y + 65, 110, 35, 5); ctx.fill();
        ctx.strokeStyle = mainColor; ctx.lineWidth = 1; ctx.stroke();
        
        ctx.fillStyle = mainColor;
        ctx.font = `bold 20px ${FONT_FAMILY}`;
        const sign = changePercent > 0 ? '+' : '';
        ctx.fillText(`${sign}${(changePercent * 100).toFixed(2)}%`, x + 145, y + 90);

        // السعر
        ctx.textAlign = "center";
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 38px ${FONT_FAMILY}`;
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 10;
        ctx.fillText(`${formatPriceText(currentPrice)}`, x + CARD_WIDTH / 2, y + 155);
        ctx.shadowBlur = 0;
    }

    // 4️⃣ ترقيم الصفحات
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

// 🎨 2. رسم بطاقة التفاصيل
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
    const cleanName = item.name.trim();
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

preloadGlobalAssets();
