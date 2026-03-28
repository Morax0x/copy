const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/cairo-Pandaify'), 'Cairo');
} catch (e) {}

async function generateShopImage(user, userData, categoryItems, categoryName) {
    const columns = 3;
    const boxW = 280;
    const boxH = 300;
    const gapX = 30;
    const gapY = 30;
    const startX = 30;
    const startY = 160;

    const rows = Math.ceil(categoryItems.length / columns);
    const canvasHeight = Math.max(500, startY + (rows * (boxH + gapY)) + 20);
    const canvasWidth = 960;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#14141E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1E1E2C';
    ctx.beginPath();
    ctx.roundRect(20, 20, 920, 110, 15);
    ctx.fill();

    try {
        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(75, 75, 45, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 30, 30, 90, 90);
        ctx.restore();
    } catch (e) {}

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px "Cairo", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(user.username, 140, 65);

    ctx.font = '22px "Cairo", sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`الكاش: ${userData.mora || 0}`, 140, 105);
    
    ctx.fillStyle = '#4CAF50';
    ctx.fillText(`البنك: ${userData.bank || 0}`, 380, 105);

    ctx.fillStyle = '#A8A8B3';
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px "Cairo", sans-serif';
    ctx.fillText(`قسم: ${categoryName}`, 910, 85);

    for (let i = 0; i < categoryItems.length; i++) {
        const item = categoryItems[i];
        const row = Math.floor(i / columns);
        const col = i % columns;
        
        const x = startX + (col * (boxW + gapX));
        const y = startY + (row * (boxH + gapY));

        ctx.fillStyle = '#222233';
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 20);
        ctx.fill();

        ctx.strokeStyle = '#33334A';
        ctx.lineWidth = 2;
        ctx.stroke();

        try {
            const itemImage = await loadImage(item.image);
            ctx.drawImage(itemImage, x + 65, y + 20, 150, 150);
        } catch (e) {
            ctx.fillStyle = '#2A2A3E';
            ctx.beginPath();
            ctx.roundRect(x + 65, y + 20, 150, 150, 15);
            ctx.fill();
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px "Cairo", sans-serif';
        ctx.fillText(item.name, x + (boxW / 2), y + 210);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 22px "Cairo", sans-serif';
        ctx.fillText(`${item.price} مورا`, x + (boxW / 2), y + 250);

        ctx.fillStyle = '#4CAF50';
        ctx.font = '16px "Cairo", sans-serif';
        ctx.fillText(`🛒 متوفر`, x + (boxW / 2), y + 280);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateShopImage };
