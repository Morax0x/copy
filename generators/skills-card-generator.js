const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("⚠️ تنبيه: لم يتم العثور على خط Bein.");
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

// مصفوفة صور المهارات
const SKILL_TO_IMAGE = {
    'skill_healing': 'heal.png',
    'skill_shielding': 'shield.png',
    'skill_buffing': 'buff.png',
    'skill_rebound': 'rebound.png',
    'skill_weaken': 'weaken.png',
    'skill_dispel': 'dispel.png',
    'skill_cleanse': 'cleanse.png',
    'skill_poison': 'poison.png',
    'skill_gamble': 'gamble.png',
    'race_dragon_skill': 'dragon.png',
    'race_human_skill': 'human.png',
    'race_seraphim_skill': 'seraphim.png',
    'race_demon_skill': 'demon.png',
    'race_elf_skill': 'elf.png',
    'race_dark_elf_skill': 'darkelf.png',
    'race_vampire_skill': 'vampire.png',
    'race_hybrid_skill': 'hybrid.png',
    'race_spirit_skill': 'spirit.png',
    'race_dwarf_skill': 'dwarf.png',
    'race_ghoul_skill': 'ghoul.png'
};

// ==========================================
// 🔥 دوال الرسم المساعدة 🔥
// ==========================================

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
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

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// 🔥 دالة رسم المخطط العنكبوتي (Spider/Radar Chart) 🔥
function drawSpiderChart(ctx, cx, cy, radius, stats, primaryColor) {
    const sides = stats.length;
    const angleStep = (Math.PI * 2) / sides;
    const maxVal = 100; // القيمة القصوى لكل محور

    ctx.save();
    ctx.translate(cx, cy);

    // 1. رسم شبكة العنكبوت الخلفية (المستويات)
    const levels = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    for (let l = 1; l <= levels; l++) {
        const r = (radius / levels) * l;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const angle = i * angleStep - Math.PI / 2;
            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // 2. رسم المحاور (الخطوط الممتدة من المركز)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    ctx.stroke();

    // 3. رسم منطقة بيانات اللاعب (المضلع الملون)
    ctx.beginPath();
    let dataPoints = [];
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        // التأكد أن النسبة لا تتجاوز 100% حتى لا تخرج عن الشبكة
        const percentage = Math.min(Math.max(stats[i].val / maxVal, 0.1), 1); 
        const r = radius * percentage;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        dataPoints.push({x, y});
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // تعبئة المضلع وإطاره
    ctx.fillStyle = `rgba(${parseInt(primaryColor.slice(1,3),16)}, ${parseInt(primaryColor.slice(3,5),16)}, ${parseInt(primaryColor.slice(5,7),16)}, 0.45)`;
    ctx.fill();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // نقاط مضيئة على الزوايا
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 12;
    for (const pt of dataPoints) {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // 4. كتابة أسماء المحاور بالعربي بمسافات ممتازة
    ctx.font = 'bold 18px "Bein"';
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const labelRadius = radius + 40; // مسافة تنفس للنص بعيداً عن الشبكة
        const x = labelRadius * Math.cos(angle);
        const y = labelRadius * Math.sin(angle);

        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // تعديل المحاذاة حسب الموقع لتجنب التداخل
        if (Math.abs(Math.cos(angle)) > 0.1) {
            ctx.textAlign = Math.cos(angle) > 0 ? 'left' : 'right';
        }
        
        ctx.fillText(stats[i].label, x, y);
    }

    ctx.restore();
}

// ========================================================
// 🔥 الدالة الرئيسية: رسم بطاقة المهارات 🔥
// ========================================================
async function generateSkillsCard(data) {
    const width = 1200;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryColor = '#B968FF'; // لون البطاقة (أرجواني فخم / Epic)

    // 1. الخلفية السينمائية
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); 
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // غبار النجوم
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 2. الهيدر الملكي 
    const headerH = 120;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(185, 104, 255, 0)');
    goldGrad.addColorStop(0.5, 'rgba(185, 104, 255, 0.8)');
    goldGrad.addColorStop(1, 'rgba(185, 104, 255, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);

    // عنوان البطاقة
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = primaryColor; 
    ctx.font = 'bold 50px "Bein"';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 20;
    ctx.fillText(`✦ مهارات ${data.cleanName} ✦`, width / 2, 60);
    ctx.shadowBlur = 0;

    // 🔥 رقم الصفحة في الزاوية العلوية اليمنى (Pagination) 🔥
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Bein"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`[ ${data.currentPage + 1} / ${data.totalPages || 1} ]`, width - 30, 60);

    // ==========================================
    // 🛡️ الجزء الأيسر: لوحة الهوية والمخطط العنكبوتي
    // ==========================================
    const leftPanelW = 450;
    
    ctx.fillStyle = 'rgba(15, 20, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, 40, 160, leftPanelW, height - 200, 20); ctx.fill();
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2; ctx.stroke();

    // 👤 الصورة الدائرية (Avatar)
    const avatarSize = 130;
    const avatarX = 40 + leftPanelW / 2;
    const avatarY = 250;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    try {
        const avatarImage = await loadImage(data.avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) { ctx.fillStyle = '#333'; ctx.fill(); }
    ctx.restore();

    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = primaryColor; ctx.stroke();

    // معلومات العرق والسلاح تحت الصورة
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E0E0E0'; ctx.font = 'bold 22px "Bein"';
    ctx.fillText(`🩸 العرق: ${data.raceName}`, avatarX, avatarY + 90);
    
    ctx.fillStyle = '#F1C40F'; ctx.font = 'bold 20px "Bein"';
    const wpName = data.weaponData ? data.weaponData.name : 'بدون سلاح';
    const wpDmg = data.weaponData ? data.weaponData.currentDamage : 0;
    ctx.fillText(`⚔️ السلاح: ${wpName} (ضرر: ${wpDmg})`, avatarX, avatarY + 125);

    // 🕸️ المخطط العنكبوتي (Spider Chart)
    const totalSkillsLevel = data.skillsList.reduce((acc, s) => acc + s.level, 0);
    const playerLevel = data.userLevel || 1;
    
    let chartStats = [
        { label: 'الهجوم', val: Math.min((wpDmg / 150) * 100, 100) }, 
        { label: 'المهارة', val: Math.min((totalSkillsLevel / 50) * 100 + 20, 100) }, 
        { label: 'الحيوية', val: Math.min((playerLevel / 50) * 100 + 10, 100) }, 
        { label: 'السحر', val: Math.min(data.skillsList.length * 20, 100) }, 
        { label: 'الاستثمار', val: Math.min((data.totalSpent / 50000) * 100, 100) }, 
        { label: 'الدفاع', val: Math.min((playerLevel / 60) * 100 + (wpDmg / 300) * 100, 100) }
    ];

    drawSpiderChart(ctx, avatarX, avatarY + 310, 100, chartStats, primaryColor);

    // ==========================================
    // 📜 الجزء الأيمن: قائمة المهارات (The Skills List)
    // ==========================================
    const rightPanelX = 530;
    const rightPanelW = 630;
    const startY = 160;
    const slotH = 180;
    const gapY = 25;

    if (data.skillsList.length === 0) {
        ctx.fillStyle = 'rgba(15, 20, 30, 0.8)';
        ctx.beginPath(); roundRect(ctx, rightPanelX, startY, rightPanelW, height - 200, 20); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();
        
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = 'bold 30px "Bein"';
        ctx.fillText('❌ لا يوجد مهارات مسجلة', rightPanelX + rightPanelW/2, startY + 200);
    } else {
        for (let i = 0; i < data.skillsList.length; i++) {
            const skill = data.skillsList[i];
            const y = startY + i * (slotH + gapY);

            // إطار المهارة الزجاجي
            ctx.fillStyle = 'rgba(20, 25, 35, 0.8)';
            ctx.beginPath(); roundRect(ctx, rightPanelX, y, rightPanelW, slotH, 15); ctx.fill();
            ctx.strokeStyle = 'rgba(185, 104, 255, 0.5)'; ctx.lineWidth = 2; ctx.stroke();

            // مربع صورة المهارة
            const imgBoxSize = 130;
            const imgBoxX = rightPanelX + rightPanelW - imgBoxSize - 25; // على اليمين
            const imgBoxY = y + 25;

            ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
            ctx.beginPath(); roundRect(ctx, imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 15); ctx.fill();
            ctx.strokeStyle = primaryColor; ctx.lineWidth = 2; ctx.stroke();

            // جلب صورة المهارة ورسمها
            let imgDrawn = false;
            if (skill.id && SKILL_TO_IMAGE[skill.id]) {
                const imgPath = path.join(process.cwd(), `images/skills/${SKILL_TO_IMAGE[skill.id]}`);
                const img = await getCachedImage(imgPath);
                if (img) {
                    ctx.shadowColor = primaryColor; ctx.shadowBlur = 20;
                    ctx.drawImage(img, imgBoxX + 15, imgBoxY + 15, imgBoxSize - 30, imgBoxSize - 30);
                    ctx.shadowBlur = 0;
                    imgDrawn = true;
                }
            }

            if (!imgDrawn) {
                ctx.fillStyle = '#FFFFFF'; ctx.font = '50px Arial';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('📜', imgBoxX + imgBoxSize/2, imgBoxY + imgBoxSize/2);
            }

            // شارة لفل المهارة (Level Badge)
            const badgeW = 60, badgeH = 30;
            ctx.fillStyle = primaryColor;
            ctx.beginPath(); roundRect(ctx, imgBoxX - 10, imgBoxY - 10, badgeW, badgeH, 8); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font = 'bold 16px "Arial"'; ctx.textAlign = 'center';
            ctx.fillText(`LVL ${skill.level}`, imgBoxX - 10 + badgeW/2, imgBoxY - 10 + badgeH/2 + 2);

            // النصوص الخاصة بالمهارة (تم تحسين مسافاتها بشكل دقيق)
            const textStartX = imgBoxX - 25; // نكتب من اليمين لليسار
            
            ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.fillStyle = '#FFD700'; ctx.font = 'bold 32px "Bein"';
            ctx.fillText(skill.name, textStartX, y + 35); // توسيط أفضل لاسم المهارة

            // الوصف (دعم للأسطر المتعددة بمسافة مريحة)
            ctx.fillStyle = '#A8B8D0'; ctx.font = '22px "Bein"';
            const lines = wrapText(ctx, skill.description, rightPanelW - imgBoxSize - 70);
            for (let j = 0; j < Math.min(lines.length, 3); j++) {
                ctx.fillText(lines[j], textStartX, y + 85 + (j * 35)); // تباعد أسطر 35 بدلاً من 30
            }
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateSkillsCard };
