const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// تسجيل الخطوط (تأكد من وجود الخط في مجلد fonts)
try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("⚠️ تنبيه: لم يتم العثور على خط Bein، سيتم استخدام خط النظام.");
}

/**
 * دالة توليد صورة نتيجة السحب (Gacha)
 * @param {Object} item - كائن العنصر (يحتوي على الاسم والندرة والمسار)
 * @param {String} rarity - ندرة العنصر (Common, Rare, etc.)
 */
async function generateGachaCard(item, rarity) {
    const canvas = createCanvas(600, 600);
    const ctx = canvas.getContext('2d');

    // 1. تحميل الهالة (الخلفية) بناءً على الندرة
    const auraPath = path.join(__dirname, `../images/auras/${rarity.toLowerCase()}.png`);
    try {
        const auraImg = await loadImage(auraPath);
        ctx.drawImage(auraImg, 0, 0, 600, 600);
    } catch (e) {
        // خلفية احتياطية في حال فقدان الصورة
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 600, 600);
    }

    // 2. رسم تأثير إضاءة خلفي إضافي (اختياري للجمال)
    const gradient = ctx.createRadialGradient(300, 300, 50, 300, 300, 250);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 600);

    // 3. تحميل ورسم صورة الأداة (الماتيريال أو الكتاب)
    // ملاحظة: نفترض أن الصور مفرغة (PNG)
    if (item.imgPath) {
        try {
            const itemImg = await loadImage(path.join(__dirname, '..', item.imgPath));
            
            // حساب المقاس للحفاظ على النسبة والتناسب (Centered)
            const size = 350;
            const x = (600 - size) / 2;
            const y = (600 - size) / 2 - 20; // رفعها قليلاً للأعلى لترك مساحة للاسم
            
            // رسم ظل خفيف تحت الأداة
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            
            ctx.drawImage(itemImg, x, y, size, size);
            
            // إعادة تعيين الظل
            ctx.shadowBlur = 0;
        } catch (e) {
            console.error(`❌ لم يتم العثور على صورة العنصر: ${item.imgPath}`);
        }
    }

    // 4. كتابة النصوص (الاسم والندرة)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';

    // كتابة اسم الندرة في الأعلى
    const rarityNames = {
        'Common': 'عادي',
        'Uncommon': 'غير شائع',
        'Rare': 'نادر',
        'Epic': 'ملحمي',
        'Legendary': 'أسطوري'
    };

    ctx.font = '30px Bein';
    ctx.globalAlpha = 0.7;
    ctx.fillText(rarityNames[rarity] || rarity, 300, 50);
    ctx.globalAlpha = 1.0;

    // كتابة اسم الأداة في الأسفل بخط عريض
    ctx.font = 'bold 45px Bein';
    // إضافة تحديد (Stroke) للنص ليكون واضحاً فوق أي خلفية
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 6;
    ctx.strokeText(item.name, 300, 540);
    ctx.fillText(item.name, 300, 540);

    // 5. إضافة شعار الإمبراطورية في الزاوية (لمسة ملكية)
    ctx.font = '18px Bein';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('EMPIRE ARTIFACTS', 300, 580);

    return canvas.toBuffer('image/png');
}

module.exports = { generateGachaCard };
