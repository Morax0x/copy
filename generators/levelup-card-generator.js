const Canvas = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

// 🔥 تسجيل الخط العربي الفخم 🔥
try {
    const rootDir = process.cwd();
    Canvas.registerFont(path.join(rootDir, 'fonts', 'bein-ar-normal.ttf'), { family: 'BeinAr' });
} catch (e) {
    console.log("❌ لم يتم العثور على الخط bein-ar-normal.ttf، سيتم استخدام الخط الافتراضي.");
}

// دالة مساعدة لرسم المستطيل ذو الزوايا الدائرية
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// دالة ضبط حجم النص
function applyText(canvas, text, baseSize) {
    const ctx = canvas.getContext('2d');
    let fontSize = baseSize;
    do {
        ctx.font = `bold ${fontSize -= 2}px "BeinAr", "Arial"`; 
    } while (ctx.measureText(text).width > canvas.width - 350);
    return ctx.font;
}

// 🔥 دالة اختيار تدرج لوني عشوائي متناسق وفخم 🔥
function getHarmoniousGradient() {
    const gradients = [
        ['#0f0c29', '#302b63', '#24243e'], // بنفسجي ليلي
        ['#141E30', '#243B55'],             // أزرق ملكي معدني
        ['#232526', '#414345'],             // أسود فاحم
        ['#200122', '#6f0000'],             // أحمر ملكي داكن
        ['#000428', '#004e92'],             // أزرق بحري عميق
        ['#16222A', '#3A6073'],             // رصاصي مزرق هادئ
        ['#191654', '#43C6AC'],             // أزرق غامق مع لمسة تركواز
        ['#000000', '#434343'],             // أسود كلاسيكي
        ['#1A2980', '#26D0CE'],             // أزرق كهربائي
        ['#4B1248', '#F0C27B'],             // ذهبي مع بنفسجي
        ['#8E0E00', '#1F1C18'],             // أحمر بركاني
        ['#3a1c71', '#d76d77', '#ffaf7b']   // غروب الشمس
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
}

// 🛠️ دالة لاستخراج رابط الإيموجي
function getEmojiUrl(emoji) {
    if (!emoji) return null;
    // 1. إيموجي مخصص من ديسكورد (Custom Emoji)
    const customMatch = emoji.match(/<?(a)?:?(\w{2,32}):(\d{17,19})>?/);
    if (customMatch) {
        const ext = customMatch[1] ? 'gif' : 'png';
        return `https://cdn.discordapp.com/emojis/${customMatch[3]}.${ext}`;
    }
    // 2. إيموجي عادي (Unicode Emoji) - نستخدم مكتبة twemoji
    try {
        // التحقق إذا كان النص حروفاً عادية وليس إيموجي
        if (/^[a-zA-Z0-9\s]+$/.test(emoji)) return null;
        
        const codePoints = [...emoji]
            .map(c => c.codePointAt(0).toString(16))
            .filter(cp => cp !== 'fe0f') 
            .join('-');
        return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png`;
    } catch (e) {
        return null; 
    }
}

// 🛠️ دالة لرسم النص مع دعم الإيموجي (الرسم كصورة)
async function drawTextWithEmoji(ctx, text, x, y, fontSize = 30) {
    const parts = text.split(/(\s+)/); // تقسيم النص بالمسافات للحفاظ عليها
    let currentX = x;

    for (const part of parts) {
        const emojiUrl = getEmojiUrl(part);
        
        if (emojiUrl) {
            try {
                const img = await Canvas.loadImage(emojiUrl);
                // رسم الإيموجي كصورة (أكبر قليلاً من النص ليكون واضحاً)
                const size = fontSize * 1.2; 
                const offset = size * 0.15; // رفع الصورة قليلاً للمحاذاة
                ctx.drawImage(img, currentX, y - size + offset, size, size);
                currentX += size + 5; 
            } catch (e) {
                // فشل تحميل الصورة، ارسم النص كما هو
                ctx.fillText(part, currentX, y);
                currentX += ctx.measureText(part).width;
            }
        } else {
            // نص عادي
            ctx.fillText(part, currentX, y);
            currentX += ctx.measureText(part).width;
        }
    }
}

async function generateLevelUpCard(member, oldLevel, newLevel) {
    const canvas = Canvas.createCanvas(900, 280);
    const ctx = canvas.getContext('2d');

    // 1. الخلفية (ألوان متناسقة)
    const colors = getHarmoniousGradient();
    
    const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (colors.length === 2) {
        grd.addColorStop(0, colors[0]);
        grd.addColorStop(1, colors[1]);
    } else if (colors.length === 3) {
        grd.addColorStop(0, colors[0]);
        grd.addColorStop(0.5, colors[1]);
        grd.addColorStop(1, colors[2]);
    } else {
        colors.forEach((color, index) => {
            grd.addColorStop(index / (colors.length - 1), color);
        });
    }
    
    ctx.fillStyle = grd;
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // 2. تموجات الخلفية
    ctx.save();
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.clip();

    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * canvas.height);
        
        ctx.bezierCurveTo(
            canvas.width / 3, Math.random() * canvas.height,
            (canvas.width / 3) * 2, Math.random() * canvas.height,
            canvas.width, Math.random() * canvas.height
        );
        
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();

        ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + (i * 0.02)})`;
        ctx.fill();
    }
    ctx.restore();

    // 3. الإطار المتوهج
    const glowColor = colors[1] || '#00d2ff';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. صورة العضو
    const avatarX = 50;
    const avatarY = 40;
    const avatarSize = 200;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    try {
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await Canvas.loadImage(avatarURL);
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();

    // 5. النصوص
    const textX = 280;
    
    // العنوان
    ctx.fillStyle = '#ffffff'; 
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
    ctx.font = 'bold 30px "BeinAr", "Arial"';
    ctx.fillText('LEVEL UP!', textX, 70);
    ctx.shadowBlur = 0;

    // الاسم (مع دعم الإيموجي إذا وجد)
    ctx.fillStyle = '#ffffff';
    const nameFontSize = 50;
    ctx.font = applyText(canvas, member.displayName, nameFontSize); 
    // نستخدم الدالة العادية هنا لأن دمج الخط المتغير مع رسم الإيموجي معقد، 
    // ولكن يمكننا استخدام drawTextWithEmoji لو أردت دعم إيموجي الاسم بشكل خاص
    ctx.fillText(member.displayName, textX, 125); 

    // المستوى القديم
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 40px "BeinAr", "Arial"';
    ctx.fillText(`Lvl ${oldLevel}`, textX, 200);

    const oldLevelWidth = ctx.measureText(`Lvl ${oldLevel}`).width;
    const arrowX = textX + oldLevelWidth + 20;

    // السهم (»)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = 'bold 40px "BeinAr", "Arial"'; 
    ctx.fillText('»', arrowX, 200);

    // المستوى الجديد
    ctx.save();
    ctx.fillStyle = '#FFD700'; 
    ctx.shadowColor = '#FFD700'; 
    ctx.shadowBlur = 25; 
    ctx.font = 'bold 65px "BeinAr", "Arial"'; 
    ctx.fillText(`${newLevel}`, arrowX + 50, 205);
    ctx.restore();

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'levelup.png' });
}

module.exports = { generateLevelUpCard };
