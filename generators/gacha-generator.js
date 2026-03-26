const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
// إذا تستخدم canvas العادية: const { createCanvas, loadImage } = require('canvas');

// المقاسات المثالية للديسكورد
const HUB_WIDTH = 1200;
const HUB_HEIGHT = 600;
const CARD_WIDTH = 600;
const CARD_HEIGHT = 840;

// ألوان الندرة (Rarity Colors) للإضاءة والتأثيرات
const RARITY_COLORS = {
    Common: '#B0BEC5',    // رصاصي
    Uncommon: '#69F0AE',  // أخضر مشع
    Rare: '#40C4FF',      // أزرق سماوي
    Epic: '#E040FB',      // بنفسجي سحري
    Legendary: '#FFD700'  // ذهبي أسطوري
};

async function generateGachaHub(user, userMora, flavorText) {
    const canvas = createCanvas(HUB_WIDTH, HUB_HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. خلفية سحرية متدرجة (تقدر تستبدلها بصورة لو حاب)
    const bgGradient = ctx.createLinearGradient(0, 0, HUB_WIDTH, HUB_HEIGHT);
    bgGradient.addColorStop(0, '#0f0c29');
    bgGradient.addColorStop(0.5, '#302b63');
    bgGradient.addColorStop(1, '#24243e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    // 2. رسم دوائر سحرية في الخلفية (Glow)
    ctx.save();
    ctx.globalAlpha = 0.3;
    const glow = ctx.createRadialGradient(HUB_WIDTH/2, HUB_HEIGHT/2, 50, HUB_WIDTH/2, HUB_HEIGHT/2, 400);
    glow.addColorStop(0, '#E040FB');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);
    ctx.restore();

    // 3. كتابة النص الافتتاحي (Flavor Text) في المنتصف
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Arial"'; // يفضل تحمل خط عربي فخم
    ctx.textAlign = 'center';
    ctx.fillText(flavorText, HUB_WIDTH / 2, HUB_HEIGHT / 2 - 40);

    // 4. عرض رصيد المورا بطريقة فخمة
    ctx.font = 'bold 35px "Arial"';
    ctx.fillStyle = '#FFD700'; // لون ذهبي للمورا
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.fillText(`💰 رصيد المورا: ${userMora.toLocaleString()}`, HUB_WIDTH / 2, HUB_HEIGHT / 2 + 60);

    // 5. إطار ذهبي مزخرف حول الصورة
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 10;
    ctx.strokeRect(15, 15, HUB_WIDTH - 30, HUB_HEIGHT - 30);

    return canvas.encode('png'); // أو canvas.toBuffer() على حسب المكتبة
}

async function generateGachaCard(item, rarity) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const color = RARITY_COLORS[rarity] || RARITY_COLORS.Common;

    // 1. خلفية البطاقة
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // 2. إضاءة خلفية للبطاقة بناءً على الندرة
    const glow = ctx.createRadialGradient(CARD_WIDTH/2, CARD_HEIGHT/2, 10, CARD_WIDTH/2, CARD_HEIGHT/2, 300);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.globalAlpha = 1.0;

    // 3. رسم صورة العنصر (إذا كان فيه مسار للصورة)
    if (item.imgPath) {
        try {
            // هنا تفترض إنك تسحب الصورة من مجلد محلي، أو استخدم Fetch للرابط السحابي
            const img = await loadImage(`./${item.imgPath}`); 
            ctx.drawImage(img, CARD_WIDTH/2 - 150, CARD_HEIGHT/2 - 200, 300, 300);
        } catch (err) {
            console.log("صورة العنصر غير موجودة:", item.imgPath);
        }
    }

    // 4. إطار البطاقة اللامع
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 15;
    ctx.strokeRect(20, 20, CARD_WIDTH - 40, CARD_HEIGHT - 40);

    // 5. اسم العنصر والندرة
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#000';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = 'bold 50px "Arial"';
    ctx.fillText(item.name || "عنصر مجهول", CARD_WIDTH / 2, CARD_HEIGHT - 120);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '35px "Arial"';
    ctx.fillText(`[ ${rarity} ]`, CARD_WIDTH / 2, CARD_HEIGHT - 60);

    return canvas.encode('png'); // أو canvas.toBuffer()
}

module.exports = {
    generateGachaHub,
    generateGachaCard
};
