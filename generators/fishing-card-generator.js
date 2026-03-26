const Canvas = require('canvas');

const THEME = {
    TEXT: "#FFFFFF",
    TENSION_LOW: "#00FF88",
    TENSION_MID: "#FFD700",
    TENSION_HIGH: "#FF3333",
    BAR_BG: "rgba(0, 0, 0, 0.6)"
};

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/fish';

const imageCache = new Map();

async function preloadAssets() {
    console.log("[Fishing Generator] Starting asset preload from Cloud into RAM...");
    
    const foldersToLoad = [
        { folder: 'beach', files: ['beach.png', 'shallow.png', 'deep.png', 'bermuda.png', 'trench.png', 'atlantis.png', 'dark_sea.png'] },
        { folder: '', files: ['ordinary_fish.png', 'shadow_fish.png', 'fish.png'] } 
    ];

    const shipFiles = [];
    const rodFiles = [];
    for(let i = 1; i <= 10; i++) {
        if(i <= 7) shipFiles.push(`boat_${i}.png`);
        rodFiles.push(`rod_${i}.png`);
    }
    
    foldersToLoad.push({ folder: 'ships', files: shipFiles });
    foldersToLoad.push({ folder: 'fishing', files: rodFiles });

    for (const group of foldersToLoad) {
        for (const file of group.files) {
            const urlPath = group.folder ? `${R2_URL}/${group.folder}/${file}` : `${R2_URL}/${file}`;
            try {
                const img = await Canvas.loadImage(urlPath);
                imageCache.set(urlPath, img);
            } catch (e) {
                console.error(`[Fishing] Error loading image: ${urlPath}`);
            }
        }
    }
    console.log(`[Fishing Generator] Successfully loaded ${imageCache.size} assets into RAM.`);
}

preloadAssets();

async function getCachedImage(folder, imageName) {
    const urlPath = folder ? `${R2_URL}/${folder}/${imageName}` : `${R2_URL}/${imageName}`;
    if (imageCache.has(urlPath)) return imageCache.get(urlPath);
    try {
        const img = await Canvas.loadImage(urlPath);
        imageCache.set(urlPath, img);
        return img;
    } catch (e) {
        return null;
    }
}

async function generateFishingCard(tension, distance, statusText, locationId = 'beach', boatLevel = 1, rodLevel = 1) {
    const canvasWidth = 800;
    const canvasHeight = 400;
    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    const bgImage = await getCachedImage('beach', `${locationId}.png`);
    const boatImage = await getCachedImage('ships', `boat_${boatLevel}.png`);
    const rodImage = await getCachedImage('fishing', `rod_${rodLevel}.png`);
    
    const fishImage = await getCachedImage('', 'ordinary_fish.png') 
                   || await getCachedImage('', 'shadow_fish.png') 
                   || await getCachedImage('', 'fish.png');

    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } else {
        const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        grad.addColorStop(0, "#0B1D3A");
        grad.addColorStop(1, "#1A3B5C");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    let tensionColor = THEME.TENSION_LOW;
    if (tension > 50) tensionColor = THEME.TENSION_MID;
    if (tension > 80) tensionColor = THEME.TENSION_HIGH;

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

    const boatWidth = 260;
    const boatHeight = 160;
    const boatX = 30; 
    const boatY = 180; 

    const rodWidth = 70;
    const rodHeight = 70;
    const rodX = boatX + 160; 
    const rodY = boatY + 10;  

    const fishWidth = 80;
    const fishHeight = 60;
    const fishX = 320 + ((distance / 100) * 350);
    const fishY = 260;

    ctx.beginPath();
    const lineStartX = rodX + (rodWidth * 0.85); 
    const lineStartY = rodY + (rodHeight * 0.15);
    ctx.moveTo(lineStartX, lineStartY); 
    ctx.lineTo(fishX + 10, fishY + 20);
    ctx.lineWidth = tension > 80 ? 4 : 2;
    ctx.strokeStyle = tensionColor;
    if (tension > 85) ctx.setLineDash([5, 5]); 
    ctx.stroke();
    ctx.setLineDash([]);

    if (boatImage) {
        ctx.drawImage(boatImage, boatX, boatY, boatWidth, boatHeight);
    } else {
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(boatX, boatY + 50, 150, 50);
    }

    if (rodImage) {
        ctx.drawImage(rodImage, rodX, rodY, rodWidth, rodHeight);
    }

    if (fishImage) {
        ctx.drawImage(fishImage, fishX, fishY, fishWidth, fishHeight);
    } else {
        ctx.fillStyle = "#4682B4";
        ctx.beginPath();
        ctx.ellipse(fishX + 30, fishY + 30, 30, 15, 0, 0, Math.PI * 2);
        ctx.fill();
    }

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
