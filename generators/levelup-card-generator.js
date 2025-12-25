const Canvas = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

// 🔥 تسجيل الخط العربي الفخم الموجود في ملفاتك 🔥
try {
    const rootDir = process.cwd();
    Canvas.registerFont(path.join(rootDir, 'fonts', 'bein-ar-normal.ttf'), { family: 'BeinAr' });
} catch (e) {
    console.log("❌ لم يتم العثور على الخط bein-ar-normal.ttf، سيتم استخدام الخط الافتراضي.");
}

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

function applyText(canvas, text, baseSize) {
    const ctx = canvas.getContext('2d');
    let fontSize = baseSize;
    do {
        // 🔥 استخدام الخط العربي المخصص 🔥
        ctx.font = `bold ${fontSize -= 2}px "BeinAr", "Arial"`; 
    } while (ctx.measureText(text).width > canvas.width - 350);
    return ctx.font;
}

async function generateLevelUpCard(member, oldLevel, newLevel, rewards) {
    const canvas = Canvas.createCanvas(900, 280);
    const ctx = canvas.getContext('2d');

    // الخلفية (تدرج لوني فخم)
    const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grd.addColorStop(0, '#141E30'); 
    grd.addColorStop(1, '#243B55'); 
    ctx.fillStyle = grd;
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // زخرفة
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // الإطار المتوهج
    ctx.shadowColor = '#00d2ff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // صورة العضو
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

    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#00d2ff';
    ctx.stroke();

    // النصوص
    const textX = 280;
    
    ctx.fillStyle = '#00d2ff';
    ctx.font = 'bold 30px "BeinAr", "Arial"';
    ctx.fillText('LEVEL UP!', textX, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = applyText(canvas, member.displayName, 50);
    ctx.fillText(member.displayName, textX, 125);

    ctx.fillStyle = '#a8c0ff';
    ctx.font = 'bold 35px "BeinAr", "Arial"';
    ctx.fillText(`Lvl ${oldLevel}`, textX, 180);

    ctx.fillStyle = '#00d2ff';
    ctx.fillText('➜', textX + 110, 180);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 50px "BeinAr", "Arial"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 10;
    ctx.fillText(`${newLevel}`, textX + 160, 185);
    ctx.shadowBlur = 0;

    // شريط المكافآت
    if (rewards) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        drawRoundedRect(ctx, textX, 210, 500, 45, 10);
        ctx.fill();

        ctx.font = 'bold 22px "BeinAr", "Arial"';
        let rewardX = textX + 15;
        
        if (rewards.mora) {
            ctx.fillStyle = '#FFD700'; 
            ctx.fillText(`💰 +${rewards.mora} Mora`, rewardX, 240);
            rewardX += 200;
        }
        if (rewards.hp) {
            ctx.fillStyle = '#ff4d4d'; 
            ctx.fillText(`❤️ +${rewards.hp} HP`, rewardX, 240);
        }
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'levelup.png' });
}

module.exports = { generateLevelUpCard };
