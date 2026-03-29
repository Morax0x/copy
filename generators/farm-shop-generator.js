const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// 🌟 تسجيل الخطوط الاحترافية ودعم الإيموجي كـ Fallback 🌟
try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir);

    // سجل خطوطك هنا إذا حبيت (مثال: Cairo)
    // registerFont(path.join(fontsDir, 'Cairo-Bold.ttf'), { family: 'Cairo', weight: 'bold' });

    // تسجيل خط الإيموجي الاحترافي لحل مشاكل التقطيع
    registerFont(path.join(fontsDir, 'NotoEmoj.ttf'), { family: 'NotoEmoji' });
} catch (e) {
    console.error("⚠️ فشل تسجيل الخطوط الاحترافية، سيتم استخدام خطوط النظام.");
}

const FONT_MAIN = '"Cairo", "Arial", sans-serif'; 
const FONT_EMOJI = '"NotoEmoji", "Arial", sans-serif'; 

const COLOR_BG_START = '#080c14';
const COLOR_BG_END = '#101a2e';
const COLOR_ACCENT = '#00ffaa'; 
const COLOR_TEXT = '#ffffff';
const COLOR_SUBTEXT = '#a0aabf';

// دالة المستطيل الزجاجي المضيء (Glassmorphism + Neon)
function drawGlassCard(ctx, x, y, width, height, radius, glowColor) {
    ctx.save();
    
    ctx.shadowColor = glowColor || 'rgba(0, 255, 170, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
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
    ctx.fill();
    
    ctx.shadowBlur = 0; 
    
    ctx.strokeStyle = glowColor || 'rgba(0, 255, 170, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
}

async function safeLoadImage(url) {
    if (!url || url.startsWith('http') === false) return null;
    try { return await loadImage(url); } 
    catch (e) { return null; }
}

// 🔥 1. الدالة المفقودة: القائمة الرئيسية للمتجر (Hub) 🔥
exports.drawFarmShopHub = async function(user, mora) {
    const canvas = createCanvas(1200, 600);
    const ctx = canvas.getContext('2d');

    // الخلفية السينمائية
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 600);
    bgGradient.addColorStop(0, COLOR_BG_START);
    bgGradient.addColorStop(1, COLOR_BG_END);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1200, 600);

    // زخرفة خفيفة
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 1200; i += 50) {
        for (let j = 0; j < 600; j += 50) {
            ctx.beginPath(); ctx.arc(i, j, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // الهيدر
    drawGlassCard(ctx, 50, 40, 1100, 120, 20, COLOR_ACCENT);
    
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `bold 50px ${FONT_MAIN}`;
    ctx.textAlign = 'center';
    ctx.fillText('🌾 المتجر الزراعي المركزي 🌾', 600, 100);

    ctx.fillStyle = COLOR_ACCENT;
    ctx.font = `bold 28px ${FONT_MAIN}`;
    ctx.fillText(`الرصيد المتاح: ${mora.toLocaleString()} Mora`, 600, 140);

    // الكروت الثلاثة للأقسام
    const drawCategory = (x, y, title, desc, icon, glow) => {
        drawGlassCard(ctx, x, y, 320, 350, 20, glow);

        ctx.font = `100px ${FONT_EMOJI}`;
        ctx.textAlign = 'center';
        ctx.fillText(icon, x + 160, y + 140);

        ctx.fillStyle = COLOR_TEXT;
        ctx.font = `bold 38px ${FONT_MAIN}`;
        ctx.fillText(title, x + 160, y + 210);

        ctx.fillStyle = COLOR_SUBTEXT;
        ctx.font = `22px ${FONT_MAIN}`;
        const lines = desc.split('\n');
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x + 160, y + 260 + (i * 30));
        }
    };

    drawCategory(70, 200, 'الحيوانات', 'استثمر في الدواجن\nوالمواشي لزيادة\nدخلك اليومي', '🐄', '#ff8800');
    drawCategory(440, 200, 'البذور', 'اشترِ البذور وازرعها\nلجني المحاصيل\nوبيعها بأرباح', '🌱', '#00ffaa');
    drawCategory(810, 200, 'الأعلاف', 'وفر الغذاء اللازم\nلحيواناتك لتبقى\nعلى قيد الحياة', '🌾', '#00d4ff');

    return canvas.toBuffer();
};

// 🔥 2. شبكة العناصر (المنتجات) 🔥
exports.drawFarmShopGrid = async function(items, category, page, totalPages, maxCap, currCap) {
    const canvas = createCanvas(1200, 850);
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, 0, 850);
    bgGradient.addColorStop(0, COLOR_BG_START);
    bgGradient.addColorStop(1, COLOR_BG_END);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1200, 850);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, 1200, 90);
    ctx.strokeStyle = COLOR_ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(1200, 90); ctx.stroke();

    const drawTab = (x, y, label, icon, isActive) => {
        if (isActive) {
            ctx.fillStyle = COLOR_ACCENT;
            ctx.fillRect(x, 87, 200, 3); 
            ctx.fillStyle = 'rgba(0, 255, 170, 0.1)';
            ctx.fillRect(x, 0, 200, 90);
            ctx.fillStyle = COLOR_ACCENT;
        } else {
            ctx.fillStyle = COLOR_SUBTEXT;
        }
        ctx.font = `bold 28px ${FONT_MAIN}`;
        ctx.textAlign = 'center';
        ctx.fillText(label, x + 100, 55);
        ctx.font = `30px ${FONT_EMOJI}`;
        ctx.fillText(icon, x + 100, 30);
    };

    drawTab(100, 0, 'الحيوانات', '🐄', category === 'animals');
    drawTab(300, 0, 'البذور', '🌱', category === 'seeds');
    drawTab(500, 0, 'الأعلاف', '🌾', category === 'feed');

    if (category === 'animals') {
        ctx.fillStyle = currCap >= maxCap ? '#ff4444' : COLOR_ACCENT;
        ctx.font = `bold 24px ${FONT_MAIN}`;
        ctx.textAlign = 'right';
        ctx.fillText(`سعة الحظيرة: ${currCap} / ${maxCap}`, 1150, 55);
    }

    const CARD_W = 360;
    const CARD_H = 210;
    const START_X = 60;
    const START_Y = 120;
    const GAP_X = 30;
    const GAP_Y = 30;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = START_X + col * (CARD_W + GAP_X);
        const y = START_Y + row * (CARD_H + GAP_Y);

        let glow = COLOR_ACCENT;
        if (category === 'animals' && item.price > 10000) glow = '#ff00ff';
        if (category === 'animals' && item.price > 5000) glow = '#ff8800';

        drawGlassCard(ctx, x, y, CARD_W, CARD_H, 15, glow);

        if (item.image) {
            const img = await safeLoadImage(item.image);
            if (img) ctx.drawImage(img, x + 15, y + 15, 110, 110);
            else { ctx.font = `80px ${FONT_EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(item.emoji, x + 70, y + 100); }
        } else {
            ctx.font = `80px ${FONT_EMOJI}`;
            ctx.textAlign = 'center';
            ctx.fillText(item.emoji, x + 70, y + 100);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR_TEXT;
        ctx.font = `bold 30px ${FONT_MAIN}`;
        ctx.fillText(item.name, x + CARD_W - 20, y + 50);

        ctx.fillStyle = COLOR_ACCENT;
        ctx.font = `bold 26px ${FONT_MAIN}`;
        ctx.fillText(`${item.price.toLocaleString()} Mora`, x + CARD_W - 20, y + 90);

        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(x + 150, y + 105); ctx.lineTo(x + CARD_W - 15, y + 105); ctx.stroke();

        ctx.fillStyle = COLOR_SUBTEXT;
        ctx.font = `18px ${FONT_MAIN}`;
        if (category === 'animals') {
            ctx.fillText(`الدخل/يوم: ${item.income_per_day}`, x + CARD_W - 20, y + 135);
            ctx.fillText(`العمر: ${item.lifespan_days} يوم | الحجم: ${item.size}`, x + CARD_W - 20, y + 165);
        } else if (category === 'seeds') {
            ctx.fillText(`قيمة المحصول: ${item.sell_price}`, x + CARD_W - 20, y + 135);
            ctx.fillText(`النمو: ${item.growth_time_hours}س | الخبرة: +${item.xp_reward}`, x + CARD_W - 20, y + 165);
        } else {
            const desc = item.description ? item.description.substring(0, 30) + '...' : 'علف عالي الجودة.';
            ctx.fillText(desc, x + CARD_W - 20, y + 135);
        }
    }

    ctx.fillStyle = COLOR_SUBTEXT;
    ctx.textAlign = 'center';
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(`الصفحة ${page + 1} من ${totalPages}`, 600, 830);

    return canvas.toBuffer();
};

// 🔥 3. كرت التفاصيل (Detail View) 🔥
exports.drawFarmShopDetail = async function(item, category, userQty, maxCap, currCap) {
    const canvas = createCanvas(1000, 500); 
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, 1000, 500);
    bgGradient.addColorStop(0, '#0c1220');
    bgGradient.addColorStop(1, '#182848');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1000, 500);

    drawGlassCard(ctx, 50, 50, 900, 400, 25, COLOR_ACCENT);

    if (item.image) {
        const img = await safeLoadImage(item.image);
        if (img) ctx.drawImage(img, 100, 100, 300, 300);
        else { ctx.font = `200px ${FONT_EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(item.emoji, 250, 330); }
    } else { 
        ctx.font = `200px ${FONT_EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(item.emoji, 250, 330); 
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.fillText(item.name, 900, 130);

    ctx.fillStyle = COLOR_ACCENT;
    ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.fillText(`${item.price.toLocaleString()} Mora`, 900, 190);

    ctx.fillStyle = '#ffffff';
    ctx.font = `26px ${FONT_MAIN}`;
    const START_INFO_Y = 240;
    const GAP_INFO_Y = 35;

    if (category === 'animals') {
        ctx.fillText(`الدخل اليومي المتوقع: ${item.income_per_day} Mora`, 900, START_INFO_Y);
        ctx.fillText(`العمر الافتراضي: ${item.lifespan_days} يوم`, 900, START_INFO_Y + GAP_INFO_Y);
        ctx.fillText(`المساحة المستخدمة: ${item.size} وحدة`, 900, START_INFO_Y + (GAP_INFO_Y * 2));
    } else if (category === 'seeds') {
        ctx.fillText(`قيمة المحصول عند البيع: ${item.sell_price} Mora`, 900, START_INFO_Y);
        ctx.fillText(`وقت النمو الكامل: ${item.growth_time_hours} ساعة`, 900, START_INFO_Y + GAP_INFO_Y);
        ctx.fillText(`الخبرة المكتسبة: +${item.xp_reward} XP`, 900, START_INFO_Y + (GAP_INFO_Y * 2));
    } else {
        const desc = item.description || 'علف صحي غني بالبروتين لضمان نمو ودخل ممتاز لحيواناتك.';
        const words = desc.split(' ');
        let line = '';
        let y = START_INFO_Y;
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > 450 && n > 0) {
                ctx.fillText(line, 900, y);
                line = words[n] + ' ';
                y += GAP_INFO_Y;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 900, y);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    drawGlassCard(ctx, 450, 380, 450, 50, 10, 'rgba(255,255,255,0.2)');
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.textAlign = 'center';
    
    if (category === 'animals') {
        ctx.fillText(`المساحة المتاحة: ${maxCap - currCap} | تمتلك: ${userQty}`, 675, 412);
    } else {
        ctx.fillText(`الكمية لديك في المخزن: ${userQty}`, 675, 412);
    }

    return canvas.toBuffer();
};
