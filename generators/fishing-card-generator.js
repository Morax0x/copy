const Canvas = require('canvas');
const path = require('path');
const fs = require('fs');

const THEME = {
    TEXT: "#FFFFFF",
    TENSION_LOW: "#00FF88",
    TENSION_MID: "#FFD700",
    TENSION_HIGH: "#FF3333",
    BAR_BG: "rgba(0, 0, 0, 0.6)"
};

// مسار المجلدات الأساسية للصور
const BASE_IMG_PATH = path.join(process.cwd(), 'images', 'fish');

// كاش لتخزين الصور في الذاكرة لتسريع عملية الرسم (Render)
const imageCache = new Map();

/**
 * دالة مساعدة لتحميل الصورة بأمان من المسار المحدد
 */
async function safeLoadImage(folder, imageName) {
    const fullPath = path.join(BASE_IMG_PATH, folder, imageName);
    if (imageCache.has(fullPath)) return imageCache.get(fullPath);

    if (fs.existsSync(fullPath)) {
        try {
            const img = await Canvas.loadImage(fullPath);
            imageCache.set(fullPath, img);
            return img;
        } catch (e) {
            console.error(`Error loading image: ${fullPath}`, e);
            return null;
        }
    }
    return null;
}

/**
 * @param {number} tension - مستوى التوتر (0 إلى 100)
 * @param {number} distance - المسافة المتبقية (0 إلى 100)
 * @param {string} statusText - رسالة الحالة
 * @param {string} locationId - (مثل: beach, deep, atlantis)
 * @param {number} boatLevel - مستوى القارب (1 إلى 7)
 * @param {number} rodLevel - مستوى السنارة (1 إلى 10)
 */
async function generateFishingCard(tension, distance, statusText, locationId = 'beach', boatLevel = 1, rodLevel = 1) {
    const canvasWidth = 800;
    const canvasHeight = 400;
    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // 1. تحميل الصور المطلوبة
    const bgImage = await safeLoadImage(locationId, `${locationId}.png`);
    const boatImage = await safeLoadImage('ships', `boat_${boatLevel}.png`);
    const rodImage = await safeLoadImage('fishing', `rod_${rodLevel}.png`);
    const fishImage = await safeLoadImage('', 'fish.png'); // السمكة في המجلد الرئيسي fish

    // 2. رسم الخلفية
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } else {
        // خلفية احتياطية في حال لم تتوفر الصورة
        const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        grad.addColorStop(0, "#0B1D3A");
        grad.addColorStop(1, "#1A3B5C");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // تحديد لون التوتر
    let tensionColor = THEME.TENSION_LOW;
    if (tension > 50) tensionColor = THEME.TENSION_MID;
    if (tension > 80) tensionColor = THEME.TENSION_HIGH;

    // 3. رسم عداد التوتر (Tension Gauge) على اليمين
    const tensionBarX = 730;
    const tensionBarY = 50;
    const tensionBarW = 30;
    const tensionBarH = 250;

    ctx.fillStyle = THEME.BAR_BG;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(tensionBarX, tensionBarY, tensionBarW, tensionBarH, 10);
    else ctx.rect(tensionBarX, tensionBarY, tensionBarW, tensionBarH);
    ctx.fill();

    const fillHeight = (tension / 100) * tensionBarH;
    const fillY = tensionBarY + (tensionBarH - fillHeight);
    
    ctx.fillStyle = tensionColor;
    ctx.shadowColor = tensionColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(tensionBarX, fillY, tensionBarW, fillHeight, 10);
    else ctx.rect(tensionBarX, fillY, tensionBarW, fillHeight);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = THEME.TEXT;
    ctx.font = 'bold 16px "Arial"';
    ctx.textAlign = 'center';
    ctx.fillText('توتر الخيط', tensionBarX + 15, tensionBarY - 15);
    ctx.fillText(`${Math.floor(tension)}%`, tensionBarX + 15, tensionBarY + tensionBarH + 25);

    // 4. رسم القارب، السنارة، والسمكة
    const boatX = 100;
    const boatY = 220; 
    
    // حساب موقع السمكة بناءً على المسافة
    const fishX = 150 + ((distance / 100) * 450);
    const fishY = 270;

    // رسم الخيط قبل السنارة والسمكة ليكون بالخلف
    ctx.beginPath();
    ctx.moveTo(boatX + 70, boatY - 50); // إحداثيات افتراضية لقمة السنارة 
    ctx.lineTo(fishX + 10, fishY + 10); // إحداثيات فم السمكة
    ctx.lineWidth = tension > 80 ? 4 : 2;
    ctx.strokeStyle = tensionColor;
    
    if (tension > 85) {
        ctx.setLineDash([5, 5]); // خيط يهتز
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // رسم القارب
    if (boatImage) {
        ctx.drawImage(boatImage, boatX - 60, boatY - 40, 160, 100);
    } else {
        // قارب احتياطي
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(boatX - 40, boatY, 80, 30);
    }

    // رسم السنارة
    if (rodImage) {
        // نضع السنارة فوق القارب وتميل لليمين
        ctx.drawImage(rodImage, boatX + 10, boatY - 80, 80, 80);
    }

    // رسم السمكة
    if (fishImage) {
        ctx.drawImage(fishImage, fishX - 30, fishY - 20, 80, 60);
    } else {
        // سمكة احتياطية
        ctx.fillStyle = "#4682B4";
        ctx.beginPath();
        ctx.ellipse(fishX, fishY, 30, 15, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 5. رسم شريط المسافة السفلي
    const distBarX = 50;
    const distBarY = 350;
    const distBarW = 600;
    const distBarH = 15;

    ctx.fillStyle = THEME.BAR_BG;
    if(ctx.roundRect) ctx.roundRect(distBarX, distBarY, distBarW, distBarH, 7);
    else ctx.rect(distBarX, distBarY, distBarW, distBarH);
    ctx.fill();

    const distFillW = ((100 - Math.min(distance, 100)) / 100) * distBarW;
    ctx.fillStyle = "#00a8ff"; 
    ctx.shadowColor = "#00a8ff";
    ctx.shadowBlur = 10;
    if(ctx.roundRect) ctx.roundRect(distBarX, distBarY, distFillW, distBarH, 7);
    else ctx.rect(distBarX, distBarY, distFillW, distBarH);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = THEME.TEXT;
    ctx.textAlign = 'left';
    ctx.fillText(`المسافة المتبقية: ${Math.floor(distance)}m`, distBarX, distBarY - 10);

    // 6. طباعة نص الحالة في الأعلى
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
