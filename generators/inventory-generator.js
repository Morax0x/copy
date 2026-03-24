const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Inventory Generator] ⚠️ خطأ في تحميل الخط.");
}

const imageCache = new Map();
async function getCachedImage(imagePath) {
    if (!imagePath) return null;
    if (imageCache.has(imagePath)) return imageCache.get(imagePath);
    if (fs.existsSync(imagePath)) {
        try {
            const img = await loadImage(imagePath);
            imageCache.set(imagePath, img);
            return img;
        } catch (e) { return null; }
    }
    return null;
}

const RARITY_COLORS = {
    'Common': '#B0BEC5', 'Uncommon': '#2ECC71', 'Rare': '#3498DB', 'Epic': '#9B59B6', 'Legendary': '#F1C40F'
};

async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. رسم الخلفية
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1a1c23');
    grad.addColorStop(1, '#111217');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. تزيين الخلفية بنقوش خفيفة
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 3. كتابة العنوان (اسم اللاعب والقسم)
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 35px "Bein"';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.fillText(`🎒 حقيبة ${userDisplayName} - ${categoryTitle}`, width / 2, 60);
    ctx.shadowBlur = 0;

    // 4. إعدادات شبكة المربعات (Grid) - 5 أعمدة و 3 صفوف = 15 عنصر في الصفحة
    const cols = 5;
    const slotSize = 110;
    const gapX = 30;
    const gapY = 40;
    
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 120;

    // 5. رسم العناصر داخل المربعات
    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#B0BEC5') : '#444444';

        // رسم المربع (الخلفية)
        ctx.fillStyle = '#2a2d37';
        ctx.beginPath();
        ctx.roundRect(x, y, slotSize, slotSize, 15);
        ctx.fill();

        // رسم إطار المربع بلون الندرة
        ctx.strokeStyle = rarityColor;
        ctx.lineWidth = item ? 3 : 1;
        ctx.stroke();

        if (item) {
            // رسم صورة العنصر
            if (item.imgPath) {
                const imgPath = path.join(process.cwd(), item.imgPath);
                const img = await getCachedImage(imgPath);
                if (img) {
                    ctx.drawImage(img, x + 10, y + 10, slotSize - 20, slotSize - 20);
                } else {
                    ctx.fillStyle = rarityColor;
                    ctx.font = '40px Arial';
                    ctx.fillText('✨', x + slotSize / 2, y + slotSize / 2 + 15);
                }
            } else {
                ctx.fillStyle = rarityColor;
                ctx.font = '40px Arial';
                ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2 + 15);
            }

            // رسم عداد الكمية في الزاوية السفلية اليمنى
            const qtyText = `${item.quantity}`;
            ctx.font = 'bold 20px Arial';
            const textMetrics = ctx.measureText(qtyText);
            const textWidth = textMetrics.width;

            // خلفية رقم الكمية
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.roundRect(x + slotSize - textWidth - 15, y + slotSize - 25, textWidth + 15, 25, { tl: 10, br: 15 });
            ctx.fill();

            // النص
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'right';
            ctx.fillText(qtyText, x + slotSize - 5, y + slotSize - 6);
            ctx.textAlign = 'center'; // إعادة الضبط
        }
    }

    // 6. كتابة رقم الصفحة في الأسفل
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '20px "Bein"';
    ctx.fillText(`صفحة ${page} من ${totalPages || 1}`, width / 2, height - 25);

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard };
