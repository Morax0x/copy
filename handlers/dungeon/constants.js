const path = require('path');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

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

module.exports = {
    dungeonConfig,
    weaponsConfig,
    skillsConfig,
    potionItems,
    EMOJI_MORA: '<:mora:1435647151349698621>',
    EMOJI_XP: '<a:levelup:1437805366048985290>',
    EMOJI_BUFF: '<a:buff:1438796257522094081>',
    EMOJI_NERF: '<a:Nerf:1438795685280612423>',
    OWNER_ID: "1145327691772481577",
    BASE_HP: 100,
    HP_PER_LEVEL: 4,
    WIN_IMAGES: [
        'https://i.postimg.cc/JhMrnyLd/download-1.gif',
        'https://i.postimg.cc/FHgv29L0/download.gif',
        'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
        'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
        'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
        'https://i.postimg.cc/05dLktNF/download-5.gif',
        'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
    ],
    LOSE_IMAGES: [
        'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
        'https://i.postimg.cc/1zb8JGVC/download.gif',
        'https://i.postimg.cc/rmSwjvkV/download-1.gif',
        'https://i.postimg.cc/8PyPZRqt/download.jpg'
    ]
};
