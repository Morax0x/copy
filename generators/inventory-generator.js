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
    'Common': '#A0A0A0',      
    'Uncommon': '#2ECC71',    
    'Rare': '#3498DB',        
    'Epic': '#9B59B6',        
    'Legendary': '#F1C40F'    
};

// ========================================================
// 🔥 دالة 1: المربعات السينمائية لأقسام الحقيبة (Grid) 🔥
// ========================================================
async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    const width = 880;
    const height = 680;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. رسم الخلفية السينمائية
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0f172a'); 
    bgGrad.addColorStop(1, '#020617'); 
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }

    // 2. الهيدر
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 100);
    headerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    headerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, width, 100);
    
    ctx.beginPath();
    ctx.moveTo(0, 100);
    ctx.lineTo(width, 100);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px "Bein"';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText(`🎒 حقيبة ${userDisplayName}`, width / 2, 40);
    
    ctx.fillStyle = '#A0ABC0';
    ctx.font = '22px "Bein"';
    ctx.fillText(`[ ${categoryTitle} ]`, width / 2, 80);
    ctx.shadowBlur = 0;

    // 3. المربعات (Grid)
    const cols = 5;
    const rows = 3;
    const slotSize = 130; 
    const gapX = 30;      
    const gapY = 35;      
    
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 140;

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#1e222b';

        ctx.fillStyle = item ? '#1e293b' : '#111827'; 
        ctx.beginPath();
        ctx.roundRect(x, y, slotSize, slotSize, 16);
        ctx.fill();

        if (item) {
            const glow = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.5);
            glow.addColorStop(0, `${rarityColor}40`); 
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fill();
        }

        ctx.strokeStyle = item ? rarityColor : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = item ? 3 : 2;
        ctx.stroke();

        if (item) {
            let imgDrawn = false;

            // أ. محاولة رسم الصورة الحقيقية
            if (item.imgPath) {
                const imgPath = path.join(process.cwd(), item.imgPath);
                const img = await getCachedImage(imgPath);
                if (img) {
                    const padding = 20; 
                    const imgSize = slotSize - (padding * 2);
                    
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                    ctx.shadowBlur = 15;
                    ctx.drawImage(img, x + padding, y + padding + 8, imgSize, imgSize);
                    ctx.shadowBlur = 0; 
                    imgDrawn = true;
                }
            }

            // ب. نظام الإيموجي التعويضي (إذا لم يجد صورة)
            if (!imgDrawn) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '50px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2 + 10);
            }

            // إضافة اسم العنصر في الزاوية العلوية اليسرى 
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 12px "Bein"';
            
            let shortName = item.name;
            if (shortName.length > 11) shortName = shortName.substring(0, 10) + '..';
            
            const nameWidth = ctx.measureText(shortName).width;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.beginPath();
            ctx.roundRect(x, y, nameWidth + 12, 24, [14, 0, 8, 0]);
            ctx.fill();

            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x, y, nameWidth + 12, 24, [14, 0, 8, 0]);
            ctx.stroke();

            ctx.fillStyle = '#E2E8F0'; 
            ctx.fillText(shortName, x + 6, y + 12);

            // شارة الكمية في الزاوية السفلية اليمنى 
            const qtyText = `x${item.quantity.toLocaleString()}`;
            ctx.font = 'bold 16px "Arial"';
            const textWidth = ctx.measureText(qtyText).width;
            
            const badgePaddingX = 10;
            const badgeHeight = 24;
            const badgeWidth = textWidth + badgePaddingX;
            const badgeX = x + slotSize - badgeWidth;
            const badgeY = y + slotSize - badgeHeight;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, [10, 0, 14, 0]);
            ctx.fill();

            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(qtyText, x + slotSize - 5, badgeY + badgeHeight / 2 + 1);
            ctx.textAlign = 'center'; 
        }
    }

    // تذييل الصفحة
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '22px "Bein"';
    ctx.fillText(`❖ صفحة ${page} من ${totalPages || 1} ❖`, width / 2, height - 30);

    return canvas.toBuffer('image/png');
}

// ========================================================
// 🔥 دالة 2: واجهة الحقيبة الرئيسية (طاولة الإمبراطور) 🔥
// ========================================================
async function generateMainHub(userObj, displayName, moraBalance) {
    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. رسم خلفية الطاولة
    const bgPath = path.join(process.cwd(), 'images/inventory/desk_bg.png');
    const bgImg = await getCachedImage(bgPath);
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
    } else {
        ctx.fillStyle = '#2c1e16'; // لون خشبي كبديل إذا لم يجد الصورة
        ctx.fillRect(0, 0, width, height);
    }

    // 2. رسم ورقة (مخطوطة) شفافة خلف معلومات اللاعب للوضوح
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; // أسود شفاف
    ctx.beginPath();
    ctx.roundRect(30, 30, 320, 390, 15);
    ctx.fill();
    ctx.strokeStyle = '#D4AC0D'; // إطار ذهبي
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 320, 390);

    // 3. سحب ورسم صورة البروفايل الخاصة باللاعب (Avatar)
    const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
    try {
        const avatarImg = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(190, 140, 70, 0, Math.PI * 2); // دائرة القص
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, 120, 70, 140, 140);
        ctx.restore();

        // إطار ذهبي حول الصورة الشخصية
        ctx.beginPath();
        ctx.arc(190, 140, 70, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#F1C40F';
        ctx.stroke();
    } catch(e) {
        console.log("لم يتمكن من جلب صورة اللاعب.");
    }

    // 4. كتابة اسم اللاعب والرصيد
    ctx.textAlign = 'center';
    
    // الاسم
    ctx.font = 'bold 38px "Bein"';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 10;
    ctx.fillText(displayName, 190, 260);

    // الرصيد (المورا)
    ctx.font = '28px "Bein"';
    ctx.fillStyle = '#F1C40F';
    ctx.fillText(`المورا: ${moraBalance.toLocaleString()}`, 190, 320);

    // نص ترحيبي
    ctx.font = '22px "Bein"';
    ctx.fillStyle = '#A0A0A0';
    ctx.fillText('أهلاً بك في خيمتك الخاصة', 190, 370);
    ctx.shadowBlur = 0;

    // 5. رسم الحقيبة المفرغة (الأبعاد) على اليمين
    const bagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
    const bagImg = await getCachedImage(bagPath);
    if (bagImg) {
        // ظل سحري للحقيبة
        ctx.shadowColor = '#9B59B6'; 
        ctx.shadowBlur = 40;
        ctx.drawImage(bagImg, 400, 40, 360, 360);
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard, generateMainHub };
