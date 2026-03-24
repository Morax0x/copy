const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Inventory Generator] ⚠️ تنبيه: لم يتم العثور على خط Bein.");
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
    'Common': '#8b9bb4',      
    'Uncommon': '#10b981',    
    'Rare': '#0ea5e9',        
    'Epic': '#a855f7',        
    'Legendary': '#f59e0b'    
};

// ==========================================
// 🔥 دوال هندسية متوحشة (Extreme Shapes) 🔥
// ==========================================

// 1. رسم شكل مقطوع الحواف (Sci-Fi Cut Rectangle)
function drawCutRect(ctx, x, y, w, h, cut) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

// 2. رسم شكل سداسي (Hexagon)
function drawHexagon(ctx, x, y, radius) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = x + radius * Math.cos(angle);
        const py = y + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

// 3. علامات التصويب (HUD Crosshairs)
function drawCrosshair(ctx, x, y, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - size, y); ctx.lineTo(x - size/3, y);
    ctx.moveTo(x + size, y); ctx.lineTo(x + size/3, y);
    ctx.moveTo(x, y - size); ctx.lineTo(x, y - size/3);
    ctx.moveTo(x, y + size); ctx.lineTo(x, y + size/3);
    ctx.stroke();
}

// ========================================================
// 🔥 دالة 1: مصفوفة الأبعاد لأقسام الحقيبة (The Matrix Grid)
// ========================================================
async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages) {
    const width = 1200; // حجم سينمائي ضخم
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryTheme = '#0ea5e9'; // لون التكنولوجيا السحرية

    // 1. الخلفية (Deep Abyss Nebula)
    const bgBase = ctx.createRadialGradient(width/2, height/2, 50, width/2, height/2, 800);
    bgBase.addColorStop(0, '#0f172a'); 
    bgBase.addColorStop(1, '#020617');
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, width, height);

    // 2. مصفوفة الخلايا السداسية في الخلفية (Hex Matrix Overlay)
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.05)';
    ctx.lineWidth = 1;
    const hexRadius = 40;
    for (let y = 0; y < height + hexRadius; y += hexRadius * 1.5) {
        for (let x = 0; x < width + hexRadius; x += hexRadius * Math.sqrt(3)) {
            const offsetX = (Math.floor(y / (hexRadius * 1.5)) % 2) * (hexRadius * Math.sqrt(3) / 2);
            drawHexagon(ctx, x + offsetX, y, hexRadius);
            ctx.stroke();
        }
    }

    // 3. أشرطة بيانات خلفية (Data Lines)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, 150, width, 2);
    ctx.fillRect(0, height - 80, width, 2);
    for(let i=0; i<10; i++) {
        ctx.fillRect(Math.random()*width, 0, Math.random()*3, height);
    }

    // 4. إطار الـ HUD الخارجي
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
    drawCutRect(ctx, 15, 15, width - 30, height - 30, 40);
    ctx.stroke();
    drawCrosshair(ctx, 15, 15, 20, primaryTheme);
    drawCrosshair(ctx, width - 15, 15, 20, primaryTheme);
    drawCrosshair(ctx, 15, height - 15, 20, primaryTheme);
    drawCrosshair(ctx, width - 15, height - 15, 20, primaryTheme);

    // 5. الهيدر (Sci-Fi Banner)
    ctx.save();
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 120);
    headerGrad.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
    headerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = headerGrad;
    drawCutRect(ctx, 50, 0, width - 100, 120, 30);
    ctx.fill();

    ctx.strokeStyle = primaryTheme;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 120);
    ctx.lineTo(width - 50, 120);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px "Bein"';
    ctx.shadowColor = primaryTheme;
    ctx.shadowBlur = 20;
    ctx.fillText(`❖ مـسـتـودع ${userDisplayName} ❖`, width / 2, 50);
    
    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px "Bein"';
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "5px"; // لمسة احترافية
    ctx.fillText(`[ ${categoryTitle} / SYSTEM.ONLINE ]`, width / 2, 95);

    // 6. المربعات المقطوعة (The HUD Slots)
    const cols = 5;
    const rows = 3;
    const slotW = 170; 
    const slotH = 180;
    const gapX = 45;      
    const gapY = 45;      
    
    const startX = (width - ((cols * slotW) + ((cols - 1) * gapX))) / 2;
    const startY = 170;

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotW + gapX);
        const y = startY + row * (slotH + gapY);

        const item = items[i];
        const rarityColor = item && item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#1e293b';

        // رسم قاعدة الـ Slot (Cut Rect)
        ctx.fillStyle = item ? 'rgba(15, 23, 42, 0.8)' : 'rgba(15, 23, 42, 0.3)';
        drawCutRect(ctx, x, y, slotW, slotH, 15);
        ctx.fill();

        ctx.strokeStyle = item ? rarityColor : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = item ? 2 : 1;
        ctx.stroke();

        // رسم زوايا تكنولوجية للـ Slot
        ctx.strokeStyle = item ? '#ffffff' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 15, y); ctx.lineTo(x + 30, y); // Top left
        ctx.moveTo(x, y + 15); ctx.lineTo(x, y + 30);
        ctx.stroke();

        if (item) {
            // ==========================================
            // 🔥 القرص الهولوجرامي أسفل العنصر (Hologram Pedestal) 🔥
            // ==========================================
            ctx.save();
            ctx.translate(x + slotW / 2, y + slotH - 60);
            ctx.scale(1, 0.3); // ضغط الدائرة لتصبح شكل بيضاوي 3D
            
            const pedGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, slotW / 2 - 20);
            pedGrad.addColorStop(0, `${rarityColor}80`); // قلب مشع
            pedGrad.addColorStop(0.8, `${rarityColor}20`);
            pedGrad.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.fillStyle = pedGrad;
            ctx.beginPath();
            ctx.arc(0, 0, slotW / 2 - 20, 0, Math.PI * 2);
            ctx.fill();
            
            // حلقة طاقة حول القرص
            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.restore();

            // رسم العنصر
            let imgDrawn = false;
            if (item.imgPath) {
                const imgPath = path.join(process.cwd(), item.imgPath);
                const img = await getCachedImage(imgPath);
                if (img) {
                    const padding = 30; 
                    const imgSize = slotW - (padding * 2);
                    
                    // ظل رهيب يعطي طفو
                    ctx.shadowColor = rarityColor;
                    ctx.shadowBlur = 35;
                    // تحريك الصورة للأسفل قليلاً لتجلس على القرص
                    ctx.drawImage(img, x + padding, y + padding - 10, imgSize, imgSize);
                    ctx.shadowBlur = 0; 
                    imgDrawn = true;
                }
            }

            if (!imgDrawn) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '65px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = rarityColor;
                ctx.shadowBlur = 30;
                ctx.fillText(item.emoji || '📦', x + slotW / 2, y + slotH / 2 - 15);
                ctx.shadowBlur = 0;
            }

            // ==========================================
            // 🔥 شريط الاسم الفخم (Angled Ribbon) 🔥
            // ==========================================
            ctx.fillStyle = `rgba(0, 0, 0, 0.8)`;
            drawCutRect(ctx, x + 5, y + slotH - 35, slotW - 10, 30, 8);
            ctx.fill();

            // خط جانبي نيون
            ctx.fillStyle = rarityColor;
            ctx.fillRect(x + 5, y + slotH - 35 + 8, 4, 14);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 14px "Bein"';
            ctx.fillStyle = '#f8fafc';
            let shortName = item.name;
            if (shortName.length > 14) shortName = shortName.substring(0, 13) + '..';
            ctx.fillText(shortName, x + slotW / 2, y + slotH - 20);

            // ==========================================
            // 🔥 شارة الكمية (Hexagon Badge) 🔥
            // ==========================================
            const badgeRadius = 18;
            const badgeX = x + slotW - 10;
            const badgeY = y + 15;

            ctx.fillStyle = '#020617';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 10;
            drawHexagon(ctx, badgeX, badgeY, badgeRadius);
            ctx.fill();

            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;

            const qtyText = item.quantity > 999 ? '999+' : item.quantity.toString();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px "Arial"';
            ctx.fillText(qtyText, badgeX, badgeY + 1);
        }
    }

    // تذييل الصفحة (HUD Footer)
    ctx.fillStyle = 'rgba(14, 165, 233, 0.1)';
    drawCutRect(ctx, width / 2 - 150, height - 50, 300, 40, 15);
    ctx.fill();
    ctx.strokeStyle = primaryTheme;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = primaryTheme;
    ctx.fillRect(width / 2 - 150 + 10, height - 35, 10, 10);
    ctx.fillRect(width / 2 + 150 - 20, height - 35, 10, 10);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px "Bein"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PAGE ${page} / ${totalPages || 1}  |  STATUS: SYNCED`, width / 2, height - 30);

    return canvas.toBuffer('image/png');
}

// ========================================================
// 🔥 دالة 2: الخيمة الملكية (Royal Altar Hub) 🔥
// (تمت ترقيتها لتتناسب مع الفخامة الجديدة)
// ========================================================
async function generateMainHub(userObj, displayName, moraBalance) {
    const width = 900;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية
    const bgPath = path.join(process.cwd(), 'images/inventory/desk_bg.png');
    const bgImg = await getCachedImage(bgPath);
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        // تغميق الأطراف للدراما
        const vignette = ctx.createRadialGradient(width/2, height/2, 200, width/2, height/2, 600);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0,0,width,height);
    } else {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, width, height);
    }

    // لوحة زجاجية للبيانات
    ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 30;
    drawCutRect(ctx, 40, 40, 350, 420, 30);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // دائرة سحرية خلف البروفايل
    ctx.translate(215, 150);
    for(let i=0; i<8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.strokeRect(-80, -80, 160, 160);
    }
    ctx.resetTransform();

    // صورة اللاعب
    const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
    try {
        const avatarImg = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        drawHexagon(ctx, 215, 150, 80); // البروفايل صار سداسي!
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, 135, 70, 160, 160);
        ctx.restore();

        ctx.beginPath();
        drawHexagon(ctx, 215, 150, 80);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#f59e0b';
        ctx.stroke();
    } catch(e) {}

    // النصوص
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px "Bein"';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.fillText(displayName, 215, 290);

    ctx.fillStyle = '#222';
    drawCutRect(ctx, 80, 330, 270, 50, 10);
    ctx.fill();

    ctx.font = 'bold 26px "Bein"';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`المورا: ${moraBalance.toLocaleString()}`, 215, 355);

    ctx.font = '20px "Bein"';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('الأنظمة متصلة .. الحقيبة جاهزة', 215, 420);
    ctx.shadowBlur = 0;

    // الحقيبة تطفو
    const bagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
    const bagImg = await getCachedImage(bagPath);
    if (bagImg) {
        // دائرة استدعاء تحت الحقيبة
        ctx.save();
        ctx.translate(630, 380);
        ctx.scale(1, 0.25);
        ctx.beginPath();
        ctx.arc(0, 0, 180, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.restore();

        ctx.shadowColor = '#a855f7'; 
        ctx.shadowBlur = 60;
        ctx.drawImage(bagImg, 450, 50, 360, 360);
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateInventoryCard, generateMainHub };
