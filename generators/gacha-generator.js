const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// المقاسات المثالية للديسكورد (مضبوطة 100%)
const HUB_WIDTH = 1200;
const HUB_HEIGHT = 600;
const CARD_WIDTH = 600;
const CARD_HEIGHT = 840;

// ألوان الندرة للبطاقات
const RARITY_COLORS = {
    Common: '#B0BEC5',    
    Uncommon: '#69F0AE',  
    Rare: '#40C4FF',      
    Epic: '#E040FB',      
    Legendary: '#FFD700'  
};

async function generateGachaHub(user, userMora, flavorText) {
    const canvas = createCanvas(HUB_WIDTH, HUB_HEIGHT);
    const ctx = canvas.getContext('2d');
    const centerX = HUB_WIDTH / 2;
    const centerY = HUB_HEIGHT / 2;

    // 1. خلفية ليلية عميقة (فضاء سحري)
    const bgGradient = ctx.createLinearGradient(0, 0, HUB_WIDTH, HUB_HEIGHT);
    bgGradient.addColorStop(0, '#0a0a1a');
    bgGradient.addColorStop(0.5, '#1a103c'); // لون بنفسجي غامق بالوسط
    bgGradient.addColorStop(1, '#050510');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    // 2. دوامة سحرية في المنتصف (تأثير Summon Magic)
    const portalGlow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 500);
    portalGlow.addColorStop(0, 'rgba(123, 31, 162, 0.9)'); // قلب البوابة مشع
    portalGlow.addColorStop(0.4, 'rgba(49, 27, 146, 0.5)');
    portalGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = portalGlow;
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    // رسم دوائر البوابة السحرية (Magic Circles)
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'; // ذهبي شفاف
    ctx.lineWidth = 2;
    for(let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, i * 80, 0, Math.PI * 2);
        ctx.stroke();
        
        // خطوط متقطعة تعطي طابع طلاسم/سحر
        ctx.setLineDash([15, 20]);
        ctx.beginPath();
        ctx.arc(0, 0, (i * 80) + 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]); // تصفير التقطيع
    }
    ctx.restore();

    // 3. جزيئات سحرية ونجوم تتطاير (Particles)
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * HUB_WIDTH;
        const y = Math.random() * HUB_HEIGHT;
        const size = Math.random() * 2.5 + 0.5;
        const opacity = Math.random() * 0.8 + 0.2;
        
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 4. كتابة النص الافتتاحي (Flavor Text)
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px "Arial"'; // إذا عندك خط عربي حمله واستخدمه هنا
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(flavorText, centerX, centerY - 80);

    // 5. عرض رصيد المورا بطريقة فخمة مع إضاءة قوية
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 48px "Arial"';
    ctx.fillText(`💰 المورا: ${userMora.toLocaleString()}`, centerX, centerY + 80);

    // 6. إطار احترافي للواجهة مع زوايا مزخرفة
    ctx.shadowBlur = 0; // نقفل الظل للإطار
    const frameGradient = ctx.createLinearGradient(0, 0, HUB_WIDTH, HUB_HEIGHT);
    frameGradient.addColorStop(0, '#FFD700');
    frameGradient.addColorStop(0.5, '#FFA000');
    frameGradient.addColorStop(1, '#FFD700');
    
    ctx.strokeStyle = frameGradient;
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, HUB_WIDTH - 40, HUB_HEIGHT - 40);

    // رسم زوايا ذهبية سميكة للإطار
    const cornerSize = 50;
    ctx.lineWidth = 12;
    
    // الزاوية العلوية اليسرى
    ctx.beginPath(); ctx.moveTo(20, 20 + cornerSize); ctx.lineTo(20, 20); ctx.lineTo(20 + cornerSize, 20); ctx.stroke();
    // الزاوية العلوية اليمنى
    ctx.beginPath(); ctx.moveTo(HUB_WIDTH - 20 - cornerSize, 20); ctx.lineTo(HUB_WIDTH - 20, 20); ctx.lineTo(HUB_WIDTH - 20, 20 + cornerSize); ctx.stroke();
    // الزاوية السفلية اليسرى
    ctx.beginPath(); ctx.moveTo(20, HUB_HEIGHT - 20 - cornerSize); ctx.lineTo(20, HUB_HEIGHT - 20); ctx.lineTo(20 + cornerSize, HUB_HEIGHT - 20); ctx.stroke();
    // الزاوية السفلية اليمنى
    ctx.beginPath(); ctx.moveTo(HUB_WIDTH - 20 - cornerSize, HUB_HEIGHT - 20); ctx.lineTo(HUB_WIDTH - 20, HUB_HEIGHT - 20); ctx.lineTo(HUB_WIDTH - 20, HUB_HEIGHT - 20 - cornerSize); ctx.stroke();

    return canvas.encode('png');
}

async function generateGachaCard(item, rarity) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const color = RARITY_COLORS[rarity] || RARITY_COLORS.Common;

    // خلفية البطاقة الأساسية
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // إضاءة خلفية للبطاقة من المنتصف
    const glow = ctx.createRadialGradient(CARD_WIDTH/2, CARD_HEIGHT/2, 20, CARD_WIDTH/2, CARD_HEIGHT/2, 400);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.globalAlpha = 1.0;

    // رسم صورة العنصر (مع تأكيد المقاسات)
    if (item.imgPath) {
        try {
            const img = await loadImage(`./${item.imgPath}`); 
            // رسم الصورة في منتصف البطاقة بالضبط
            ctx.drawImage(img, (CARD_WIDTH / 2) - 150, (CARD_HEIGHT / 2) - 180, 300, 300);
        } catch (err) {
            console.log("صورة العنصر غير موجودة:", item.imgPath);
        }
    }

    // إطار البطاقة اللامع بلون الندرة
    ctx.shadowColor = color;
    ctx.shadowBlur = 25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 15;
    ctx.strokeRect(20, 20, CARD_WIDTH - 40, CARD_HEIGHT - 40);

    // كتابة اسم العنصر أسفل الصورة
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#000000';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 45px "Arial"';
    ctx.fillText(item.name || "عنصر مجهول", CARD_WIDTH / 2, CARD_HEIGHT - 140);

    // كتابة الندرة بأسلوب مميز
    ctx.fillStyle = color;
    ctx.font = 'bold 35px "Arial"';
    ctx.fillText(`✦ ${rarity.toUpperCase()} ✦`, CARD_WIDTH / 2, CARD_HEIGHT - 70);

    return canvas.encode('png');
}

module.exports = {
    generateGachaHub,
    generateGachaCard
};
