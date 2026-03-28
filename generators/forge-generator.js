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

// دالة متطورة لرسم سهم فانتزي مرسوم رسم بين الإحصائيات
function drawFantasyArrow(ctx, x, y, width, height, color) {
    ctx.save();
    ctx.translate(x, y);
    
    // تدرج لوني للسهم
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, 'rgba(255,255,255,0.8)');
    
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    // رسم جسم السهم (Path)
    ctx.beginPath();
    ctx.moveTo(0, height * 0.4);
    ctx.lineTo(width * 0.6, height * 0.4);
    ctx.lineTo(width * 0.6, 0);
    ctx.lineTo(width, height * 0.5); // رأس السهم
    ctx.lineTo(width * 0.6, height);
    ctx.lineTo(width * 0.6, height * 0.6);
    ctx.lineTo(0, height * 0.6);
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
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

// رسم إطار العنصر مع لمعان الندرة (تكبير الحجم وتحسين التأثير)
function drawItemBox(ctx, x, y, size, img, rarity = 'Common') {
    const color = RARITY_COLORS[rarity] || RARITY_COLORS['Common'];
    
    // خلفية العنصر
    ctx.fillStyle = 'rgba(10, 15, 20, 0.95)';
    ctx.beginPath(); roundRect(ctx, x, y, size, size, 20); ctx.fill();

    // لمعان خلفي قوي للندرة
    ctx.shadowColor = color;
    ctx.shadowBlur = 25;
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0; // إعادة ضبط الظل

    // رسم الصورة
    if (img) {
        ctx.drawImage(img, x + 15, y + 15, size - 30, size - 30);
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.font = 'bold 50px "Arial"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('❓', x + size/2, y + size/2);
    }
}

// دالة الرسم الأساسية للمجمع الإمبراطوري (الحدادة الفخمة) 🔥
async function generateForgeUI(userObj, view, data) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. تحديد ثيم الألوان والجسيمات بناءً على القسم
    let themeColor1, themeColor2, sparkColor, particleType;
    if (view === 'weapon') {
        themeColor1 = 'rgba(220, 50, 0, 0.6)'; // ناري مكثف
        themeColor2 = 'rgba(15, 0, 0, 0.98)';
        sparkColor = '#FFDD00';
        particleType = 'fire';
    } else if (view === 'skill' || view === 'synthesis') {
        themeColor1 = 'rgba(130, 0, 255, 0.5)'; // سحري عميق
        themeColor2 = 'rgba(10, 0, 20, 0.98)';
        sparkColor = '#A0EEFF';
        particleType = 'magic';
    } else if (view === 'smelting') {
        themeColor1 = 'rgba(255, 0, 0, 0.6)'; // أحمر دموي/حرارة قصوى
        themeColor2 = 'rgba(20, 0, 0, 0.98)';
        sparkColor = '#FFFFFF';
        particleType = 'heat';
    } else {
        themeColor1 = 'rgba(0, 150, 255, 0.4)'; // أزرق ملكي
        themeColor2 = 'rgba(5, 10, 25, 0.98)';
        sparkColor = '#FFFFFF';
        particleType = 'normal';
    }

    // 2. رسم الخلفية الأساسية والتدرج
    ctx.fillStyle = '#020305';
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 50, width/2, height/2, 1000);
    bgGrad.addColorStop(0, themeColor1);
    bgGrad.addColorStop(1, themeColor2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. رسم تأثير الجسيمات المتطايرة حسب القسم
    ctx.fillStyle = sparkColor;
    ctx.beginPath();
    const particleCount = particleType === 'fire' ? 100 : 70;
    for(let i=0; i<particleCount; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        let pSize = Math.random() * 3;
        if (particleType === 'fire') pSize = Math.random() * 4;
        ctx.globalAlpha = Math.random() * 0.6 + 0.1;
        ctx.moveTo(px, py);
        ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 4. الشريط العلوي الملكي (Header)
    const headerH = 110;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, headerH);
    
    // فاصل ذهبي مزخرف
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(200, 150, 0, 0)');
    goldGrad.addColorStop(0.1, 'rgba(255, 215, 0, 1)');
    goldGrad.addColorStop(0.5, 'rgba(255, 255, 200, 1)');
    goldGrad.addColorStop(0.9, 'rgba(255, 215, 0, 1)');
    goldGrad.addColorStop(1, 'rgba(200, 150, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 4, width, 4);

    // تحميل الصور الأساسية
    const [avatarImage, reqMatImg, targetMatImg] = await Promise.all([
        loadImage(userObj.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
        data.reqMatIcon ? getCachedImage(data.reqMatIcon) : null,
        data.targetMatIcon ? getCachedImage(data.targetMatIcon) : null
    ]);

    // رسم صورة اللاعب واسمه (يسار)
    const avatarSize = 80;
    const avatarX = 60 + avatarSize/2;
    const avatarY = headerH / 2;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10; ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    let dName = userObj.displayName || userObj.username;
    drawAutoScaledArabicText(ctx, dName, avatarX + 60, avatarY, 300, 28, 16);
    ctx.shadowBlur = 0;

    // رسم رصيد المورا (يمين) - تصميم لوحة معدنية
    ctx.fillStyle = 'rgba(20, 25, 30, 0.9)';
    ctx.beginPath(); roundRect(ctx, width - 300, 30, 260, 55, 18); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)'; ctx.stroke();
    
    ctx.textAlign = 'right'; ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px "Arial"';
    drawAutoScaledText(ctx, (data.mora || 0).toLocaleString(), width - 85, 57, 180, 28, 14);
    ctx.font = '28px "Arial"'; ctx.fillText('🪙', width - 50, 57);

    // عنوان القسم المركزي بلمعان ذهبي
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 55px "Bein"';
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
    ctx.fillText(data.title || 'المجمع الإمبراطوري', width / 2, 180);
    ctx.shadowBlur = 0;

    // 5. اللوحة الرئيسية الفخمة للمحتوى (Main Panel)
    const panelY = 240;
    const panelW = 1100;
    const panelH = 410;
    const panelX = (width - panelW) / 2;

    // خلفية اللوحة مع إطار مضيء
    ctx.fillStyle = 'rgba(5, 7, 10, 0.92)';
    ctx.beginPath(); roundRect(ctx, panelX, panelY, panelW, panelH, 30); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = goldGrad; ctx.stroke(); // استخدام نفس تدرج الهيدر

    ctx.textAlign = 'center';

    // =========================================================================
    // شاشات (تطوير السلاح / صقل المهارة) - التركيز على مقارنة الإحصائيات
    // =========================================================================
    if (view === 'weapon' || view === 'skill') {
        const isWeapon = view === 'weapon';
        const accentColor = isWeapon ? '#E74C3C' : '#9B59B6';
        
        // --- القسم الأيمن: الإحصائيات (Old -> New) ---
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px "Bein"';
        ctx.fillText(isWeapon ? 'تطوير القوة القتالية' : 'تركيز الطاقة السحرية', panelX + 270, panelY + 60);

        // مواقع رسم المقارنة
        const statsY_Level = panelY + 160;
        const statsY_Value = panelY + 270;
        const compX_Start = panelX + 100;
        const compX_Arrow = panelX + 220;
        const compX_End = panelX + 370;

        // 1. مقارنة المستوى (Level)
        // القديم: شفاف
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 45px "Arial"'; ctx.textAlign = 'left';
        ctx.fillText(`Lv.${data.currentLevel}`, compX_Start, statsY_Level);
        ctx.restore();

        // السهم المرسوم
        drawFantasyArrow(ctx, compX_Arrow, statsY_Level - 20, 130, 40, '#FFD700');

        // الجديد: واضح ومضيء
        ctx.save();
        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 50px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 15;
        ctx.fillText(`Lv.${data.nextLevel}`, compX_End, statsY_Level);
        ctx.restore();

        // 2. مقارنة القيمة (Stat Value)
        // القديمة: شفافة
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 40px "Arial"'; ctx.textAlign = 'left';
        ctx.fillText(data.currentStat, compX_Start, statsY_Value);
        ctx.restore();

        // السهم المرسوم
        drawFantasyArrow(ctx, compX_Arrow, statsY_Value - 20, 130, 40, accentColor);

        // الجديدة: واضحة ومضيئة بلون القسم
        ctx.save();
        ctx.fillStyle = accentColor; ctx.font = 'bold 45px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = accentColor; ctx.shadowBlur = 15;
        ctx.fillText(data.nextStat, compX_End, statsY_Value);
        ctx.restore();


        // --- خط فاصل عمودي فخم ---
        const lineGrad = ctx.createLinearGradient(0, panelY + 40, 0, panelY + panelH - 40);
        lineGrad.addColorStop(0, 'rgba(255,215,0,0)');
        lineGrad.addColorStop(0.5, goldGrad);
        lineGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = lineGrad;
        ctx.fillRect(panelX + 550, panelY + 40, 4, panelH - 80);


        // --- القسم الأيسر: المتطلبات (Materials) ---
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px "Bein"';
        ctx.fillText('الموارد المطلوبة للمستوى التالي', panelX + 820, panelY + 60);

        // رسم المورا وتكلفتها
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); roundRect(ctx, panelX + 660, panelY + 100, 320, 60, 15); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.stroke();

        const moraStatusColor = data.mora >= data.reqMora ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = moraStatusColor; ctx.font = 'bold 32px "Arial"';
        ctx.fillText(`${data.mora.toLocaleString()} / ${data.reqMora.toLocaleString()} 🪙`, panelX + 820, panelY + 140);

        // رسم المورد الأساسي (تكبير الإطار)
        drawItemBox(ctx, panelX + 725, panelY + 185, 190, reqMatImg, data.reqMatRarity || 'Rare');
        
        // كمية المورد واسمه
        const matStatusColor = data.userMatCount >= data.reqMatCount ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = matStatusColor; ctx.font = 'bold 30px "Arial"';
        ctx.fillText(`${data.userMatCount} / ${data.reqMatCount}`, panelX + 820, panelY + 395);

        ctx.fillStyle = '#DDDDDD'; ctx.font = 'bold 24px "Bein"';
        drawAutoScaledArabicText(ctx, data.reqMatName, panelX + 820, panelY + 425, 280, 24, 14);
    }
    
    // =========================================================================
    // شاشة الرئيسية (اختر القسم) - تعريب وتنظيف
    // =========================================================================
    else if (view === 'main') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 42px "Bein"';
        ctx.fillText('مرحباً بك في مجمع التطوير الإمبراطوري', width/2, panelY + 160);
        
        ctx.font = 'bold 28px "Bein"';
        ctx.fillStyle = '#BBBBBB';
        ctx.fillText('الرجاء تحديد القسم المطلوب زيارته باستخدام الأزرار أدناه', width/2, panelY + 230);
    } 
    
    // =========================================================================
    // شاشة (فرن الدمج) - تحسين التدفق والبصريات
    // =========================================================================
    else if (view === 'synthesis') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 42px "Bein"';
            ctx.fillText('برجاء تحديد العنصر المراد التضحية به', width/2, panelY + 170);
            ctx.fillStyle = '#E74C3C'; ctx.font = 'bold 30px "Bein"';
            ctx.fillText('(تتطلب العملية 4 وحدات من نفس العنصر)', width/2, panelY + 230);
        } else {
            // مواقع رسم الدمج
            const itemSize = 200;
            const leftItemX = panelX + 120;
            const rightItemX = panelX + panelW - 320;
            const itemY = panelY + 70;

            // 1. رسم العنصر المضحى به (4x)
            drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg, data.sacMatRarity || 'Rare');
            ctx.fillStyle = '#E74C3C'; ctx.font = 'bold 36px "Bein"'; ctx.shadowColor = '#E74C3C'; ctx.shadowBlur = 10;
            ctx.fillText(`4x تضحية`, leftItemX + itemSize/2, itemY + itemSize + 40);
            ctx.shadowBlur = 0; ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px "Bein"';
            drawAutoScaledArabicText(ctx, data.sacMatName, leftItemX + itemSize/2, itemY + itemSize + 80, 240, 26, 14);

            // سهم التحويل الفانتزي المركزي (أكبر وأوضح)
            ctx.fillStyle = '#F1C40F'; ctx.font = 'bold 100px "Arial"'; ctx.shadowColor = '#F1C40F'; ctx.shadowBlur = 15;
            ctx.fillText('➔', width/2, panelY + 170);
            ctx.shadowBlur = 0;

            // 2. رسم النتيجة أو الانتظار
            if (data.targetMatName) {
                drawItemBox(ctx, rightItemX, itemY, itemSize, targetMatImg, data.targetMatRarity || 'Rare');
                ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 36px "Bein"'; ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 10;
                ctx.fillText(`النتيجة 1x`, rightItemX + itemSize/2, itemY + itemSize + 40);
                ctx.shadowBlur = 0; ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px "Bein"';
                drawAutoScaledArabicText(ctx, data.targetMatName, rightItemX + itemSize/2, itemY + itemSize + 80, 240, 26, 14);
                
                // رسوم العملية (المورا)
                const feeStatusColor = data.mora >= data.fee ? '#2ECC71' : '#E74C3C';
                ctx.fillStyle = feeStatusColor; ctx.font = 'bold 30px "Bein"';
                ctx.fillText(`رسوم العملية: ${data.fee.toLocaleString()} 🪙`, width/2, panelY + 360);
            } else {
                // حالة الانتظار لاختيار الهدف
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath(); roundRect(ctx, rightItemX, itemY, itemSize, itemSize, 20); ctx.fill();
                ctx.fillStyle = '#777777'; ctx.font = 'bold 32px "Bein"';
                ctx.fillText('في انتظار\nتحديد الهدف...', rightItemX + itemSize/2, itemY + itemSize/2);
            }
        }
    }
    
    // =========================================================================
    // شاشة (المصهر) - تأثيرات حرارة وصهر احترافية
    // =========================================================================
    else if (view === 'smelting') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 42px "Bein"';
            ctx.fillText('حدد المورد المراد صهره وتفكيكه', width/2, panelY + 170);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 28px "Bein"';
            ctx.fillText('سيتم تحويل المورد لخبرة فورية (XP) بشكل نهائي', width/2, panelY + 230);
        } else {
            const itemSize = 220;
            const leftItemX = panelX + 150;
            const itemY = panelY + 80;

            // 1. المورد المراد صهره
            drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg, data.sacMatRarity || 'Uncommon');
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 34px "Bein"';
            drawAutoScaledArabicText(ctx, data.sacMatName, leftItemX + itemSize/2, itemY + itemSize + 50, 280, 34, 16);

            // سهم انصهار ناري
            ctx.fillStyle = '#FF4400'; ctx.font = 'bold 100px "Arial"'; ctx.shadowColor = '#FF0000'; ctx.shadowBlur = 20;
            ctx.fillText('➔', width/2, panelY + 190);
            ctx.shadowBlur = 0;

            // 2. نتيجة الـ XP (تصميم لوحة طاقة مضيئة)
            const xpBoxWidth = 350;
            const xpBoxHeight = 160;
            const xpBoxX = panelX + panelW - 500;
            const xpBoxY = panelY + 110;

            ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
            ctx.beginPath(); roundRect(ctx, xpBoxX, xpBoxY, xpBoxWidth, xpBoxHeight, 20); ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#2ECC71'; ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 15; ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 80px "Arial"';
            ctx.fillText(`+${data.xpGain}`, xpBoxX + xpBoxWidth/2, xpBoxY + xpBoxHeight/2 + 10);
            
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 32px "Bein"';
            ctx.fillText('خبرة فورية مكتسبة', xpBoxX + xpBoxWidth/2, xpBoxY + xpBoxHeight + 50);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateForgeUI };
