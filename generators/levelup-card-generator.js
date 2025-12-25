const Canvas = require('canvas');
const { AttachmentBuilder } = require('discord.js');

// دالة رسم الزوايا الدائرية
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

// دالة ضبط حجم النص ليناسب المساحة
function applyText(canvas, text, baseSize) {
    const ctx = canvas.getContext('2d');
    let fontSize = baseSize;
    do {
        ctx.font = `bold ${fontSize -= 2}px "Arial"`; // خط Arial لضمان التوافق
    } while (ctx.measureText(text).width > canvas.width - 350);
    return ctx.font;
}

async function generateLevelUpCard(member, oldLevel, newLevel, rewards) {
    // 1. إعداد اللوحة (Canvas)
    const canvas = Canvas.createCanvas(900, 280);
    const ctx = canvas.getContext('2d');

    // 2. الخلفية (تدرج لوني فخم)
    const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grd.addColorStop(0, '#141E30'); // أزرق غامق
    grd.addColorStop(1, '#243B55'); // أزرق معدني
    ctx.fillStyle = grd;
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // 3. زخرفة خلفية خفيفة
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 4. الإطار المتوهج
    ctx.shadowColor = '#00d2ff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 5. صورة العضو (Avatar)
    const avatarX = 50;
    const avatarY = 40;
    const avatarSize = 200;

    // قص دائري للصورة
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
        // لون احتياطي في حال فشل تحميل الصورة
        ctx.fillStyle = '#ccc';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    // إطار حول الصورة
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#00d2ff';
    ctx.stroke();

    // 6. النصوص والمعلومات
    const textX = 280;
    
    // العنوان
    ctx.fillStyle = '#00d2ff';
    ctx.font = 'bold 30px "Arial"';
    ctx.fillText('LEVEL UP!', textX, 70);

    // اسم العضو
    ctx.fillStyle = '#ffffff';
    ctx.font = applyText(canvas, member.displayName, 50);
    ctx.fillText(member.displayName, textX, 125);

    // عرض المستويات (Old -> New)
    ctx.fillStyle = '#a8c0ff';
    ctx.font = 'bold 35px "Arial"';
    ctx.fillText(`Lvl ${oldLevel}`, textX, 180);

    // سهم الانتقال
    ctx.fillStyle = '#00d2ff';
    ctx.fillText('➜', textX + 110, 180);

    // المستوى الجديد (كبير وذهبي)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 50px "Arial"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 10;
    ctx.fillText(`${newLevel}`, textX + 160, 185);
    ctx.shadowBlur = 0;

    // 7. شريط المكافآت (في الأسفل)
    if (rewards) {
        // خلفية الشريط
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        drawRoundedRect(ctx, textX, 210, 500, 45, 10);
        ctx.fill();

        ctx.font = 'bold 22px "Arial"';
        let rewardX = textX + 15;
        
        // نص المورا
        if (rewards.mora) {
            ctx.fillStyle = '#FFD700'; // ذهبي
            ctx.fillText(`💰 +${rewards.mora} Mora`, rewardX, 240);
            rewardX += 200;
        }
        // نص الصحة
        if (rewards.hp) {
            ctx.fillStyle = '#ff4d4d'; // أحمر
            ctx.fillText(`❤️ +${rewards.hp} HP`, rewardX, 240);
        }
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'levelup.png' });
}

module.exports = { generateLevelUpCard };
