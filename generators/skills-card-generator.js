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

    const primaryColor = '#FFD700'; // لون ذهبي امبراطوري
    const secondaryColor = '#b8860b'; // لون برونزي

    // 1. رسم الخلفية الفخمة (تدرج لوني داكن)
    const bgBase = ctx.createLinearGradient(0, 0, width, height);
    bgBase.addColorStop(0, '#0a0a14'); 
    bgBase.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, width, height);

    // 2. إضافة تأثيرات إضاءة (Vignette & Glow)
    const glow = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 600);
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.05)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.8)'); 
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // 3. رسم الإطار الخارجي المزخرف
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

    // 4. رسم الرمز الشخصي (Avatar)
    const avatarSize = 160;
    const avatarX = width - 190; 
    const avatarY = 50; 
    
    ctx.save();
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 30; 
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, (avatarSize / 2) + 6, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const avatarImage = await loadImage(data.avatarUrl);
        ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#333'; ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    // 5. كتابة اسم اللاعب
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.font = 'bold 50px "Bein", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,1)';
    ctx.shadowBlur = 10;
    
    let dName = data.cleanName;
    if (dName.length > 15) dName = dName.substring(0, 15) + '..';
    ctx.fillText(dName, width - 210, 100);
    ctx.shadowBlur = 0;

    // صندوق إجمالي التطويرات تحت الاسم
    ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
    ctx.beginPath(); roundRect(ctx, width - 450, 130, 230, 45, 10); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = secondaryColor; ctx.stroke();
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`قيمة العتاد: ${data.totalSpent.toLocaleString()}`, width - 335, 160);

    // ==========================================
    // 6. قسم العتاد القتالي (يسار)
    // ==========================================
    const leftX = 40;
    let leftY = 60;
    const leftBoxW = 400;

    // صندوق السلاح
    ctx.fillStyle = 'rgba(15, 15, 20, 0.8)';
    ctx.beginPath(); roundRect(ctx, leftX, leftY, leftBoxW, 160, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = primaryColor; ctx.stroke();

    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 28px "Bein", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('⚔️ العـتـاد والأسلحـة', leftX + leftBoxW - 20, leftY + 40);
    
    ctx.beginPath(); ctx.moveTo(leftX + 20, leftY + 55); ctx.lineTo(leftX + leftBoxW - 20, leftY + 55);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.font = '22px "Bein", sans-serif';
    ctx.fillStyle = '#ffffff';
    if (data.weaponData) {
        ctx.fillText(`السلاح: ${data.weaponData.name}`, leftX + leftBoxW - 20, leftY + 90);
        ctx.fillStyle = '#00BFFF';
        ctx.fillText(`المستوى: Lv.${data.weaponData.currentLevel}`, leftX + leftBoxW - 20, leftY + 120);
        ctx.fillStyle = '#FF4500';
        ctx.fillText(`الضرر: ${data.weaponData.currentDamage} DMG`, leftX + leftBoxW - 20, leftY + 150);
    } else {
        ctx.fillText(`العرق: ${data.raceName}`, leftX + leftBoxW - 20, leftY + 100);
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`(بدون سلاح مجهز)`, leftX + leftBoxW - 20, leftY + 135);
    }

    // صندوق الجرعات
    leftY += 190;
    ctx.fillStyle = 'rgba(15, 15, 20, 0.8)';
    ctx.beginPath(); roundRect(ctx, leftX, leftY, leftBoxW, 180, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = secondaryColor; ctx.stroke();

    ctx.fillStyle = secondaryColor;
    ctx.font = 'bold 28px "Bein", sans-serif';
    ctx.fillText('⚗️ حقـيبـة الجرعـات', leftX + leftBoxW - 20, leftY + 40);
    
    ctx.beginPath(); ctx.moveTo(leftX + 20, leftY + 55); ctx.lineTo(leftX + leftBoxW - 20, leftY + 55);
    ctx.stroke();

    ctx.font = '20px "Bein", sans-serif';
    ctx.fillStyle = '#e0e0e0';
    let pY = leftY + 90;
    if (data.potionsList.length > 0) {
        data.potionsList.slice(0, 3).forEach(p => {
            ctx.fillText(`(x${p.qty}) : ${p.name}`, leftX + leftBoxW - 20, pY);
            pY += 30;
        });
        if (data.potionsList.length > 3) {
            ctx.fillStyle = '#888888';
            ctx.fillText(`... وجرعات أخرى في الحقيبة`, leftX + leftBoxW - 20, pY);
        }
    } else {
        ctx.fillText("الحقيبة فارغة.", leftX + leftBoxW - 20, pY);
    }

    // ==========================================
    // 7. قسم المهارات (يمين ووسط وأسفل)
    // ==========================================
    let rightY = 260;
    const rightBoxW = width - 80; // عرض كامل للمهارات
    const skillX = 40;

    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 30px "Bein", sans-serif';
    ctx.textAlign = 'right';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 10;
    ctx.fillText('❖ المهارات والقـدرات المكتسبة', width - 40, rightY);
    ctx.shadowBlur = 0;

    rightY += 30;

    if (data.skillsList.length > 0) {
        data.skillsList.forEach((skill, index) => {
            // صندوق المهارة
            ctx.fillStyle = 'rgba(15, 15, 20, 0.9)';
            ctx.beginPath(); roundRect(ctx, skillX, rightY, rightBoxW, 110, 12); ctx.fill();
            
            // خط ملون جانبي للمهارة
            const colors = ['#FFD700', '#00FFFF', '#FF00FF'];
            ctx.fillStyle = colors[index % colors.length];
            ctx.beginPath(); roundRect(ctx, skillX + rightBoxW - 10, rightY, 10, 110, 5); ctx.fill();

            // اسم المهارة والمستوى
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px "Bein", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${skill.name} (Lv.${skill.level})`, skillX + rightBoxW - 25, rightY + 35);
            
            // الوصف
            ctx.fillStyle = '#cccccc';
            ctx.font = '18px "Bein", sans-serif';
            wrapText(ctx, skill.description, skillX + rightBoxW - 25, rightY + 70, rightBoxW - 50, 25);

            rightY += 130;
        });
    } else {
        ctx.fillStyle = '#aaaaaa';
        ctx.font = 'italic 24px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("لا توجد مهارات مكتسبة حتى الآن.", width / 2, rightY + 100);
    }

    // 8. شريط ترقيم الصفحات
    if (data.totalPages > 1) {
        ctx.fillStyle = 'rgba(20, 20, 25, 0.9)';
        ctx.beginPath(); roundRect(ctx, width/2 - 80, height - 50, 160, 35, 10); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = primaryColor; ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`صفحة ${data.currentPage + 1} / ${data.totalPages}`, width/2, height - 26);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateSkillsCard };
