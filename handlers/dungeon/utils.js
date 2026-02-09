// handlers/dungeon/utils.js

const { BASE_HP, HP_PER_LEVEL, potionItems, weaponsConfig, skillsConfig, OWNER_ID } = require('./constants');

// آيدي رتبة العضوية المميزة
const VIP_ROLE_ID = "1395674235002945636";

function ensureInventoryTable(sql) {
    if (!sql.open) return;
      
    // 1. جدول الحقيبة
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

    // 2. جدول إحصائيات الدانجون
    sql.prepare(`
        CREATE TABLE IF NOT EXISTS dungeon_stats (
            guildID TEXT,
            userID TEXT,
            tickets INTEGER DEFAULT 0,
            last_reset TEXT DEFAULT '',
            PRIMARY KEY (guildID, userID)
        );
    `).run();
}

function getRandomImage(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// 🔥🔥🔥 تعديل قيم المورا حسب طلبك 🔥🔥🔥
function getBaseFloorMora(floor) {
    // من 1 إلى 20 (ممتاز كما هو)
    if (floor <= 10) return 100;
    if (floor <= 20) return 200;

    // التعديلات الجديدة
    if (floor <= 30) return 450;
    if (floor <= 40) return 700;
    
    // ⚠️ ملاحظة: لم تذكر 41-50، فوضعتها 850 لتكون وسطاً بين 700 و 1000
    if (floor <= 50) return 850; 

    if (floor <= 60) return 1000;
    if (floor <= 70) return 2000;
    if (floor <= 80) return 3000;
    
    // 81 وفوق (قبل الطابق 100)
    if (floor < 100) return 3500;
    
    // الطابق 100 (كما هو)
    return 25000; 
}

function applyDamageToPlayer(player, damageAmount) {
    damageAmount = Math.floor(damageAmount);
    if (isNaN(damageAmount)) damageAmount = 0;

    player.hp = Math.floor(player.hp);
    if (isNaN(player.hp)) player.hp = player.maxHp || 100;

    if (player.isDead) return 0;

    if (player.id === OWNER_ID) {
        if (player.effects.some(e => e.type === 'evasion')) return 0;
        let actualDamage = damageAmount;
        player.hp = Math.floor(player.hp - actualDamage);
        if (player.hp <= 0) player.hp = 1;
        player.isDead = false;
        return actualDamage;
    }

    let remainingDamage = damageAmount;
      
    if (player.effects.some(e => e.type === 'evasion')) return 0;

    const defBuff = player.effects.find(e => e.type === 'def_buff');
    if (defBuff) remainingDamage = Math.floor(remainingDamage * (1 - defBuff.val));

    const dmgReduction = player.effects.find(e => e.type === 'dmg_reduce');
    if (dmgReduction) remainingDamage = Math.floor(remainingDamage * (1 - dmgReduction.val));

    const hadShield = player.shield > 0;

    if (player.shield > 0) {
        player.shield = Math.floor(player.shield);
        if (remainingDamage <= player.shield) {
            player.shield = Math.floor(player.shield - remainingDamage);
            remainingDamage = 0;
        } else {
            remainingDamage = Math.floor(remainingDamage - player.shield);
            player.shield = 0;
        }
    }

    remainingDamage = Math.floor(remainingDamage);
    player.hp = Math.floor(player.hp - remainingDamage);
      
    if (player.hp <= 0) {
        player.hp = 0;
        player.isDead = true;
    }

    if (hadShield && player.shield <= 0) {
        if (!player.skillCooldowns) player.skillCooldowns = {};
        player.skillCooldowns['skill_shielding'] = 3; 
    }
      
    return remainingDamage; 
}

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    return clean.trim() || "لاعب";
}

function buildHpBar(currentHp, maxHp, shield = 0) {
    currentHp = Math.floor(Math.max(0, currentHp || 0));
    maxHp = Math.floor(maxHp || 100);
    shield = Math.floor(shield || 0);

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
      
    const maxHp = Math.floor(BASE_HP + (level * HP_PER_LEVEL));

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
        atk: Math.floor(damage),
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

function getSaudiDateIso() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

function manageTickets(userID, guildID, sql, action = 'check', member = null) {
    userID = String(userID);
    guildID = String(guildID);

    const levelData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    const level = levelData ? levelData.level : 1;

    let baseTickets = 0;
    if (level >= 61) baseTickets = 10;
    else if (level >= 51) baseTickets = 9;
    else if (level >= 41) baseTickets = 8;
    else if (level >= 31) baseTickets = 7;
    else if (level >= 21) baseTickets = 6;
    else if (level >= 11) baseTickets = 5;
    else if (level >= 5) baseTickets = 3;
    else baseTickets = 0;

    let bonusTickets = 0;
    if (member && member.roles.cache.has(VIP_ROLE_ID)) {
        bonusTickets = 10;
        console.log(`[Tickets] VIP User detected: +10 tickets for ${userID}`);
    }

    let maxTickets = baseTickets + bonusTickets;

    let stats = sql.prepare("SELECT tickets, last_reset FROM dungeon_stats WHERE userID = ? AND guildID = ?").get(userID, guildID);

    const todayStr = getSaudiDateIso(); 

    if (!stats) {
        sql.prepare("INSERT INTO dungeon_stats (guildID, userID, tickets, last_reset) VALUES (?, ?, ?, ?)")
            .run(guildID, userID, maxTickets, todayStr);
        stats = { tickets: maxTickets, last_reset: todayStr };
    }

    let dbDate = stats.last_reset;
    let dbTickets = stats.tickets;

    if (dbDate !== todayStr) {
        console.log(`[DailyLimit] Resetting tickets for ${userID}. New max: ${maxTickets}`);
        
        sql.prepare("UPDATE dungeon_stats SET tickets = ?, last_reset = ? WHERE userID = ? AND guildID = ?")
            .run(maxTickets, todayStr, userID, guildID);
        
        dbTickets = maxTickets;
        dbDate = todayStr;
    } 
    else if (dbTickets < maxTickets && action === 'check') {
       // تحديث فوري إذا زاد الحد الأقصى (اختياري)
    }

    if (action === 'check') {
        return { tickets: dbTickets, max: maxTickets };
    }

    if (action === 'consume') {
        if (dbTickets > 0) {
            const newCount = dbTickets - 1;
            console.log(`[DailyLimit] Consuming ticket for ${userID}. Remaining: ${newCount}`);

            const info = sql.prepare("UPDATE dungeon_stats SET tickets = ? WHERE userID = ? AND guildID = ?")
                .run(newCount, userID, guildID);
                
            if (info.changes > 0) {
                return { success: true, tickets: newCount, max: maxTickets };
            } else {
                return { success: false, tickets: dbTickets, max: maxTickets };
            }
        } else {
            return { success: false, tickets: 0, max: maxTickets };
        }
    }

    return { tickets: dbTickets, max: maxTickets };
}

function calculateThreat(player, baseValue, isTauntSkill = false) {
    let threat = baseValue;
    if (player.class === 'Tank') {
        threat = Math.floor(threat * 3);
        if (isTauntSkill) {
            threat += 2000; 
        }
    }
    return threat;
}

module.exports = {
    ensureInventoryTable,
    getRandomImage,
    getBaseFloorMora,
    applyDamageToPlayer,
    cleanDisplayName,
    buildHpBar,
    getRealPlayerData,
    manageTickets,
    getSaudiDateIso,
    calculateThreat
};
