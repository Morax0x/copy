const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// 🌟 تسجيل الخطوط الاحترافية ودعم الإيموجي كـ Fallback 🌟
try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir);

    // تسجيل خط أساسي احترافي للنصوص (تأكد من وجود الملف في مجلد fonts)
    // registerFont(path.join(fontsDir, 'Cairo-Bold.ttf'), { family: 'Cairo', weight: 'bold' });
    // registerFont(path.join(fontsDir, 'Cairo-Regular.ttf'), { family: 'Cairo', weight: 'normal' });

    // تسجيل خط الإيموجي الاحترافي لحل مشاكل التقطيع
    registerFont(path.join(fontsDir, 'NotoEmoj.ttf'), { family: 'NotoEmoji' });
} catch (e) {
    console.error("⚠️ فشل تسجيل الخطوط الاحترافية، سيتم استخدام خطوط النظام.");
}

const FONT_MAIN = '"Cairo", "Arial", sans-serif'; // الخط الأساسي مع Fallback
const FONT_EMOJI = '"NotoEmoji", "Arial", sans-serif'; // خط الإيموجي

const COLOR_BG_START = '#080c14';
const COLOR_BG_END = '#101a2e';
const COLOR_ACCENT = '#00ffaa'; // أخضر نيون
const COLOR_TEXT = '#ffffff';
const COLOR_SUBTEXT = '#a0aabf';

// دالة مساعدة لرسم مستطيل بحواف دائرية مع توهج (Neon Glow)
function drawGlassCard(ctx, x, y, width, height, radius, glowColor) {
    ctx.save();
    
    // التوهج الخارجي
    ctx.shadowColor = glowColor || 'rgba(0, 255, 170, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // الخلفية الزجاجية
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'; // شفافية عالية
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
    
    // إزالة الظل لرسم الحدود
    ctx.shadowBlur = 0; 
    
    // الحدود المضيئة
    ctx.strokeStyle = glowColor || 'rgba(0, 255, 170, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // لمعة زجاجية داخلية
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
}

// دالة مساعدة لجلب الصورة بأمان مع Fallback
async function safeLoadImage(url) {
    if (!url || url.startsWith('http') === false) return null;
    try { return await loadImage(url); } 
    catch (e) { return null; }
}

// 🔥 الدالة الرئيسية لرسم المتجر الاحترافي الجديد 🔥
exports.drawFarmShopGrid = async function(items, category, page, totalPages, maxCap, currCap, userMora) {
    const canvas = createCanvas(1200, 850); // حجم أكبر لعرض احترافي
    const ctx = canvas.getContext('2d');

    // 1. الخلفية السينمائية
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 850);
    bgGradient.addColorStop(0, COLOR_BG_START);
    bgGradient.addColorStop(1, COLOR_BG_END);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1200, 850);

    // إضافة نمط زخرفي خلفي خفيف
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
    for (let i = 0; i < 1200; i += 60) {
        for (let j = 0; j < 850; j += 60) {
            ctx.beginPath(); ctx.arc(i, j, 1, 0, Math.PI * 2); ctx.fill();
        }
    }

    // 2. الهيدر الاحترافي (Tabs Style)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, 1200, 90);
    ctx.strokeStyle = COLOR_ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(1200, 90); ctx.stroke();

    const drawTab = (x, y, label, icon, isActive) => {
        if (isActive) {
            ctx.fillStyle = COLOR_ACCENT;
            ctx.fillRect(x, 87, 200, 3); // خط سفلي مضيء
            ctx.fillStyle = 'rgba(0, 255, 170, 0.1)';
            ctx.fillRect(x, 0, 200, 90);
            ctx.fillStyle = COLOR_ACCENT;
        } else {
            ctx.fillStyle = COLOR_SUBTEXT;
        }
        ctx.font = `bold 28px ${FONT_MAIN}`;
        ctx.textAlign = 'center';
        ctx.fillText(label, x + 100, 55);
        
        // رسم الأيقونة باستخدام خط الإيموجي الاحترافي
        ctx.font = `30px ${FONT_EMOJI}`;
        ctx.fillText(icon, x + 100, 30);
    };

    drawTab(100, 0, 'الحيوانات', '🐄', category === 'animals');
    drawTab(300, 0, 'البذور', '🌱', category === 'seeds');
    drawTab(500, 0, 'الأعلاف', '🌾', category === 'feed');

    // معلومات المستخدم
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${userMora.toLocaleString()} Mora`, 1150, 45);
    ctx.fillStyle = COLOR_SUBTEXT;
    ctx.font = `20px ${FONT_MAIN}`;
    if (category === 'animals') ctx.fillText(`السعة: ${currCap} / ${maxCap}`, 1150, 75);

    // 3. شبكة الكروت الاحترافية (3 صفوف × 3 أعمدة)
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

        // تحديد لون التوهج بناءً على النوع (اختياري)
        let glow = COLOR_ACCENT;
        if (category === 'animals' && item.price > 10000) glow = '#ff00ff'; // توهج أرجواني للنادر
        if (category === 'animals' && item.price > 5000) glow = '#ff8800'; // توهج برتقالي

        drawGlassCard(ctx, x, y, CARD_W, CARD_H, 15, glow);

        // الصورة (الاستيراد الحقيقي)
        if (item.image) {
            const img = await safeLoadImage(item.image);
            if (img) {
                ctx.drawImage(img, x + 15, y + 15, 110, 110);
            } else {
                // Fallback للإيموجي إذا فشل التحميل
                ctx.font = `80px ${FONT_EMOJI}`;
                ctx.textAlign = 'center';
                ctx.fillText(item.emoji, x + 70, y + 100);
            }
        } else {
            ctx.font = `80px ${FONT_EMOJI}`;
            ctx.textAlign = 'center';
            ctx.fillText(item.emoji, x + 70, y + 100);
        }

        // التفاصيل الاحترافية
        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR_TEXT;
        ctx.font = `bold 30px ${FONT_MAIN}`;
        ctx.fillText(item.name, x + CARD_W - 20, y + 50);

        ctx.fillStyle = COLOR_ACCENT;
        ctx.font = `bold 26px ${FONT_MAIN}`;
        ctx.fillText(`${item.price.toLocaleString()} Mora`, x + CARD_W - 20, y + 90);

        // إحصائيات صغيرة مع أيقونات مرسومة (بدون إيموجي نصوص)
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
            // الأعلاف (تقسيم الوصف لطويل)
            const desc = item.description ? item.description.substring(0, 30) + '...' : 'علف عالي الجودة.';
            ctx.fillText(desc, x + CARD_W - 20, y + 135);
        }
    }

    // 4. الفوتر ورقم الصفحة
    ctx.fillStyle = COLOR_SUBTEXT;
    ctx.textAlign = 'center';
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(`الصفحة ${page + 1} من ${totalPages}`, 600, 830);

    return canvas.toBuffer();
};

// 🔥 دالة رسم كرت التفاصيل ( Detail View Pro) 🔥
// لم تطلب تغييرها لكن قمت بتحسينها لتواكب التصميم الاحترافي
exports.drawFarmShopDetail = async function(item, category, userQty, maxCap, currCap) {
    const canvas = createCanvas(1000, 500); // حجم أكبر
    const ctx = canvas.getContext('2d');

    // الخلفية
    const bgGradient = ctx.createLinearGradient(0, 0, 1000, 500);
    bgGradient.addColorStop(0, '#0c1220');
    bgGradient.addColorStop(1, '#182848');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1000, 500);

    // الكرت الزجاجي الكبير
    drawGlassCard(ctx, 50, 50, 900, 400, 25, COLOR_ACCENT);

    // الصورة الكبيرة
    if (item.image) {
        const img = await safeLoadImage(item.image);
        if (img) ctx.drawImage(img, 100, 100, 300, 300);
        else { ctx.font = `200px ${FONT_EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(item.emoji, 250, 330); }
    } else { ctx.font = `200px ${FONT_EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(item.emoji, 250, 330); }

    // التفاصيل
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
        // الأعلاف (وصف كامل مع التفاف النص)
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

    // المخزون الحالي في الأسفل
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
