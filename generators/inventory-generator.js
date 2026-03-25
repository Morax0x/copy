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
    'Common': '#A8B8D0',      
    'Uncommon': '#2ECC71',    
    'Rare': '#00C3FF',        
    'Epic': '#B968FF',        
    'Legendary': '#FFD700'    
};

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
}

function drawOrnateFrame(ctx, x, y, w, h, color) {
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    const cl = 20; 
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawRibbon(ctx, x, y, w, h, color) {
    const ext = 10; 
    ctx.fillStyle = 'rgba(5, 5, 8, 0.95)';
    ctx.beginPath();
    ctx.moveTo(x - ext, y);
    ctx.lineTo(x + w + ext, y);
    ctx.lineTo(x + w + ext - 8, y + h / 2);
    ctx.lineTo(x + w + ext, y + h);
    ctx.lineTo(x - ext, y + h);
    ctx.lineTo(x - ext + 8, y + h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

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

function drawShield(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y - h/2); 
    ctx.lineTo(x + w/2, y - h/4); 
    ctx.lineTo(x + w/2, y + h/5); 
    ctx.quadraticCurveTo(x + w/2, y + h/2, x, y + h/2); 
    ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/5); 
    ctx.lineTo(x - w/2, y - h/4); 
    ctx.closePath();
}

function drawMagicCircle(ctx, cx, cy, radius, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, radius - 15, 0, Math.PI * 2); ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0; i<3; i++) {
        const angle1 = (Math.PI * 2 / 3) * i - Math.PI/2;
        const angle2 = (Math.PI * 2 / 3) * i + Math.PI/6;
        ctx.moveTo(radius * Math.cos(angle1), radius * Math.sin(angle1));
        ctx.lineTo(radius * Math.cos(angle2), radius * Math.sin(angle2));
    }
    ctx.stroke();
    ctx.restore();
}

async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages, selectedIndex = 0) {
    const width = 1200; 
    const height = 900; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); 
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const headerH = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; 
    ctx.font = 'bold 55px "Bein"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.fillText(`✦ خـزائـن ${userDisplayName} ✦`, width / 2, 60);
    
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '26px "Bein"';
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "3px";
    ctx.fillText(`⟪ ${categoryTitle} ⟫`, width / 2, 110);

    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Bein"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`[ ${page} / ${totalPages || 1} ]`, width - 30, 70);

    const cols = 5;
    const rows = 3;
    const slotSize = 175; 
    const gapX = 45;      
    const gapY = 55;      
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 180; 

    if (!items || items.length === 0) {
        for (let i = 0; i < 15; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (slotSize + gapX);
            const y = startY + row * (slotSize + gapY);
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');

            if (i === selectedIndex) {
                ctx.save();
                const cl = 20;
                ctx.beginPath();
                ctx.moveTo(x + cl, y);
                ctx.lineTo(x + slotSize - cl, y);
                ctx.lineTo(x + slotSize, y + cl);
                ctx.lineTo(x + slotSize, y + slotSize - cl);
                ctx.lineTo(x + slotSize - cl, y + slotSize);
                ctx.lineTo(x + cl, y + slotSize);
                ctx.lineTo(x, y + slotSize - cl);
                ctx.lineTo(x, y + cl);
                ctx.closePath();

                ctx.shadowColor = '#00FFFF';
                ctx.shadowBlur = 25;
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 4;
                ctx.stroke();

                ctx.shadowBlur = 50;
                ctx.strokeStyle = '#00FFFF';
                ctx.lineWidth = 6;
                ctx.stroke();

                ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
                ctx.fill();
                ctx.restore();
            }
        }
        
        const emptyBoxW = 600;
        const emptyBoxH = 120;
        const emptyBoxX = (width - emptyBoxW) / 2;
        const emptyBoxY = (height + headerH - emptyBoxH) / 2 - 20;

        ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
        ctx.beginPath(); roundRect(ctx, emptyBoxX, emptyBoxY, emptyBoxW, emptyBoxH, 20); ctx.fill();
        ctx.strokeStyle = '#B968FF'; ctx.lineWidth = 3; ctx.stroke();
        
        ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 40px "Bein"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❌ هذا القسم فارغ تماماً', width / 2, emptyBoxY + emptyBoxH / 2);
        ctx.shadowBlur = 0;

        return canvas.toBuffer('image/png', { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
    }

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);

        const item = items && items[i] ? items[i] : null;
        
        if (!item) {
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');
        } else {
            const rarityColor = item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#222';
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, rarityColor);

            const aura = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.2);
            aura.addColorStop(0, `${rarityColor}60`); 
            aura.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = aura;
            ctx.fillRect(x, y, slotSize, slotSize);

            let imgDrawn = false;
            if (item.imgPath) {
                const imgPath = path.join(process.cwd(), item.imgPath);
                const img = await getCachedImage(imgPath);
                if (img) {
                    const padding = 25; 
                    const imgSize = slotSize - (padding * 2);
                    
                    ctx.shadowColor = rarityColor;
                    ctx.shadowBlur = 40;
                    ctx.drawImage(img, x + padding, y + padding - 15, imgSize, imgSize);
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
                ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2 - 15);
                ctx.shadowBlur = 0;
            }

            const ribbonH = 35;
            const ribbonY = y + slotSize - 20;
            drawRibbon(ctx, x, ribbonY, slotSize, ribbonH, rarityColor);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFFFFF';
            drawAutoScaledText(ctx, item.name, x + slotSize / 2, ribbonY + ribbonH / 2, slotSize - 20, 16, 10);

            const qtyText = item.quantity > 999 ? '999+' : item.quantity.toString();
            ctx.font = 'bold 15px "Arial"';
            const textW = ctx.measureText(qtyText).width;
            const badgeRadius = Math.max(16, textW / 2 + 6);
            const badgeX = x + slotSize; 
            const badgeY = y;

            ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI*2);
            ctx.fillStyle = rarityColor;
            ctx.shadowColor = '#000'; ctx.shadowBlur = 10; ctx.fill();
            
            ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius - 2, 0, Math.PI*2);
            ctx.fillStyle = '#111'; ctx.shadowBlur = 0; ctx.fill();

            ctx.fillStyle = '#FFF';
            ctx.fillText(qtyText, badgeX, badgeY + 1);
        }

        if (i === selectedIndex) {
            ctx.save();
            const cl = 20;
            ctx.beginPath();
            ctx.moveTo(x + cl, y);
            ctx.lineTo(x + slotSize - cl, y);
            ctx.lineTo(x + slotSize, y + cl);
            ctx.lineTo(x + slotSize, y + slotSize - cl);
            ctx.lineTo(x + slotSize - cl, y + slotSize);
            ctx.lineTo(x + cl, y + slotSize);
            ctx.lineTo(x, y + slotSize - cl);
            ctx.lineTo(x, y + cl);
            ctx.closePath();

            ctx.shadowColor = '#00FFFF';
            ctx.shadowBlur = 25;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.shadowBlur = 50;
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 6;
            ctx.stroke();

            ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
            ctx.fill();
            ctx.restore();
        }
    }

    return canvas.toBuffer('image/png', { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
}

async function generateMainHub(userObj, displayName, moraBalance, rankLetter, raceName, weaponName) {
    const width = 1100;
    const height = 650;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryColor = '#FFD700'; 

    const bgPath = path.join(process.cwd(), 'images/inventory/desk_bg.png');
    const bgImg = await getCachedImage(bgPath);
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        const vignette = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
        vignette.addColorStop(0, 'rgba(0,0,0,0.2)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.98)'); 
        ctx.fillStyle = vignette;
        ctx.fillRect(0,0,width,height);
    } else {
        ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, width, height);
    }

    const idX = 60, idY = 60, idW = 380, idH = 530;
    
    ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 50;
    ctx.beginPath(); roundRect(ctx, idX, idY, idW, idH, 20); ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2;
    ctx.strokeRect(idX + 15, idY + 15, idW - 30, idH - 30);
    const cl = 30; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(idX+15, idY+15+cl); ctx.lineTo(idX+15, idY+15); ctx.lineTo(idX+15+cl, idY+15);
    ctx.moveTo(idX+idW-15-cl, idY+15); ctx.lineTo(idX+idW-15, idY+15); ctx.lineTo(idX+idW-15, idY+15+cl);
    ctx.moveTo(idX+idW-15, idY+idH-15-cl); ctx.lineTo(idX+idW-15, idY+idH-15); ctx.lineTo(idX+idW-15-cl, idY+idH-15);
    ctx.moveTo(idX+15+cl, idY+idH-15); ctx.lineTo(idX+15, idY+idH-15); ctx.lineTo(idX+15, idY+idH-15-cl);
    ctx.stroke();

    const avatarSize = 160;
    const avatarX = idX + idW / 2; 
    const avatarY = idY + 130; 

    const glowAv = ctx.createRadialGradient(avatarX, avatarY, 10, avatarX, avatarY, 120);
    glowAv.addColorStop(0, 'rgba(255, 215, 0, 0.4)'); glowAv.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowAv; ctx.fillRect(avatarX-120, avatarY-120, 240, 240);

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    try {
        const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) { ctx.fillStyle = '#333'; ctx.fill(); }
    ctx.restore();

    const borderAvGrad = ctx.createLinearGradient(avatarX - avatarSize/2, avatarY - avatarSize/2, avatarX + avatarSize/2, avatarY + avatarSize/2);
    borderAvGrad.addColorStop(0, primaryColor); borderAvGrad.addColorStop(0.5, '#ffffff'); borderAvGrad.addColorStop(1, primaryColor);
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = borderAvGrad; ctx.stroke();

    const badgeW = 75, badgeH = 85;
    const badgeX = avatarX;
    const badgeY = avatarY + (avatarSize / 2) + 5; 

    ctx.save();
    drawShield(ctx, badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = 'rgba(10, 10, 15, 0.98)';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 20; ctx.fill();
    
    ctx.lineWidth = 3; ctx.strokeStyle = primaryColor; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
    
    ctx.fillStyle = primaryColor; ctx.font = 'bold 36px "Arial"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 10;
    ctx.fillText(rankLetter, badgeX, badgeY + 6);
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 15;
    drawAutoScaledText(ctx, displayName, avatarX, badgeY + 75, idW - 60, 45, 20); 
    ctx.shadowBlur = 0;

    const tagX = idX + 40, tagY = badgeY + 115, tagW = idW - 80, tagH = 45;
    ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
    ctx.beginPath(); roundRect(ctx, tagX, tagY, tagW, tagH, 10); ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'; ctx.lineWidth = 1;
    roundRect(ctx, tagX, tagY, tagW, tagH, 10); ctx.stroke();
    
    ctx.beginPath(); ctx.moveTo(tagX + tagW/2, tagY + 5); ctx.lineTo(tagX + tagW/2, tagY + tagH - 5);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();

    const halfTagW = (tagW / 2) - 10; 
    ctx.fillStyle = '#E0E0E0';
    drawAutoScaledText(ctx, `🩸 ${raceName}`, tagX + tagW/4, tagY + tagH/2, halfTagW, 18, 12);
    
    ctx.fillStyle = '#F1C40F';
    drawAutoScaledText(ctx, `⚔️ ${weaponName}`, tagX + (tagW * 0.75), tagY + tagH/2, halfTagW, 18, 12);

    const moraX = idX + 60, moraY = tagY + 65, moraW = idW - 120, moraH = 55;
    const goldGradBox = ctx.createLinearGradient(moraX, moraY, moraX + moraW, moraY);
    goldGradBox.addColorStop(0, 'rgba(255, 215, 0, 0.2)'); goldGradBox.addColorStop(0.5, 'rgba(255, 215, 0, 0)'); goldGradBox.addColorStop(1, 'rgba(255, 215, 0, 0.2)');
    
    ctx.fillStyle = goldGradBox;
    ctx.beginPath(); roundRect(ctx, moraX, moraY, moraW, moraH, 15); ctx.fill();
    
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2;
    ctx.beginPath(); roundRect(ctx, moraX, moraY, moraW, moraH, 15); ctx.stroke();
    
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    const moraText = `${moraBalance.toLocaleString()} 🪙`;
    drawAutoScaledText(ctx, moraText, idX + idW/2, moraY + moraH/2 + 2, moraW - 20, 30, 16);
    ctx.shadowBlur = 0;

    const bagX = 780, bagY = 320;
    
    ctx.save();
    ctx.translate(bagX, bagY + 120);
    ctx.scale(1, 0.35); 
    
    const hGlow = ctx.createRadialGradient(0, 0, 20, 0, 0, 250);
    hGlow.addColorStop(0, 'rgba(185, 104, 255, 0.6)'); hGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hGlow;
    ctx.beginPath(); ctx.arc(0, 0, 250, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = '#B968FF'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 200, 0, Math.PI*2); ctx.stroke();
    
    ctx.strokeStyle = 'rgba(185, 104, 255, 0.5)'; ctx.lineWidth = 1;
    ctx.setLineDash([15, 10]);
    ctx.beginPath(); ctx.arc(0, 0, 220, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const beam = ctx.createLinearGradient(0, bagY + 120, 0, bagY - 200);
    beam.addColorStop(0, 'rgba(185, 104, 255, 0.3)');
    beam.addColorStop(1, 'rgba(185, 104, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(bagX - 200, bagY + 120); ctx.lineTo(bagX + 200, bagY + 120); ctx.lineTo(bagX + 100, bagY - 200); ctx.lineTo(bagX - 100, bagY - 200); ctx.fill();

    const bagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
    const bagImg = await getCachedImage(bagPath);
    if (bagImg) {
        ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 60; 
        ctx.drawImage(bagImg, bagX - 225, bagY - 225, 450, 450); 
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png', { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
}

module.exports = { generateInventoryCard, generateMainHub };
