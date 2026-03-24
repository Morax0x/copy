const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// 1. تسجيل خط الإمبراطورية الرسمي
try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Gacha Generator] ⚠️ تنبيه: لم يتم العثور على خط Bein، سيتم استخدام خط النظام.");
}

// 2. نظام التخزين المؤقت (Cache) لسرعة خارقة ⚡
const imageCache = new Map();

async function getCachedImage(imagePath) {
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

// 3. ألوان وخصائص الندرات
const RARITY_INFO = {
    'Common': { text: 'عـادي', color: '#B0BEC5' },
    'Uncommon': { text: 'غـيـر شـائـع', color: '#2ECC71' },
    'Rare': { text: 'نــادر', color: '#3498DB' },
    'Epic': { text: 'مـلـحـمـي', color: '#9B59B6' },
    'Legendary': { text: 'أسـطـوري', color: '#F1C40F' }
};

/**
 * دالة توليد بطاقة السحب (Gacha Pull)
 * @param {Object} item - العنصر الذي تم سحبه
 * @param {String} rarity - ندرة العنصر
 */
async function generateGachaCard(item, rarity) {
    // دقة عالية HD 800x800
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const rInfo = RARITY_INFO[rarity] || RARITY_INFO['Common'];

    // ==========================================
    // 1. رسم الهالة (الخلفية)
    // ==========================================
    const auraPath = path.join(process.cwd(), `images/auras/${rarity.toLowerCase()}.png`);
    const auraImg = await getCachedImage(auraPath);
    
    if (auraImg) {
        ctx.drawImage(auraImg, 0, 0, width, height);
    } else {
        // إذا لم يجد صورة الهالة، يصنع تدرج كوني احترافي
        const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
        grad.addColorStop(0, rInfo.color);
        grad.addColorStop(1, '#0d0d0d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // ==========================================
    // 2. رسم الأداة (العنصر المسحوب)
    // ==========================================
    let itemDrawn = false;

    if (item.imgPath) {
        const itemPath = path.join(process.cwd(), item.imgPath);
        const itemImg = await getCachedImage(itemPath);
        
        if (itemImg) {
            const itemSize = 400; // حجم الأداة
            const ix = (width - itemSize) / 2;
            const iy = (height - itemSize) / 2 - 40; // رفعها للأعلى قليلاً
            
            // تأثير التوهج المذهل (Glow) بلون الندرة
            ctx.shadowColor = rInfo.color;
            ctx.shadowBlur = 70;
            
            // رسم الأداة
            ctx.drawImage(itemImg, ix, iy, itemSize, itemSize);
            
            ctx.shadowBlur = 0; // إعادة تعيين الظل
            itemDrawn = true;
        }
    }

    // إذا كان العنصر "مهارة" أو لم نجد صورته، نرسم بلورة سحرية تعويضية
    if (!itemDrawn) {
        const cx = width / 2;
        const cy = height / 2 - 40;
        
        // بلورة مشعة
        ctx.beginPath();
        ctx.arc(cx, cy, 140, 0, Math.PI * 2);
        ctx.fillStyle = rInfo.color;
        ctx.shadowColor = rInfo.color;
        ctx.shadowBlur = 80;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(cx, cy, 110, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        // أيقونة النجمة بداخل البلورة
        ctx.font = '100px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✨', cx, cy + 10);
    }

    // ==========================================
    // 3. التدرج السينمائي السفلي (لإبراز النص)
    // ==========================================
    const bottomGrad = ctx.createLinearGradient(0, height - 300, 0, height);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.7)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - 300, width, 300);

    // ==========================================
    // 4. كتابة النصوص
    // ==========================================
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic'; // إعادة ضبط المحاذاة

    // أ. نص الندرة (في الأعلى)
    ctx.font = 'bold 45px "Bein"';
    ctx.fillStyle = rInfo.color;
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 10;
    ctx.fillText(`✦ ${rInfo.text} ✦`, width / 2, 80);
    ctx.shadowBlur = 0;

    // ب. اسم الأداة (في الأسفل)
    ctx.font = 'bold 75px "Bein"';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; // حدود سوداء قوية
    ctx.strokeText(item.name, width / 2, height - 120);
    
    ctx.fillStyle = '#FFFFFF'; // لون النص أبيض ناصع
    ctx.fillText(item.name, width / 2, height - 120);

    // ج. نوع الأداة (تحت الاسم مباشرة)
    let typeText = "أداة غامضة";
    if (item.type === 'material') typeText = "مورد تصنيع عتيق";
    if (item.type === 'book') typeText = "مخطوطة سحرية";
    if (item.type === 'skill') typeText = "مـهـارة خـارقـة";

    ctx.font = '35px "Bein"';
    ctx.fillStyle = '#A0A0A0'; // رمادي فاتح
    ctx.fillText(typeText, width / 2, height - 50);

    // ==========================================
    // 5. إخراج الصورة
    // ==========================================
    return canvas.toBuffer('image/png');
}

module.exports = { generateGachaCard };
