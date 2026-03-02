const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

let arabicReshaper;
try { arabicReshaper = require('arabic-reshaper'); } catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try { return arabicReshaper.reshape(text); } catch (err) { return text; }
}

try { GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

function getRepRank(points) {
    if (points >= 1000) return { rank: 'SS', name: '👑 مغامـر رتبـة SS', color: '#FF0055', next: 'الحد الأقصى' };
    if (points >= 500)  return { rank: 'S',  name: '💎 مغامـر رتبـة S', color: '#00FFFF', next: 1000 };
    if (points >= 250)  return { rank: 'A',  name: '🥇 مغامـر رتبـة A', color: '#FFD700', next: 500 };
    if (points >= 100)  return { rank: 'B',  name: '🥈 مغامـر رتبـة B', color: '#C0C0C0', next: 250 };
    if (points >= 50)   return { rank: 'C',  name: '🥉 مغامـر رتبـة C', color: '#CD7F32', next: 100 };
    if (points >= 25)   return { rank: 'D',  name: '⚔️ مغامـر رتبـة D', color: '#2E8B57', next: 50 };
    if (points >= 10)   return { rank: 'E',  name: '🛡️ مغامـر رتبـة E', color: '#8B4513', next: 25 };
    return { rank: 'F', name: '🪵 مغامـر رتبـة F', color: '#A0522D', next: 10 };
}

function drawRandomPolygon(ctx, cx, cy, radius, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides + (Math.random() * 0.5);
        const r = radius * (0.5 + Math.random() * 0.5);
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

async function generateRepCard(senderAvatar, receiverAvatar, receiverName, currentPoints, rankData, isRankUp) {
    const width = 1000;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    // 1️⃣ الخلفية
    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 60 + 20;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        shardGrad.addColorStop(0, rankData.color); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.8)');

        drawRandomPolygon(ctx, x, y, radius, sides);

        ctx.globalAlpha = 0.08; 
        ctx.fillStyle = shardGrad;
        ctx.fill();

        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#050505'; 
        ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 700);
    vignette.addColorStop(0, 'rgba(0,0,0,0.2)'); 
    vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // 2️⃣ الإطار الملكي
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(15, 15, width - 30, height - 30);

    ctx.lineWidth = 1;
    ctx.strokeStyle = rankData.color;
    ctx.strokeRect(25, 25, width - 50, height - 50);

    // 3️⃣ العنوان
    ctx.fillStyle = isRankUp ? '#00FF88' : '#FFD700';
    ctx.font = 'bold 50px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.fillText(fixAr(isRankUp ? "⚜️ ارتـقـاء فـي الـسـمـعـة ⚜️" : "✨ شـهـادة تـزكـيـة ✨"), width / 2, 85);
    ctx.shadowBlur = 0;

    const lineGrad = ctx.createLinearGradient(width / 2 - 300, 0, width / 2 + 300, 0);
    lineGrad.addColorStop(0, 'rgba(0,0,0,0)');
    lineGrad.addColorStop(0.5, rankData.color);
    lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(width / 2 - 300, 110, 600, 2);

    // 4️⃣ رسم الأفاتارات
    const drawCirc = async (url, x, y, size, border, glow) => {
        try {
            if (glow) {
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size / 1.8, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.shadowColor = glow;
                ctx.shadowBlur = 25;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            const img = await loadImage(url);
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();
            
            ctx.strokeStyle = border;
            ctx.lineWidth = size > 100 ? 5 : 3;
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.stroke();
        } catch (e) {}
    };

    await drawCirc(receiverAvatar, width - 260, 140, 180, rankData.color, `${rankData.color}44`);
    await drawCirc(senderAvatar, 50, 40, 80, 'rgba(255,255,255,0.4)', null);
    
    ctx.fillStyle = '#888888';
    ctx.font = '20px "Bein", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(fixAr("المُـزكّـي:"), 145, 75);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "Bein", sans-serif';
    ctx.fillText(fixAr("عـضـو الـنـقـابـة"), 145, 100);

    // 5️⃣ معلومات المستلم
    ctx.textAlign = 'right';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Bein", sans-serif';
    let dName = receiverName.length > 20 ? receiverName.substring(0, 20) + '..' : receiverName;
    ctx.fillText(fixAr(dName), width - 300, 190);

    ctx.fillStyle = rankData.color;
    ctx.font = 'bold 38px "Bein", sans-serif';
    ctx.fillText(fixAr(rankData.name), width - 300, 255);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '32px "Bein", sans-serif';
    ctx.fillText(fixAr(`مجموع السمعة: ${currentPoints.toLocaleString()} 🌟`), width - 300, 315);

    // 6️⃣ شريط التقدم الدقيق 100%
    const barW = 600;
    const barH = 25;
    const barX = width - 300 - barW;
    const barY = 360;

    if (rankData.next !== 'الحد الأقصى') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath(); 
        ctx.roundRect(barX, barY, barW, barH, 12); 
        ctx.fill();
        ctx.stroke();

        // 🔥 التعديل السحري: حساب النسبة بناءً على نطاق الرتبة الحالية فقط 🔥
        const tiers = [0, 10, 25, 50, 100, 250, 500, 1000];
        const currentTierMin = tiers.slice().reverse().find(t => currentPoints >= t) || 0;
        
        let progress = (currentPoints - currentTierMin) / (rankData.next - currentTierMin);
        progress = Math.max(0.02, Math.min(progress, 1)); // 0.02 عشان يظل فيه لون خفيف جداً يوضح بداية الشريط
        
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, rankData.color);
        grad.addColorStop(1, '#ffffff');
        
        ctx.fillStyle = grad;
        ctx.shadowColor = rankData.color;
        ctx.shadowBlur = 10;
        ctx.beginPath(); 
        ctx.roundRect(barX, barY, barW * progress, barH, 12); 
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#AAAAAA';
        ctx.font = '22px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fixAr(`متبقي ${rankData.next - currentPoints} سمعة للوصول للمستوى التالي`), barX + barW / 2, barY + 60);
    } else {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 35px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.fillText(fixAr("⭐ تـربـع عـلى عـرش الأسـاطـيـر ⭐"), barX + barW / 2, barY + 45);
        ctx.shadowBlur = 0;
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateRepCard };
