const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// 1. تسجيل خط الإمبراطورية
try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Inventory Generator] ⚠️ تنبيه: لم يتم العثور على خط Bein.");
}

// 2. نظام التخزين المؤقت للصور لضمان سرعة 0 تأخير
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

// 3. ألوان الندرة الأنيقة (Hex)
const RARITY_COLORS = {
    'Common': '#A0A0A0',      // رمادي معدني
    'Uncommon': '#2ECC71',    // أخضر زمردي
    'Rare': '#3498DB',        // أزرق محيطي
    'Epic': '#9B59B6',        // بنفسجي أسطوري
    'Legendary': '#F1C40F'    // ذهبي متوهج
};

/**
 * دالة توليد صورة الحقيبة المرئية
 */
async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    // مقاسات واسعة تعطي فخامة للوحة
    const width = 880;
    const height = 680;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // ==========================================
    // 1. رسم الخلفية السينمائية الداكنة
    // ==========================================
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0f172a'); // كحلي غامق جداً
    bgGrad.addColorStop(1, '#020617'); // أسود ليلي
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // إضافة تأثير شبكة خفيفة (Grid Pattern) لتبدو كواجهة لعبة
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }

    // ==========================================
    // 2. رسم الهيدر (شريط العنوان العلوي)
    // ==========================================
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 100);
    headerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    headerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, width, 100);
    
    // خط سفلي للهيدر
    ctx.beginPath();
    ctx.moveTo(0, 100);
    ctx.lineTo(width, 100);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // نصوص العنوان
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // اسم الحقيبة
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px "Bein"';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText(`🎒 حقيبة ${userDisplayName}`, width / 2, 40);
    
    // اسم القسم
    ctx.fillStyle = '#A0ABC0';
    ctx.font = '22px "Bein"';
    ctx.fillText(`[ ${categoryTitle} ]`, width / 2, 80);
    ctx.shadowBlur = 0;

    // ==========================================
    // 3. إعدادات شبكة المربعات (Grid)
    // ==========================================
    const cols = 5;
    const rows = 3;
    const slotSize = 130; // حجم المربع المريح
    const gapX = 30;      // المسافة الأفقية
    const gapY = 35;      // المسافة العمودية
    
    // حساب المنتصف لكي تكون المربعات متمركزة تماماً
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 140;

    // ==========================================
    // 4. رسم المربعات وتعبئة العناصر
    // ==========================================
    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#1e222b';

        // أ. خلفية المربع (Slot Background)
        ctx.fillStyle = item ? '#1e293b' : '#111827'; // أفتح قليلاً إذا كان فيه عنصر
        ctx.beginPath();
        ctx.roundRect(x, y, slotSize, slotSize, 16);
        ctx.fill();

        // ب. توهج خلفي للندرة (Glow)
        if (item) {
            const glow = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.5);
            glow.addColorStop(0, `${rarityColor}40`); // شفافية 40%
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fill();
        }

        // ج. إطار المربع (Border)
        ctx.strokeStyle = item ? rarityColor : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = item ? 3 : 2;
        ctx.stroke();

        // د. رسم محتوى العنصر
        if (item) {
            // رسم صورة العنصر
            if (item.imgPath) {
                const imgPath = path.join(process.cwd(), item.imgPath);
                const img = await getCachedImage(imgPath);
                if (img) {
                    const padding = 15;
                    const imgSize = slotSize - (padding * 2);
                    
                    // إضافة ظل خفيف للصورة نفسها لتبرز
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                    ctx.shadowBlur = 15;
                    ctx.drawImage(img, x + padding, y + padding - 5, imgSize, imgSize);
                    ctx.shadowBlur = 0; // إطفاء الظل
                } else {
                    // Fallback إذا لم نجد الصورة
                    ctx.fillStyle = rarityColor;
                    ctx.font = '50px Arial';
                    ctx.fillText('✨', x + slotSize / 2, y + slotSize / 2);
                }
            } else {
                // Fallback للمهارات أو الأشياء اللي ما لها صورة
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '50px Arial';
                ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2);
            }

            // هـ. شارة الكمية الاحترافية (Quantity Badge)
            const qtyText = `x${item.quantity.toLocaleString()}`;
            ctx.font = 'bold 18px "Arial"';
            const textWidth = ctx.measureText(qtyText).width;
            
            const badgePaddingX = 12;
            const badgeHeight = 26;
            const badgeWidth = textWidth + badgePaddingX;
            const badgeX = x + slotSize - badgeWidth;
            const badgeY = y + slotSize - badgeHeight;

            // خلفية الشارة (سوداء نصف شفافة لتناسب جميع الخلفيات)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, { tl: 10, br: 14 });
            ctx.fill();

            // إطار خفيف للشارة بلون الندرة
            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // رقم الكمية
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(qtyText, x + slotSize - 6, badgeY + badgeHeight / 2 + 1);
            ctx.textAlign = 'center'; // إعادة الضبط
        }
    }

    // ==========================================
    // 5. تذييل الصفحة (رقم الصفحة)
    // ==========================================
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '22px "Bein"';
    ctx.fillText(`❖ صفحة ${page} من ${totalPages || 1} ❖`, width / 2, height - 30);

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard };
