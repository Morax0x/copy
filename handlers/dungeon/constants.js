const path = require('path');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

// 🔥 إضافة مهارة "شق الزمكان" الخاصة بالاونر 🔥
skillsConfig.push({
    id: 'skill_owner_leave',
    name: 'شق الزمكان',
    description: 'تقنية محرمة: سحب الفريق قسراً من الدانجون وإنهاء المعركة فوراً واحتساب الغنائم.',
    emoji: '🌌',
    stat_type: 'Owner', // تصنيف الامبراطور
    base_price: 0,
    cooldown: 0
});

// تحميل ملفات العناصر
let potionItems = [];
try {
    potionItems = require(path.join(rootDir, 'json', 'potions.json'));
} catch (e) {
    try {
        const shopItems = require(path.join(rootDir, 'json', 'shop-items.json'));
        potionItems = shopItems.filter(i => i.category === 'potions');
    } catch (err) { console.error("Error loading potions:", err); }
}

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const EMOJI_XP = '<a:levelup:1437805366048985290>'; 
const EMOJI_BUFF = '<a:buff:1438796257522094081>';
const EMOJI_NERF = '<a:Nerf:1438795685280612423>';
const OWNER_ID = "1145327691772481577"; 
const BASE_HP = 100;
const HP_PER_LEVEL = 4;

// --- صور النتائج ---
const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

module.exports = {
    dungeonConfig,
    weaponsConfig,
    skillsConfig,
    potionItems,
    EMOJI_MORA,
    EMOJI_XP,
    EMOJI_BUFF,
    EMOJI_NERF,
    OWNER_ID,
    BASE_HP,
    HP_PER_LEVEL,
    WIN_IMAGES,
    LOSE_IMAGES
};
