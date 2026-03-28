const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// تسجيل الخط العربي (تأكد من وجود الخط في مسار fonts)
try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.warn("⚠️ لم يتم العثور على خط Bein، سيتم استخدام الخطوط الافتراضية.");
}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

// ألوان الندرة (Rarity Colors) للإطارات والتأثيرات
const RARITY_COLORS = {
    'Common': '#B0BEC5',
    'Uncommon': '#2ECC71',
    'Rare': '#3498DB',
    'Epic': '#9B59B6',
    'Legendary': '#F1C40F'
};

async function getCachedImage(imageUrl) {
    if (!imageUrl) return null;
    let finalUrl = imageUrl;
    if (!finalUrl.startsWith('http')) finalUrl = `${R2_URL}/${finalUrl.replace(/\\/g, '/')}`;
    const encodedUrl = encodeURI(finalUrl);

    if (imageCache.has(encodedUrl)) return imageCache.get(encodedUrl);
    try {
        const img = await loadImage(encodedUrl);
        imageCache.set(encodedUrl, img);
        return img;
    } catch (e) { return null; }
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Arial"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Arial"`;
    }
    ctx.fillText(text, x, y);
}

function drawAutoScaledArabicText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
}

// رسم إطار العنصر مع لمعان الندرة
function drawItemBox(ctx, x, y, size, img, rarity = 'Common') {
    const color = RARITY_COLORS[rarity] || RARITY_COLORS['Common'];
    
    // خلفية العنصر
    ctx.fillStyle = 'rgba(10, 15, 20, 0.9)';
    ctx.beginPath(); roundRect(ctx, x, y, size, size, 15); ctx.fill();

    // لمعان خلفي خفيف
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0; // إعادة ضبط الظل

    // رسم الصورة
    if (img) {
        ctx.drawImage(img, x + 10, y + 10, size - 20, size - 20);
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillText('❓', x + size/2, y + size/2);
    }
}

// دالة الرسم الأساسية للمجمع الإمبراطوري (الحدادة) 🔥
async function generateForgeUI(userObj, view, data) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. تحديد ثيم الألوان بناءً على القسم المختار
    let themeColor1, themeColor2, sparkColor;
    if (view === 'weapon') {
        themeColor1 = 'rgba(200, 60, 10, 0.5)'; // ناري للحدادة
        themeColor2 = 'rgba(20, 5, 5, 0.95)';
        sparkColor = '#FF5500';
    } else if (view === 'skill' || view === 'synthesis') {
        themeColor1 = 'rgba(120, 30, 200, 0.5)'; // سحري للدمج والأكاديمية
        themeColor2 = 'rgba(15, 5, 25, 0.95)';
        sparkColor = '#B968FF';
    } else if (view === 'smelting') {
        themeColor1 = 'rgba(255, 30, 30, 0.5)'; // أحمر دموي للمحرقة
        themeColor2 = 'rgba(20, 0, 0, 0.95)';
        sparkColor = '#FF2222';
    } else {
        themeColor1 = 'rgba(0, 120, 200, 0.4)'; // أزرق ملكي للرئيسية
        themeColor2 = 'rgba(5, 10, 20, 0.95)';
        sparkColor = '#00AAFF';
    }

    // 2. رسم الخلفية (الأساس + التدرج)
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 50, width/2, height/2, 900);
    bgGrad.addColorStop(0, themeColor1);
    bgGrad.addColorStop(1, themeColor2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. رسم تأثير الشرار/السحر المتطاير (Particles)
    ctx.fillStyle = sparkColor;
    ctx.beginPath();
    for(let i=0; i<70; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 3;
        ctx.globalAlpha = Math.random() * 0.7 + 0.1;
        ctx.moveTo(px, py);
        ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 4. الشريط العلوي (Header)
    const headerH = 100;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.9)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);

    // تحميل الصور الأساسية
    const [avatarImage, reqMatImg, targetMatImg] = await Promise.all([
        loadImage(userObj.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
        data.reqMatIcon ? getCachedImage(data.reqMatIcon) : null,
        data.targetMatIcon ? getCachedImage(data.targetMatIcon) : null
    ]);

    // رسم صورة واسم اللاعب
    const avatarSize = 70;
    const avatarX = 50 + avatarSize/2;
    const avatarY = headerH / 2;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    let dName = userObj.displayName || userObj.username;
    drawAutoScaledArabicText(ctx, dName, avatarX + 50, avatarY, 250, 26, 14);
    ctx.shadowBlur = 0;

    // رسم رصيد المورا (يمين الشاشة)
    ctx.fillStyle = 'rgba(15, 20, 25, 0.85)';
    ctx.beginPath(); roundRect(ctx, width - 280, 25, 240, 50, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();
    
    ctx.textAlign = 'right'; ctx.fillStyle = '#FFD700';
    drawAutoScaledText(ctx, (data.mora || 0).toLocaleString(), width - 80, 50, 160, 24, 12);
    ctx.font = '24px "Arial"'; ctx.fillText('🪙', width - 45, 50);

    // عنوان الصفحة المركزي
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 50px "Bein"';
    ctx.shadowColor = '#F1C40F'; ctx.shadowBlur = 15;
    ctx.fillText(data.title || 'المجمع الإمبراطوري للتطوير', width / 2, 170);
    ctx.shadowBlur = 0;

    // 5. اللوحة الرئيسية للمحتوى (Main Panel)
    const panelY = 220;
    const panelW = 1050;
    const panelH = 400;
    const panelX = (width - panelW) / 2;

    ctx.fillStyle = 'rgba(10, 15, 20, 0.85)'; // لون خلفية اللوحة أغمق للتباين
    ctx.beginPath(); roundRect(ctx, panelX, panelY, panelW, panelH, 25); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.stroke();

    ctx.textAlign = 'center';

    // --------------------------------------------------
    // شاشة (الرئيسية)
    if (view === 'main') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px "Bein"';
        ctx.fillText('اختر القسم الذي تود زيارته من الأزرار بالأسفل', width/2, panelY + 180);
        
        ctx.font = 'bold 24px "Bein"';
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('الحدادة ⚔️ • الأكاديمية 📜 • فرن الدمج 🔄 • المصهر 🔥', width/2, panelY + 240);
    } 
    
    // --------------------------------------------------
    // شاشات (تطوير السلاح / صقل المهارة)
    else if (view === 'weapon' || view === 'skill') {
        const isWeapon = view === 'weapon';
        
        // القسم الأيمن (تفاصيل الترقية)
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 36px "Bein"';
        ctx.fillText(isWeapon ? 'حالة السلاح' : 'حالة المهارة', panelX + 260, panelY + 60);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 42px "Arial"';
        ctx.fillText(`Lv.${data.currentLevel}  ➔  Lv.${data.nextLevel}`, panelX + 260, panelY + 150);

        ctx.fillStyle = isWeapon ? '#E74C3C' : '#9B59B6';
        ctx.font = 'bold 38px "Arial"';
        ctx.fillText(`${data.currentStat}  ➔  ${data.nextStat}`, panelX + 260, panelY + 240);

        // خط فاصل أنيق في المنتصف
        const lineGrad = ctx.createLinearGradient(0, panelY + 30, 0, panelY + panelH - 30);
        lineGrad.addColorStop(0, 'rgba(255,255,255,0)');
        lineGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        lineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lineGrad;
        ctx.fillRect(panelX + 520, panelY + 30, 3, panelH - 60);

        // القسم الأيسر (المتطلبات)
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 36px "Bein"';
        ctx.fillText('المتطلبات', panelX + 780, panelY + 60);

        // رسم المورا
        const moraColor = data.mora >= data.reqMora ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = moraColor;
        ctx.font = 'bold 32px "Arial"';
        ctx.fillText(`${data.mora.toLocaleString()} / ${data.reqMora.toLocaleString()} 🪙`, panelX + 780, panelY + 140);

        // رسم المورد (داخل إطار فخم)
        drawItemBox(ctx, panelX + 700, panelY + 180, 160, reqMatImg, data.reqMatRarity || 'Rare');
        
        const matColor = data.userMatCount >= data.reqMatCount ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = matColor;
        ctx.font = 'bold 30px "Arial"';
        ctx.fillText(`تمتلك: ${data.userMatCount} / ${data.reqMatCount}`, panelX + 780, panelY + 380);
    }
    
    // --------------------------------------------------
    // شاشة (فرن الدمج)
    else if (view === 'synthesis') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 40px "Bein"';
            ctx.fillText('قم بتحديد العنصر الذي تود التضحية به', width/2, panelY + 180);
            ctx.fillStyle = '#E74C3C';
            ctx.font = 'bold 28px "Bein"';
            ctx.fillText('(سيكلفك هذا 4 حبات من نفس العنصر)', width/2, panelY + 240);
        } else {
            // رسم الضحية
            drawItemBox(ctx, panelX + 150, panelY + 80, 180, reqMatImg, data.sacMatRarity || 'Rare');
            ctx.fillStyle = '#E74C3C';
            ctx.font = 'bold 32px "Bein"';
            ctx.fillText(`4x تضحية`, panelX + 240, panelY + 310);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 26px "Bein"';
            drawAutoScaledArabicText(ctx, data.sacMatName, panelX + 240, panelY + 355, 220, 26, 14);

            // سهم التحويل
            ctx.fillStyle = '#F1C40F';
            ctx.font = 'bold 80px "Arial"';
            ctx.fillText('➔', width/2, panelY + 170);

            // رسم النتيجة أو الانتظار
            if (data.targetMatName) {
                drawItemBox(ctx, panelX + panelW - 330, panelY + 80, 180, targetMatImg, data.targetMatRarity || 'Rare');
                ctx.fillStyle = '#2ECC71';
                ctx.font = 'bold 32px "Bein"';
                ctx.fillText(`النتيجة 1x`, panelX + panelW - 240, panelY + 310);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 26px "Bein"';
                drawAutoScaledArabicText(ctx, data.targetMatName, panelX + panelW - 240, panelY + 355, 220, 26, 14);
                
                // رسوم الدمج
                ctx.fillStyle = data.mora >= data.fee ? '#2ECC71' : '#E74C3C';
                ctx.font = 'bold 28px "Bein"';
                ctx.fillText(`الرسوم: ${data.fee.toLocaleString()} 🪙`, width/2, panelY + 360);
            } else {
                ctx.fillStyle = '#AAAAAA';
                ctx.font = 'bold 36px "Bein"';
                ctx.fillText('اختر العنصر المطلوب استخراجه...', panelX + panelW - 240, panelY + 190);
            }
        }
    }
    
    // --------------------------------------------------
    // شاشة (محرقة التفكيك الصهر)
    else if (view === 'smelting') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 40px "Bein"';
            ctx.fillText('حدد العنصر الذي تود صهره في المحرقة', width/2, panelY + 180);
            ctx.fillStyle = '#AAAAAA';
            ctx.font = 'bold 26px "Bein"';
            ctx.fillText('سيتم حرق العنصر نهائياً وتحويله لخبرة XP', width/2, panelY + 240);
        } else {
            drawItemBox(ctx, panelX + 200, panelY + 90, 180, reqMatImg, data.sacMatRarity || 'Uncommon');
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 30px "Bein"';
            drawAutoScaledArabicText(ctx, data.sacMatName, panelX + 290, panelY + 315, 240, 30, 14);

            ctx.fillStyle = '#FF5500'; // لون ناري
            ctx.font = 'bold 80px "Arial"';
            ctx.fillText('➔', width/2, panelY + 180);

            // عرض نتيجة الـ XP بتأثير مميز
            ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
            ctx.beginPath(); roundRect(ctx, panelX + panelW - 400, panelY + 120, 280, 120, 15); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#2ECC71'; ctx.stroke();

            ctx.fillStyle = '#2ECC71';
            ctx.font = 'bold 65px "Arial"';
            ctx.fillText(`+${data.xpGain} XP`, panelX + panelW - 260, panelY + 195);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 28px "Bein"';
            ctx.fillText('خبرة فورية', panelX + panelW - 260, panelY + 290);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateForgeUI };
