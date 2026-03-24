const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("[Gacha Generator] ⚠️ تنبيه: لم يتم العثور على خط Bein.");
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

// 🔥 إضافة نظام النجوم للندرات 🔥
const RARITY_INFO = {
    'Common': { text: 'عـادي', color: '#B0BEC5', stars: '★' },
    'Uncommon': { text: 'غـيـر شـائـع', color: '#2ECC71', stars: '★★' },
    'Rare': { text: 'نــادر', color: '#3498DB', stars: '★★★' },
    'Epic': { text: 'مـلـحـمـي', color: '#9B59B6', stars: '★★★★' },
    'Legendary': { text: 'أسـطـوري', color: '#F1C40F', stars: '★★★★★' }
};

async function generateGachaCard(item, rarity) {
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const rInfo = RARITY_INFO[rarity] || RARITY_INFO['Common'];

    // ==========================================
    // 1. رسم الخلفية / الهالة الأساسية
    // ==========================================
    const auraPath = path.join(process.cwd(), `images/materials/auras/${rarity}.png`);
    const auraImg = await getCachedImage(auraPath);
    
    if (auraImg) {
        ctx.drawImage(auraImg, 0, 0, width, height);
    } else {
        const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
        grad.addColorStop(0, rInfo.color);
        grad.addColorStop(1, '#050505');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // ==========================================
    // 2. إضافة توهج مركزي خلف الأداة لإبرازها
    // ==========================================
    const centerGlow = ctx.createRadialGradient(width/2, height/2 - 60, 20, width/2, height/2 - 60, 350);
    centerGlow.addColorStop(0, `${rInfo.color}60`); // توهج شفاف
    centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    // ==========================================
    // 3. رسم الأداة 
    // ==========================================
    let itemDrawn = false;
    if (item.imgPath) {
        const itemPath = path.join(process.cwd(), item.imgPath);
        const itemImg = await getCachedImage(itemPath);
        
        if (itemImg) {
            const itemSize = 380; 
            const ix = (width - itemSize) / 2;
            const iy = (height - itemSize) / 2 - 80; // دفعها للأعلى قليلاً لتوسيع مساحة النص
            
            // تأثير طفو وظل قوي بلون الندرة
            ctx.shadowColor = rInfo.color;
            ctx.shadowBlur = 100;
            ctx.drawImage(itemImg, ix, iy, itemSize, itemSize);
            ctx.shadowBlur = 0; 
            itemDrawn = true;
        }
    }

    // ==========================================
    // 🔥 4. شكل تعويضي (ماسة سحرية) إذا لم توجد صورة 🔥
    // ==========================================
    if (!itemDrawn) {
        const cx = width / 2;
        const cy = height / 2 - 80;
        
        ctx.shadowColor = rInfo.color;
        ctx.shadowBlur = 120;
        ctx.fillStyle = rInfo.color;
        
        // رسم الماسة (Diamond Shape)
        ctx.beginPath();
        ctx.moveTo(cx, cy - 120);
        ctx.lineTo(cx + 80, cy);
        ctx.lineTo(cx, cy + 120);
        ctx.lineTo(cx - 80, cy);
        ctx.closePath();
        ctx.fill();

        // تظليل داخلي للماسة لإعطاء عمق 3D
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 120);
        ctx.lineTo(cx + 80, cy);
        ctx.lineTo(cx, cy + 120);
        ctx.closePath();
        ctx.fill();
        
        ctx.shadowBlur = 0;

        ctx.font = '90px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('✨', cx, cy + 10);
    }

    // ==========================================
    // 5. التدرج السفلي (الأسود) لإبراز النصوص بشكل درامي
    // ==========================================
    const bottomGrad = ctx.createLinearGradient(0, height - 350, 0, height);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - 350, width, 350);

    // ==========================================
    // 6. كتابة النصوص والنجوم
    // ==========================================
    ctx.textAlign = 'center';
    
    // 🔥 أ. رسم النجوم الذهبية 🔥
    ctx.font = '50px Arial';
    ctx.fillStyle = '#F1C40F'; // أصفر ذهبي ناصع
    ctx.shadowColor = '#D4AC0D';
    ctx.shadowBlur = 20;
    ctx.fillText(rInfo.stars, width / 2, height - 200);
    ctx.shadowBlur = 0;

    // ب. اسم الأداة بتدرج معدني
    ctx.font = 'bold 75px "Bein"';
    
    // إطار أسود عريض للنص
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.strokeText(item.name, width / 2, height - 100);
    
    // تدرج لوني للنص من الأبيض للرمادي الفاتح
    const textGrad = ctx.createLinearGradient(0, height - 180, 0, height - 100);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(1, '#D0D0D0');
    ctx.fillStyle = textGrad;
    ctx.fillText(item.name, width / 2, height - 100);

    // ج. نوع الأداة بلون الندرة
    let typeText = "أداة غامضة";
    if (item.type === 'material') typeText = "مورد تصنيع عتيق";
    if (item.type === 'book') typeText = "مخطوطة سحرية";
    if (item.type === 'skill') typeText = "مـهـارة خـارقـة";

    ctx.font = 'bold 32px "Bein"';
    ctx.fillStyle = rInfo.color; 
    ctx.fillText(`✦ ${typeText} ✦`, width / 2, height - 40);

    // ==========================================
    // 7. إطار سينمائي شفاف لكامل البطاقة
    // ==========================================
    ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    return canvas.toBuffer('image/png');
}

module.exports = { generateGachaCard };
