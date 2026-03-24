const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Gacha Generator] ⚠️ تنبيه: لم يتم العثور على خط Bein.");
}

const imageCache = new Map();

async function getCachedImage(imagePath) {
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

const RARITY_INFO = {
    'Common': { text: 'عـادي', color: '#B0BEC5' },
    'Uncommon': { text: 'غـيـر شـائـع', color: '#2ECC71' },
    'Rare': { text: 'نــادر', color: '#3498DB' },
    'Epic': { text: 'مـلـحـمـي', color: '#9B59B6' },
    'Legendary': { text: 'أسـطـوري', color: '#F1C40F' }
};

async function generateGachaCard(item, rarity) {
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const rInfo = RARITY_INFO[rarity] || RARITY_INFO['Common'];

    // 🔥 التعديل هنا: جلب الهالات من داخل مجلد materials/auras
    const auraPath = path.join(process.cwd(), `images/materials/auras/${rarity}.png`);
    const auraImg = await getCachedImage(auraPath);
    
    if (auraImg) {
        ctx.drawImage(auraImg, 0, 0, width, height);
    } else {
        const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
        grad.addColorStop(0, rInfo.color);
        grad.addColorStop(1, '#0d0d0d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    let itemDrawn = false;

    // 🔥 رسم الأداة من المسار الدقيق الذي حددناه في gacha.js
    if (item.imgPath) {
        const itemPath = path.join(process.cwd(), item.imgPath);
        const itemImg = await getCachedImage(itemPath);
        
        if (itemImg) {
            const itemSize = 400; 
            const ix = (width - itemSize) / 2;
            const iy = (height - itemSize) / 2 - 40; 
            
            ctx.shadowColor = rInfo.color;
            ctx.shadowBlur = 70;
            ctx.drawImage(itemImg, ix, iy, itemSize, itemSize);
            ctx.shadowBlur = 0; 
            itemDrawn = true;
        }
    }

    if (!itemDrawn) {
        const cx = width / 2;
        const cy = height / 2 - 40;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 140, 0, Math.PI * 2);
        ctx.fillStyle = rInfo.color;
        ctx.shadowColor = rInfo.color;
        ctx.shadowBlur = 80;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(cx, cy, 110, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        ctx.font = '100px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✨', cx, cy + 10);
    }

    const bottomGrad = ctx.createLinearGradient(0, height - 300, 0, height);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.7)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - 300, width, 300);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic'; 

    ctx.font = 'bold 45px "Bein"';
    ctx.fillStyle = rInfo.color;
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 10;
    ctx.fillText(`✦ ${rInfo.text} ✦`, width / 2, 80);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 75px "Bein"';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText(item.name, width / 2, height - 120);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(item.name, width / 2, height - 120);

    let typeText = "أداة غامضة";
    if (item.type === 'material') typeText = "مورد تصنيع عتيق";
    if (item.type === 'book') typeText = "مخطوطة سحرية";
    if (item.type === 'skill') typeText = "مـهـارة خـارقـة";

    ctx.font = '35px "Bein"';
    ctx.fillStyle = '#A0A0A0'; 
    ctx.fillText(typeText, width / 2, height - 50);

    return canvas.toBuffer('image/png');
}

module.exports = { generateGachaCard };
