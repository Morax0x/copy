const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/cairo-Pandaify'), 'Cairo');
} catch (e) {}

async function generateShopImage(user, userData, currentItem, categoryName) {
    const canvas = createCanvas(900, 500);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1A1A24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#252533';
    ctx.beginPath();
    ctx.roundRect(20, 20, 860, 100, 15);
    ctx.fill();

    try {
        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(70, 70, 40, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 30, 30, 80, 80);
        ctx.restore();
    } catch (e) {}

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px "Cairo", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(user.username, 130, 60);

    ctx.font = '22px "Cairo", sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`الكاش: ${userData.mora || 0}`, 130, 95);
    
    ctx.fillStyle = '#4CAF50';
    ctx.fillText(`البنك: ${userData.bank || 0}`, 350, 95);

    ctx.fillStyle = '#A8A8B3';
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px "Cairo", sans-serif';
    ctx.fillText(`القسم: ${categoryName}`, 850, 75);

    ctx.fillStyle = '#2B2B3A';
    ctx.beginPath();
    ctx.roundRect(20, 140, 860, 340, 15);
    ctx.fill();

    if (currentItem) {
        try {
            const itemImage = await loadImage(currentItem.image);
            ctx.drawImage(itemImage, 50, 180, 250, 250);
        } catch (e) {
            ctx.fillStyle = '#3E3E50';
            ctx.beginPath();
            ctx.roundRect(50, 180, 250, 250, 15);
            ctx.fill();
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.font = 'bold 45px "Cairo", sans-serif';
        ctx.fillText(currentItem.name, 850, 210);

        ctx.fillStyle = '#CCCCCC';
        ctx.font = '26px "Cairo", sans-serif';
        
        const words = currentItem.description.split(' ');
        let line = '';
        let y = 280;
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > 500 && n > 0) {
                ctx.fillText(line, 850, y);
                line = words[n] + ' ';
                y += 40;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 850, y);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 38px "Cairo", sans-serif';
        ctx.fillText(`السعر: ${currentItem.price} مورا`, 850, 440);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateShopImage };
