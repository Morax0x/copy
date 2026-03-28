const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// تسجيل الخط العربي بقوة
try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.warn("⚠️ لم يتم العثور على خط Bein.");
}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

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

function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

// 🏹 سهم فانتزي متطور
function drawFantasyArrow(ctx, x, y, width, color) {
    ctx.save();
    ctx.translate(x, y);
    
    const grad = ctx.createLinearGradient(0, -10, width, 10);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, color);

    ctx.fillStyle = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(width - 35, -6);
    ctx.lineTo(width - 35, -20);
    ctx.lineTo(width, 0); 
    ctx.lineTo(width - 35, 20);
    ctx.lineTo(width - 35, 6);
    ctx.lineTo(0, 6);
    ctx.closePath();
    
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.restore();
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 12) {
    const safeText = resolveText(text);
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Arial"`;
    while (ctx.measureText(safeText).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Arial"`;
    }
    ctx.fillText(safeText, x, y);
}

function drawAutoScaledArabicText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 12) {
    const safeText = resolveText(text);
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(safeText).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(safeText, x, y);
}

// 📦 إطار العناصر
function drawItemBox(ctx, x, y, size, img, rarity = 'Common', label = null, quantity = null) {
    const color = RARITY_COLORS[rarity] || RARITY_COLORS['Common'];
    
    ctx.fillStyle = 'rgba(12, 16, 24, 0.95)';
    ctx.beginPath(); roundRect(ctx, x, y, size, size, 20); ctx.fill();

    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
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

    if (quantity !== null) {
        ctx.fillStyle = color;
        ctx.beginPath(); roundRect(ctx, x + size - 50, y - 15, 65, 35, 10); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.font = 'bold 22px "Arial"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`x${quantity}`, x + size - 17, y + 2);
    }

    if (label) {
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        drawAutoScaledArabicText(ctx, label, x + size/2, y + size + 15, size + 80, 24, 12);
    }
}

// ==========================================
// 👑 الدالة الأساسية لتوليد الصور
// ==========================================
async function generateForgeUI(userObj, view, data) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let activeView = view.replace('success_', '');
    const isSuccess = view.startsWith('success_');
    
    if (activeView === 'main' && data.title?.includes('أكاديمية')) activeView = 'skill_home';
    if (activeView === 'synthesis' && !data.sacMatName) activeView = 'synthesis_home';
    if (activeView === 'smelting' && !data.sacMatName) activeView = 'smelting_home';

    // 1. تحديد الروابط لصور الخلفيات والشعارات حسب القسم
    let bgUrl, emblemUrl, sparkColor, accentColor;
    
    if (activeView === 'weapon') {
        bgUrl = 'images/forge/bg_forge.png';
        emblemUrl = 'images/forge/emblem_forge.png';
        sparkColor = '#FF8800'; accentColor = '#E74C3C';
    } else if (activeView.includes('skill')) {
        bgUrl = 'images/forge/bg_academy.png';
        emblemUrl = 'images/forge/emblem_magic.png';
        sparkColor = '#DDAAFF'; accentColor = '#9B59B6';
    } else if (activeView.includes('synthesis')) {
        bgUrl = 'images/forge/bg_synthesis.png';
        emblemUrl = 'images/forge/emblem_synthesis.png'; // اختياري لو عندك
        sparkColor = '#55FF88'; accentColor = '#2ECC71';
    } else if (activeView.includes('smelting')) {
        bgUrl = 'images/forge/bg_smelting.png';
        emblemUrl = 'images/forge/emblem_smelt.png'; // اختياري
        sparkColor = '#FF4400'; accentColor = '#FF4400';
    } else { 
        bgUrl = 'images/forge/bg_main_hub.png';
        sparkColor = '#00AAFF'; accentColor = '#3498DB';
    }

    // تحميل الصور (الخلفية، الشعار، الأفتار، الموارد)
    const [bgImage, emblemImg, avatarImage, reqMatImg, targetMatImg] = await Promise.all([
        getCachedImage(bgUrl),
        emblemUrl ? getCachedImage(emblemUrl) : null,
        loadImage(userObj.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
        data.reqMatIcon ? getCachedImage(data.reqMatIcon) : null,
        data.targetMatIcon ? getCachedImage(data.targetMatIcon) : null
    ]);

    // 2. رسم الخلفية المرفوعة
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, width, height);
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, width, height);
        // فلتر تظليل بسيط عشان النصوص تبرز
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);
    }

    // تأثير الجسيمات (عشان نعطي حياة للصورة الثابتة)
    ctx.fillStyle = sparkColor;
    ctx.beginPath();
    const pCount = activeView.includes('smelting') || activeView === 'weapon' ? 120 : 80;
    for(let i=0; i<pCount; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 3;
        ctx.globalAlpha = Math.random() * 0.7 + 0.1;
        ctx.moveTo(px, py); ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill(); ctx.globalAlpha = 1.0;

    // 3. الشريط العلوي
    const headerH = 100;
    ctx.fillStyle = 'rgba(5, 8, 12, 0.9)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(200, 150, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 1)');
    goldGrad.addColorStop(1, 'rgba(200, 150, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);

    // الأفتار والاسم
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
    drawAutoScaledArabicText(ctx, userObj.displayName || userObj.username, avatarX + 50, avatarY, 250, 26, 14);
    ctx.shadowBlur = 0;

    // المورا
    ctx.fillStyle = 'rgba(15, 20, 25, 0.9)';
    ctx.beginPath(); roundRect(ctx, width - 280, 25, 240, 50, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();
    
    ctx.textAlign = 'right'; ctx.fillStyle = '#FFD700';
    drawAutoScaledText(ctx, (data.mora || 0).toLocaleString(), width - 80, 50, 160, 24, 12);
    ctx.font = '24px "Arial"'; ctx.fillText('🪙', width - 45, 50);

    // عنوان الصفحة المركزي
    ctx.textAlign = 'center'; ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 45px "Bein"';
    ctx.shadowColor = '#F1C40F'; ctx.shadowBlur = 15;
    ctx.fillText(resolveText(data.title || 'المجمع الإمبراطوري'), width / 2, 160);
    ctx.shadowBlur = 0;

    // 4. اللوحة الرئيسية (Panel) بشفافية عشان تبين الخلفية 
    const panelY = 210;
    const panelW = 1100;
    const panelH = 430;
    const panelX = (width - panelW) / 2;

    ctx.fillStyle = 'rgba(8, 12, 16, 0.80)'; // الشفافية زادت هنا
    ctx.beginPath(); roundRect(ctx, panelX, panelY, panelW, panelH, 25); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.stroke();

    // =========================================================
    // 🌟 شاشات النجاح
    // =========================================================
    if (isSuccess) {
        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 50px "Bein"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 20;
        
        let msg = "";
        if (activeView === 'weapon') msg = "✨ تمت عملية صقل السلاح بنجاح! ✨";
        else if (activeView === 'skill') msg = "✨ تم استيعاب حكمة المهارة بنجاح! ✨";
        else if (activeView === 'synthesis') msg = "🔄 تمت عملية دمج العناصر بنجاح! 🔄";
        else if (activeView === 'smelting') msg = "🔥 تمت عملية الصهر بنجاح! 🔥";

        ctx.fillText(msg, width/2, panelY + 80);
        ctx.shadowBlur = 0;

        if (activeView === 'weapon' || activeView === 'skill') {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 50px "Arial"';
            ctx.fillText(`المستوى الجديد: Lv.${data.nextLevel}`, width/2, panelY + 200);
            ctx.fillStyle = accentColor; ctx.font = 'bold 45px "Arial"';
            ctx.fillText(resolveText(data.nextStat), width/2, panelY + 280);
        }
        else if (activeView === 'synthesis') {
            drawItemBox(ctx, width/2 - 90, panelY + 140, 180, targetMatImg, data.targetMatRarity);
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 30px "Bein"'; ctx.textBaseline = 'top';
            drawAutoScaledArabicText(ctx, `حصلت على: ${resolveText(data.targetMatName)}`, width/2, panelY + 350, 900, 30, 16);
        }
        else if (activeView === 'smelting') {
            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 100px "Arial"';
            ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 30;
            ctx.fillText(`+${data.xpGain} XP`, width/2, panelY + 220);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#E0E0E0'; ctx.font = 'bold 30px "Bein"';
            ctx.fillText('تمت إضافتها إلى خبرتك الشخصية', width/2, panelY + 320);
        }
        return canvas.toBuffer('image/png');
    }

    // =========================================================
    // 🏠 الصفحات الرئيسية المخصصة للأقسام
    // =========================================================
    if (activeView === 'main' || activeView.endsWith('_home')) {
        
        // رسم الشعار المرفوع إذا توفر، أو الشعار القديم
        if (emblemImg) {
            ctx.drawImage(emblemImg, width/2 - 70, panelY + 60, 140, 140);
        } else {
            let emoji = '🏛️';
            if(activeView === 'skill_home') emoji = '🔮';
            else if(activeView === 'synthesis_home') emoji = '⚗️';
            else if(activeView === 'smelting_home') emoji = '🌋';
            
            ctx.save();
            ctx.translate(width/2, panelY + 130);
            ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(10, 15, 20, 0.9)'; ctx.fill();
            ctx.lineWidth = 5; ctx.strokeStyle = accentColor; ctx.shadowColor = accentColor; ctx.shadowBlur = 40; ctx.stroke();
            ctx.font = '70px "Arial"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
            ctx.fillText(emoji, 0, 5);
            ctx.restore();
        }

        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 42px "Bein"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        
        if (activeView === 'main') {
            ctx.fillText('مرحباً بك في المجمع الإمبراطوري', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('الرجاء اختيار القسم الذي تود زيارته من الأزرار بالأسفل', width/2, panelY + 330);
        }
        else if (activeView === 'skill_home') {
            ctx.fillText('أكاديمية السحر السري', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('الرفوف مليئة بالمخطوطات... اختر المهارة المراد صقلها من القائمة', width/2, panelY + 330);
        }
        else if (activeView === 'synthesis_home') {
            ctx.fillText('فرن الدمج الكيميائي', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('قانون التبادل: ضع 4 عناصر متطابقة لاستخلاص عنصر جديد', width/2, panelY + 330);
        }
        else if (activeView === 'smelting_home') {
            ctx.fillText('محرقة التفكيك العظمى', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('ألقِ بعتادك الزائد في النار المشتعلة لتحصل على خبرة خالصة', width/2, panelY + 330);
        }
    }

    // =========================================================
    // ⚔️ شاشات (تطوير السلاح / صقل المهارة)
    // =========================================================
    else if (activeView === 'weapon' || activeView === 'skill') {
        const isWeapon = activeView === 'weapon';
        const midX = panelX + 550; 

        // --- القسم الأيمن ---
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 34px "Bein"';
        ctx.fillText(isWeapon ? 'التطوير القادم' : 'الصقل القادم', panelX + 275, panelY + 60);

        const statsY_Level = panelY + 170;
        const statsY_Value = panelY + 300;
        
        const oldX = panelX + 90;   
        const arrowX = panelX + 210; 
        const newX = panelX + 370;  

        // 1. المستوى
        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 40px "Arial"'; ctx.textAlign = 'left';
        ctx.fillText(`Lv.${data.currentLevel}`, oldX, statsY_Level);
        ctx.restore();

        drawFantasyArrow(ctx, arrowX, statsY_Level, 130, '#FFD700');

        ctx.save();
        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 45px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 15;
        ctx.fillText(`Lv.${data.nextLevel}`, newX, statsY_Level);
        ctx.restore();

        // 2. القيمة 
        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 34px "Arial"'; ctx.textAlign = 'left';
        drawAutoScaledText(ctx, data.currentStat, oldX, statsY_Value, 110, 34, 14);
        ctx.restore();

        drawFantasyArrow(ctx, arrowX, statsY_Value, 130, accentColor);

        ctx.save();
        ctx.fillStyle = accentColor; ctx.font = 'bold 38px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = accentColor; ctx.shadowBlur = 15;
        drawAutoScaledText(ctx, data.nextStat, newX, statsY_Value, 150, 38, 14);
        ctx.restore();

        // --- الفاصل العمودي ---
        const lineGrad = ctx.createLinearGradient(0, panelY + 40, 0, panelY + panelH - 40);
        lineGrad.addColorStop(0, 'rgba(255,215,0,0)');
        lineGrad.addColorStop(0.5, 'rgba(255,215,0,0.3)');
        lineGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = lineGrad; ctx.fillRect(midX - 1, panelY + 40, 3, panelH - 80);

        // --- القسم الأيسر ---
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 34px "Bein"';
        ctx.fillText('المتطلبات', panelX + 825, panelY + 60);

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); roundRect(ctx, panelX + 665, panelY + 100, 320, 60, 15); ctx.fill();
        const moraColor = data.mora >= data.reqMora ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = moraColor; ctx.font = 'bold 30px "Arial"';
        ctx.fillText(`${data.mora.toLocaleString()} / ${data.reqMora.toLocaleString()} 🪙`, panelX + 825, panelY + 130);

        // المورد 
        ctx.textBaseline = 'alphabetic';
        drawItemBox(ctx, panelX + 740, panelY + 180, 170, reqMatImg, data.reqMatRarity || 'Rare', data.reqMatName);
        
        // كمية المورد
        const matColor = data.userMatCount >= data.reqMatCount ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = matColor; ctx.font = 'bold 26px "Arial"';
        ctx.fillText(`الكمية المتوفرة: ${data.userMatCount} / ${data.reqMatCount}`, panelX + 825, panelY + 395);
    }
    
    // =========================================================
    // 🔄 شاشة (فرن الدمج - Synthesis)
    // =========================================================
    else if (activeView === 'synthesis') {
        const itemSize = 180;
        const leftItemX = panelX + 160;
        const rightItemX = panelX + panelW - 340;
        const itemY = panelY + 110; 

        // الصندوق الأيسر
        ctx.fillStyle = '#E74C3C'; ctx.font = 'bold 30px "Bein"'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('عنصر الدمج (4x)', leftItemX + itemSize/2, itemY - 15);
        drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg, data.sacMatRarity || 'Rare', data.sacMatName, 4);
        
        // السهم הפانتزي
        drawFantasyArrow(ctx, width/2 - 70, panelY + 180, 140, '#F1C40F');

        // الصندوق الأيمن
        if (data.targetMatName) {
            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 30px "Bein"'; ctx.textBaseline = 'bottom';
            ctx.fillText('النتيجة (1x)', rightItemX + itemSize/2, itemY - 15);

            drawItemBox(ctx, rightItemX, itemY, itemSize, targetMatImg, data.targetMatRarity || 'Rare', data.targetMatName, 1);
            
            ctx.fillStyle = data.mora >= data.fee ? '#2ECC71' : '#E74C3C';
            ctx.font = 'bold 28px "Bein"'; ctx.textBaseline = 'middle';
            ctx.fillText(`رسوم التفكيك والدمج: ${data.fee.toLocaleString()} 🪙`, width/2, panelY + 380);
        } else {
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 30px "Bein"'; ctx.textBaseline = 'bottom';
            ctx.fillText('النتيجة (1x)', rightItemX + itemSize/2, itemY - 15);

            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath(); roundRect(ctx, rightItemX, itemY, itemSize, itemSize, 20); ctx.fill();
            
            ctx.fillStyle = '#777777'; ctx.font = 'bold 26px "Bein"'; ctx.textBaseline = 'middle';
            ctx.fillText('بانتظار تحديد', rightItemX + itemSize/2, itemY + itemSize/2 - 15);
            ctx.fillText('العنصر المطلوب', rightItemX + itemSize/2, itemY + itemSize/2 + 20);
        }
    }
    
    // =========================================================
    // 🔥 شاشة (المصهر - Smelting)
    // =========================================================
    else if (activeView === 'smelting') {
        const itemSize = 200;
        const leftItemX = panelX + 180;
        const itemY = panelY + 120; 

        ctx.fillStyle = '#FF4400'; ctx.font = 'bold 32px "Bein"'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('العنصر المراد صهره', leftItemX + itemSize/2, itemY - 15);

        drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg, data.sacMatRarity || 'Uncommon', data.sacMatName, 1);
        
        drawFantasyArrow(ctx, width/2 - 75, panelY + 210, 150, '#FF3300');

        // صندوق الـ XP
        const xpBoxW = 340, xpBoxH = 160;
        const xpBoxX = panelX + panelW - 480, xpBoxY = panelY + 130;

        ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
        ctx.beginPath(); roundRect(ctx, xpBoxX, xpBoxY, xpBoxW, xpBoxH, 20); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2ECC71'; ctx.shadowColor = 'rgba(46, 204, 113, 0.4)'; ctx.shadowBlur = 20; ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 65px "Arial"'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 10;
        ctx.fillText(`+${data.xpGain} XP`, xpBoxX + xpBoxW/2, xpBoxY + xpBoxH/2);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 28px "Bein"'; ctx.textBaseline = 'top';
        ctx.fillText('خبرة شخصية خالصة', xpBoxX + xpBoxW/2, xpBoxY + xpBoxH + 20);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateForgeUI };
