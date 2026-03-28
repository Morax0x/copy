const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// تسجيل الخط العربي
try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.warn("⚠️ لم يتم العثور على خط Bein، سيتم استخدام الخطوط الافتراضية.");
}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

// ألوان الندرة
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

// 🛡️ حماية وتفكيك الكائنات (Objects) للنصوص
function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

// 🪄 دالة رسم السهم الفانتزي المضيء
function drawFantasyArrow(ctx, x, y, width, color) {
    ctx.save();
    ctx.translate(x, y);
    
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    
    // رسم مسار السهم بشكل انسيابي واحترافي
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(width - 25, -6);
    ctx.lineTo(width - 25, -18);
    ctx.lineTo(width, 0); // رأس السهم
    ctx.lineTo(width - 25, 18);
    ctx.lineTo(width - 25, 6);
    ctx.lineTo(0, 6);
    ctx.closePath();
    
    ctx.fill();
    ctx.restore();
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    const safeText = resolveText(text);
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Arial"`;
    while (ctx.measureText(safeText).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Arial"`;
    }
    ctx.fillText(safeText, x, y);
}

function drawAutoScaledArabicText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    const safeText = resolveText(text);
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(safeText).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(safeText, x, y);
}

// 📦 رسم إطار العنصر مع تأثيرات الندرة
function drawItemBox(ctx, x, y, size, img, rarity = 'Common') {
    const color = RARITY_COLORS[rarity] || RARITY_COLORS['Common'];
    
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
    ctx.beginPath(); roundRect(ctx, x, y, size, size, 20); ctx.fill();

    ctx.shadowColor = color;
    ctx.shadowBlur = 25;
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (img) {
        ctx.drawImage(img, x + 15, y + 15, size - 30, size - 30);
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.font = 'bold 50px "Arial"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('❓', x + size/2, y + size/2);
    }
}

// 👑 دالة الرسم الأساسية للمجمع الإمبراطوري
async function generateForgeUI(userObj, view, data) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. تحديد ثيم الألوان والبارتكلز حسب القسم المختار
    let themeColor1, themeColor2, sparkColor, particleType;
    let isSuccess = view.startsWith('success_');
    let activeView = view.replace('success_', '');

    if (activeView === 'weapon') {
        themeColor1 = 'rgba(220, 50, 10, 0.5)';
        themeColor2 = 'rgba(20, 5, 5, 0.98)';
        sparkColor = '#FF8800';
        particleType = 'fire';
    } else if (activeView === 'skill') {
        themeColor1 = 'rgba(100, 30, 220, 0.5)';
        themeColor2 = 'rgba(15, 5, 25, 0.98)';
        sparkColor = '#DDAAFF';
        particleType = 'magic';
    } else if (activeView === 'synthesis') {
        themeColor1 = 'rgba(30, 200, 100, 0.4)';
        themeColor2 = 'rgba(5, 20, 10, 0.98)';
        sparkColor = '#88FFAA';
        particleType = 'magic';
    } else if (activeView === 'smelting') {
        themeColor1 = 'rgba(255, 20, 0, 0.6)';
        themeColor2 = 'rgba(25, 0, 0, 0.98)';
        sparkColor = '#FFAA55';
        particleType = 'fire';
    } else {
        // الرئيسية
        themeColor1 = 'rgba(0, 120, 200, 0.4)';
        themeColor2 = 'rgba(5, 10, 20, 0.95)';
        sparkColor = '#00AAFF';
        particleType = 'magic';
    }

    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 50, width/2, height/2, 900);
    bgGrad.addColorStop(0, themeColor1);
    bgGrad.addColorStop(1, themeColor2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. تأثير الجزيئات المتطايرة (Particles)
    ctx.fillStyle = sparkColor;
    ctx.beginPath();
    const particleCount = particleType === 'fire' ? 100 : 60;
    for(let i=0; i<particleCount; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 3;
        ctx.globalAlpha = Math.random() * 0.8 + 0.2;
        ctx.moveTo(px, py);
        ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 3. الشريط العلوي (Header)
    const headerH = 100;
    ctx.fillStyle = 'rgba(5, 7, 10, 0.8)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(200, 150, 0, 0)');
    goldGrad.addColorStop(0.1, 'rgba(255, 215, 0, 1)');
    goldGrad.addColorStop(0.5, 'rgba(255, 255, 200, 1)');
    goldGrad.addColorStop(0.9, 'rgba(255, 215, 0, 1)');
    goldGrad.addColorStop(1, 'rgba(200, 150, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);

    const [avatarImage, reqMatImg, targetMatImg] = await Promise.all([
        loadImage(userObj.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
        data.reqMatIcon ? getCachedImage(data.reqMatIcon) : null,
        data.targetMatIcon ? getCachedImage(data.targetMatIcon) : null
    ]);

    // الأفتار واسم اللاعب (يسار)
    const avatarSize = 75;
    const avatarX = 60 + avatarSize/2;
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
    drawAutoScaledArabicText(ctx, userObj.displayName || userObj.username, avatarX + 50, avatarY, 250, 26, 14);
    ctx.shadowBlur = 0;

    // رصيد المورا (يمين)
    ctx.fillStyle = 'rgba(15, 20, 25, 0.85)';
    ctx.beginPath(); roundRect(ctx, width - 280, 25, 240, 50, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();
    
    ctx.textAlign = 'right'; ctx.fillStyle = '#FFD700';
    drawAutoScaledText(ctx, (data.mora || 0).toLocaleString(), width - 80, 50, 160, 24, 12);
    ctx.font = '24px "Arial"'; ctx.fillText('🪙', width - 45, 50);

    // عنوان الصفحة المركزي
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 45px "Bein"';
    ctx.shadowColor = '#F1C40F'; ctx.shadowBlur = 15;
    ctx.fillText(resolveText(data.title || 'المجمع الإمبراطوري للتطوير'), width / 2, 170);
    ctx.shadowBlur = 0;

    // 4. اللوحة الرئيسية (Main Panel)
    const panelY = 220;
    const panelW = 1050;
    const panelH = 400;
    const panelX = (width - panelW) / 2;

    ctx.fillStyle = 'rgba(10, 12, 15, 0.85)';
    ctx.beginPath(); roundRect(ctx, panelX, panelY, panelW, panelH, 25); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.stroke();

    ctx.textAlign = 'center';

    // =========================================================
    // 🌟 شاشات النجاح (Success) 🌟
    // =========================================================
    if (isSuccess) {
        ctx.fillStyle = '#2ECC71';
        ctx.font = 'bold 45px "Bein"';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 15;
        
        let successMsg = "";
        if (activeView === 'weapon') successMsg = "✨ تمت عملية صقل السلاح بنجاح! ✨";
        else if (activeView === 'skill') successMsg = "✨ تم استيعاب حكمة المهارة بنجاح! ✨";
        else if (activeView === 'synthesis') successMsg = "🔄 تمت عملية دمج العناصر بنجاح! 🔄";
        else if (activeView === 'smelting') successMsg = "🔥 تم صهر العناصر وتفكيكها بنجاح! 🔥";

        ctx.fillText(successMsg, width/2, panelY + 90);
        ctx.shadowBlur = 0;

        if (activeView === 'weapon' || activeView === 'skill') {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 50px "Arial"';
            ctx.fillText(`المستوى الجديد: Lv.${data.nextLevel}`, width/2, panelY + 220);
            ctx.fillStyle = activeView === 'weapon' ? '#E74C3C' : '#9B59B6';
            ctx.font = 'bold 45px "Arial"';
            ctx.fillText(resolveText(data.nextStat), width/2, panelY + 300);
        }
        else if (activeView === 'synthesis') {
            drawItemBox(ctx, width/2 - 90, panelY + 140, 180, targetMatImg, data.targetMatRarity);
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 30px "Bein"';
            drawAutoScaledArabicText(ctx, `حصلت على: ${resolveText(data.targetMatName)}`, width/2, panelY + 360, 800, 30, 16);
        }
        else if (activeView === 'smelting') {
            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 90px "Arial"';
            ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 20;
            ctx.fillText(`+${data.xpGain} XP`, width/2, panelY + 220);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#E0E0E0'; ctx.font = 'bold 30px "Bein"';
            ctx.fillText('تمت إضافتها إلى خبرتك الشخصية', width/2, panelY + 310);
        }
        return canvas.toBuffer('image/png');
    }

    // =========================================================
    // شاشة (الرئيسية)
    // =========================================================
    if (activeView === 'main') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 40px "Bein"';
        ctx.fillText('مرحباً بك في مجمع التطوير الإمبراطوري', width/2, panelY + 160);
        
        ctx.font = 'bold 26px "Bein"';
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('الرجاء تحديد القسم المطلوب زيارته باستخدام الأزرار أدناه', width/2, panelY + 230);
    } 
    
    // =========================================================
    // شاشات (تطوير السلاح / صقل المهارة)
    // =========================================================
    else if (activeView === 'weapon' || activeView === 'skill') {
        const isWeapon = activeView === 'weapon';
        const accentColor = isWeapon ? '#FF5500' : '#B968FF'; // ألوان فاقعة للمقارنة
        
        // عنوان القسم الأيمن (الإحصائيات)
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 36px "Bein"';
        ctx.fillText(isWeapon ? 'التطوير القادم' : 'الصقل القادم', panelX + 270, panelY + 60);

        // إحداثيات المقارنة
        const statsY_Level = panelY + 160;
        const statsY_Value = panelY + 280;
        const compX_Old = panelX + 90;   // القديم يسار
        const compX_Arrow = panelX + 210; // السهم بالنص
        const compX_New = panelX + 350;  // الجديد يمين

        // --- المقارنة: المستوى ---
        ctx.save();
        ctx.globalAlpha = 0.4; // 👁️ تأثير الشفافية للرقم القديم
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 40px "Arial"'; ctx.textAlign = 'left';
        ctx.fillText(`Lv.${data.currentLevel}`, compX_Old, statsY_Level);
        ctx.restore();

        // 🪄 رسم السهم الفانتزي
        drawFantasyArrow(ctx, compX_Arrow, statsY_Level, 120, accentColor);

        ctx.save();
        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 45px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 15; // 🌟 وهج للرقم الجديد
        ctx.fillText(`Lv.${data.nextLevel}`, compX_New, statsY_Level);
        ctx.restore();

        // --- المقارنة: القيمة (Damage/Skill) ---
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 34px "Arial"'; ctx.textAlign = 'left';
        ctx.fillText(resolveText(data.currentStat), compX_Old, statsY_Value);
        ctx.restore();

        drawFantasyArrow(ctx, compX_Arrow, statsY_Value, 120, accentColor);

        ctx.save();
        ctx.fillStyle = accentColor; ctx.font = 'bold 38px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = accentColor; ctx.shadowBlur = 15;
        ctx.fillText(resolveText(data.nextStat), compX_New, statsY_Value);
        ctx.restore();

        // خط عمودي فاصل في المنتصف
        const lineGrad = ctx.createLinearGradient(0, panelY + 30, 0, panelY + panelH - 30);
        lineGrad.addColorStop(0, 'rgba(255,255,255,0)');
        lineGrad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
        lineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lineGrad; ctx.fillRect(panelX + 540, panelY + 30, 3, panelH - 60);

        // --- القسم الأيسر: المتطلبات ---
        ctx.textAlign = 'center'; ctx.fillStyle = '#FFD700'; ctx.font = 'bold 36px "Bein"';
        ctx.fillText('المتطلبات', panelX + 800, panelY + 60);

        // صندوق المورا
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); roundRect(ctx, panelX + 640, panelY + 100, 320, 60, 15); ctx.fill();
        
        const moraColor = data.mora >= data.reqMora ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = moraColor; ctx.font = 'bold 28px "Arial"';
        ctx.fillText(`${data.mora.toLocaleString()} / ${data.reqMora.toLocaleString()} 🪙`, panelX + 800, panelY + 140);

        // رسم المورد المطلوب
        drawItemBox(ctx, panelX + 710, panelY + 180, 180, reqMatImg, data.reqMatRarity || 'Rare');
        
        const matColor = data.userMatCount >= data.reqMatCount ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = matColor; ctx.font = 'bold 26px "Arial"';
        ctx.fillText(`تمتلك: ${data.userMatCount} / ${data.reqMatCount}`, panelX + 800, panelY + 390);
    }
    
    // =========================================================
    // شاشة (فرن الدمج)
    // =========================================================
    else if (activeView === 'synthesis') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 38px "Bein"';
            ctx.fillText('برجاء تحديد العنصر المراد التضحية به', width/2, panelY + 170);
            ctx.fillStyle = '#E74C3C'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('(تتطلب العملية 4 وحدات من نفس العنصر)', width/2, panelY + 230);
        } else {
            const itemSize = 180;
            const leftItemX = panelX + 150;
            const rightItemX = panelX + panelW - 330;
            const itemY = panelY + 70;

            // التضحية
            drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg, data.sacMatRarity || 'Rare');
            ctx.fillStyle = '#E74C3C'; ctx.font = 'bold 30px "Bein"';
            ctx.fillText(`4x تضحية`, leftItemX + itemSize/2, itemY + itemSize + 40);
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 24px "Bein"';
            drawAutoScaledArabicText(ctx, data.sacMatName, leftItemX + itemSize/2, itemY + itemSize + 80, 220, 24, 12);

            // السهم الفانتزي
            drawFantasyArrow(ctx, width/2 - 60, panelY + 160, 120, '#F1C40F');

            // النتيجة
            if (data.targetMatName) {
                drawItemBox(ctx, rightItemX, itemY, itemSize, targetMatImg, data.targetMatRarity || 'Rare');
                ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 30px "Bein"';
                ctx.fillText(`النتيجة 1x`, rightItemX + itemSize/2, itemY + itemSize + 40);
                ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 24px "Bein"';
                drawAutoScaledArabicText(ctx, data.targetMatName, rightItemX + itemSize/2, itemY + itemSize + 80, 220, 24, 12);
                
                ctx.fillStyle = data.mora >= data.fee ? '#2ECC71' : '#E74C3C';
                ctx.font = 'bold 28px "Bein"';
                ctx.fillText(`رسوم الدمج: ${data.fee.toLocaleString()} 🪙`, width/2, panelY + 360);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath(); roundRect(ctx, rightItemX, itemY, itemSize, itemSize, 20); ctx.fill();
                ctx.fillStyle = '#777777'; ctx.font = 'bold 28px "Bein"';
                ctx.fillText('في انتظار\nالهدف...', rightItemX + itemSize/2, itemY + itemSize/2 + 5);
            }
        }
    }
    
    // =========================================================
    // شاشة (محرقة التفكيك الصهر)
    // =========================================================
    else if (activeView === 'smelting') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 38px "Bein"';
            ctx.fillText('حدد العنصر الذي تود تفكيكه في المحرقة', width/2, panelY + 170);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('سيتم الحرق نهائياً وتحويل العنصر لخبرة (XP)', width/2, panelY + 230);
        } else {
            const itemSize = 200;
            const leftItemX = panelX + 180;
            const itemY = panelY + 80;

            // رسم العنصر
            drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg, data.sacMatRarity || 'Uncommon');
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 30px "Bein"';
            drawAutoScaledArabicText(ctx, data.sacMatName, leftItemX + itemSize/2, itemY + itemSize + 50, 260, 30, 14);

            // سهم انصهار
            drawFantasyArrow(ctx, width/2 - 60, panelY + 170, 120, '#FF4400');

            // صندوق الـ XP
            const xpBoxW = 320, xpBoxH = 140;
            const xpBoxX = panelX + panelW - 480, xpBoxY = panelY + 110;

            ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
            ctx.beginPath(); roundRect(ctx, xpBoxX, xpBoxY, xpBoxW, xpBoxH, 20); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#2ECC71'; ctx.stroke();

            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 60px "Arial"';
            ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 10;
            ctx.fillText(`+${data.xpGain} XP`, xpBoxX + xpBoxW/2, xpBoxY + xpBoxH/2 + 15);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('خبرة فورية', xpBoxX + xpBoxW/2, xpBoxY + xpBoxH + 40);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateForgeUI };
