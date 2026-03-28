const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

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

function drawAutoScaledArabicText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
}

// دالة الرسم الأساسية للمجمع الإمبراطوري
async function generateForgeUI(userObj, view, data) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية المجمع (ألوان نارية/سحرية غامقة)
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, width, height);

    const grad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    grad.addColorStop(0, view === 'skill' ? 'rgba(88, 24, 150, 0.4)' : (view === 'weapon' || view === 'smelting' ? 'rgba(180, 50, 0, 0.4)' : 'rgba(0, 100, 180, 0.4)'));
    grad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // تأثير الشرار (Sparks)
    ctx.fillStyle = '#FFAA00';
    ctx.beginPath();
    for(let i=0; i<60; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2;
        ctx.globalAlpha = Math.random() * 0.6 + 0.2;
        ctx.moveTo(px, py);
        ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // الشريط العلوي
    const headerH = 100;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.8)';
    ctx.fillRect(0, 0, width, headerH);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.fillRect(0, headerH - 2, width, 2);

    const avatarSize = 70;
    const avatarX = 60 + avatarSize/2;
    const avatarY = headerH / 2;

    const [avatarImage, reqMatImg, targetMatImg] = await Promise.all([
        loadImage(userObj.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
        data.reqMatIcon ? getCachedImage(data.reqMatIcon) : null,
        data.targetMatIcon ? getCachedImage(data.targetMatIcon) : null
    ]);

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
    let dName = userObj.displayName || userObj.username;
    drawAutoScaledArabicText(ctx, dName, avatarX + 50, avatarY, 200, 26, 14);

    // المورا
    ctx.fillStyle = 'rgba(20, 25, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, width - 260, 25, 220, 50, 12); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)'; ctx.stroke();
    
    ctx.textAlign = 'right'; ctx.fillStyle = '#FFD700';
    drawAutoScaledText(ctx, (data.mora || 0).toLocaleString(), width - 80, 50, 140, 22, 12);
    ctx.font = '22px "Arial"';
    ctx.fillText('🪙', width - 50, 50);

    // عنوان الصفحة
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 45px "Bein"';
    ctx.fillText(data.title || 'المجمع الإمبراطوري للتطوير', width / 2, 160);

    // اللوحة الرئيسية
    const panelY = 200;
    const panelW = 1000;
    const panelH = 420;
    const panelX = (width - panelW) / 2;

    ctx.fillStyle = 'rgba(15, 20, 25, 0.85)';
    ctx.beginPath(); roundRect(ctx, panelX, panelY, panelW, panelH, 20); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'; ctx.stroke();

    ctx.textAlign = 'center';

    if (view === 'main') {
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 30px "Bein"';
        ctx.fillText('الرجاء اختيار القسم المطلوب من القائمة بالأسفل', width/2, panelY + 200);
        ctx.font = 'bold 22px "Bein"';
        ctx.fillStyle = '#888888';
        ctx.fillText('(حدادة أسلحة - صقل مهارات - فرن دمج - محرقة صهر)', width/2, panelY + 250);
    } 
    else if (view === 'weapon' || view === 'skill') {
        // حالة العنصر
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 35px "Bein"';
        ctx.fillText('حالة العنصر الحالية', panelX + 250, panelY + 60);

        ctx.fillStyle = '#3498DB';
        ctx.font = 'bold 40px "Arial"';
        ctx.fillText(`Lv.${data.currentLevel} ➔ Lv.${data.nextLevel}`, panelX + 250, panelY + 150);

        ctx.fillStyle = view === 'weapon' ? '#E74C3C' : '#9B59B6';
        ctx.font = 'bold 35px "Arial"';
        ctx.fillText(`${data.currentStat} ➔ ${data.nextStat}`, panelX + 250, panelY + 230);

        // خط فاصل
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(panelX + 500, panelY + 30, 2, panelH - 60);

        // المتطلبات
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 35px "Bein"';
        ctx.fillText('متطلبات التطوير', panelX + 750, panelY + 60);

        // المورا المطلوبة
        const moraColor = data.mora >= data.reqMora ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = moraColor;
        ctx.font = 'bold 30px "Arial"';
        ctx.fillText(`${data.mora.toLocaleString()} / ${data.reqMora.toLocaleString()} 🪙`, panelX + 750, panelY + 150);

        // الموارد المطلوبة
        if (reqMatImg) {
            ctx.drawImage(reqMatImg, panelX + 680, panelY + 190, 140, 140);
        }
        
        const matColor = data.userMatCount >= data.reqMatCount ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = matColor;
        ctx.font = 'bold 30px "Arial"';
        ctx.fillText(`${data.userMatCount} / ${data.reqMatCount}`, panelX + 750, panelY + 370);

        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 22px "Bein"';
        ctx.fillText(data.reqMatName, panelX + 750, panelY + 410);
    }
    else if (view === 'synthesis') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#E0E0E0';
            ctx.font = 'bold 35px "Bein"';
            ctx.fillText('اختر العنصر الذي تريد التضحية به (يتطلب 4 حبات)', width/2, panelY + 200);
        } else {
            // التضحية
            if (reqMatImg) ctx.drawImage(reqMatImg, panelX + 150, panelY + 80, 160, 160);
            ctx.fillStyle = '#E74C3C';
            ctx.font = 'bold 30px "Arial"';
            ctx.fillText(`4x المضحى به`, panelX + 230, panelY + 280);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px "Bein"';
            ctx.fillText(data.sacMatName, panelX + 230, panelY + 320);

            // سهم
            ctx.fillStyle = '#F1C40F';
            ctx.font = 'bold 80px "Arial"';
            ctx.fillText('➔', width/2, panelY + 180);

            // الناتج
            if (data.targetMatName) {
                if (targetMatImg) ctx.drawImage(targetMatImg, panelX + panelW - 310, panelY + 80, 160, 160);
                ctx.fillStyle = '#2ECC71';
                ctx.font = 'bold 30px "Arial"';
                ctx.fillText(`1x النتيجة`, panelX + panelW - 230, panelY + 280);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 24px "Bein"';
                ctx.fillText(data.targetMatName, panelX + panelW - 230, panelY + 320);
                
                ctx.fillStyle = '#F1C40F';
                ctx.fillText(`رسوم الحداد: ${data.fee.toLocaleString()} 🪙`, width/2, panelY + 380);
            } else {
                ctx.fillStyle = '#E0E0E0';
                ctx.font = 'bold 30px "Bein"';
                ctx.fillText('اختر العنصر المطلوب استخراجه', panelX + panelW - 230, panelY + 180);
            }
        }
    }
    else if (view === 'smelting') {
        if (!data.sacMatName) {
            ctx.fillStyle = '#E0E0E0';
            ctx.font = 'bold 35px "Bein"';
            ctx.fillText('اختر العنصر الذي تريد صهره من القائمة', width/2, panelY + 200);
        } else {
            if (reqMatImg) ctx.drawImage(reqMatImg, panelX + 250, panelY + 100, 150, 150);
            ctx.fillStyle = '#E74C3C';
            ctx.font = 'bold 30px "Bein"';
            ctx.fillText(data.sacMatName, panelX + 325, panelY + 290);

            ctx.fillStyle = '#F1C40F';
            ctx.font = 'bold 80px "Arial"';
            ctx.fillText('➔', width/2, panelY + 180);

            ctx.fillStyle = '#2ECC71';
            ctx.font = 'bold 70px "Arial"';
            ctx.fillText(`+${data.xpGain} XP`, panelX + panelW - 300, panelY + 180);
            ctx.font = 'bold 30px "Bein"';
            ctx.fillStyle = '#E0E0E0';
            ctx.fillText('خبرة مباشرة', panelX + panelW - 300, panelY + 240);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateForgeUI };
