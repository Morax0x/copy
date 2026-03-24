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
// 🔥 دوال الرسم الفني العالي (High Fantasy Art) 🔥
// ==========================================

// 1. رسم إطار قوطي مزخرف للأدوات (Gothic Ornate Frame)
function drawOrnateFrame(ctx, x, y, w, h, color) {
    // الخلفية الزجاجية المظلمة
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // زوايا معدنية فخمة (Ornate Corners)
    const cl = 20; // طول الزاوية
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    // Top Left
    ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    // Top Right
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    // Bottom Right
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    // Bottom Left
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// 2. رسم شريط حريري لاسم الأداة (Elegant Ribbon)
function drawRibbon(ctx, x, y, w, h, color) {
    const ext = 10; // امتداد الشريط خارج المربع
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

    // إطار الشريط
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// 3. رسم دائرة سحرية معقدة (Complex Magic Circle)
function drawMagicCircle(ctx, cx, cy, radius, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    
    // الدائرة الخارجية
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    
    // الدائرة الداخلية
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, radius - 15, 0, Math.PI * 2); ctx.stroke();

    // النجمة السداسية
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0; i<3; i++) {
        const angle1 = (Math.PI * 2 / 3) * i - Math.PI/2;
        const angle2 = (Math.PI * 2 / 3) * i + Math.PI/6;
        ctx.moveTo(radius * Math.cos(angle1), radius * Math.sin(angle1));
        ctx.lineTo(radius * Math.cos(angle2), radius * Math.sin(angle2));
    }
    ctx.stroke();
    ctx.restore();
}

// ========================================================
// 🔥 دالة 1: شبكة الأقسام الأسطورية (The Vault Grid) 🔥
// ========================================================
async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    const width = 1200; 
    const height = 850;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. الخلفية (The Astral Void)
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); // بنفسجي ملكي غامق جداً
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. نثر غبار النجوم السحري (Stardust Particles)
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 3. الهيدر الملكي (Royal Banner)
    const headerH = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    // خطوط ذهبية للهيدر
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; // ذهبي
    ctx.font = 'bold 55px "Bein"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.fillText(`✦ خـزائـن ${userDisplayName} ✦`, width / 2, 60);
    
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '26px "Bein"';
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "3px";
    ctx.fillText(`⟪ ${categoryTitle} ⟫`, width / 2, 110);

    // 4. المربعات (The Relic Slots)
    const cols = 5;
    const rows = 3;
    const slotSize = 175; 
    const gapX = 45;      
    const gapY = 55;      
    
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 190;

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#222';

        if (!item) {
            // خانة فارغة
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');
            continue;
        }

        // رسم الخانة المزخرفة للعنصر
        drawOrnateFrame(ctx, x, y, slotSize, slotSize, rarityColor);

        // توهج أسطوري خلف الأداة (Aura)
        const aura = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.2);
        aura.addColorStop(0, `${rarityColor}60`); 
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotSize, slotSize);

        // رسم الأداة
        let imgDrawn = false;
        if (item.imgPath) {
            const imgPath = path.join(process.cwd(), item.imgPath);
            const img = await getCachedImage(imgPath);
            if (img) {
                const padding = 25; 
                const imgSize = slotSize - (padding * 2);
                
                ctx.shadowColor = rarityColor;
                ctx.shadowBlur = 40;
                // تحريك للصعود قليلاً لإفساح المجال للشريط السفلي
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

        // شريط الاسم الحريري (Ribbon)
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

        // شارة الكمية (Jewel Badge) في الزاوية العلوية اليمنى
        const qtyText = item.quantity > 999 ? '999+' : item.quantity.toString();
        ctx.font = 'bold 15px "Arial"';
        const textW = ctx.measureText(qtyText).width;
        const badgeRadius = Math.max(16, textW / 2 + 6);
        const badgeX = x + slotSize; // على حافة الإطار
        const badgeY = y;

        // رسم الجوهرة
        ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI*2);
        ctx.fillStyle = rarityColor;
        ctx.shadowColor = '#000'; ctx.shadowBlur = 10; ctx.fill();
        
        ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius - 2, 0, Math.PI*2);
        ctx.fillStyle = '#111'; ctx.shadowBlur = 0; ctx.fill();

        ctx.fillStyle = '#FFF';
        ctx.fillText(qtyText, badgeX, badgeY + 1);
    }

    // تذييل الصفحة (Parchment Footer)
    const footerY = height - 50;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(width / 2 - 150, footerY - 20, 300, 40);
    
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.strokeRect(width / 2 - 150, footerY - 20, 300, 40);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px "Bein"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✧ صفحة ${page} من ${totalPages || 1} ✧`, width / 2, footerY);

    return canvas.toBuffer('image/png');
}

// ========================================================
// 🔥 دالة 2: قاعة الإمبراطور (The Emperor's Sanctum) 🔥
// (الترحيب الفخم الخيالي)
// ========================================================
async function generateMainHub(userObj, displayName, moraBalance) {
    const width = 1000;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. خلفية القاعة المظلمة
    const bgPath = path.join(process.cwd(), 'images/inventory/desk_bg.png');
    const bgImg = await getCachedImage(bgPath);
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        const vignette = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 700);
        vignette.addColorStop(0, 'rgba(0,0,0,0.3)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); // حواف مظلمة جداً لتركيز الإضاءة
        ctx.fillStyle = vignette;
        ctx.fillRect(0,0,width,height);
    } else {
        const fallbackBg = ctx.createLinearGradient(0,0,0,height);
        fallbackBg.addColorStop(0,'#111'); fallbackBg.addColorStop(1,'#000');
        ctx.fillStyle = fallbackBg; ctx.fillRect(0, 0, width, height);
    }

    // 2. بطاقة هوية اللاعب المنقوشة (Embossed ID Plaque)
    const idX = 50, idY = 50, idW = 400, idH = 450;
    
    // اللوحة المعدنية الداكنة
    ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.roundRect(idX, idY, idW, idH, 20); ctx.fill();
    ctx.shadowBlur = 0;
    
    // إطار ذهبي مزخرف للوحة
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
    ctx.strokeRect(idX + 10, idY + 10, idW - 20, idH - 20);
    // زوايا اللوحة
    const cl = 30; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(idX+10, idY+10+cl); ctx.lineTo(idX+10, idY+10); ctx.lineTo(idX+10+cl, idY+10);
    ctx.moveTo(idX+idW-10-cl, idY+10); ctx.lineTo(idX+idW-10, idY+10); ctx.lineTo(idX+idW-10, idY+10+cl);
    ctx.moveTo(idX+idW-10, idY+idH-10-cl); ctx.lineTo(idX+idW-10, idY+idH-10); ctx.lineTo(idX+idW-10-cl, idY+idH-10);
    ctx.moveTo(idX+10+cl, idY+idH-10); ctx.lineTo(idX+10, idY+idH-10); ctx.lineTo(idX+10, idY+idH-10-cl);
    ctx.stroke();

    // 3. صورة اللاعب المحفورة (Avatar Frame)
    const avatarX = idX + idW/2, avatarY = idY + 120, avatarSize = 140;
    
    // شعاع خلف الصورة
    const avatarGlow = ctx.createRadialGradient(avatarX, avatarY, 10, avatarX, avatarY, 100);
    avatarGlow.addColorStop(0, 'rgba(255, 215, 0, 0.5)'); avatarGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = avatarGlow; ctx.fillRect(avatarX-100, avatarY-100, 200, 200);

    const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
    try {
        const avatarImg = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize/2, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(avatarImg, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
        ctx.restore();
    } catch(e) {}

    // إطار ذهبي سميك للصورة
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize/2, 0, Math.PI*2);
    ctx.lineWidth = 6; ctx.strokeStyle = '#FFD700'; ctx.stroke();
    // إطار داخلي رفيع
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize/2 - 8, 0, Math.PI*2);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();

    // 4. نصوص الهوية (Player Info)
    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Bein"';
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 15;
    ctx.fillText(displayName, avatarX, avatarY + 110);
    ctx.shadowBlur = 0;

    // خط فاصل
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.fillRect(idX + 50, avatarY + 150, idW - 100, 2);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 32px "Bein"';
    ctx.fillText(`الثروة: ${moraBalance.toLocaleString()} 🪙`, avatarX, avatarY + 210);

    ctx.fillStyle = '#A8B8D0';
    ctx.font = '22px "Bein"';
    ctx.fillText('❖ حـارس الأبـعـاد ❖', avatarX, avatarY + 270);

    // 5. الحقيبة الفضائية (The Dimensional Relic)
    const bagX = 720, bagY = 250;
    
    // رسم الدائرة السحرية الخرافية خلف الحقيبة
    drawMagicCircle(ctx, bagX, bagY + 80, 160, 'rgba(185, 104, 255, 0.6)');
    
    // شعاع سحري يخرج من الدائرة للأعلى
    const beam = ctx.createLinearGradient(0, bagY + 80, 0, bagY - 200);
    beam.addColorStop(0, 'rgba(185, 104, 255, 0.4)');
    beam.addColorStop(1, 'rgba(185, 104, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(bagX - 160, bagY + 80); ctx.lineTo(bagX + 160, bagY + 80); ctx.lineTo(bagX + 80, bagY - 200); ctx.lineTo(bagX - 80, bagY - 200); ctx.fill();

    const bagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
    const bagImg = await getCachedImage(bagPath);
    if (bagImg) {
        ctx.shadowColor = '#B968FF'; 
        ctx.shadowBlur = 80; // توهج عظيم
        ctx.drawImage(bagImg, bagX - 200, bagY - 200, 400, 400); // الحقيبة ضخمة وفخمة
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard, generateMainHub };
