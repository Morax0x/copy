const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'); 
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("⚠️ لم يتم العثور على خط Bein، سيتم استخدام الخط الافتراضي.");
}

function roundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

async function generateSkillsCard(data) {
    const width = 1000;
    const height = 750;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryColor = '#FFD700'; // ذهبي
    const secondaryColor = '#b8860b'; // برونزي

    // 1. رسم الخلفية الأساسية
    const bgBase = ctx.createLinearGradient(0, 0, width, height);
    bgBase.addColorStop(0, '#0a0a14'); 
    bgBase.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, width, height);

    // 2. تأثير الإضاءة
    const glow = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 600);
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.05)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.8)'); 
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // 3. الإطار الخارجي
    const borderGradient = ctx.createLinearGradient(0, 0, width, height);
    borderGradient.addColorStop(0, primaryColor);
    borderGradient.addColorStop(0.5, '#ffffff');
    borderGradient.addColorStop(1, primaryColor);

    ctx.lineWidth = 6;
    ctx.strokeStyle = borderGradient;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 4. رسم المهارات (تم تقديمها لتكون في الخلفية بالنسبة للمربعات الجانبية)
    let skillY = 290;
    const skillBoxW = width - 80;
    const skillX = 40;

    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 30px "Bein", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('❖ المهارات والقـدرات المكتسبة', width - 40, 260);

    if (data.skillsList.length > 0) {
        data.skillsList.forEach((skill, index) => {
            ctx.fillStyle = 'rgba(15, 15, 20, 0.9)';
            ctx.beginPath(); roundRect(ctx, skillX, skillY, skillBoxW, 110, 12); ctx.fill();
            
            const colors = ['#FFD700', '#00FFFF', '#FF00FF'];
            ctx.fillStyle = colors[index % colors.length];
            ctx.beginPath(); roundRect(ctx, skillX + skillBoxW - 10, skillY, 10, 110, 5); ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px "Bein", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${skill.name} (Lv.${skill.level})`, skillX + skillBoxW - 25, skillY + 35);
            
            ctx.fillStyle = '#cccccc';
            ctx.font = '18px "Bein", sans-serif';
            wrapText(ctx, skill.description, skillX + skillBoxW - 25, skillY + 70, skillBoxW - 50, 25);
            skillY += 130;
        });
    }

    // ==========================================================
    // 5. رسم الطبقة الأمامية (السلاح + الجرعات + الأفاتار)
    // نضعها هنا لترسم "فوق" أي تداخل من المهارات
    // ==========================================================
    
    // الأفاتار واسم اللاعب
    const avatarSize = 160;
    const avatarX = width - 190; 
    const avatarY = 50; 
    
    ctx.save();
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 30; 
    ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, (avatarSize / 2) + 6, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor; ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    try {
        const avatarImage = await loadImage(data.avatarUrl);
        ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) { ctx.fillStyle = '#333'; ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize); }
    ctx.restore();

    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'right'; ctx.font = 'bold 50px "Bein", sans-serif';
    let dName = data.cleanName; if (dName.length > 15) dName = dName.substring(0, 15) + '..';
    ctx.fillText(dName, width - 210, 100);

    // صندوق السلاح (أمام المهارات)
    const leftX = 40;
    const leftBoxW = 400;
    
    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)'; // زيادة الشفافية لضمان التغطية
    ctx.beginPath(); roundRect(ctx, leftX, 60, leftBoxW, 160, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = primaryColor; ctx.stroke();

    ctx.fillStyle = primaryColor; ctx.font = 'bold 28px "Bein", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('⚔️ العـتـاد والأسلحـة', leftX + leftBoxW - 20, 100);

    ctx.font = '22px "Bein", sans-serif'; ctx.fillStyle = '#ffffff';
    if (data.weaponData) {
        ctx.fillText(`السلاح: ${data.weaponData.name}`, leftX + leftBoxW - 20, 150);
        ctx.fillStyle = '#00BFFF'; ctx.fillText(`المستوى: Lv.${data.weaponData.currentLevel}`, leftX + leftBoxW - 20, 180);
    }

    // صندوق الجرعات (أمام المهارات)
    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
    ctx.beginPath(); roundRect(ctx, leftX, 250, leftBoxW, 180, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = secondaryColor; ctx.stroke();

    ctx.fillStyle = secondaryColor; ctx.font = 'bold 28px "Bein", sans-serif';
    ctx.fillText('⚗️ حقـيبـة الجرعـات', leftX + leftBoxW - 20, 290);

    ctx.font = '20px "Bein", sans-serif'; ctx.fillStyle = '#e0e0e0';
    let pY = 340;
    if (data.potionsList.length > 0) {
        data.potionsList.slice(0, 3).forEach(p => {
            ctx.fillText(`(x${p.qty}) : ${p.name}`, leftX + leftBoxW - 20, pY);
            pY += 30;
        });
    } else { ctx.fillText("الحقيبة فارغة.", leftX + leftBoxW - 20, pY); }

    // قيمة العتاد
    ctx.fillStyle = 'rgba(20, 20, 25, 0.9)';
    ctx.beginPath(); roundRect(ctx, width - 450, 130, 230, 45, 10); ctx.fill();
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 20px "Bein", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`قيمة العتاد: ${data.totalSpent.toLocaleString()}`, width - 335, 160);

    // 8. ترقيم الصفحات
    if (data.totalPages > 1) {
        ctx.fillStyle = 'rgba(20, 20, 25, 0.9)';
        ctx.beginPath(); roundRect(ctx, width/2 - 80, height - 50, 160, 35, 10); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '18px "Bein", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`صفحة ${data.currentPage + 1} / ${data.totalPages}`, width/2, height - 26);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateSkillsCard };
