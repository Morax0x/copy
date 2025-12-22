const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Colors, MessageFlags } = require('discord.js');
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

// --- 🧠 دوال الذكاء الاصطناعي (Smart AI Helpers) ---
function getSmartTarget(players) {
    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return null;

    // 1. الأولوية للكاهن (Priest) لتعطيل الإحياء
    const priest = alive.find(p => p.class === 'Priest');
    if (priest && Math.random() < 0.7) return priest; // 70% فرصة لاستهداف الكاهن

    // 2. الأولوية للأضعف (Kill Confirm)
    const lowestHp = alive.sort((a, b) => a.hp - b.hp)[0];
    if (lowestHp.hp < lowestHp.maxHp * 0.3 && Math.random() < 0.8) return lowestHp; // 80% فرصة لقتل الضعيف

    // 3. عشوائي
    return alive[Math.floor(Math.random() * alive.length)];
}

// --- ⚔️ مهارات الوحوش العامة (للمينيون والنخبة) ---
const GENERIC_MONSTER_SKILLS = [
    { name: "ضربة قاصمة", emoji: "🔨", chance: 0.3, execute: (m, p, l) => { 
        const target = getSmartTarget(p); // استخدام الاستهداف الذكي
        if(target){ applyDamageToPlayer(target, Math.floor(m.atk * 1.5)); l.push(`🔨 **${m.name}** رصد نقطة ضعف **${target.name}** وسدد ضربة قاصمة!`); }
    }},
    { name: "عضة سامة", emoji: "🤮", chance: 0.3, execute: (m, p, l) => { 
        const target = p.filter(pl=>!pl.isDead)[Math.floor(Math.random()*p.filter(pl=>!pl.isDead).length)];
        if(target){ target.effects.push({type:'poison', val: Math.floor(m.atk*0.2), turns:3}); l.push(`🤮 **${m.name}** نفث سماً على **${target.name}**!`); }
    }},
    { name: "صرخة مرعبة", emoji: "🗣️", chance: 0.2, execute: (m, p, l) => { 
        p.forEach(pl=>{if(!pl.isDead && Math.random()<0.5) pl.effects.push({type:'weakness',val:0.3,turns:2})}); l.push(`🗣️ **${m.name}** أطلق صرخة أضعفت عزيمة البعض!`);
    }},
    { name: "هجوم متوحش", emoji: "🐾", chance: 0.3, execute: (m, p, l) => { 
        p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.8))}); l.push(`🐾 **${m.name}** هاجم الجميع بوحشية!`);
    }},
    { name: "تصلب", emoji: "🛡️", chance: 0.2, execute: (m, p, l) => { 
        m.hp += Math.floor(m.maxHp * 0.05); l.push(`🛡️ **${m.name}** زاد دفاعه واستعاد قليلاً من الصحة!`);
    }}
];

// --- 👹 قاعدة بيانات مهارات الزعماء والحراس (Bosses & Guardians) ---
const MONSTER_SKILLS = {
    // === Elden Ring ===
    "مالينيا، نصل ميكيلا": {
        name: "رقصة الموت (Dance of Death)",
        emoji: "🌸",
        chance: 0.25,
        execute: (monster, players, log) => {
            // ذكاء خاص: إذا الصحة منخفضة تزيد فرصة استخدام المهارة للشفاء
            let totalDmg = 0;
            players.forEach(p => {
                if (!p.isDead) {
                    const dmg = Math.floor(monster.atk * 1.5);
                    const actualDmg = applyDamageToPlayer(p, dmg);
                    totalDmg += actualDmg;
                    monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(actualDmg * 0.5));
                }
            });
            log.push(`🌸 **مالينيا** حلقت ونفذت **رقصة الموت**! (امتصاص صحة الفريق)`);
        }
    },
    "الجنرال رادان": {
        name: "نجمة القهر",
        emoji: "☄️",
        chance: 0.20,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players); // استهداف ذكي
            if (target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.5));
                target.effects.push({ type: 'weakness', val: 0.5, turns: 2 });
                log.push(`☄️ **رادان** سحق **${target.name}** بقوة النجوم!`);
            }
        }
    },
    "ماليكيث، النصل الأسود": {
        name: "الموت المقدر",
        emoji: "🗡️",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { p.hp -= Math.floor(p.hp * 0.20); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.2), turns: 3 }); } });
            log.push(`🗡️ **ماليكيث** أطلق العنان للموت المقدر! (HP Cut + Burn)`);
        }
    },
    "غودفري، الإلدن لورد": {
        name: "زلزال هورا لوكس",
        emoji: "🌋",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 0.9)); if (Math.random() < 0.5) p.skipCount = (p.skipCount || 0) + 1; } });
            log.push(`🌋 **غودفري** مزق الأرض! (ضرر + إسقاط)`);
        }
    },
    "الساحرة راني": {
        name: "قمر الظلام البارد",
        emoji: "🌕",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'weakness', val:0.3, turns:2}); } });
            log.push(`🌕 **راني** أطلقت سحر القمر المظلم! (تجميد/ضعف)`);
        }
    },

    // === Dark Souls / Bloodborne / Sekiro ===
    "إيشين قديس السيف": {
        name: "تقنية البرق",
        emoji: "⚡",
        chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.2)); log.push(`⚡ **إيشين** صعق **${target.name}** بالبرق!`); }
        }
    },
    "النامليس كينج": {
        name: "عاصفة الرعد",
        emoji: "🌩️",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.1)); });
            log.push(`🌩️ **الملك المجهول** استدعى العاصفة!`);
        }
    },
    "أرتورياس، سائر الهاوية": {
        name: "شقلبة الهاوية",
        emoji: "🤸",
        chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); monster.atk = Math.floor(monster.atk * 1.1); log.push(`🌑 **أرتورياس** سحق **${target.name}** وازداد غضباً!`); }
        }
    },
    "سول أوف سيندر": {
        name: "كومبو السيف الملتوي",
        emoji: "🔥",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.3), turns:2}); log.push(`🔥 **روح الرماد** أحرق **${target.name}**!`); }
        }
    },
    "مانوس أبو الهاوية": {
        name: "وابل الظلام (Dark Bead)",
        emoji: "⚫",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 1.6)); p.effects.push({ type: 'blind', val: 0.5, turns: 2 }); } });
            log.push(`⚫ **مانوس** أطلق سحر **وابل الظلام**! (ضرر + عمى)`);
        }
    },

    // === Final Fantasy ===
    "سيفيروث": {
        name: "سوبر نوفا",
        emoji: "🌌",
        chance: 0.15,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { const dmg = Math.floor(p.hp * 0.5); applyDamageToPlayer(p, dmg); p.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); } });
            log.push(`🌌 **سيفيروث** دمر النظام الشمسي بـ **سوبر نوفا**! (HP -50%)`);
        }
    },

    // === DMC ===
    "فيرجل، العاصفة المقتربة": {
        name: "Judgment Cut End",
        emoji: "⚔️",
        chance: 0.20,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.3)); });
            log.push(`⚔️ **فيرجل** قطع الزمان والمكان!`);
        }
    },
    "دانتي صائد الشياطين": {
        name: "Devil Trigger",
        emoji: "😈",
        chance: 0.20,
        execute: (monster, players, log) => {
            monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(monster.maxHp * 0.15));
            monster.atk = Math.floor(monster.atk * 1.25);
            log.push(`😈 **دانتي** فعل **Devil Trigger**! (شفاء + زيادة هجوم)`);
        }
    },
    "نيمسيس": {
        name: "قاذف الصواريخ",
        emoji: "🚀",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); log.push(`🚀 **نيمسيس** أطلق صاروخاً على **${target.name}**!`); }
        }
    },
    "ويسكر المتحول": {
        name: "انتقال فوري",
        emoji: "🕶️",
        chance: 0.30,
        execute: (monster, players, log) => {
            const target = players.filter(p => !p.isDead).sort((a,b) => b.atk - a.atk)[0]; // استهداف الأقوى هجوماً (DPS)
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); target.skipCount = (target.skipCount||0)+1; log.push(`🕶️ **ويسكر** باغث **${target.name}** بسرعة خارقة!`); }
        }
    },
    "بيراميد هيد": {
        name: "حكم الإعدام",
        emoji: "🔪",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.2), turns:3}); log.push(`🔪 **بيراميد هيد** شق **${target.name}** بسكينه العظيم! (نزيف)`); }
        }
    },

    // === WoW / Diablo ===
    "آرثاس، الليتش كينج": {
        name: "غضب فروستمورن",
        emoji: "❄️",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); target.effects.push({ type: 'weakness', val: 0.5, turns: 3 }); log.push(`❄️ **آرثاس** جمد روح **${target.name}**!`); }
        }
    },
    "إليدان ستورمريج": {
        name: "أشعة العين (Eye Beam)",
        emoji: "🟢",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.2)); });
            log.push(`🟢 **إليدان** أحرق الجميع بأشعة الفيل!`);
        }
    },
    "ديث وينج المدمر": {
        name: "كتاكليزم",
        emoji: "🔥",
        chance: 0.10,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 2)); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.3), turns: 5 }); } });
            log.push(`🔥 **ديث وينج** أحرق العالم! (ضرر هائل + حرق)`);
        }
    },
    "ديابلو سيد الرعب": {
        name: "برق الجحيم الأحمر",
        emoji: "🔴",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'confusion', val:0.3, turns:2}); } });
            log.push(`🔴 **ديابلو** بث الرعب في القلوب!`);
        }
    },
    "باعل سيد الدمار": {
        name: "نسخة الظل",
        emoji: "👥",
        chance: 0.20,
        execute: (monster, players, log) => {
            monster.effects.push({ type: 'evasion', val: 0.5, turns: 2 }); // 50% مراوغة
            log.push(`👥 **باعل** استدعى نسخة، مما جعل إصابته صعبة!`);
        }
    },
    "ميفيستو سيد الكراهية": {
        name: "نوفا السموم",
        emoji: "☠️",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) p.effects.push({type:'poison', val: Math.floor(monster.atk*0.4), turns:3}); });
            log.push(`☠️ **ميفيستو** أطلق موجة سموم قاتلة!`);
        }
    },
    "الملك تيرانيوس": {
        name: "زئير مرعب",
        emoji: "🦖",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead && Math.random()<0.5) p.skipCount = (p.skipCount||0)+1; });
            log.push(`🦖 **تيرانيوس** زأر بقوة مرعبة! (إلغاء أدوار)`);
        }
    },

    // === God of War ===
    "زيوس جبار الصواعق": {
        name: "غضب الأولمب",
        emoji: "⚡",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(t => { if(!t.isDead) applyDamageToPlayer(t, Math.floor(monster.atk * 1.2)); });
            log.push(`⚡ **زيوس** ألقى الصواعق على الجميع!`);
        }
    },
    "كريتوس شبح إسبارطة": {
        name: "غضب إسبارطة",
        emoji: "😡",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 3.0)); log.push(`😡 **كريتوس** فقد أعصابه وانهال بالضرب على **${target.name}**!`); }
        }
    },

    // === Guardians (الحراس) ===
    "حارس البوابة الأخير": { name: "الدرع العظيم", emoji: "🛡️", chance: 0.3, execute: (m,p,l) => { m.hp += Math.floor(m.maxHp * 0.1); l.push(`🛡️ **الحارس** رفع درعه وترمم!`); } },
    "درع العرش المنيع": { name: "عكس الضرر", emoji: "🔄", chance: 0.3, execute: (m,p,l) => { m.effects.push({type:'reflect', val:0.5, turns:2}); l.push(`🔄 **درع العرش** فعل وضعية الانعكاس!`); } },
    "حامي الختم المقدس": { name: "تطهير", emoji: "✨", chance: 0.3, execute: (m,p,l) => { m.effects = []; m.hp += Math.floor(m.maxHp*0.05); l.push(`✨ **الحامي** طهر نفسه من اللعنات!`); } },
    "ظل الملك القاتل": { name: "اغتيال", emoji: "🗡️", chance: 0.3, execute: (m,p,l) => { const t=p.filter(x=>!x.isDead).sort((a,b)=>a.hp-b.hp)[0]; if(t){applyDamageToPlayer(t, Math.floor(m.atk*2)); l.push(`🗡️ **الظل** اغتال أضعف حلقة: **${t.name}**!`);} } },
    "الجنرال الذي لا يقهر": { name: "هجوم كاسح", emoji: "⚔️", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*1.2))}); l.push(`⚔️ **الجنرال** نفذ هجوماً كاسحاً!`); } },
    "المدرع الأسطوري": { name: "تحطيم الأرض", emoji: "🔨", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, m.atk)}); l.push(`🔨 **المدرع** حطم الأرض تحتكم!`); } },
    "كابوس الأبعاد": { name: "رعب", emoji: "👻", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'confusion',val:0.5,turns:2})}); l.push(`👻 **الكابوس** بث الرعب في القلوب!`); } },
    "حارس الجحيم الأزلي": { name: "نفس اللهب", emoji: "🔥", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:3})}); l.push(`🔥 **الحارس** نفث نيران الجحيم!`); } }
};

// --- Helper Functions ---

function ensureInventoryTable(sql) {
    if (!sql.open) return;
    sql.prepare(`
        CREATE TABLE IF NOT EXISTS user_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildID TEXT,
            userID TEXT,
            itemID TEXT,
            quantity INTEGER DEFAULT 0,
            UNIQUE(guildID, userID, itemID)
        );
    `).run();
}

function getRandomImage(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function getBaseFloorMora(floor) {
    if (floor <= 10) return 100;
    const tier = floor - 10;
    return Math.floor(100 + (tier * 50) + (Math.pow(tier, 1.8))); 
}

function applyDamageToPlayer(player, damageAmount) {
    let remainingDamage = damageAmount;
    
    // Check for Evasion
    if (player.effects.some(e => e.type === 'evasion')) {
        return 0; // Full dodge
    }

    // Check for Defense Buff
    const defBuff = player.effects.find(e => e.type === 'def_buff');
    if (defBuff) {
        remainingDamage = Math.floor(remainingDamage * (1 - defBuff.val));
    }

    // Check for Damage Reduction
    const dmgReduction = player.effects.find(e => e.type === 'dmg_reduce');
    if (dmgReduction) {
        remainingDamage = Math.floor(remainingDamage * (1 - dmgReduction.val));
    }

    if (player.shield > 0) {
        if (remainingDamage <= player.shield) {
            player.shield -= remainingDamage;
            remainingDamage = 0;
        } else {
            remainingDamage -= player.shield;
            player.shield = 0;
        }
    }
    player.hp -= remainingDamage;
    if (player.hp < 0) player.hp = 0;
    return remainingDamage; 
}

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    return clean.trim() || "لاعب";
}

function buildHpBar(currentHp, maxHp, shield = 0) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    let bar = `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
    if (shield > 0) bar += ` 🛡️(${shield})`;
    return bar;
}

function getRealPlayerData(member, sql, assignedClass = 'Adventurer') {
    const guildID = member.guild.id;
    const userID = member.id;
    const userData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    const level = userData ? userData.level : 1;
    const maxHp = BASE_HP + (level * HP_PER_LEVEL);

    let damage = 15;
    let weaponName = "قبضة اليد";
      
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID));

    if (userRace) {
        const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
        if (weaponConfig) {
            const userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(userID, guildID, userRace.raceName);
            if (userWeapon && userWeapon.weaponLevel > 0) {
                damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));
                weaponName = `${weaponConfig.name} (Lv.${userWeapon.weaponLevel})`;
            }
        }
    }

    const skillsOutput = {};
    const userSkillsData = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(member.id, member.guild.id);
      
    if (userSkillsData) {
        userSkillsData.forEach(userSkill => {
            const skillConfig = skillsConfig.find(s => s.id === userSkill.skillID);
            if (skillConfig && userSkill.skillLevel > 0) {
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (userSkill.skillLevel - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: userSkill.skillLevel, effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && !skillsOutput[raceSkillId]) {
            skillsOutput[raceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }

    return {
        id: userID,
        name: cleanDisplayName(member.displayName),
        avatar: member.user.displayAvatarURL(),
        level: level,
        hp: maxHp,
        maxHp: maxHp,
        atk: damage,
        weaponName: weaponName,
        skills: skillsOutput,
        isDead: false,
        defending: false,
        skillCooldowns: {},
        shield: 0,
        tempAtkMultiplier: 1.0,
        critRate: 0, 
        effects: [],
        totalDamage: 0,
        skipCount: 0, 
        loot: { mora: 0, xp: 0 },
        class: assignedClass, 
        special_cooldown: 0, 
        summon: null,
        reviveCount: 0, 
        isPermDead: false 
    };
}

function getRandomMonster(type, theme) {
    let pool = [];
    if (type === 'boss') pool = dungeonConfig.monsters.bosses;
    else if (type === 'guardian') pool = dungeonConfig.monsters.guardians;
    else if (type === 'elite') pool = dungeonConfig.monsters.elites;
    else pool = dungeonConfig.monsters.minions;
      
    if (!pool || pool.length === 0) pool = dungeonConfig.monsters.minions;

    const name = pool[Math.floor(Math.random() * pool.length)];
    return { name, emoji: theme.emoji };
}

function buildSkillSelector(player) {
    const options = [];

    if (player.id === OWNER_ID) {
        options.push(new StringSelectMenuOptionBuilder().setLabel('تركيز تام').setValue('skill_secret_owner').setDescription('ضربة قاضية خاصة بالمالك.').setEmoji('👁️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('رحيل بصمت').setValue('skill_owner_leave').setDescription('ترك الوحش يحتضر والمغادرة.').setEmoji('🚪'));
        
        options.push(new StringSelectMenuOptionBuilder().setLabel('صرخة الحرب').setValue('class_leader').setDescription('زيادة ضرر الفريق 30%.').setEmoji('👑'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استفزاز وتصليب').setValue('class_tank').setDescription('جذب الوحش وتقليل الضرر 60%.').setEmoji('🛡️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('النور المقدس').setValue('class_priest').setDescription('شفاء الفريق أو إحياء ميت.').setEmoji('✨'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('سجن الجليد').setValue('class_mage').setDescription('تجميد الوحش.').setEmoji('❄️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استدعاء حارس الظل').setValue('class_summoner').setDescription('استدعاء وحش مساند.').setEmoji('🐺'));

        skillsConfig.forEach(s => {
             if (!options.some(o => o.data.value === s.id)) {
                 options.push(new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id).setDescription(s.description ? s.description.substring(0, 90) : "مهارة").setEmoji(s.emoji || '📜'));
             }
        });

    } else {
        const cd = player.special_cooldown;
        const cdText = cd > 0 ? ` (كولداون: ${cd})` : '';
        
        let myClassSkill = null;
        if (player.class === 'Leader') myClassSkill = { name: "صرخة الحرب", desc: "زيادة ضرر الفريق 30%.", emoji: "👑" };
        else if (player.class === 'Tank') myClassSkill = { name: "استفزاز وتصليب", desc: "جذب الوحش وتقليل الضرر 60%.", emoji: "🛡️" };
        else if (player.class === 'Priest') myClassSkill = { name: "النور المقدس", desc: "شفاء الفريق أو إحياء ميت.", emoji: "✨" };
        else if (player.class === 'Mage') myClassSkill = { name: "سجن الجليد", desc: "تجميد الوحش.", emoji: "❄️" };
        else if (player.class === 'Summoner') myClassSkill = { name: "استدعاء حارس الظل", desc: "استدعاء وحش مساند.", emoji: "🐺" };

        if (myClassSkill) {
            options.push(new StringSelectMenuOptionBuilder()
                .setLabel(myClassSkill.name)
                .setValue('class_special_skill')
                .setDescription(`${myClassSkill.desc}${cdText}`)
                .setEmoji(myClassSkill.emoji));
        }

        const userSkills = player.skills || {};
        const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
        
        availableSkills.forEach(skill => {
            const cooldown = player.skillCooldowns[skill.id] || 0;
            const description = (cooldown > 0) ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
            options.push(new StringSelectMenuOptionBuilder()
                .setLabel(skill.name)
                .setValue(skill.id)
                .setDescription(description.substring(0, 100))
                .setEmoji(skill.emoji || '✨'));
        });
    }

    if (options.length === 0) return null;
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId('skill_select_menu')
        .setPlaceholder('اختر مهارة لتفعيلها...')
        .addOptions(options.slice(0, 25))
    );
}

function buildPotionSelector(player, sql, guildID) {
    ensureInventoryTable(sql); 
    const userItems = sql.prepare("SELECT itemID, quantity FROM user_inventory WHERE userID = ? AND guildID = ?").all(player.id, guildID);
    
    const potions = userItems.map(ui => {
        const itemDef = potionItems.find(si => si.id === ui.itemID);
        if (itemDef) return { ...itemDef, quantity: ui.quantity };
        return null;
    }).filter(p => p !== null && p.quantity > 0);

    if (potions.length === 0) return null;

    const options = potions.map(p => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(`${p.name} (x${p.quantity})`)
            .setValue(`use_potion_${p.id}`)
            .setDescription(p.description.substring(0, 90))
            .setEmoji(p.emoji);
    });

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('potion_select_menu')
            .setPlaceholder('اختر جرعة لشربها...')
            .addOptions(options.slice(0, 25))
    );
}

// 🟢 SKILL USAGE FUNCTION (Updated Cooldowns: Class=6, Race=5, Std=3)
function handleSkillUsage(player, skill, monster, log, threadChannel, players) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    // 🔥 Calculate Buffs 🔥
    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    if (skill.id === 'skill_secret_owner') {
        skillDmg = Math.floor(monster.maxHp * 0.50); 
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم الوحش لنصفين! (**${skillDmg}** ضرر)`);
        return;
    }

    if (skill.id === 'skill_owner_leave') {
        monster.hp = 1; 
        log.push(`🚪 **${player.name}** غادر بلمح البصر، وترك الوحش يترنح (HP: 1)!`);
        if (threadChannel) threadChannel.send(`🚪 **${player.name}** غادر الدانجون بلمح البصر!`).catch(()=>{});
        return { type: 'owner_leave' };
    }

    // --- Class Skills (Cooldown: 6 Turns) ---
    let classType = null;
    if (skill.id === 'class_special_skill') {
        classType = player.class;
    } else if (skill.id.startsWith('class_')) {
        let rawType = skill.id.split('_')[1]; 
        classType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    }

    if (classType) {
         if (player.special_cooldown > 0 && player.id !== OWNER_ID) {
             return { error: `انتظر ${player.special_cooldown} دور.` }; 
         }

         // Set cooldown to 6 for all class skills
         switch(classType) {
             case 'Leader': return { type: 'class_effect', effect: 'leader_buff', cooldown: 6 }; 
             case 'Tank': return { type: 'class_effect', effect: 'tank_taunt', cooldown: 6 }; 
             case 'Priest': return { type: 'class_effect', effect: 'priest_heal', cooldown: (player.id===OWNER_ID?0:6) }; 
             case 'Mage': return { type: 'class_effect', effect: 'mage_freeze', cooldown: 6 }; 
             case 'Summoner': return { type: 'class_effect', effect: 'summon_pet', cooldown: 6 }; 
         }
         return;
    }

    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // Helper to set cooldown (Race=5, Std=3)
    const setCD = (turns = 3) => {
        if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = turns;
    };

    // Race Skill Check
    if (skill.id.startsWith('race_')) {
        setCD(5); 
    } else {
        setCD(3); // Default standard
    }

    switch (skill.stat_type) {
        case 'TrueDMG_Burn': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أطلق ${skill.name} وأحرق الوحش! (${skillDmg} ضرر)`);
            break;
        }
        case 'Cleanse_Buff_Shield': { 
            player.effects = player.effects.filter(e => e.type === 'buff' || e.type === 'atk_buff'); 
            const shieldVal = Math.floor(player.maxHp * (value / 100));
            player.shield += shieldVal;
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            log.push(`⚔️ **${player.name}** استجمع قواه! (تطهير + درع ${shieldVal} + هجوم)`);
            break;
        }
        case 'Scale_MissingHP_Heal': { 
            const missingHpPercent = (player.maxHp - player.hp) / player.maxHp;
            const extraDmg = Math.floor(effectiveAtk * missingHpPercent * 2);
            skillDmg = (Math.floor(effectiveAtk * 1.2) + extraDmg) * mult;
            const healVal = Math.floor(player.maxHp * 0.15);
            monster.hp -= skillDmg;
            player.hp = Math.min(player.maxHp, player.hp + healVal);
            player.totalDamage += skillDmg;
            log.push(`⚖️ **${player.name}** عاقب الوحش وشفى نفسه! (${skillDmg} ضرر / +${healVal} HP)`);
            break;
        }
        case 'Sacrifice_Crit': { 
            const selfDmg = Math.floor(player.maxHp * 0.10);
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult;
            applyDamageToPlayer(player, selfDmg);
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`👹 **${player.name}** ضحى بدمه (-${selfDmg}) لتوجيه ضربة مدمرة! (**${skillDmg}** ضرر)`);
            break;
        }
        case 'Stun_Vulnerable': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.frozen = true; 
            monster.effects.push({ type: 'weakness', val: 0.5, turns: 1 }); 
            player.totalDamage += skillDmg;
            log.push(`🍃 **${player.name}** شل حركة الوحش وجعل دفاعه هشاً! (${skillDmg} ضرر)`);
            break;
        }
        case 'Confusion': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); 
            player.totalDamage += skillDmg;
            log.push(`😵 **${player.name}** ألقى لعنة الجنون على الوحش! (${skillDmg} ضرر)`);
            break;
        }
        case 'Lifesteal_Overheal': { 
            skillDmg = Math.floor(effectiveAtk * 1.4) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const healVal = Math.floor(skillDmg * 0.5);
            const missingHp = player.maxHp - player.hp;
            if (healVal > missingHp) {
                player.hp = player.maxHp;
                const overHeal = healVal - missingHp;
                player.shield += Math.floor(overHeal * 0.5);
                log.push(`🍷 **${player.name}** امتص الدماء! (شفاء تام + درع ${Math.floor(overHeal * 0.5)})`);
            } else {
                player.hp += healVal;
                log.push(`🍷 **${player.name}** امتص ${healVal} من الصحة!`);
            }
            break;
        }
        case 'Chaos_RNG': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const effects = ['burn', 'weakness', 'confusion', 'blind'];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            
            if (randomEffect === 'burn') monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            else if (randomEffect === 'weakness') monster.effects.push({ type: 'weakness', val: 0.3, turns: 2 });
            else if (randomEffect === 'confusion') monster.effects.push({ type: 'confusion', val: 0.4, turns: 2 });
            else if (randomEffect === 'blind') monster.effects.push({ type: 'blind', val: 0.5, turns: 2 });

            log.push(`🌀 **${player.name}** أثار الفوضى بتأثير عشوائي (${randomEffect})!`);
            break;
        }
        case 'Dmg_Evasion': { 
            skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            player.effects.push({ type: 'evasion', val: 1, turns: 1 }); 
            log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة)`);
            break;
        }
        case 'Reflect_Tank': { 
            const shieldVal = Math.floor(player.maxHp * 0.2);
            player.shield += shieldVal;
            player.effects.push({ type: 'dmg_reduce', val: 0.6, turns: 2 });
            player.effects.push({ type: 'reflect', val: 0.4, turns: 2 }); 
            log.push(`🔨 **${player.name}** تحصن بالجبل! (دفاع عالٍ + عكس الضرر)`);
            break;
        }
        case 'Execute_Heal': { 
            skillDmg = Math.floor(effectiveAtk * 1.8) * mult;
            if (monster.hp - skillDmg <= 0) {
                monster.hp = 0;
                player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.25));
                log.push(`🥩 **${player.name}** افترس الوحش واستعاد 25% صحة!`);
            } else {
                monster.hp -= skillDmg;
                log.push(`🧟 **${player.name}** نهش الوحش بضرر **${skillDmg}**!`);
            }
            player.totalDamage += skillDmg;
            break;
        }
        
        default: {
            switch (skill.id) {
                case 'skill_rebound': 
                case 'potion_reflect': { 
                     const reflectPercent = (value > 0 ? value / 100 : 0.5) * mult;
                     player.effects.push({ type: 'reflect', val: reflectPercent, turns: 1 });
                     log.push(`🌵 **${player.name}** جهز درع الأشواك (انعكاس)!`);
                     break;
                }
                case 'skill_healing':
                case 'skill_cleanse': {
                    let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
                    if (skill.id === 'skill_cleanse') {
                        player.effects = []; 
                        log.push(`✨ **${player.name}** تطهر وشفى **${healAmount}** HP.`);
                    } else {
                        log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
                    }
                    player.hp = Math.min(player.maxHp, player.hp + healAmount);
                    break;
                }
                case 'skill_shielding': {
                     if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
                     let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
                     player.shield = shieldAmount; 
                     log.push(`${skill.emoji} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
                     break;
                }
                case 'skill_buffing': {
                     player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
                     log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
                     break;
                }
                case 'skill_poison': {
                     skillDmg = Math.floor(effectiveAtk * 0.5) * mult; 
                     monster.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)) * mult, turns: 3 });
                     monster.hp -= skillDmg;
                     player.totalDamage += skillDmg; 
                     log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg}).`);
                     break;
                }
                case 'skill_gamble': {
                     const isSuccess = Math.random() < 0.5; 
                     if (isSuccess) {
                         const bonusDmg = Math.floor(Math.random() * (250 - 80 + 1)) + 80;
                         skillDmg = (effectiveAtk + bonusDmg) * mult; 
                         log.push(`🎲 **${player.name}** خاطر ونجح! سدد ضربة قوية بمقدار **${skillDmg}**!`);
                     } else {
                         const selfDamage = Math.floor(Math.random() * (30 - 10 + 1)) + 10;
                         skillDmg = 0;
                         applyDamageToPlayer(player, selfDamage);
                         log.push(`🎲 **${player.name}** خسر الرهان! وانفجرت النردات مسببة **${selfDamage}** ضرر!`);
                     }
                     if (skillDmg > 0) {
                        monster.hp -= skillDmg;
                        player.totalDamage += skillDmg; 
                     }
                     break;
                }
                case 'skill_weaken': {
                     skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
                     monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
                     monster.hp -= skillDmg;
                     player.totalDamage += skillDmg; 
                     log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
                     break;
                }
                case 'skill_dispel': {
                    monster.effects = []; 
                    log.push(`💨 **${player.name}** بدد السحر!`);
                    break;
                }
                default: {
                    let multiplier = skill.stat_type === '%' ? (1 + (value/100)) : 1;
                    skillDmg = Math.floor((effectiveAtk * multiplier) + (skill.stat_type !== '%' ? value : 0)) * mult;
                    monster.hp -= skillDmg;
                    player.totalDamage += skillDmg; 
                    log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
                    break;
                }
            }
            break;
        }
    }
}

function generateBattleEmbed(players, monster, floor, theme, log, actedPlayers = [], color = '#2F3136') {
    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | ضد ${monster.name}`)
        .setColor(color);

    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'burn')) monsterStatus += " 🔥";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";
    if (monster.effects.some(e => e.type === 'confusion')) monsterStatus += " 😵";
    if (monster.frozen) monsterStatus += " ❄️";

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    let teamStatus = players.map(p => {
        let icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '');
        let arabClass = p.class;
        
        if (p.class === 'Leader') { arabClass = 'القائد'; icon += '👑'; }
        else if (p.class === 'Tank') arabClass = 'مُدرّع';
        else if (p.class === 'Priest') arabClass = 'كاهن';
        else if (p.class === 'Mage') arabClass = 'ساحر';
        else if (p.class === 'Summoner') { arabClass = 'مستدعٍ'; if(p.summon && p.summon.active) icon += '🐺'; }
        else if (p.class === '???') { arabClass = '؟؟؟'; icon += '👁️'; } 

        const hpBar = p.isDead ? (p.isPermDead ? 'تحللت الجثة' : 'MORT') : buildHpBar(p.hp, p.maxHp, p.shield);
        let displayName;
        let statusCircle;

        if (p.isDead) {
            statusCircle = "💀";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else if (actedPlayers.includes(p.id)) {
            statusCircle = "🔴";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else {
            statusCircle = "🟢";
            displayName = `<@${p.id}> [${arabClass}]`; 
        }

        return `${statusCircle} ${icon} ${displayName}\n${hpBar}`;
    }).join('\n\n');

    embed.addFields({ name: `🛡️ **فريق المغامرين**`, value: teamStatus, inline: false  });

    if (log.length > 0) {
        embed.addFields({ name: "سجل المعركة:", value: log.join('\n'), inline: false });
    }

    return embed;
}

function generateBattleRows() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('skill').setLabel('المهارات').setEmoji('✨').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests) {
    const guild = threadChannel.guild;
    ensureInventoryTable(sql); 

    let players = [];
    let retreatedPlayers = [];
      
    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m, index) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            players.push(getRealPlayerData(m, sql, cls));
        }
    });

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.");
    }

    const maxFloors = 100; 
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    for (let floor = 1; floor <= maxFloors; floor++) {
        if (players.every(p => p.isDead)) break; 

        for (let p of players) {
            if (!p.isDead) { 
                p.shield = 0; p.effects = []; p.defending = false; p.summon = null; 
            } 
        }

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || dungeonConfig.floors[dungeonConfig.floors.length - 1];
        const randomMob = getRandomMonster(floorConfig.type, theme);

        let finalHp, finalAtk;
        
        if (floor <= 10) {
            const baseFloorHP = 300 + ((floor - 1) * 100);
            const baseAtk = 15 + (floor * 3);
            finalHp = Math.floor(baseFloorHP * (floorConfig.hp_mult || 1));
            finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));
        } else {
            const tier = floor - 10;
            const baseFloorHP = 1200 + (Math.pow(tier, 2) * 50); 
            const baseAtk = 45 + (tier * 5); 
            finalHp = Math.floor(baseFloorHP * (floorConfig.hp_mult || 1));
            finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));
        }

        let monster = {
            name: `${randomMob.name} (Lv.${floor})`, 
            hp: finalHp, maxHp: finalHp, atk: finalAtk, 
            enraged: false, effects: [], targetFocusId: null, frozen: false 
        };

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        let ongoing = true;
        let turnCount = 0;

        let battleMsg = await threadChannel.send({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
            components: generateBattleRows() 
        });

        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(() => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    if (afkPlayers.length > 0) {
                          afkPlayers.forEach(afkP => {
                                afkP.skipCount = (afkP.skipCount || 0) + 1;
                                monster.targetFocusId = afkP.id;
                                threadChannel.send(`⚠️ **${afkP.name}** <@${afkP.id}> تم تخطي دورك بسبب عدم الاستجابة!`).catch(()=>{});
                          });
                    }
                    collector.stop('turn_end'); 
                }, 45000); 

                collector.on('collect', async i => {
                    if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{});
                    if (processingUsers.has(i.user.id)) return;
                    
                    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
                        let ownerPlayer = players.find(pl => pl.id === OWNER_ID);
                        if (!ownerPlayer) {
                             const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
                             if (member) {
                                 ownerPlayer = getRealPlayerData(member, sql, '???'); 
                                 players.push(ownerPlayer);
                                 log.push(`👑 **اقتـحـام الأونـر!**`);
                             }
                        }
                    }

                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) return;
                    
                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.followUp({ content: "❌ لا توجد مهارات.", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true, fetchReply: true });
                                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                                await selection.deferUpdate().catch(()=>{}); 

                                const skillId = selection.values[0];
                                
                                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                if (shieldSkills.includes(skillId) && p.shield > 0) {
                                    await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                                    processingUsers.delete(i.user.id); return; 
                                }

                                actedPlayers.push(p.id);
                                let skillNameUsed = "مهارة";

                                if (skillId === 'class_special_skill' || skillId.startsWith('class_')) {
                                    const res = handleSkillUsage(p, { id: skillId }, monster, log, threadChannel, players);
                                    if (res && res.error) {
                                        await selection.editReply({ content: `⏳ ${res.error}`, components: [] }).catch(()=>{});
                                        processingUsers.delete(i.user.id); return;
                                    }
                                    if (res && res.type === 'class_effect') {
                                        if (res.effect === 'leader_buff') {
                                            players.forEach(m => { 
                                                if(!m.isDead) {
                                                    m.effects.push({ type: 'atk_buff', val: 0.3, turns: 2 });
                                                    m.critRate = (m.critRate || 0) + 0.2; 
                                                } 
                                            });
                                            log.push(`⚔️ **${p.name}** أطلق صرخة الحرب! (ATK & Luck UP)`);
                                            skillNameUsed = "صرخة الحرب";
                                        } else if (res.effect === 'tank_taunt') {
                                            monster.targetFocusId = p.id;
                                            p.effects.push({ type: 'def_buff', val: 0.6, turns: 2 }); 
                                            log.push(`🛡️ **${p.name}** استفز الوحش وتصلب!`);
                                            skillNameUsed = "استفزاز وتصليب";
                                        } else if (res.effect === 'priest_heal') {
                                            const dead = players.filter(m => m.isDead && !m.isPermDead); 
                                            if (dead.length > 0) {
                                                const t = dead[0]; 
                                                if (t.reviveCount >= 1) {
                                                    t.isPermDead = true;
                                                    log.push(`💀 **${t.name}** تحللت جثته وزهقت روحه ولا يمكن إحياؤه!`);
                                                    threadChannel.send(`💀 **${t.name}** <@${t.id}> تحللت جثته وزهقت روحه!`).catch(()=>{});
                                                } else {
                                                    t.isDead = false; 
                                                    t.hp = Math.floor(t.maxHp * 0.2);
                                                    t.reviveCount = (t.reviveCount || 0) + 1;
                                                    applyDamageToPlayer(p, Math.floor(p.maxHp * 0.1));
                                                    log.push(`✨ **${p.name}** أحيا **${t.name}**!`);
                                                    threadChannel.send(`✨ **${p.name}** قام بإحياء **${t.name}** <@${t.id}>!`).catch(()=>{});
                                                    p.special_cooldown = 7;
                                                }
                                            } else {
                                                players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                                                log.push(`✨ **${p.name}** عالج الفريق!`);
                                                p.special_cooldown = 6;
                                            }
                                            skillNameUsed = "النور المقدس";
                                        } else if (res.effect === 'mage_freeze') {
                                            monster.frozen = true;
                                            log.push(`❄️ **${p.name}** جمد الوحش!`);
                                            skillNameUsed = "سجن الجليد";
                                        } else if (res.effect === 'summon_pet') {
                                            p.summon = { active: true, turns: 3 };
                                            log.push(`🐺 **${p.name}** استدعى الحارس!`);
                                            skillNameUsed = "استدعاء حارس الظل";
                                        }
                                        if (res.cooldown && res.effect !== 'priest_heal') p.special_cooldown = res.cooldown;
                                    }
                                } else {
                                    if (skillId === 'skill_owner_leave') {
                                        const res = handleSkillUsage(p, { id: skillId }, monster, log, threadChannel);
                                        if (res && res.type === 'owner_leave') {
                                            players = players.filter(pl => pl.id !== OWNER_ID);
                                            if (players.length === 0) { collector.stop('monster_dead'); return; }
                                        }
                                        skillNameUsed = "رحيل بصمت";
                                    } else {
                                        let skillObj = { id: skillId, name: 'Skill', effectValue: 0 };
                                        if (skillId === 'skill_secret_owner') skillObj = { id: skillId, name: 'تركيز تام' };
                                        else if (p.skills[skillId]) skillObj = p.skills[skillId];
                                        else if (p.id === OWNER_ID) {
                                            const sConf = skillsConfig.find(s=>s.id === skillId);
                                            if(sConf) skillObj = { ...sConf, effectValue: sConf.base_value * 2 };
                                        }
                                        handleSkillUsage(p, skillObj, monster, log, threadChannel);
                                        skillNameUsed = skillObj.name;
                                        if (skillId !== 'skill_secret_owner' && p.id !== OWNER_ID) p.skillCooldowns[skillId] = skillObj.cooldown || 3;
                                    }
                                }
                                p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                            } catch (err) { 
                                processingUsers.delete(i.user.id); return; 
                            }
                        } 
                        else if (i.customId === 'heal') {
                            const potionRow = buildPotionSelector(p, sql, guild.id);
                            if (!potionRow) {
                                await i.followUp({ content: "❌ لا تملك جرعات في حقيبتك!", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], ephemeral: true, fetchReply: true });
                                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                                await selection.deferUpdate().catch(()=>{});
                                const potionId = selection.values[0].replace('use_potion_', '');
                                sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);

                                let actionMsg = "";
                                if (potionId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    actionMsg = "🧪 استعاد 50% HP!";
                                } else if (potionId === 'potion_reflect') {
                                    p.effects.push({ type: 'reflect', val: 0.5, turns: 2 });
                                    actionMsg = "🌵 جهز درع الأشواك!";
                                } else if (potionId === 'potion_time') {
                                    p.special_cooldown = 0;
                                    p.skillCooldowns = {};
                                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                                } else if (potionId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', turns: 3 }); 
                                    monster.targetFocusId = p.id;
                                    actionMsg = "🔥 تحول لعملاق!";
                                } else if (potionId === 'potion_sacrifice') {
                                    p.hp = 0; p.isDead = true; p.isPermDead = true;
                                    players.forEach(ally => {
                                        if (ally.id !== p.id) {
                                            ally.isDead = false;
                                            ally.isPermDead = false;
                                            ally.reviveCount = 0;
                                            ally.hp = ally.maxHp; 
                                            ally.effects = [];
                                        }
                                    });
                                    actionMsg = "💀 شرب جرعة التضحية، تحللت جثته وأنقذ الجميع!";
                                    threadChannel.send(`💀 **${p.name}** شرب جرعة التضحية، تحللت جثته وأنقذ الفريق!`).catch(()=>{});
                                }
                                log.push(`**${p.name}**: ${actionMsg}`);
                                actedPlayers.push(p.id); p.skipCount = 0;
                                await selection.editReply({ content: `✅ ${actionMsg}`, components: [] }).catch(()=>{});
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                            } catch (err) { processingUsers.delete(i.user.id); return; }
                        }
                        else if (i.customId === 'atk' || i.customId === 'def') {
                            actedPlayers.push(p.id); p.skipCount = 0;
                            if (i.customId === 'atk') {
                                let atkMultiplier = 1.0;
                                p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                const currentAtk = Math.floor(p.atk * atkMultiplier);
                                
                                const baseCrit = p.critRate || 0.2;
                                const isCrit = Math.random() < baseCrit;
                                
                                let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                if (isCrit) dmg = Math.floor(dmg * 1.5);
                                monster.hp -= dmg; p.totalDamage += dmg; 
                                log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                            }
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                        }

                        if (monster.hp <= 0) {
                            monster.hp = 0; ongoing = false; collector.stop('monster_dead'); return; 
                        }
                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            if (monster.hp <= 0) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (turnCount % 3 === 0 && ongoing) {
                await battleMsg.delete().catch(()=>{});
                battleMsg = await threadChannel.send({ 
                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                    components: generateBattleRows() 
                });
            }

            if (monster.hp > 0 && ongoing) {
                turnCount++;
                if (monster.frozen) { log.push(`❄️ **${monster.name}** متجمد!`); monster.frozen = false; } 
                else {
                    // 🔥🔥 Monster Effect Handling 🔥🔥
                    if (monster.effects) {
                        monster.effects = monster.effects.filter(e => {
                            if (e.type === 'burn') {
                                const burnDmg = e.val;
                                monster.hp -= burnDmg;
                                log.push(`🔥 **${monster.name}** يحترق! (-${burnDmg} HP)`);
                            }
                            if (e.type === 'poison') {
                                const poisonDmg = e.val;
                                monster.hp -= poisonDmg;
                                log.push(`☠️ **${monster.name}** يتألم من السم! (-${poisonDmg} HP)`);
                            }
                            e.turns--;
                            return e.turns > 0;
                        });
                    }

                    if (monster.hp <= 0) { ongoing = false; break; }

                    // 🔥🔥 Check Confusion 🔥🔥
                    const confusion = monster.effects.find(e => e.type === 'confusion');
                    if (confusion && Math.random() < confusion.val) {
                        const selfDmg = Math.floor(monster.atk * 0.5);
                        monster.hp -= selfDmg;
                        log.push(`😵 **${monster.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg} HP)`);
                    } else {
                        // ========================================================
                        // 🔥 Monster AI & Skills Logic (SMART AI UPDATE) 🔥
                        // ========================================================
                        
                        const alive = players.filter(p => !p.isDead);
                        let skillUsed = false;

                        // 1. Trigger Specific Boss/Guardian Skills (After Floor 17)
                        if (floor > 17 && alive.length > 0) {
                            const baseMonsterName = monster.name.split(' (Lv.')[0].trim();
                            const monsterSkill = MONSTER_SKILLS[baseMonsterName];

                            if (monsterSkill) {
                                // Smart Trigger Chance: Increase probability if low HP (Desperation Mode)
                                let chance = monsterSkill.chance;
                                if (monster.hp < monster.maxHp * 0.3) chance += 0.2; // Increase by 20%

                                if (Math.random() < chance) {
                                    monsterSkill.execute(monster, players, log);
                                    skillUsed = true;
                                }
                            }
                        }

                        // 2. Trigger Generic Skills for Minions/Elites (After Floor 17)
                        if (!skillUsed && floor > 17 && alive.length > 0) {
                            if (Math.random() < 0.20) {
                                const randomGenericSkill = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
                                randomGenericSkill.execute(monster, players, log);
                                skillUsed = true;
                            }
                        }

                        // 3. Normal Attack (if no skill used)
                        if (!skillUsed && alive.length > 0) {
                            
                            // Summoner Pet Attack Logic
                            players.forEach(p => {
                                if (!p.isDead && p.summon && p.summon.active && p.summon.turns > 0) {
                                    const petDmg = Math.floor(p.atk * 0.5);
                                    monster.hp -= petDmg;
                                    p.totalDamage += petDmg;
                                    log.push(`🐺 حارس **${p.name}** نهش الوحش! (${petDmg} ضرر)`);
                                    p.summon.turns--;
                                    if (p.summon.turns <= 0) {
                                        p.summon.active = false;
                                        log.push(`🐺 اختفى حارس **${p.name}**.`);
                                    }
                                }
                            });

                            if (monster.hp <= 0) { ongoing = false; break; }

                            // Smart Targeting for Normal Attacks
                            // Priority: Taunted > Giant > Priest > Weakest > Random
                            let target = alive.find(p => p.id === monster.targetFocusId) || 
                                         alive.find(p => p.effects.some(e => e.type === 'titan')) ||
                                         getSmartTarget(players) || // Use AI Helper
                                         alive[Math.floor(Math.random() * alive.length)];
                            
                            if (target) {
                                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                                
                                if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.75);

                                if(target.defending) dmg = Math.floor(dmg * 0.5);
                                
                                const reflectEffect = target.effects.find(e => e.type === 'reflect');
                                if (reflectEffect) {
                                    const reflected = Math.floor(dmg * reflectEffect.val);
                                    dmg -= reflected;
                                    monster.hp -= reflected;
                                    log.push(`🔄 **${target.name}** عكس **${reflected}** ضرر للوحش!`);
                                }

                                const takenDmg = applyDamageToPlayer(target, dmg);
                                if (takenDmg === 0 && dmg > 0) log.push(`👻 **${target.name}** راوغ الهجوم!`);
                                else log.push(`👹 **${monster.name}** ضرب **${target.name}** (${takenDmg})`);
                                
                                if(target.hp <= 0 && !target.isDead) { 
                                    target.hp = 0; 
                                    target.isDead = true; 
                                    
                                    if (target.class === 'Priest' && !target.isPermDead) {
                                        players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                                        log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
                                        threadChannel.send(`✨⚰️ **${target.name}** سقـط ولكنه عالج الفريق قبل موته!`).catch(()=>{});
                                    }

                                    if (target.reviveCount >= 1) {
                                        target.isPermDead = true;
                                        log.push(`💀 **${target.name}** سقط وتحللت جثته!`);
                                        threadChannel.send(`💀 **${target.name}** سقط وتحللت جثته (لا يمكن إحياؤه)!`).catch(()=>{});
                                    } else {
                                        log.push(`💀 **${target.name}** سقط!`);
                                        threadChannel.send(`💀 **${target.name}** سقط في أرض المعركة!`).catch(()=>{});
                                    }
                                }
                            }
                        }
                    }
                }
                if (players.every(p => p.isDead)) ongoing = false;
                else {
                    if (log.length > 5) log = log.slice(-5);
                    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
                }
            }
        }

        if (players.every(p => p.isDead)) {
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }

        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora / 3); 
        players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
        totalAccumulatedCoins += baseMora;
        totalAccumulatedXP += floorXp;

        const restEmbed = new EmbedBuilder()
            .setTitle('❖ استـراحـة بيـن الطـوابـق')
            .setDescription(`✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}\n\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`)
            .setColor(Colors.Red)
            .setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');

        const restRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
        );

        const restMsg = await threadChannel.send({ embeds: [restEmbed], components: [restRow] });
        
        const decision = await new Promise(res => {
            const decCollector = restMsg.createMessageComponentCollector({ time: 60000 });
            decCollector.on('collect', async i => {
                if (i.user.id !== hostId) return i.reply({ content: "فقط القائد يقرر.", ephemeral: true });
                await i.deferUpdate(); 
                decCollector.stop(i.customId);
            });
            decCollector.on('end', (c, reason) => res(reason));
        });

        await restMsg.edit({ components: [] }).catch(()=>{});

        if (decision === 'retreat' || decision === 'time') { 
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
            return;
        } else if (decision === 'continue') {
            await threadChannel.send(`**⚔️ قـرر القائد الاستمرار! يتوغل الفريق بالدانجون نحو طوابق أعمق...**`);
        }

        players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)); });
    }
}

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests) {
    if (!sql.open) return;
    let title = "", color = "", randomImage = null;

    if (status === 'win') { title = "❖ أسطـورة الدانـجون !"; color = "#00FF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else if (status === 'retreat') { title = "❖ انـسـحـاب تـكـتيـكـي !"; color = "#FFFF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else { title = "❖ هزيمـة ساحقـة ..."; color = "#FF0000"; randomImage = getRandomImage(LOSE_IMAGES); }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
      
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => (p.totalDamage > c.totalDamage) ? p : c) : null;
      
    let lootString = "";
    allParticipants.forEach(p => {
        let finalMora = Math.floor(p.loot.mora);
        let finalXp = Math.floor(p.loot.xp);
        if (p.isDead) { finalMora = Math.floor(finalMora * 0.5); finalXp = Math.floor(finalXp * 0.5); }
        sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
        lootString += `✬ <@${p.id}>: ${finalMora} ${EMOJI_MORA} | ${finalXp} XP\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'N/A'}\n\n${lootString}`)
        .setColor(color).setImage(randomImage).setTimestamp();

    await mainChannel.send({ content: activePlayers.map(p => `<@${p.id}>`).join(' '), embeds: [embed] });
    activeDungeonRequests.delete(hostId);
      
    if (floor >= 10) {
        if (status === 'lose') {
            const debuffDuration = 15 * 60 * 1000;
            const expiresAt = Date.now() + debuffDuration;
              
            allParticipants.forEach(p => {
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'mora', -0.15);
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'xp', -0.15);
            });
            await mainChannel.send(`**💀 لعنـة الهزيمـة:** أصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`).catch(()=>{});

        } else if (mvpPlayer) {
            const buffDuration = 15 * 60 * 1000; 
            const expiresAt = Date.now() + buffDuration;
              
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15);

            await mainChannel.send(`**✨ نجـم المعركـة (ضرر: ${mvpPlayer.totalDamage.toLocaleString()}):** <@${mvpPlayer.id}>\nحصل على تعزيز **15%** مورا واكس بي لـ **15د** ${EMOJI_BUFF}`).catch(()=>{});
        }
    }

    try {
        await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { runDungeon };
