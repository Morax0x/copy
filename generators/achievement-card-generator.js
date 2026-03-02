const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

let arabicReshaper;
try { arabicReshaper = require('arabic-reshaper'); } catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try { return arabicReshaper.reshape(text); } catch (err) { return text; }
}

try { GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

async function generateAchievementCard(userAvatar, userName, achName, achDesc, rewardMora, rewardXp, repReward) {
    const width = 900;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 10, width/2, height/2, 600);
    bgGrad.addColorStop(0, '#3a1c00'); 
    bgGrad.addColorStop(1, '#0a0505'); 
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, 160);
    for (let i = 0; i < 16; i++) {
        ctx.rotate((Math.PI * 2) / 16);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(50, -600);
        ctx.lineTo(-50, -600);
        ctx.closePath();
        const rayGrad = ctx.createLinearGradient(0, 0, 0, -600);
        rayGrad.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
        rayGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = rayGrad;
        ctx.fill();
    }
    ctx.restore();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#FFD700'; 
    ctx.strokeRect(15, 15, width - 30, height - 30);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeRect(25, 25, width - 50, height - 50);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 45px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.fillText(fixAr("🎉 إنجـاز جـديـد مـفـتـوح 🎉"), width / 2, 75);
    ctx.shadowBlur = 0;

    const avatarSize = 130;
    const avatarX = (width / 2) - (avatarSize / 2);
    const avatarY = 110;

    try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(width/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const img = await loadImage(userAvatar);
        ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(width/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 5;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.shadowBlur = 0;
    } catch (e) {}

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Bein", sans-serif';
    ctx.fillText(fixAr(achName), width / 2, 290);

    ctx.fillStyle = '#CCCCCC';
    ctx.font = '24px "Bein", sans-serif';
    ctx.fillText(fixAr(achDesc), width / 2, 335);

    const pillW = 680;
    const pillH = 55;
    const pillX = (width / 2) - (pillW / 2);
    const pillY = 365;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 25);
    ctx.fill();
    ctx.stroke();

    let rewardsText = `المكافأة: ${rewardMora.toLocaleString()} M | ${rewardXp.toLocaleString()} XP`;
    if (repReward && repReward > 0) {
        rewardsText += ` | ${repReward.toLocaleString()} REP 🌟`;
    }

    ctx.fillStyle = '#00FF88'; 
    ctx.font = 'bold 26px "Bein", sans-serif';
    ctx.fillText(fixAr(rewardsText), width / 2, 403);

    return canvas.toBuffer('image/png');
}

module.exports = { generateAchievementCard };
