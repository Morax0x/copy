const Canvas = require('canvas');
const path = require('path');

const THEME = {
    BG_TOP: "#0B1D3A",
    BG_BOT: "#1A3B5C",
    TEXT: "#FFFFFF",
    TENSION_LOW: "#00FF88",
    TENSION_MID: "#FFD700",
    TENSION_HIGH: "#FF3333",
    BAR_BG: "rgba(0, 0, 0, 0.6)",
    BOAT_COLOR: "#8B4513",
    FISH_COLOR: "#4682B4"
};

/**
 * @param {number} tension - مستوى التوتر (0 إلى 100)
 * @param {number} distance - المسافة المتبقية (0 إلى 100)
 * @param {string} statusText - رسالة الحالة (مثلاً: "السمكة تقاوم!")
 */
async function generateFishingCard(tension, distance, statusText) {
    const canvasWidth = 800;
    const canvasHeight = 400;
    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // 1. رسم الخلفية (تدرج لوني للمحيط)
    const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // إضافة تأثير أمواج خفيف
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 100 + (i * 60));
        ctx.quadraticCurveTo(200, 80 + (i * 60), 400, 100 + (i * 60));
        ctx.quadraticCurveTo(600, 120 + (i * 60), 800, 100 + (i * 60));
        ctx.stroke();
    }

    // تحديد لون التوتر
    let tensionColor = THEME.TENSION_LOW;
    if (tension > 50) tensionColor = THEME.TENSION_MID;
    if (tension > 80) tensionColor = THEME.TENSION_HIGH;

    // 2. رسم عداد التوتر (Tension Gauge) على اليمين
    const tensionBarX = 730;
    const tensionBarY = 50;
    const tensionBarW = 30;
    const tensionBarH = 250;

    // خلفية العداد
    ctx.fillStyle = THEME.BAR_BG;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(tensionBarX, tensionBarY, tensionBarW, tensionBarH, 10);
    else ctx.rect(tensionBarX, tensionBarY, tensionBarW, tensionBarH);
    ctx.fill();

    // ملء العداد حسب التوتر
    const fillHeight = (tension / 100) * tensionBarH;
    const fillY = tensionBarY + (tensionBarH - fillHeight);
    
    ctx.fillStyle = tensionColor;
    ctx.shadowColor = tensionColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(tensionBarX, fillY, tensionBarW, fillHeight, 10);
    else ctx.rect(tensionBarX, fillY, tensionBarW, fillHeight);
    ctx.fill();
    ctx.shadowBlur = 0; // إعادة تعيين الظل

    // نص التوتر
    ctx.fillStyle = THEME.TEXT;
    ctx.font = 'bold 16px "Arial"';
    ctx.textAlign = 'center';
    ctx.fillText('توتر الخيط', tensionBarX + 15, tensionBarY - 15);
    ctx.fillText(`${Math.floor(tension)}%`, tensionBarX + 15, tensionBarY + tensionBarH + 25);

    // 3. رسم القارب والسمكة
    const boatX = 100;
    const boatY = 200;
    
    // حساب موقع السمكة (تبدأ من اليمين وتقترب لليسار كلما قلت المسافة)
    // المسافة 100 تعني أقصى اليمين (x = 600)
    // المسافة 0 تعني عند القارب (x = 150)
    const fishX = 150 + ((distance / 100) * 450);
    const fishY = 250;

    // رسم الخيط بين القارب والسمكة
    ctx.beginPath();
    ctx.moveTo(boatX + 20, boatY - 30); // قمة السنارة
    ctx.lineTo(fishX, fishY);
    ctx.lineWidth = tension > 80 ? 4 : 2; // الخيط يسمك إذا كان متوتراً
    ctx.strokeStyle = tensionColor;
    
    // إذا كان التوتر عالي جداً، نرسم الخيط متعرجاً قليلاً ليدل على الاهتزاز
    if (tension > 85) {
        ctx.setLineDash([5, 5]);
    }
    ctx.stroke();
    ctx.setLineDash([]); // إعادة الخط لطبيعته

    // رسم القارب (شكل بسيط)
    ctx.fillStyle = THEME.BOAT_COLOR;
    ctx.beginPath();
    ctx.moveTo(boatX - 40, boatY);
    ctx.lineTo(boatX + 40, boatY);
    ctx.lineTo(boatX + 20, boatY + 30);
    ctx.lineTo(boatX - 20, boatY + 30);
    ctx.closePath();
    ctx.fill();
    
    // السنارة
    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(boatX, boatY);
    ctx.lineTo(boatX + 20, boatY - 30);
    ctx.stroke();

    // رسم السمكة (ظل غامض)
    ctx.fillStyle = THEME.FISH_COLOR;
    ctx.beginPath();
    ctx.ellipse(fishX, fishY, 30, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // ذيل السمكة
    ctx.beginPath();
    ctx.moveTo(fishX + 30, fishY);
    ctx.lineTo(fishX + 50, fishY - 15);
    ctx.lineTo(fishX + 50, fishY + 15);
    ctx.closePath();
    ctx.fill();

    // 4. رسم شريط المسافة السفلي
    const distBarX = 50;
    const distBarY = 350;
    const distBarW = 600;
    const distBarH = 15;

    ctx.fillStyle = THEME.BAR_BG;
    if(ctx.roundRect) ctx.roundRect(distBarX, distBarY, distBarW, distBarH, 7);
    else ctx.rect(distBarX, distBarY, distBarW, distBarH);
    ctx.fill();

    const distFillW = ((100 - distance) / 100) * distBarW;
    ctx.fillStyle = "#00a8ff"; // لون أزرق للمسافة
    ctx.shadowColor = "#00a8ff";
    ctx.shadowBlur = 10;
    if(ctx.roundRect) ctx.roundRect(distBarX, distBarY, distFillW, distBarH, 7);
    else ctx.rect(distBarX, distBarY, distFillW, distBarH);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = THEME.TEXT;
    ctx.textAlign = 'left';
    ctx.fillText(`المسافة المتبقية: ${Math.floor(distance)}m`, distBarX, distBarY - 10);

    // 5. طباعة نص الحالة في الأعلى
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px "Arial"';
    ctx.fillStyle = THEME.TEXT;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 5;
    ctx.fillText(statusText, canvasWidth / 2, 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer();
}

module.exports = { generateFishingCard };
