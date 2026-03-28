const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require('fs');

const imageAssetsDir = path.join(process.cwd(), 'empress-assets', 'images', 'market');

// 🔥 نظام الكاش السريع للصور
const ASSETS_CACHE = new Map();
let trendImages = { up: null, down: null, neutral: null };

// تحميل الخط العربي إذا كان متوفراً لنظامك (اختياري لتحسين الشكل)
// try { registerFont(path.join(process.cwd(), 'assets', 'fonts', 'Tajawal-Bold.ttf'), { family: 'Tajawal' }); } catch(e) {}

async function preloadGlobalAssets() {
    try {
        if (!fs.existsSync(imageAssetsDir)) return;
        // تحميل صور حالة السهم التي ارفقتها
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

// تنسيق الرقم فقط بدون إضافة كلمة Mora
function formatPriceText(price) {
    if (isNaN(price)) return '0';
    return Number(price).toLocaleString();
}

// دالة مساعدة لقص النصوص الطويلة
function truncateText(ctx, text, maxWidth) {
    let width = ctx.measureText(text).width;
    if (width <= maxWidth) return text;
    while (width > maxWidth && text.length > 1) {
        text = text.substring(0, text.length - 1);
        width = ctx.measureText(text + "...").width;
    }
    return text + "...";
}

// 🔷 دالة رسم الكروت المستقبلية (Sci-Fi Panel)
function drawSciFiPanel(ctx, x, y, width, height, borderColor, glowColor) {
    const cut = 25; // حجم القطع في الزوايا

    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - cut);
    ctx.lineTo(x + width - cut, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + cut);
    ctx.closePath();

    // تعبئة خلفية الكرت (زجاجي داكن)
    ctx.fillStyle = 'rgba(8, 12, 22, 0.85)';
    ctx.fill();

    // تأثير التوهج النيون
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    
    // إغلاق التوهج
    ctx.shadowBlur = 0; 
    
    // رسم خطوط ديكور جانبية
    ctx.beginPath();
    ctx.moveTo(x + 5, y + cut + 10);
    ctx.lineTo(x + 5, y + height - 10);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.stroke();
}

// 📈 دالة رسم "مخطط بياني" هولوغرامي مصغر
function drawSparkline(ctx, x, y, width, height, isUp, isDown, color) {
    ctx.beginPath();
    let currentY = isUp ? y + height : (isDown ? y : y + height / 2);
    ctx.moveTo(x, currentY);

    const points = 6;
    const stepX = width / points;

    for (let i = 1; i <= points; i++) {
        let randomFluctuation = (Math.random() - 0.5) * 15; // تذبذب أقل
        
        if (isUp) {
            currentY -= (height / points) + randomFluctuation;
        } else if (isDown) {
            currentY += (height / points) + randomFluctuation;
        } else {
            currentY += randomFluctuation; 
        }

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


// 🔥🔥 GOD MODE GRID GENERATOR - النسخة الاحترافية الجديدة 🔥🔥
// ✅ تم إضافة userAvatarBuffer كمعامل جديد لعرض صورة صاحب الأمر
exports.drawMarketGrid = async function drawMarketGrid(items, timeRemaining, currentPage, totalPages, requesterAvatarBuffer) {
    const CANVAS_WIDTH = 1280;
    const CANVAS_HEIGHT = 960;
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    // إذا ثبت خط عربي، استبدل Arial باسم الخط هنا، مثلاً "Tajawal"
    const FONT_FAMILY = '"Arial", sans-serif'; 

    // 1️⃣ خلفية البورصة المستقبلية (Deep Cyber Space)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#04070d'); 
    bgGradient.addColorStop(0.5, '#0a1224'); 
    bgGradient.addColorStop(1, '#020408'); 
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // شبكة نقاط هولوغرامية
    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
    for (let x = 20; x < CANVAS_WIDTH; x += 40) {
        for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
            ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // 2️⃣ الهيدر الهولوغرامي (Terminal Header)
    ctx.fillStyle = 'rgba(0, 255, 255, 0.03)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 100);
    
    // خط نيون علوي
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(CANVAS_WIDTH, 100); ctx.stroke();
    ctx.shadowBlur = 0;

    // ✅ رسم صورة صاحب الأمر (Requester Avatar) في الزاوية
    if (requesterAvatarBuffer) {
        try {
            const avatarImg = await loadImage(requesterAvatarBuffer);
            const aviX = 40;
            const aviY = 20;
            const aviSize = 60;

            // إطار نيون دائري حول الصورة
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(aviX + aviSize/2, aviY + aviSize/2, aviSize/2, 0, Math.PI*2); ctx.stroke();
            ctx.shadowBlur = 0;

            // قص الصورة بشكل دائري
            ctx.save();
            ctx.beginPath(); ctx.arc(aviX + aviSize/2, aviY + aviSize/2, aviSize/2, 0, Math.PI*2); ctx.clip();
            ctx.drawImage(avatarImg, aviX, aviY, aviSize, aviSize);
            ctx.restore();

        } catch (e) { console.error("Error loading requester avatar:", e); }
    }

    // ✅ تعديل العنوان إلى "سوق الاستثمارات" وإزالة الإيموجي
    ctx.textAlign = "right";
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 42px ${FONT_FAMILY}`;
    ctx.fillText('سوق الاستثمارات', CANVAS_WIDTH - 50, 65);

    // ✅ تعريب وقت التحديث وتعديل التنسيق
    ctx.textAlign = "left";
    ctx.font = `bold 22px ${FONT_FAMILY}`;
    ctx.fillStyle = '#00ffff'; 
    // إذا كان بروفايل المستخدم موجوداً، نحرك النص قليلاً لليمين
    const timeTextX = requesterAvatarBuffer ? 120 : 50;
    ctx.fillText(`تحديث النظام خلال: ${timeRemaining}`, timeTextX, 62);

    // 3️⃣ الكروت (The Sci-Fi Panels)
    const CARD_WIDTH = 370;
    const CARD_HEIGHT = 240; // تم زيادة الارتفاع قليلاً لاستيعاب اللوغو الأكبر
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

        // ✅ رسم صورة حالة السهم الكبيرة بدلاً من الإيموجي القديم
        const trendImg = isUp ? trendImages.up : (isDown ? trendImages.down : trendImages.neutral);
        if (trendImg) {
            // رسمها في الزاوية العلوية اليسرى داخل الكرت
            ctx.drawImage(trendImg, x + cut, y + 15, 60, 60);
        }

        // ✅ شارة النسبة المئوية (Badge) - تم نقلها لليمين بجانب السهم
        ctx.fillStyle = isUp ? 'rgba(0, 255, 136, 0.15)' : (isDown ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 204, 255, 0.15)');
        ctx.beginPath(); ctx.roundRect(x + CARD_WIDTH - 120, y + 25, 100, 30, 5); ctx.fill();
        ctx.strokeStyle = mainColor; ctx.lineWidth = 1; ctx.stroke();
        
        ctx.textAlign = "center";
        ctx.fillStyle = mainColor;
        ctx.font = `bold 18px ${FONT_FAMILY}`;
        const sign = changePercent > 0 ? '+' : '';
        ctx.fillText(`${sign}${(changePercent * 100).toFixed(2)}%`, x + CARD_WIDTH - 70, y + 47);

        // ✅ صورة اللوغو - تم تكبيرها بشكل كبير ووضعها في المنتصف لضمان الوضوح
        const assetImg = await getAssetImage(item);
        if (assetImg) {
            ctx.shadowColor = glowColor; ctx.shadowBlur = 20; // توهج قوي خلف اللوغو
            const logSize = 100; // حجم كبير جداً 100x100
            // وضعها في منتصف الثلث العلوي للكرت
            ctx.drawImage(assetImg, x + CARD_WIDTH/2 - logSize/2, y + 45, logSize, logSize);
            ctx.shadowBlur = 0;
        }

        // --- النصوص الهولوغرامية ---
        // تنظيف الاسم من الإيموجيات كلياً
        const cleanName = (item.name || "").replace(/<a?:.+?:\d+>/g, '').trim();
        
        // ✅ اسم السهم كاملاً - تم تصغير الخط قليلاً واستخدامTruncate لضمان عدم الخروج من الكرت
        ctx.textAlign = "center";
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 24px ${FONT_FAMILY}`;
        const finalName = truncateText(ctx, cleanName, CARD_WIDTH - 40);
        ctx.fillText(finalName, x + CARD_WIDTH / 2, y + 170);

        // رسم المخطط البياني تحت الاسم (Sparkline)
        drawSparkline(ctx, x + 30, y + 185, CARD_WIDTH - 60, 35, isUp, isDown, mainColor);

        // ✅ السعر (Neon Glowing Text) - تم إزالة رمز الفلوس، يعرض الرقم فقط
        ctx.textAlign = "center";
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 32px ${FONT_FAMILY}`;
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 10;
        ctx.fillText(`${formatPriceText(currentPrice)}`, x + CARD_WIDTH / 2, y + CARD_HEIGHT - 20);
        ctx.shadowBlur = 0;
    }

    // 4️⃣ ترقيم الصفحات
    if (totalPages > 1) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, CANVAS_HEIGHT - 60, CANVAS_WIDTH, 60);
        ctx.textAlign = "center";
        ctx.font = `bold 22px ${FONT_FAMILY}`;
        ctx.fillStyle = '#00ffff';
        ctx.fillText(`الصفحة [ ${currentPage + 1} / ${totalPages} ]`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
    }

    return canvas.toBuffer();
};

preloadGlobalAssets();
