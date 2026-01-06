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
    // 🛡️ حماية: التأكد من أن الأرقام صحيحة
    damageAmount = Math.floor(damageAmount);
    if (isNaN(damageAmount)) damageAmount = 0;

    player.hp = Math.floor(player.hp);
    if (isNaN(player.hp)) {
        player.hp = player.maxHp || 100;
    }

    if (player.isDead) return 0;

    // 🔥🔥🔥 منطق مناعة الأونر (Immunity) 🔥🔥🔥
    if (player.id === OWNER_ID) {
        if (player.effects.some(e => e.type === 'evasion')) return 0;

        let actualDamage = damageAmount;
        player.hp = Math.floor(player.hp - actualDamage);
        
        // منع الموت للأونر
        if (player.hp <= 0) player.hp = 1;
        player.isDead = false;
        
        return actualDamage;
    }

    let remainingDamage = damageAmount;
      
    // مراوغة
    if (player.effects.some(e => e.type === 'evasion')) return 0;

    // بوف دفاع
    const defBuff = player.effects.find(e => e.type === 'def_buff');
    if (defBuff) {
        remainingDamage = Math.floor(remainingDamage * (1 - defBuff.val));
    }

    // تقليل ضرر
    const dmgReduction = player.effects.find(e => e.type === 'dmg_reduce');
    if (dmgReduction) {
        remainingDamage = Math.floor(remainingDamage * (1 - dmgReduction.val));
    }

    // 🔥 حفظ حالة الدرع
    const hadShield = player.shield > 0;

    // منطق الدرع
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

    // تطبيق الضرر النهائي
    remainingDamage = Math.floor(remainingDamage);
    player.hp = Math.floor(player.hp - remainingDamage);
    
    if (player.hp <= 0) {
        player.hp = 0;
        player.isDead = true;
    }

    // 🔥 تفعيل كولداون عند انكسار الدرع
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

// 🔥 دالة إدارة التذاكر (النظام الموحد - الحل النهائي) 🔥
function manageTickets(userID, guildID, sql, action = 'check') {
    // 1. تحويل المعرفات لنصوص لتجنب مشاكل الأرقام
    userID = String(userID);
    guildID = String(guildID);

    // 2. جلب البيانات
    const userData = sql.prepare("SELECT level, dungeon_tickets, last_ticket_reset FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    
    if (!userData) return { tickets: 0, max: 0 };

    const level = userData.level || 1;
    let maxTickets = 0;

    // توزيع التذاكر حسب اللفل
    if (level >= 51) maxTickets = 7;
    else if (level >= 31) maxTickets = 5;
    else if (level >= 21) maxTickets = 4;
    else if (level >= 5) maxTickets = 3;
    else maxTickets = 0;

    // 🇸🇦 حساب التاريخ بتوقيت السعودية
    const now = new Date();
    const saudiTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const todayStr = saudiTime.toISOString().split('T')[0];

    // القيم الحالية من الداتا بيس
    // نستخدم maxTickets كقيمة افتراضية إذا كان الحقل فارغاً لأول مرة
    let currentTickets = (userData.dungeon_tickets === null || userData.dungeon_tickets === undefined) ? maxTickets : userData.dungeon_tickets;
    let lastReset = userData.last_ticket_reset || '';

    // متغيرات لحساب الحالة الجديدة (مؤقتة قبل الحفظ)
    let newTickets = currentTickets;
    let newDate = lastReset;
    let needsUpdate = false;

    // 3. التحقق من التجديد اليومي
    // إذا تغير التاريخ، نجدد التذاكر ونحدث التاريخ
    if (lastReset !== todayStr) {
        newTickets = maxTickets; // إعادة تعبئة
        newDate = todayStr;      // تحديث التاريخ
        needsUpdate = true;
    }

    // 4. تنفيذ الخصم (إذا كان الأمر 'consume')
    // يتم الخصم من القيمة المحسوبة أعلاه (سواء كانت مجددة أو قديمة)
    if (action === 'consume') {
        if (newTickets > 0) {
            newTickets -= 1;
            needsUpdate = true; // نحتاج تحديث لأن العدد نقص
        } else {
            // لا يوجد تذاكر كافية، نرجع فشل ونوقف أي تحديث للقاعدة
            return { success: false, tickets: 0, max: maxTickets };
        }
    }

    // 5. تحديث قاعدة البيانات مرة واحدة فقط (Single Source of Truth)
    // نحدث التاريخ وعدد التذاكر في ضربة واحدة لمنع التضارب
    if (needsUpdate) {
        try {
            const updateInfo = sql.prepare("UPDATE levels SET dungeon_tickets = ?, last_ticket_reset = ? WHERE user = ? AND guild = ?")
                .run(newTickets, newDate, userID, guildID);
                
            if (updateInfo.changes === 0) {
                console.error(`[Tickets] Failed to update DB for user ${userID}`);
            }
        } catch (err) {
            console.error(`[Tickets] SQL Error for user ${userID}:`, err);
            // في حالة خطأ SQL نرجع فشل
            if (action === 'consume') return { success: false, tickets: currentTickets, max: maxTickets };
        }
    }

    // إرجاع النتيجة النهائية
    if (action === 'consume') {
        return { success: true, tickets: newTickets, max: maxTickets };
    }
    
    return { tickets: newTickets, max: maxTickets };
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
