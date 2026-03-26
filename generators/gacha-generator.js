const { createCanvas, loadImage } = require('@napi-rs/canvas');

// المقاسات المثالية للديسكورد (تم ضبطها لتكون سينمائية)
const HUB_WIDTH = 1200;
const HUB_HEIGHT = 600;
const CARD_WIDTH = 600;
const CARD_HEIGHT = 840;

// رابط السحابة الخاصة بك لجلب صور العناصر
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

// ألوان الندرة (ألوان أساسية + ألوان التوهج)
const RARITY_COLORS = {
    Common: { main: '#B0BEC5', glow: '#78909C' },
    Uncommon: { main: '#69F0AE', glow: '#00E676' },
    Rare: { main: '#40C4FF', glow: '#00B0FF' },
    Epic: { main: '#E040FB', glow: '#AA00FF' },
    Legendary: { main: '#FFD700', glow: '#FF8F00' }
};

// دالة مساعدة لرسم تأثير الأشعة (Sunburst) خلف العنصر
function drawSunburst(ctx, width, height, color) {
    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = Math.max(width, height);
    const rays = 24;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.15;

    for (let i = 0; i < rays; i++) {
        const angle = (i * 2 * Math.PI) / rays;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle - 0.05) * outerRadius, Math.sin(angle - 0.05) * outerRadius);
        ctx.lineTo(Math.cos(angle + 0.05) * outerRadius, Math.sin(angle + 0.05) * outerRadius);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// دالة مساعدة لرسم جزيئات الغبار/النجوم
function drawParticles(ctx, width, height, count, color) {
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = Math.random() * 2 + 0.5;
        const alpha = Math.random() * 0.8 + 0.2;
        
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

async function generateGachaHub(user, userMora, flavorText) {
    const canvas = createCanvas(HUB_WIDTH, HUB_HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. خلفية الفضاء العميق (Deep Space)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, HUB_HEIGHT);
    bgGradient.addColorStop(0, '#090514');   // أسود ليلي مائل للبنفسجي
    bgGradient.addColorStop(0.5, '#1b1236'); // بنفسجي داكن
    bgGradient.addColorStop(1, '#0c071e');   // عودة للظلام
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    // 2. رسم نجوم في الخلفية
    drawParticles(ctx, HUB_WIDTH, HUB_HEIGHT, 150, '#FFFFFF');

    // 3. تأثير السديم السحري (بؤرة الاستدعاء)
    const cx = HUB_WIDTH / 2;
    const cy = HUB_HEIGHT / 2;
    const nebula = ctx.createRadialGradient(cx, cy, 10, cx, cy, 500);
    nebula.addColorStop(0, 'rgba(224, 64, 251, 0.5)'); // قلب البنفسجي المضيء
    nebula.addColorStop(0.4, 'rgba(64, 196, 255, 0.15)'); // هالة زرقاء
    nebula.addColorStop(1, 'transparent');
    
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);
    ctx.globalCompositeOperation = 'source-over';

    // 4. رسم دائرة سحرية (إطار داخلي متوهج)
    ctx.beginPath();
    ctx.arc(cx, cy, 250, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.setLineDash([5, 15]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(224, 64, 251, 0.4)';
    ctx.stroke();
    ctx.setLineDash([]); // إعادة الضبط

    // 5. النص الافتتاحي (Flavor Text) بتأثير سينمائي
    ctx.shadowColor = '#E040FB';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px "Arial"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(flavorText, cx, cy - 30);

    // 6. صندوق عرض رصيد المورا
    const pillWidth = 400;
    const pillHeight = 70;
    const pillX = cx - pillWidth / 2;
    const pillY = cy + 70;

    // خلفية رصيد المورا
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#000000';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 35);
    ctx.fill();

    // إطار رصيد المورا
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#FFD700';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.stroke();

    // نص المورا
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 32px "Arial"';
    ctx.fillText(`💰 المورا: ${userMora.toLocaleString()}`, cx, pillY + pillHeight / 2);

    // 7. إطار ذهبي خارجي فخم يعطي طابع الـ Gacha
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 15;
    ctx.strokeRect(7.5, 7.5, HUB_WIDTH - 15, HUB_HEIGHT - 15);
    
    // زوايا الإطار
    ctx.fillStyle = '#FFD700';
    const cornerSize = 30;
    // الزاوية العلوية اليسرى
    ctx.fillRect(0, 0, cornerSize, 15);
    ctx.fillRect(0, 0, 15, cornerSize);
    // الزاوية العلوية اليمنى
    ctx.fillRect(HUB_WIDTH - cornerSize, 0, cornerSize, 15);
    ctx.fillRect(HUB_WIDTH - 15, 0, 15, cornerSize);
    // الزاوية السفلية اليسرى
    ctx.fillRect(0, HUB_HEIGHT - 15, cornerSize, 15);
    ctx.fillRect(0, HUB_HEIGHT - cornerSize, 15, cornerSize);
    // الزاوية السفلية اليمنى
    ctx.fillRect(HUB_WIDTH - cornerSize, HUB_HEIGHT - 15, cornerSize, 15);
    ctx.fillRect(HUB_WIDTH - 15, HUB_HEIGHT - cornerSize, 15, cornerSize);

    return canvas.encode('png');
}

async function generateGachaCard(item, rarity) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const colors = RARITY_COLORS[rarity] || RARITY_COLORS.Common;

    // 1. خلفية البطاقة الأساسية (داكنة لبروز الألوان)
    ctx.fillStyle = '#111115';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // 2. إضاءة التوهج المركزي حسب الندرة
    const glow = ctx.createRadialGradient(CARD_WIDTH/2, CARD_HEIGHT/2 - 50, 20, CARD_WIDTH/2, CARD_HEIGHT/2 - 50, CARD_WIDTH);
    glow.addColorStop(0, colors.glow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.globalAlpha = 1.0;

    // 3. تأثير الأشعة المنبثقة وجزيئات الندرة
    drawSunburst(ctx, CARD_WIDTH, CARD_HEIGHT, colors.main);
    drawParticles(ctx, CARD_WIDTH, CARD_HEIGHT, 80, colors.main);

    // 4. سحب صورة العنصر من السحابة (R2)
    if (item.imgPath) {
        try {
            // معالجة الرابط وجلبه من السحابة كـ Buffer عشان يقبله الـ Canvas
            const url = item.imgPath.startsWith('http') ? item.imgPath : `${R2_URL}/${item.imgPath}`;
            const res = await fetch(url);
            
            if (res.ok) {
                const buffer = await res.arrayBuffer();
                const img = await loadImage(Buffer.from(buffer));
                
                // رسم الصورة مع ظل سفلي قوي لإعطاء عمق (3D Effect)
                ctx.shadowColor = '#000000';
                ctx.shadowBlur = 30;
                ctx.shadowOffsetY = 15;
                
                const imgSize = 340;
                ctx.drawImage(img, (CARD_WIDTH - imgSize) / 2, (CARD_HEIGHT - imgSize) / 2 - 80, imgSize, imgSize);
                
                // تصفير الظل عشان ما يخرب باقي الرسم
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;
            } else {
                console.log(`[Gacha Card] فشل في تحميل الصورة من السحابة: ${url}`);
            }
        } catch (err) {
            console.log(`[Gacha Card] خطأ برمجي في جلب الصورة:`, err);
        }
    }

    // 5. تصميم إطار البطاقة (Card Border)
    const margin = 20;
    
    // الإطار الداخلي الشفاف
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin + 10, margin + 10, CARD_WIDTH - (margin * 2) - 20, CARD_HEIGHT - (margin * 2) - 20);

    // الإطار الخارجي اللامع بندرة البطاقة
    ctx.shadowColor = colors.main;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 8;
    ctx.strokeRect(margin, margin, CARD_WIDTH - (margin * 2), CARD_HEIGHT - (margin * 2));
    ctx.shadowBlur = 0;

    // 6. منطقة النص السفلية (Banner)
    const bannerHeight = 160;
    const bannerY = CARD_HEIGHT - margin - bannerHeight;
    
    // خلفية البانر متدرجة للأسود
    const bannerGrad = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerHeight);
    bannerGrad.addColorStop(0, 'transparent');
    bannerGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.8)');
    bannerGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = bannerGrad;
    ctx.fillRect(margin, bannerY, CARD_WIDTH - (margin * 2), bannerHeight);

    // 7. كتابة اسم العنصر والندرة
    ctx.textAlign = 'center';
    
    // اسم العنصر
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Arial"';
    ctx.fillText(item.name || "عنصر مجهول", CARD_WIDTH / 2, bannerY + 80);

    // الندرة
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#000000';
    ctx.fillStyle = colors.main;
    ctx.font = 'bold 30px "Arial"';
    ctx.letterSpacing = "5px"; // ميزة مدعومة في بعض نسخ الـ Canvas تعطي فخامة
    ctx.fillText(`✦ ${rarity.toUpperCase()} ✦`, CARD_WIDTH / 2, bannerY + 130);

    return canvas.encode('png');
}

module.exports = {
    generateGachaHub,
    generateGachaCard
};
