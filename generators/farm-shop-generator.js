const { createCanvas, loadImage } = require('canvas');

const FONT_FAMILY = '"Arial", sans-serif';
const BG_COLOR_START = '#0a0f1a';
const BG_COLOR_END = '#131b2f';

// دالة رسم مربع بحواف دائرية
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
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

// دالة جلب الصورة بأمان
async function safeLoadImage(url) {
    if (!url) return null;
    try { return await loadImage(url); } catch (e) { return null; }
}

// 1. رسم القائمة الرئيسية للمتجر
exports.drawFarmShopHub = async function(user, mora) {
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext('2d');

    // الخلفية
    const gradient = ctx.createLinearGradient(0, 0, 0, 450);
    gradient.addColorStop(0, BG_COLOR_START);
    gradient.addColorStop(1, BG_COLOR_END);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 450);

    // شبكة الزخرفة
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 800; i += 40) {
        for (let j = 0; j < 450; j += 40) {
            ctx.beginPath(); ctx.arc(i, j, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // الهيدر
    ctx.fillStyle = 'rgba(0, 255, 100, 0.1)';
    roundRect(ctx, 40, 30, 720, 100, 15, true);
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, 40, 30, 720, 100, 15, false, true);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 42px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('🌾 المتجر الزراعي المركزي 🌾', 400, 80);

    ctx.fillStyle = '#00ff88';
    ctx.font = `24px ${FONT_FAMILY}`;
    ctx.fillText(`رصيدك: ${mora.toLocaleString()} مورا`, 400, 115);

    // الأقسام
    const drawCategoryBox = (x, y, title, desc, icon) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        roundRect(ctx, x, y, 220, 250, 15, true);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        roundRect(ctx, x, y, 220, 250, 15, false, true);

        ctx.font = '60px Arial';
        ctx.fillText(icon, x + 110, y + 90);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 26px ${FONT_FAMILY}`;
        ctx.fillText(title, x + 110, y + 150);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = `18px ${FONT_FAMILY}`;
        const lines = desc.split('\n');
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x + 110, y + 190 + (i * 25));
        }
    };

    drawCategoryBox(50, 160, 'الحيوانات', 'شراء الدواجن\nوالمواشي', '🐄');
    drawCategoryBox(290, 160, 'البذور', 'شراء البذور\nللزراعة', '🌱');
    drawCategoryBox(530, 160, 'الأعلاف', 'شراء طعام\nلحيواناتك', '🌾');

    return canvas.toBuffer();
};

// 2. رسم شبكة العناصر (المنتجات)
exports.drawFarmShopGrid = async function(items, category, page, totalPages, maxCap, currCap) {
    const canvas = createCanvas(900, 700);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 700);
    gradient.addColorStop(0, BG_COLOR_START);
    gradient.addColorStop(1, BG_COLOR_END);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 900, 700);

    const catName = category === 'animals' ? 'الحيوانات' : (category === 'seeds' ? 'البذور' : 'الأعلاف');
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 40px ${FONT_FAMILY}`;
    ctx.textAlign = 'right';
    ctx.fillText(`متجر ${catName}`, 850, 60);

    if (category === 'animals') {
        ctx.fillStyle = currCap >= maxCap ? '#ff4444' : '#00ff88';
        ctx.font = `bold 24px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.fillText(`السعة: [ ${currCap} / ${maxCap} ]`, 50, 55);
    }

    // الكروت
    const CARD_W = 260;
    const CARD_H = 160;
    const START_X = 40;
    const START_Y = 100;
    const GAP_X = 20;
    const GAP_Y = 20;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = START_X + col * (CARD_W + GAP_X);
        const y = START_Y + row * (CARD_H + GAP_Y);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        roundRect(ctx, x, y, CARD_W, CARD_H, 10, true);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        roundRect(ctx, x, y, CARD_W, CARD_H, 10, false, true);

        // الصورة أو الإيموجي
        if (item.image) {
            const img = await safeLoadImage(item.image);
            if (img) ctx.drawImage(img, x + 10, y + 10, 80, 80);
        } else {
            ctx.font = '50px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.emoji, x + 50, y + 70);
        }

        // التفاصيل
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 24px ${FONT_FAMILY}`;
        ctx.fillText(item.name, x + CARD_W - 15, y + 40);

        ctx.fillStyle = '#00ff88';
        ctx.font = `bold 20px ${FONT_FAMILY}`;
        ctx.fillText(`${item.price.toLocaleString()} مورا`, x + CARD_W - 15, y + 75);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = `16px ${FONT_FAMILY}`;
        if (category === 'animals') {
            ctx.fillText(`الدخل: ${item.income_per_day} | الحجم: ${item.size}`, x + CARD_W - 15, y + 110);
        } else if (category === 'seeds') {
            ctx.fillText(`نمو: ${item.growth_time_hours}س | بيع: ${item.sell_price}`, x + CARD_W - 15, y + 110);
        } else {
            ctx.fillText(item.description ? item.description.substring(0, 20) + '...' : '', x + CARD_W - 15, y + 110);
        }
    }

    // رقم الصفحة
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `bold 20px ${FONT_FAMILY}`;
    ctx.fillText(`صفحة [ ${page + 1} / ${totalPages} ]`, 450, 680);

    return canvas.toBuffer();
};

// 3. رسم كرت التفاصيل
exports.drawFarmShopDetail = async function(item, category, userQty, maxCap, currCap) {
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 800, 400);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1e293b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 400);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, 20, 20, 760, 360, 20, true);

    if (item.image) {
        const img = await safeLoadImage(item.image);
        if (img) ctx.drawImage(img, 40, 50, 200, 200);
    } else {
        ctx.font = '150px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.emoji, 140, 220);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 48px ${FONT_FAMILY}`;
    ctx.fillText(item.name, 750, 80);

    ctx.fillStyle = '#00ff88';
    ctx.font = `bold 32px ${FONT_FAMILY}`;
    ctx.fillText(`السعر: ${item.price.toLocaleString()} مورا`, 750, 130);

    ctx.fillStyle = '#dddddd';
    ctx.font = `22px ${FONT_FAMILY}`;
    
    if (category === 'animals') {
        ctx.fillText(`الدخل اليومي: ${item.income_per_day} مورا`, 750, 180);
        ctx.fillText(`العمر الافتراضي: ${item.lifespan_days} يوم`, 750, 220);
        ctx.fillText(`الحجم في الحظيرة: ${item.size}`, 750, 260);
    } else if (category === 'seeds') {
        ctx.fillText(`قيمة البيع: ${item.sell_price} مورا`, 750, 180);
        ctx.fillText(`وقت النمو: ${item.growth_time_hours} ساعة`, 750, 220);
        ctx.fillText(`وقت الذبول: ${item.wither_time_hours} ساعة`, 750, 260);
    } else {
        ctx.fillText(item.description || 'علف صحي لحيواناتك.', 750, 180);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, 400, 300, 350, 60, 10, true);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 24px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    
    if (category === 'animals') {
        ctx.fillText(`المساحة المتبقية: ${maxCap - currCap} | تمتلك: ${userQty}`, 575, 340);
    } else {
        ctx.fillText(`المخزون الحالي: ${userQty}`, 575, 340);
    }

    return canvas.toBuffer();
};
