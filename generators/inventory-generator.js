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

// ألوان الندرة بأسطوع أعلى لتباين أفضل
const RARITY_COLORS = {
    'Common': '#B0BEC5',      
    'Uncommon': '#2ECC71',    
    'Rare': '#3498DB',        
    'Epic': '#9B59B6',        
    'Legendary': '#F1C40F'    
};

// ==========================================
// 🔥 دوال مساعدة هندسية (كود احترافي) 🔥
// ==========================================
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

// ========================================================
// 🔥 دالة 1: المربعات السينمائية لأقسام الحقيبة (Grid) 🔥
// ========================================================
async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    const width = 1100; // تم توسيع العرض ليتناسب مع فخامة البطاقة
    const height = 750; // تم زيادة الارتفاع ليتنفس التصميم
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryTheme = '#3498db'; // لون السمة الأساسي (أزرق فخم)

    // 1. الخلفية الأساسية (Deep Void)
    const bgBase = ctx.createLinearGradient(0, 0, width, height);
    bgBase.addColorStop(0, '#050508'); 
    bgBase.addColorStop(1, '#0b0c10');
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, width, height);

    // 2. توهج خلفي (Ambient Glow)
    const ambientGlow = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    ambientGlow.addColorStop(0, 'rgba(52, 152, 219, 0.15)');
    ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambientGlow;
    ctx.fillRect(0, 0, width, height);

    // 3. الإطار الخارجي الزجاجي المزدوج
    const borderGradient = ctx.createLinearGradient(0, 0, width, height);
    borderGradient.addColorStop(0, primaryTheme);
    borderGradient.addColorStop(0.5, '#ffffff');
    borderGradient.addColorStop(1, primaryTheme);

    ctx.lineWidth = 4;
    ctx.strokeStyle = borderGradient;
    roundRect(ctx, 10, 10, width - 20, height - 20, 20);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, 20, 20, width - 40, height - 40, 15);
    ctx.stroke();

    // 4. رسم الهيدر (Header Panel)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 20, 30, 0.8)'; // خلفية زجاجية شفافة
    ctx.beginPath();
    roundRect(ctx, 40, 40, width - 80, 100, 15);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = primaryTheme;
    ctx.stroke();

    // لمعان طفيف على الهيدر
    const headerGlow = ctx.createLinearGradient(40, 40, 40, 140);
    headerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    headerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = headerGlow;
    ctx.fill();
    ctx.restore();

    // نصوص الهيدر
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Bein"';
    ctx.shadowColor = primaryTheme;
    ctx.shadowBlur = 15;
    ctx.fillText(`🎒 مـخـزن ${userDisplayName}`, width / 2, 75);
    
    ctx.fillStyle = '#A0ABC0';
    ctx.font = '24px "Bein"';
    ctx.shadowBlur = 0;
    ctx.fillText(`[ ${categoryTitle} ]`, width / 2, 115);

    // 5. المربعات (Grid)
    const cols = 5;
    const rows = 3;
    const slotSize = 160; 
    const gapX = 40;      
    const gapY = 40;      
    
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 180;

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : 'rgba(255,255,255,0.05)';

        // خلفية المربع (Dark Glass)
        ctx.fillStyle = item ? 'rgba(20, 25, 35, 0.9)' : 'rgba(10, 15, 20, 0.5)'; 
        ctx.beginPath();
        roundRect(ctx, x, y, slotSize, slotSize, 18);
        ctx.fill();

        // التوهج الداخلي إذا كان هناك عنصر
        if (item) {
            const innerGlow = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize);
            innerGlow.addColorStop(0, `${rarityColor}30`); 
            innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = innerGlow;
            ctx.fill();
        }

        // إطار المربع الملون
        ctx.strokeStyle = rarityColor;
        ctx.lineWidth = item ? 3 : 1;
        ctx.stroke();

        // خط علوي مضيء (Highlight)
        if (item) {
            ctx.beginPath();
            ctx.moveTo(x + 18, y);
            ctx.lineTo(x + slotSize - 18, y);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        if (item) {
            let imgDrawn = false;

            // أ. محاولة رسم الصورة الحقيقية
            if (item.imgPath) {
                const imgPath = path.join(process.cwd(), item.imgPath);
                const img = await getCachedImage(imgPath);
                if (img) {
                    const padding = 25; 
                    const imgSize = slotSize - (padding * 2);
                    
                    ctx.shadowColor = rarityColor;
                    ctx.shadowBlur = 25;
                    ctx.drawImage(img, x + padding, y + padding, imgSize, imgSize);
                    ctx.shadowBlur = 0; 
                    imgDrawn = true;
                }
            }

            // ب. نظام الإيموجي التعويضي
            if (!imgDrawn) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '60px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = rarityColor;
                ctx.shadowBlur = 20;
                ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2);
                ctx.shadowBlur = 0;
            }

            // ==========================================
            // 🔥 شريط الاسم الفخم في الأسفل 🔥
            // ==========================================
            const nameBoxHeight = 35;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.beginPath();
            roundRect(ctx, x, y + slotSize - nameBoxHeight, slotSize, nameBoxHeight, [0, 0, 18, 18]);
            ctx.fill();

            // فاصل لوني صغير فوق الاسم
            ctx.beginPath();
            ctx.moveTo(x, y + slotSize - nameBoxHeight);
            ctx.lineTo(x + slotSize, y + slotSize - nameBoxHeight);
            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 16px "Bein"';
            ctx.fillStyle = '#FFFFFF';
            let shortName = item.name;
            if (shortName.length > 15) shortName = shortName.substring(0, 14) + '..';
            ctx.fillText(shortName, x + slotSize / 2, y + slotSize - (nameBoxHeight / 2));

            // ==========================================
            // 🔥 شارة الكمية (دائرية عائمة) في الأعلى 🔥
            // ==========================================
            const qtyText = `${item.quantity.toLocaleString()}`;
            ctx.font = 'bold 16px "Arial"';
            const textWidth = ctx.measureText(qtyText).width;
            
            const badgeRadius = Math.max(14, textWidth / 2 + 6);
            const badgeX = x + slotSize - badgeRadius - 8;
            const badgeY = y + badgeRadius + 8;

            ctx.fillStyle = rarityColor;
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000000';
            ctx.shadowBlur = 0;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(qtyText, badgeX, badgeY + 1);
        }
    }

    // تذييل الصفحة الأنيق
    const footerY = height - 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    roundRect(ctx, width / 2 - 120, footerY - 20, 240, 40, 10);
    ctx.fill();
    ctx.strokeStyle = primaryTheme;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px "Bein"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`❖ صفحة ${page} من ${totalPages || 1} ❖`, width / 2, footerY);

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
        ctx.fillStyle = '#2c1e16'; 
        ctx.fillRect(0, 0, width, height);
    }

    // 2. رسم ورقة (مخطوطة) شفافة
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; 
    ctx.beginPath();
    roundRect(ctx, 30, 30, 320, 390, 15);
    ctx.fill();
    ctx.strokeStyle = '#D4AC0D'; 
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 320, 390);

    // 3. صورة البروفايل
    const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
    try {
        const avatarImg = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(190, 140, 70, 0, Math.PI * 2); 
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, 120, 70, 140, 140);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(190, 140, 70, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#F1C40F';
        ctx.stroke();
    } catch(e) {}

    // 4. النصوص
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px "Bein"';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 10;
    ctx.fillText(displayName, 190, 260);

    ctx.font = '28px "Bein"';
    ctx.fillStyle = '#F1C40F';
    ctx.fillText(`المورا: ${moraBalance.toLocaleString()}`, 190, 320);

    ctx.font = '22px "Bein"';
    ctx.fillStyle = '#A0A0A0';
    ctx.fillText('أهلاً بك في خيمتك الخاصة', 190, 370);
    ctx.shadowBlur = 0;

    // 5. الحقيبة المفرغة
    const bagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
    const bagImg = await getCachedImage(bagPath);
    if (bagImg) {
        ctx.shadowColor = '#9B59B6'; 
        ctx.shadowBlur = 40;
        ctx.drawImage(bagImg, 400, 40, 360, 360);
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard, generateMainHub };
