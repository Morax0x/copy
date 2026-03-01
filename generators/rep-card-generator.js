// generators/rep-card-generator.js

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// --- إعدادات اللغة العربية ---
let arabicReshaper;
try { arabicReshaper = require('arabic-reshaper'); } catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try { return arabicReshaper.reshape(text); } catch (err) { return text; }
}

try { GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

// دالة حساب الرتبة لجلب البيانات الصحيحة للشريط
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

async function generateRepCard(senderAvatar, receiverAvatar, receiverName, currentPoints, rankData, isRankUp) {
    const width = 1000;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    // 1️⃣ الخلفية السينمائية
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // إضافة تدرج لوني خافت خلف البطاقة
    const mainGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 600);
    mainGrad.addColorStop(0, `${rankData.color}15`);
    mainGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = mainGrad;
    ctx.fillRect(0, 0, width, height);

    // 2️⃣ الإطار الملكي النحيف
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 3️⃣ العنوان العلوي
    ctx.fillStyle = isRankUp ? '#00FF88' : '#FFD700';
    ctx.font = 'bold 55px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 15;
    ctx.fillText(fixAr(isRankUp ? "⚜️ ارتقـاء فـي الـسـمـعـة ⚜️" : "📜 تـزكـيـة مـن مـغـامـر 📜"), width / 2, 85);
    ctx.shadowBlur = 0;

    // 4️⃣ منطقة الأفاتارات (توزيع أفضل)
    const drawCirc = async (url, x, y, size, border) => {
        try {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            const img = await loadImage(url);
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();
            ctx.strokeStyle = border;
            ctx.lineWidth = 4;
            ctx.stroke();
        } catch (e) {}
    };

    // أفاتار المستلم (كبير - يسار)
    await drawCirc(receiverAvatar, 80, 130, 180, rankData.color);
    
    // أفاتار المرسل (صغير - أعلى اليمين)
    await drawCirc(senderAvatar, width - 130, 40, 70, 'rgba(255,255,255,0.5)');

    // 5️⃣ معلومات المستلم (تنسيق نصوص مرتب)
    ctx.textAlign = 'right';
    
    // الاسم
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Bein", sans-serif';
    let dName = receiverName.length > 20 ? receiverName.substring(0, 20) + '..' : receiverName;
    ctx.fillText(fixAr(dName), width - 70, 180);

    // الرتبة
    ctx.fillStyle = rankData.color;
    ctx.font = 'bold 38px "Bein", sans-serif';
    ctx.fillText(fixAr(rankData.name), width - 70, 245);

    // النقاط
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '30px "Bein", sans-serif';
    ctx.fillText(fixAr(`مجموع النقاط: ${currentPoints.toLocaleString()} 🌟`), width - 70, 305);

    // 6️⃣ شريط التقدم (Progress Bar احترافي)
    const barW = 550;
    const barH = 25;
    const barX = width - 70 - barW;
    const barY = 345;

    if (rankData.next !== 'الحد الأقصى') {
        // خلفية الشريط
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 12); ctx.fill();

        // حساب النسبة
        const lowerBound = (getRepRank(currentPoints - 1).next === rankData.next) ? 0 : 0; // لتبسيط الحسبة
        const progress = Math.min((currentPoints / rankData.next), 1);
        
        // تعبئة الشريط
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, rankData.color);
        grad.addColorStop(1, '#ffffff');
        
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * progress, barH, 12); ctx.fill();

        // نص الترقية
        ctx.fillStyle = '#888888';
        ctx.font = '22px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fixAr(`متبقي ${rankData.next - currentPoints} نقطة للوصول للمستوى التالي`), barX + barW / 2, barY + 60);
    } else {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fixAr("⭐ تـربـع عـلى عـرش الأسـاطـيـر ⭐"), barX + barW / 2, barY + 40);
    }

    // نص الشهادة الجانبي
    ctx.save();
    ctx.translate(width - 40, height - 100);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255,215,0,0.2)';
    ctx.font = 'bold 20px "Bein", sans-serif';
    ctx.fillText(fixAr("نـقـابـة الـمـغـامـريـن"), 0, 0);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

module.exports = { generateRepCard };
