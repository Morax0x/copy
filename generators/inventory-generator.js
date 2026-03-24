const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Inventory Generator] ⚠️ تنبيه: لم يتم العثور على خط Bein.");
}

const imageCache = new Map();
async function getCachedImage(imagePath) {
    if (!imagePath) return null;
    if (imageCache.has(imagePath)) return imageCache.get(imagePath);
    if (fs.existsSync(imagePath)) {
        try {
            const img = await loadImage(imagePath);
            imageCache.set(imagePath, img);
            return img;
        } catch (e) { return null; }
    }
    return null;
}

const RARITY_COLORS = {
    'Common': '#A8B8D0',      
    'Uncommon': '#2ECC71',    
    'Rare': '#00C3FF',        
    'Epic': '#B968FF',        
    'Legendary': '#FFD700'    
};

// ==========================================
// 🔥 دوال الرسم والتصميم 🔥
// ==========================================

function drawOrnateFrame(ctx, x, y, w, h, color) {
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    const cl = 20; 
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawRibbon(ctx, x, y, w, h, color) {
    const ext = 10; 
    ctx.fillStyle = 'rgba(5, 5, 8, 0.95)';
    ctx.beginPath();
    ctx.moveTo(x - ext, y);
    ctx.lineTo(x + w + ext, y);
    ctx.lineTo(x + w + ext - 8, y + h / 2);
    ctx.lineTo(x + w + ext, y + h);
    ctx.lineTo(x - ext, y + h);
    ctx.lineTo(x - ext + 8, y + h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function roundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawShield(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y - h/2); 
    ctx.lineTo(x + w/2, y - h/4); 
    ctx.lineTo(x + w/2, y + h/5); 
    ctx.quadraticCurveTo(x + w/2, y + h/2, x, y + h/2); 
    ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/5); 
    ctx.lineTo(x - w/2, y - h/4); 
    ctx.closePath();
}

// ========================================================
// 🔥 دالة 1: شبكة الأقسام (تم إصلاح المقاسات بالمليمتر) 🔥
// ========================================================
async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    const width = 1200; 
    const height = 900; // ⚠️ تم رفع الارتفاع لحل مشكلة خروج المربعات عن الإطار
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); 
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // غبار النجوم
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const headerH = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; 
    ctx.font = 'bold 55px "Bein"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.fillText(`✦ خـزائـن ${userDisplayName} ✦`, width / 2, 60);
    
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '26px "Bein"';
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "3px";
    ctx.fillText(`⟪ ${categoryTitle} ⟫`, width / 2, 110);

    // رقم الصفحة محشور بالزاوية اليمنى فوق بأناقة
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Bein"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`[ ${page} / ${totalPages || 1} ]`, width - 30, 70);

    const cols = 5;
    const rows = 3;
    const slotSize = 175; 
    const gapX = 45;      
    const gapY = 55;      
    
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 180; // ⚠️ تم ضبط بداية الرسم لتوسيط المربعات بدقة

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#222';

        if (!item) {
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');
            continue;
        }

        drawOrnateFrame(ctx, x, y, slotSize, slotSize, rarityColor);

        const aura = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.2);
        aura.addColorStop(0, `${rarityColor}60`); 
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotSize, slotSize);

        let imgDrawn = false;
        if (item.imgPath) {
            const imgPath = path.join(process.cwd(), item.imgPath);
            const img = await getCachedImage(imgPath);
            if (img) {
                const padding = 25; 
                const imgSize = slotSize - (padding * 2);
                
                ctx.shadowColor = rarityColor;
                ctx.shadowBlur = 40;
                ctx.drawImage(img, x + padding, y + padding - 15, imgSize, imgSize);
                ctx.shadowBlur = 0; 
                imgDrawn = true;
            }
        }

        if (!imgDrawn) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '65px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = rarityColor;
            ctx.shadowBlur = 30;
            ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2 - 15);
            ctx.shadowBlur = 0;
        }

        const ribbonH = 35;
        const ribbonY = y + slotSize - 20;
        drawRibbon(ctx, x, ribbonY, slotSize, ribbonH, rarityColor);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 16px "Bein"';
        ctx.fillStyle = '#FFFFFF';
        let shortName = item.name;
        if (shortName.length > 15) shortName = shortName.substring(0, 14) + '..';
        ctx.fillText(shortName, x + slotSize / 2, ribbonY + ribbonH / 2);

        const qtyText = item.quantity > 999 ? '999+' : item.quantity.toString();
        ctx.font = 'bold 15px "Arial"';
        const textW = ctx.measureText(qtyText).width;
        const badgeRadius = Math.max(16, textW / 2 + 6);
        const badgeX = x + slotSize; 
        const badgeY = y;

        ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI*2);
        ctx.fillStyle = rarityColor;
        ctx.shadowColor = '#000'; ctx.shadowBlur = 10; ctx.fill();
        
        ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius - 2, 0, Math.PI*2);
        ctx.fillStyle = '#111'; ctx.shadowBlur = 0; ctx.fill();

        ctx.fillStyle = '#FFF';
        ctx.fillText(qtyText, badgeX, badgeY + 1);
    }

    return canvas.toBuffer('image/png');
}

// ========================================================
// 🔥 دالة 2: الصفحة الرئيسية (تحفة بصرية متكاملة) 🔥
// ========================================================
async function generateMainHub(userObj, displayName, moraBalance, rankLetter) {
    // ⚠️ التأكد من أن الرتبة ليست فارغة (Fallback)
    rankLetter = rankLetter || 'F';

    const width = 1100;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryColor = '#FFD700'; // الذهبي الملكي

    // 1. الخلفية السينمائية
    const bgPath = path.join(process.cwd(), 'images/inventory/desk_bg.png');
    const bgImg = await getCachedImage(bgPath);
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        // تظليل الحواف للتركيز على العناصر
        const vignette = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
        vignette.addColorStop(0, 'rgba(0,0,0,0.2)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
        ctx.fillStyle = vignette;
        ctx.fillRect(0,0,width,height);
    } else {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, width, height);
    }

    // ==========================================
    // 🛡️ الجزء الأيسر: بطاقة الهوية الملكية 
    // ==========================================
    const idX = 60, idY = 60, idW = 380, idH = 480;
    
    // إطار البطاقة الزجاجي
    ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 40;
    ctx.beginPath(); roundRect(ctx, idX, idY, idW, idH, 20); ctx.fill();
    ctx.shadowBlur = 0;
    
    // الزخرفة الخارجية
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2;
    ctx.strokeRect(idX + 15, idY + 15, idW - 30, idH - 30);
    const cl = 30; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(idX+15, idY+15+cl); ctx.lineTo(idX+15, idY+15); ctx.lineTo(idX+15+cl, idY+15);
    ctx.moveTo(idX+idW-15-cl, idY+15); ctx.lineTo(idX+idW-15, idY+15); ctx.lineTo(idX+idW-15, idY+15+cl);
    ctx.moveTo(idX+idW-15, idY+idH-15-cl); ctx.lineTo(idX+idW-15, idY+idH-15); ctx.lineTo(idX+idW-15-cl, idY+idH-15);
    ctx.moveTo(idX+15+cl, idY+idH-15); ctx.lineTo(idX+15, idY+idH-15); ctx.lineTo(idX+15, idY+idH-15-cl);
    ctx.stroke();

    // 👤 الصورة الدائرية (البروفايل)
    const avatarSize = 160;
    const avatarX = idX + idW / 2; 
    const avatarY = idY + 130; 

    // توهج خلف الصورة
    const glow = ctx.createRadialGradient(avatarX, avatarY, 10, avatarX, avatarY, 120);
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.4)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(avatarX-120, avatarY-120, 240, 240);

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#333'; ctx.fill();
    }
    ctx.restore();

    // إطار الصورة
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = primaryColor;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2 - 8, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.stroke();

    // 🛡️ درع الرتبة (Rank Shield) متمركز بشكل احترافي أسفل الصورة
    const badgeW = 70;
    const badgeH = 80;
    const badgeX = avatarX;
    const badgeY = avatarY + (avatarSize / 2) + 10; // راكب على حافة الإطار

    ctx.save();
    drawShield(ctx, badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.fill();
    
    ctx.lineWidth = 3;
    ctx.strokeStyle = primaryColor;
    ctx.stroke();

    drawShield(ctx, badgeX, badgeY + 4, badgeW - 12, badgeH - 14);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 34px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 10;
    ctx.fillText(rankLetter, badgeX, badgeY + 6);
    ctx.shadowBlur = 0;

    // 📝 ترتيب المعلومات (الاسم والثروة)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px "Bein"';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 15;
    
    let dName = displayName;
    if (dName.length > 14) dName = dName.substring(0, 13) + '..';
    ctx.fillText(dName, avatarX, badgeY + 70);
    ctx.shadowBlur = 0;

    // فاصل زخرفي
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.fillRect(idX + 60, badgeY + 115, idW - 120, 2);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 30px "Bein"';
    ctx.fillText(`الثروة: ${moraBalance.toLocaleString()} 🪙`, avatarX, badgeY + 160);

    ctx.fillStyle = '#A8B8D0';
    ctx.font = '20px "Bein"';
    ctx.fillText('❖ حـارس الأبـعـاد ❖', avatarX, badgeY + 205);


    // ==========================================
    // 🎒 الجزء الأيمن: حقيبة الأبعاد (The Summoning Altar)
    // ==========================================
    const bagX = 800, bagY = 280;
    
    // رسم دوائر سحرية خرافية مائلة (3D Effect)
    ctx.save();
    ctx.translate(bagX, bagY + 120);
    ctx.scale(1, 0.35); // ضغط الدائرة لتعطي تأثير 3D على الأرض
    
    const altarGlow = ctx.createRadialGradient(0, 0, 20, 0, 0, 250);
    altarGlow.addColorStop(0, 'rgba(185, 104, 255, 0.6)');
    altarGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = altarGlow;
    ctx.beginPath(); ctx.arc(0, 0, 250, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = '#B968FF';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 200, 0, Math.PI*2); ctx.stroke();
    
    ctx.strokeStyle = 'rgba(185, 104, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([15, 10]);
    ctx.beginPath(); ctx.arc(0, 0, 220, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // شعاع ضوئي يتصاعد
    const beam = ctx.createLinearGradient(0, bagY + 120, 0, bagY - 200);
    beam.addColorStop(0, 'rgba(185, 104, 255, 0.3)');
    beam.addColorStop(1, 'rgba(185, 104, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(bagX - 200, bagY + 120); ctx.lineTo(bagX + 200, bagY + 120); ctx.lineTo(bagX + 100, bagY - 200); ctx.lineTo(bagX - 100, bagY - 200); ctx.fill();

    // رسم الحقيبة بشكل ضخم
    const bagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
    const bagImg = await getCachedImage(bagPath);
    if (bagImg) {
        ctx.shadowColor = '#B968FF'; 
        ctx.shadowBlur = 60; 
        ctx.drawImage(bagImg, bagX - 225, bagY - 225, 450, 450); 
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard, generateMainHub };
