const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

async function getCachedImage(imageUrl) {
    if (!imageUrl) return null;
    let finalUrl = imageUrl;
    if (!finalUrl.startsWith('http')) finalUrl = `${R2_URL}/${finalUrl.replace(/\\/g, '/')}`;
    const encodedUrl = encodeURI(finalUrl);

    if (imageCache.has(encodedUrl)) return imageCache.get(encodedUrl);
    try {
        const img = await loadImage(encodedUrl);
        imageCache.set(encodedUrl, img);
        return img;
    } catch (e) { return null; }
}

const RARITY_INFO = {
    'Common': { text: 'عـادي', color: '#B0BEC5', stars: '★' },
    'Uncommon': { text: 'غـيـر شـائـع', color: '#2ECC71', stars: '★★' },
    'Rare': { text: 'نــادر', color: '#3498DB', stars: '★★★' },
    'Epic': { text: 'مـلـحـمـي', color: '#9B59B6', stars: '★★★★' },
    'Legendary': { text: 'أسـطـوري', color: '#F1C40F', stars: '★★★★★' }
};

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

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
}

async function generateGachaHub(userObj, moraBalance, flavorText) {
    const width = 1200;
    const height = 650; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية أساسية
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    bgGrad.addColorStop(0, '#1a1025');
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // نجوم الخلفية
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // توهج خلف الصندوق
    const chestGlow = ctx.createRadialGradient(width/2, height/2 + 30, 20, width/2, height/2 + 30, 400);
    chestGlow.addColorStop(0, 'rgba(185, 104, 255, 0.4)');
    chestGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = chestGlow;
    ctx.fillRect(0, 0, width, height);

    // رسم الصندوق في المنتصف
    const chestUrl = `${R2_URL}/images/gacha/main_chest.png`;
    const chestImg = await getCachedImage(chestUrl);
    if (chestImg) {
        ctx.shadowColor = '#B968FF';
        ctx.shadowBlur = 80;
        ctx.drawImage(chestImg, width/2 - 220, height/2 - 100, 440, 440);
        ctx.shadowBlur = 0;
    }

    // =====================================
    // 1. الهيدر العلوي الشفاف
    // =====================================
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, 140);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, 138, width, 2);

    // =====================================
    // 2. صندوق الأفاتار واسم اللاعب (يسار)
    // =====================================
    const profileW = 320;
    const profileH = 100;
    const profileX = 40;
    const profileY = 20;

    // خلفية صندوق البروفايل
    ctx.fillStyle = 'rgba(20, 25, 35, 0.8)';
    ctx.beginPath(); roundRect(ctx, profileX, profileY, profileW, profileH, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();

    const avatarSize = 70;
    const avatarX = profileX + 20 + avatarSize/2;
    const avatarY = profileY + profileH/2;

    // رسم الأفاتار
    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    try {
        const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) {}
    ctx.restore();
    
    // إطار الأفاتار
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.stroke();

    // اسم اللاعب
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    let dName = userObj.displayName || userObj.username;
    drawAutoScaledText(ctx, dName, avatarX + Number(avatarSize/2) + 15, avatarY, profileW - avatarSize - 40, 26, 14);
    ctx.shadowBlur = 0;

    // =====================================
    // 3. صندوق رصيد المورا (يمين)
    // =====================================
    const moraW = 320;
    const moraH = 100;
    const moraX = width - moraW - 40;
    const moraY = 20;

    ctx.fillStyle = 'rgba(20, 25, 35, 0.8)';
    ctx.beginPath(); roundRect(ctx, moraX, moraY, moraW, moraH, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#A8B8D0';
    ctx.font = 'bold 20px "Bein"';
    ctx.fillText("الرصيد المتوفر", moraX + moraW/2, moraY + 15);

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px "Bein"';
    ctx.fillText(`${moraBalance.toLocaleString()} 🪙`, moraX + moraW/2, moraY + moraH - 30);

    // =====================================
    // 4. لوحة الأسعار (المنتصف)
    // =====================================
    const pricePanelW = 350;
    const pricePanelH = 110;
    const pricePanelX = (width - pricePanelW) / 2;
    const pricePanelY = 160;

    // خلفية زجاجية للأسعار
    ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
    ctx.beginPath(); roundRect(ctx, pricePanelX, pricePanelY, pricePanelW, pricePanelH, 20); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#B968FF'; ctx.stroke();
    
    // عنوان اللوحة
    ctx.fillStyle = '#B968FF';
    ctx.font = 'bold 22px "Bein"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText("تكلفة الاستدعاء", pricePanelX + pricePanelW/2, pricePanelY + 15);

    // خط فاصل
    ctx.beginPath();
    ctx.moveTo(pricePanelX + 50, pricePanelY + 45);
    ctx.lineTo(pricePanelX + pricePanelW - 50, pricePanelY + 45);
    ctx.strokeStyle = 'rgba(185, 104, 255, 0.3)';
    ctx.stroke();

    // الأسعار
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px "Bein"';
    ctx.textAlign = 'right';
    ctx.fillText("1 صندوق", pricePanelX + pricePanelW - 40, pricePanelY + 55);
    ctx.fillText("10 صناديق", pricePanelX + pricePanelW - 40, pricePanelY + 80);

    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'left';
    ctx.fillText("1,000 🪙", pricePanelX + 40, pricePanelY + 55);
    ctx.fillText("10,000 🪙", pricePanelX + 40, pricePanelY + 80);

    // =====================================
    // 5. العبارة العشوائية (أسفل الشاشة)
    // =====================================
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#E0E0E0';
    ctx.font = 'bold 28px "Bein"';
    ctx.shadowColor = '#FFD700'; 
    ctx.shadowBlur = 15;
    ctx.fillText(flavorText, width/2, height - 50);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

async function generateGachaCard(item, rarity) {
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const rInfo = RARITY_INFO[rarity] || RARITY_INFO['Common'];
    const auraUrl = `${R2_URL}/images/materials/auras/${rarity}.png`;
    const auraImg = await getCachedImage(auraUrl);
    
    if (auraImg) {
        ctx.drawImage(auraImg, 0, 0, width, height);
    } else {
        const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
        grad.addColorStop(0, rInfo.color);
        grad.addColorStop(1, '#050505');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    const centerGlow = ctx.createRadialGradient(width/2, height/2 - 60, 20, width/2, height/2 - 60, 350);
    centerGlow.addColorStop(0, `${rInfo.color}60`);
    centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    let itemDrawn = false;
    if (item.imgPath) {
        const itemImg = await getCachedImage(item.imgPath);
        if (itemImg) {
            const itemSize = 380; 
            const ix = (width - itemSize) / 2;
            const iy = (height - itemSize) / 2 - 80;
            ctx.shadowColor = rInfo.color;
            ctx.shadowBlur = 100;
            ctx.drawImage(itemImg, ix, iy, itemSize, itemSize);
            ctx.shadowBlur = 0; 
            itemDrawn = true;
        }
    }

    if (!itemDrawn) {
        const cx = width / 2;
        const cy = height / 2 - 80;
        ctx.shadowColor = rInfo.color;
        ctx.shadowBlur = 120;
        ctx.fillStyle = rInfo.color;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 120); ctx.lineTo(cx + 80, cy); ctx.lineTo(cx, cy + 120); ctx.lineTo(cx - 80, cy);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 120); ctx.lineTo(cx + 80, cy); ctx.lineTo(cx, cy + 120);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '90px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('✨', cx, cy + 10);
    }

    const bottomGrad = ctx.createLinearGradient(0, height - 350, 0, height);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - 350, width, 350);

    ctx.textAlign = 'center';
    ctx.font = '50px Arial';
    ctx.fillStyle = '#F1C40F';
    ctx.shadowColor = '#D4AC0D';
    ctx.shadowBlur = 20;
    ctx.fillText(rInfo.stars, width / 2, height - 200);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 75px "Bein"';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.strokeText(item.name, width / 2, height - 100);
    const textGrad = ctx.createLinearGradient(0, height - 180, 0, height - 100);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(1, '#D0D0D0');
    ctx.fillStyle = textGrad;
    ctx.fillText(item.name, width / 2, height - 100);

    let typeText = "أداة غامضة";
    if (item.type === 'material') typeText = "مورد تصنيع عتيق";
    if (item.type === 'book') typeText = "مخطوطة سحرية";
    if (item.type === 'skill') typeText = "مـهـارة خـارقـة";

    ctx.font = 'bold 32px "Bein"';
    ctx.fillStyle = rInfo.color; 
    ctx.fillText(`✦ ${typeText} ✦`, width / 2, height - 40);

    ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    return canvas.toBuffer('image/png');
}

module.exports = { generateGachaCard, generateGachaHub };
