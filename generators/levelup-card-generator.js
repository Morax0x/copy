const Canvas = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

// 🔥 تسجيل الخط العربي الفخم 🔥
try {
    const rootDir = process.cwd();
    Canvas.registerFont(path.join(rootDir, 'fonts', 'bein-ar-normal.ttf'), { family: 'BeinAr' });
} catch (e) {
    console.log("❌ لم يتم العثور على الخط bein-ar-normal.ttf، سيتم استخدام الخط الافتراضي.");
}

// دالة مساعدة لرسم المستطيل ذو الزوايا الدائرية
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// دالة ضبط حجم النص
function applyText(canvas, text, baseSize) {
    const ctx = canvas.getContext('2d');
    let fontSize = baseSize;
    do {
        ctx.font = `bold ${fontSize -= 2}px "BeinAr", "Arial"`; 
    } while (ctx.measureText(text).width > canvas.width - 350);
    return ctx.font;
}

// دالة توليد لون عشوائي داكن (لخلفية فخمة)
function getRandomDarkColor() {
    const letters = '0123456789'; // نستخدم أرقاماً فقط لضمان ألوان داكنة
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 10)];
    }
    return color;
}

async function generateLevelUpCard(member, oldLevel, newLevel) {
    const canvas = Canvas.createCanvas(900, 280);
    const ctx = canvas.getContext('2d');

    // 1. الخلفية (تدرج لوني عشوائي)
    const color1 = getRandomDarkColor();
    const color2 = getRandomDarkColor();
    
    const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grd.addColorStop(0, color1); 
    grd.addColorStop(1, color2); 
    ctx.fillStyle = grd;
    
    // رسم الخلفية الأساسية
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // 🔥 2. إضافة تأثير التموجات (Waves) في الخلفية 🔥
    // نقوم بقص الرسم ليكون داخل المستطيل فقط
    ctx.save();
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.clip();

    // رسم 3 طبقات من الأمواج لتعطي عمقاً
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * canvas.height);
        
        // رسم منحنى بيزيه (Bezier Curve) متموج
        ctx.bezierCurveTo(
            canvas.width / 3, Math.random() * canvas.height,
            (canvas.width / 3) * 2, Math.random() * canvas.height,
            canvas.width, Math.random() * canvas.height
        );
        
        // إغلاق الشكل للأسفل لملئه
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();

        // لون أبيض شفاف جداً
        ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + (i * 0.02)})`;
        ctx.fill();
    }
    ctx.restore(); // إلغاء القص

    // زخرفة إضافية (دوائر خفيفة)
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 3. الإطار المتوهج
    ctx.shadowColor = '#00d2ff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. صورة العضو
    const avatarX = 50;
    const avatarY = 40;
    const avatarSize = 200;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    try {
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await Canvas.loadImage(avatarURL);
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    // إطار دائري للصورة
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#00d2ff';
    ctx.stroke();

    // 5. النصوص
    const textX = 280;
    
    // العنوان
    ctx.fillStyle = '#00d2ff'; // أزرق سماوي
    ctx.font = 'bold 30px "BeinAr", "Arial"';
    ctx.fillText('LEVEL UP!', textX, 70);

    // الاسم
    ctx.fillStyle = '#ffffff';
    ctx.font = applyText(canvas, member.displayName, 50);
    ctx.fillText(member.displayName, textX, 125);

    // المستوى القديم (خافت)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // أبيض شفاف (خافت)
    ctx.font = 'bold 40px "BeinAr", "Arial"';
    ctx.fillText(`Lvl ${oldLevel}`, textX, 200);

    // حساب موقع السهم بناءً على طول نص المستوى القديم
    const oldLevelWidth = ctx.measureText(`Lvl ${oldLevel}`).width;
    const arrowX = textX + oldLevelWidth + 20;

    // السهم (خافت جداً)
    ctx.fillStyle = 'rgba(0, 210, 255, 0.3)'; // أزرق خافت
    ctx.font = 'bold 35px "BeinAr", "Arial"';
    ctx.fillText('➜', arrowX, 200);

    // المستوى الجديد (يلمع بقوة)
    ctx.save();
    ctx.fillStyle = '#FFD700'; // ذهبي
    ctx.shadowColor = '#FFD700'; // توهج ذهبي
    ctx.shadowBlur = 25; 
    ctx.font = 'bold 65px "BeinAr", "Arial"'; // أكبر حجماً
    ctx.fillText(`${newLevel}`, arrowX + 60, 205);
    ctx.restore();

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'levelup.png' });
}

module.exports = { generateLevelUpCard };
