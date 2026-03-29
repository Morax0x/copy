const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// استدعاء قاموس الأغراض من الحقيبة لجلب روابط الصور بشكل آلي
let resolveItemInfoLocal;
try {
    const invGen = require('./inventory-generator.js');
    resolveItemInfoLocal = invGen.resolveItemInfo;
} catch (e) {
    console.error("⚠️ لم يتم العثور على inventory-generator.js، الصور قد لا تعمل.");
    resolveItemInfoLocal = (id) => ({ imgPath: null });
}

try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir);
    registerFont(path.join(fontsDir, 'NotoEmoj.ttf'), { family: 'NotoEmoji' });
} catch (e) {}

const FONT_MAIN = '"Arial", sans-serif'; 
const FONT_EMOJI = '"NotoEmoji", "Arial", sans-serif'; 

const COLOR_BG = '#1a1a1d';
const COLOR_CARD = '#27272a';
const COLOR_GOLD = '#d4af37';
const COLOR_TEXT = '#f8fafc';
const COLOR_SUB = '#94a3b8';

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

async function safeLoadImage(url) {
    if (!url || !url.startsWith('http')) return null;
    try { return await loadImage(url); } catch (e) { return null; }
}

exports.drawFarmShopGrid = async function(items, category, page, totalPages, maxCap, currCap) {
    const canvas = createCanvas(1200, 800);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, 1200, 800);

    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, 1200, 80);
    ctx.strokeStyle = COLOR_GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 80); ctx.lineTo(1200, 80); ctx.stroke();

    const catName = category === 'animals' ? 'قسم الحيوانات والمواشي' : (category === 'seeds' ? 'قسم البذور والمحاصيل' : 'قسم الأعلاف والغذاء');
    
    ctx.fillStyle = COLOR_GOLD;
    ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.textAlign = 'right';
    ctx.fillText(`🛒 المتجر الزراعي | ${catName}`, 1150, 55);

    if (category === 'animals') {
        ctx.fillStyle = currCap >= maxCap ? '#ef4444' : COLOR_SUB;
        ctx.font = `bold 24px ${FONT_MAIN}`;
        ctx.textAlign = 'left';
        ctx.fillText(`مساحة الحظيرة: ${currCap} / ${maxCap}`, 50, 50);
    }

    const CARD_W = 360;
    const CARD_H = 200;
    const START_X = 50;
    const START_Y = 110;
    const GAP_X = 35;
    const GAP_Y = 30;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = START_X + col * (CARD_W + GAP_X);
        const y = START_Y + row * (CARD_H + GAP_Y);

        ctx.fillStyle = COLOR_CARD;
        drawRoundedRect(ctx, x, y, CARD_W, CARD_H, 12, true, false);
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, x, y, CARD_W, CARD_H, 12, false, true);

        ctx.fillStyle = COLOR_GOLD;
        drawRoundedRect(ctx, x + CARD_W - 8, y, 8, CARD_H, 6, true, false);

        const imgX = x + CARD_W - 110;
        const imgY = y + 20;
        
        // 🔥 جلب مسار الصورة من القاموس بناءً على ID العنصر 🔥
        const itemDictionaryInfo = resolveItemInfoLocal(item.id);
        const targetImageURL = item.image || itemDictionaryInfo.imgPath;

        if (targetImageURL) {
            const img = await safeLoadImage(targetImageURL);
            if (img) ctx.drawImage(img, imgX, imgY, 80, 80);
            else { ctx.fillStyle=COLOR_TEXT; ctx.font = `60px ${FONT_EMOJI}`; ctx.textAlign='center'; ctx.fillText(item.emoji, imgX+40, imgY+60); }
        } else {
            ctx.fillStyle=COLOR_TEXT; ctx.font = `60px ${FONT_EMOJI}`; ctx.textAlign='center'; ctx.fillText(item.emoji, imgX+40, imgY+60);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR_TEXT;
        ctx.font = `bold 28px ${FONT_MAIN}`;
        ctx.fillText(item.name, imgX - 15, y + 45);

        ctx.fillStyle = COLOR_GOLD;
        ctx.font = `bold 24px ${FONT_MAIN}`;
        ctx.fillText(`${item.price.toLocaleString()} مورا`, imgX - 15, y + 85);

        ctx.strokeStyle = '#3f3f46';
        ctx.beginPath(); ctx.moveTo(x + 20, y + 115); ctx.lineTo(CARD_W + x - 20, y + 115); ctx.stroke();

        ctx.fillStyle = COLOR_SUB;
        ctx.font = `20px ${FONT_MAIN}`;
        if (category === 'animals') {
            ctx.fillText(`الدخل: ${item.income_per_day} م/يوم`, x + CARD_W - 25, y + 150);
            ctx.fillText(`العمر: ${item.lifespan_days} يوم | مساحة: ${item.size}`, x + CARD_W - 25, y + 180);
        } else if (category === 'seeds') {
            ctx.fillText(`سعر البيع: ${item.sell_price} مورا`, x + CARD_W - 25, y + 150);
            ctx.fillText(`النمو: ${item.growth_time_hours} ساعة`, x + CARD_W - 25, y + 180);
        } else {
            const desc = item.description ? item.description.substring(0, 32) + '...' : 'علف مخصص للحيوانات.';
            ctx.fillText(desc, x + CARD_W - 25, y + 150);
        }
    }

    ctx.fillStyle = COLOR_SUB;
    ctx.textAlign = 'center';
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(`الصفحة ${page + 1} من ${totalPages}`, 600, 780);

    return canvas.toBuffer();
};

exports.drawFarmShopDetail = async function(item, category, userQty, maxCap, currCap) {
    const canvas = createCanvas(900, 450);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, 900, 450);

    ctx.fillStyle = COLOR_CARD;
    drawRoundedRect(ctx, 20, 20, 860, 410, 15, true, false);
    ctx.strokeStyle = COLOR_GOLD;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 20, 20, 860, 410, 15, false, true);

    const imgX = 620;
    const imgY = 60;
    ctx.fillStyle = '#1f1f22';
    drawRoundedRect(ctx, imgX, imgY, 220, 220, 15, true, false);

    // 🔥 جلب مسار الصورة من القاموس بناءً على ID العنصر 🔥
    const itemDictionaryInfo = resolveItemInfoLocal(item.id);
    const targetImageURL = item.image || itemDictionaryInfo.imgPath;

    if (targetImageURL) {
        const img = await safeLoadImage(targetImageURL);
        if (img) ctx.drawImage(img, imgX + 10, imgY + 10, 200, 200);
        else { ctx.fillStyle=COLOR_TEXT; ctx.font = `120px ${FONT_EMOJI}`; ctx.textAlign='center'; ctx.fillText(item.emoji, imgX+110, imgY+150); }
    } else {
        ctx.fillStyle=COLOR_TEXT; ctx.font = `120px ${FONT_EMOJI}`; ctx.textAlign='center'; ctx.fillText(item.emoji, imgX+110, imgY+150);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `bold 55px ${FONT_MAIN}`;
    ctx.fillText(item.name, 580, 100);

    ctx.fillStyle = COLOR_GOLD;
    ctx.font = `bold 35px ${FONT_MAIN}`;
    ctx.fillText(`${item.price.toLocaleString()} مورا`, 580, 160);

    ctx.fillStyle = COLOR_SUB;
    ctx.font = `24px ${FONT_MAIN}`;
    const startY = 220;
    const gapY = 40;

    if (category === 'animals') {
        ctx.fillText(`💰 الدخل المتوقع: ${item.income_per_day} مورا يومياً`, 580, startY);
        ctx.fillText(`⏳ العمر الافتراضي: ${item.lifespan_days} يوم`, 580, startY + gapY);
        ctx.fillText(`📦 المساحة المطلوبة: ${item.size} وحدة حظيرة`, 580, startY + gapY * 2);
    } else if (category === 'seeds') {
        ctx.fillText(`💰 العائد بعد الزراعة: ${item.sell_price} مورا`, 580, startY);
        ctx.fillText(`⏳ وقت النضج: ${item.growth_time_hours} ساعة`, 580, startY + gapY);
        ctx.fillText(`🍂 يذبل بعد: ${item.wither_time_hours} ساعة من النضج`, 580, startY + gapY * 2);
    } else {
        const desc = item.description || 'علف صحي لضمان نمو ودخل ممتاز.';
        const words = desc.split(' ');
        let line = '';
        let currentY = startY;
        for(let w of words) {
            let testLine = line + w + ' ';
            if(ctx.measureText(testLine).width > 500) {
                ctx.fillText(line, 580, currentY);
                line = w + ' ';
                currentY += gapY;
            } else { line = testLine; }
        }
        ctx.fillText(line, 580, currentY);
    }

    ctx.fillStyle = '#111113';
    drawRoundedRect(ctx, 40, 350, 820, 60, 10, true, false);
    
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.textAlign = 'center';
    
    if (category === 'animals') {
        ctx.fillText(`📊 المساحة المتبقية في حظيرتك: ${maxCap - currCap} | تمتلك حالياً: ${userQty} من هذا النوع`, 450, 388);
    } else {
        ctx.fillText(`📊 الكمية المتوفرة لديك في المخزن: ${userQty}`, 450, 388);
    }

    return canvas.toBuffer();
};
