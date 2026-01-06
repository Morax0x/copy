const { BASE_HP, HP_PER_LEVEL, potionItems, weaponsConfig, skillsConfig, OWNER_ID } = require('./constants');

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
    damageAmount = Math.floor(damageAmount);
    if (isNaN(damageAmount)) damageAmount = 0;

    player.hp = Math.floor(player.hp);
    if (isNaN(player.hp)) {
        player.hp = player.maxHp || 100;
    }

    if (player.isDead) return 0;

    // 🔥🔥🔥 منطق مناعة الأونر 🔥🔥🔥
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

// 🕒 حساب موعد التجديد (السعودية: 12:00 منتصف الليل)
function getNextResetTimestamp() {
    const now = new Date();
    // تحويل الوقت الحالي لتوقيت السعودية (UTC+3)
    const saudiNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    
    const nextReset = new Date(saudiNow);
    nextReset.setUTCDate(saudiNow.getUTCDate() + 1); // غداً
    nextReset.setUTCHours(0, 0, 0, 0); // منتصف الليل

    // نرجع التايم ستامب (UTC الحقيقي)
    return nextReset.getTime() - (3 * 60 * 60 * 1000); 
}

// 🔥 دالة إدارة التذاكر (المحمية والمفحوصة) 🔥
function manageTickets(userID, guildID, sql, action = 'check') {
    userID = String(userID);
    guildID = String(guildID);

    // 1. جلب البيانات
    const userData = sql.prepare("SELECT level, dungeon_tickets, last_ticket_reset FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    
    if (!userData) return { tickets: 0, max: 0 };

    // حساب الحد الأقصى للتذاكر
    const level = userData.level || 1;
    let maxTickets = 0;
    if (level >= 51) maxTickets = 7;
    else if (level >= 31) maxTickets = 5;
    else if (level >= 21) maxTickets = 4;
    else if (level >= 5) maxTickets = 3;
    else maxTickets = 0;

    // قراءة البيانات من القاعدة
    let currentTickets = (userData.dungeon_tickets === null || userData.dungeon_tickets === undefined) ? maxTickets : userData.dungeon_tickets;
    let storedResetTimeRaw = userData.last_ticket_reset; // القيمة الخام
    let nextResetTime = 0;
    let needsReset = false;
    const now = Date.now();

    // 🔬 فحص عميق للسبب (DEBUG LOG) 🔬
    // console.log(`[DEBUG] User: ${userID} | RawTime: ${storedResetTimeRaw} | Tickets: ${currentTickets}`);

    // محاولة تحويل الوقت المخزن لرقم
    if (!storedResetTimeRaw || storedResetTimeRaw === '') {
        // console.log(`[DEBUG] No stored time. Resetting.`);
        needsReset = true;
    } else {
        nextResetTime = parseInt(storedResetTimeRaw);
        
        // التحقق من صلاحية الرقم
        if (isNaN(nextResetTime)) {
             // console.log(`[DEBUG] Time is NaN (Old format?). Resetting.`);
             needsReset = true;
        } else if (now >= nextResetTime) {
             // console.log(`[DEBUG] Time Expired (${now} >= ${nextResetTime}). Resetting.`);
             needsReset = true;
        } else {
             // console.log(`[DEBUG] Time Valid. No Reset.`);
        }
    }

    // متغيرات للحفظ
    let finalTickets = currentTickets;
    let finalResetTime = nextResetTime;

    // 2. تطبيق التجديد إذا لزم الأمر
    if (needsReset) {
        finalTickets = maxTickets;
        finalResetTime = getNextResetTimestamp();
        
        // تحديث القاعدة فوراً
        sql.prepare("UPDATE levels SET dungeon_tickets = ?, last_ticket_reset = ? WHERE user = ? AND guild = ?")
            .run(finalTickets, String(finalResetTime), userID, guildID);
        
        // console.log(`[DEBUG] RESET DONE -> New Tickets: ${finalTickets}, New Time: ${finalResetTime}`);
    }

    // 3. تنفيذ الخصم
    if (action === 'consume') {
        if (finalTickets > 0) {
            // نخصم من القيمة "النهائية" (سواء تجددت الآن أو كانت قديمة)
            let newTicketCount = finalTickets - 1;
            
            // في حالة الخصم، نستخدم الوقت المحسوب (finalResetTime)
            // هذا يضمن أننا لا نكتب "0" أو "NaN" في الخانة
            
            // حماية إضافية: إذا لسبب ما الوقت غير صالح، نعيد حسابه
            if (!finalResetTime || isNaN(finalResetTime)) {
                finalResetTime = getNextResetTimestamp();
            }

            const info = sql.prepare("UPDATE levels SET dungeon_tickets = ?, last_ticket_reset = ? WHERE user = ? AND guild = ?")
                .run(newTicketCount, String(finalResetTime), userID, guildID);

            if (info.changes > 0) {
                // console.log(`[DEBUG] CONSUME SUCCESS -> Tickets: ${newTicketCount}`);
                return { success: true, tickets: newTicketCount, max: maxTickets };
            } else {
                console.error(`[DEBUG] CONSUME FAILED (SQL Error)`);
                return { success: false, tickets: finalTickets, max: maxTickets };
            }
        } else {
            // console.log(`[DEBUG] CONSUME FAILED (Not enough tickets)`);
            return { success: false, tickets: 0, max: maxTickets };
        }
    }

    return { tickets: finalTickets, max: maxTickets };
}

module.exports = {
    ensureInventoryTable,
    getRandomImage,
    getBaseFloorMora,
    applyDamageToPlayer,
    cleanDisplayName,
    buildHpBar,
    getRealPlayerData,
    manageTickets 
};
