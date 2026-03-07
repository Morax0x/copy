const { BASE_HP, HP_PER_LEVEL, potionItems, weaponsConfig, skillsConfig, OWNER_ID } = require('./constants');

const VIP_ROLE_ID = "1395674235002945636";

async function ensureInventoryTable(db) {
    if (!db) return;
      
    await db.query(`
        CREATE TABLE IF NOT EXISTS user_inventory (
            id SERIAL PRIMARY KEY,
            guildid TEXT,
            userid TEXT,
            itemid TEXT,
            quantity INTEGER DEFAULT 0,
            UNIQUE(guildid, userid, itemid)
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS dungeon_stats (
            guildid TEXT,
            userid TEXT,
            tickets INTEGER DEFAULT 0,
            last_reset TEXT DEFAULT '',
            campfires INTEGER DEFAULT 1, 
            last_campfire_reset TEXT DEFAULT '',
            PRIMARY KEY (guildid, userid)
        );
    `);
}

function getRandomImage(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function getBaseFloorMora(floor) {
    if (floor <= 10) return 100;
    if (floor <= 20) return 200;

    if (floor <= 30) return 450;
    if (floor <= 40) return 700;
    
    if (floor <= 50) return 850; 

    if (floor <= 60) return 1000;
    if (floor <= 70) return 2000;
    if (floor <= 80) return 3000;
    
    if (floor < 100) return 3500;
    
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
    const shieldSource = player.effects.shield_source; 

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
        if (shieldSource !== 'Cleanse_Buff_Shield') {
            if (!player.skillCooldowns) player.skillCooldowns = {};
            if (shieldSource === 'skill_shielding' || !shieldSource) {
                 player.skillCooldowns['skill_shielding'] = 3; 
            }
        }
        
        player.effects.shield_source = null;
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

async function getRealPlayerData(member, db, assignedClass = 'Adventurer') {
    const guildID = member.guild.id;
    const userID = member.id;
    const userDataRes = await db.query("SELECT level FROM levels WHERE userid = $1 AND guildid = $2", [userID, guildID]);
    const userData = userDataRes.rows[0];
    const level = userData ? parseInt(userData.level) : 1;
      
    const maxHp = Math.floor(BASE_HP + (level * HP_PER_LEVEL));

    let damage = 15;
    let weaponName = "قبضة اليد";
      
    const allRaceRolesRes = await db.query("SELECT roleid, racename FROM race_roles WHERE guildid = $1", [guildID]);
    const allRaceRoles = allRaceRolesRes.rows;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleid));

    if (userRace) {
        const weaponConfig = weaponsConfig.find(w => w.race === userRace.racename);
        if (weaponConfig) {
            const userWeaponRes = await db.query("SELECT * FROM user_weapons WHERE userid = $1 AND guildid = $2 AND racename = $3", [userID, guildID, userRace.racename]);
            const userWeapon = userWeaponRes.rows[0];
            if (userWeapon && parseInt(userWeapon.weaponlevel) > 0) {
                damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (parseInt(userWeapon.weaponlevel) - 1));
                weaponName = `${weaponConfig.name} (Lv.${userWeapon.weaponlevel})`;
            }
        }
    }

    const skillsOutput = {};
    const userSkillsDataRes = await db.query("SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2", [userID, guildID]);
    const userSkillsData = userSkillsDataRes.rows;
      
    if (userSkillsData) {
        userSkillsData.forEach(userSkill => {
            const skillConfig = skillsConfig.find(s => s.id === userSkill.skillid);
            if (skillConfig && parseInt(userSkill.skilllevel) > 0) {
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (parseInt(userSkill.skilllevel) - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: parseInt(userSkill.skilllevel), effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.racename.toLowerCase().replace(/\s+/g, '_')}_skill`;
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

async function manageTickets(userID, guildID, db, action = 'check', member = null) {
    userID = String(userID);
    guildID = String(guildID);

    const levelDataRes = await db.query("SELECT level FROM levels WHERE userid = $1 AND guildid = $2", [userID, guildID]);
    const levelData = levelDataRes.rows[0];
    const level = levelData ? parseInt(levelData.level) : 1;

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
        bonusTickets += 10; 
    }

    let maxTickets = baseTickets + bonusTickets;

    const statsRes = await db.query("SELECT tickets, last_reset FROM dungeon_stats WHERE userid = $1 AND guildid = $2", [userID, guildID]);
    let stats = statsRes.rows[0];

    const todayStr = getSaudiDateIso(); 

    if (!stats) {
        await db.query("INSERT INTO dungeon_stats (guildid, userid, tickets, last_reset) VALUES ($1, $2, $3, $4)", [guildID, userID, maxTickets, todayStr]);
        stats = { tickets: maxTickets, last_reset: todayStr };
    }

    let dbDate = stats.last_reset;
    let dbTickets = parseInt(stats.tickets);

    if (dbDate !== todayStr) {
        console.log(`[DailyLimit] Resetting tickets for ${userID}. New max: ${maxTickets}`);
        
        await db.query("UPDATE dungeon_stats SET tickets = $1, last_reset = $2 WHERE userid = $3 AND guildid = $4", [maxTickets, todayStr, userID, guildID]);
        
        dbTickets = maxTickets;
        dbDate = todayStr;
    } 

    if (action === 'check') {
        return { tickets: dbTickets, max: maxTickets };
    }

    if (action === 'consume') {
        if (dbTickets > 0) {
            const newCount = dbTickets - 1;
            console.log(`[DailyLimit] Consuming ticket for ${userID}. Remaining: ${newCount}`);

            const info = await db.query("UPDATE dungeon_stats SET tickets = $1 WHERE userid = $2 AND guildid = $3", [newCount, userID, guildID]);
                
            if (info.rowCount > 0) {
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

async function manageCampfires(userID, guildID, db, action = 'check', member = null) {
    userID = String(userID);
    guildID = String(guildID);

    let maxCampfires = 1;

    if (member) {
        const roleLimitsRes = await db.query("SELECT roleid, limitcount FROM role_campfire_limits WHERE guildid = $1", [guildID]);
        const roleLimits = roleLimitsRes.rows;

        if (roleLimits.length > 0) {
            const memberRoleIds = member.roles.cache.map(r => r.id);
            
            roleLimits.forEach(config => {
                if (memberRoleIds.includes(config.roleid)) {
                    maxCampfires += parseInt(config.limitcount);
                }
            });
        }
    }

    const statsRes = await db.query("SELECT campfires, last_campfire_reset FROM dungeon_stats WHERE userid = $1 AND guildid = $2", [userID, guildID]);
    let stats = statsRes.rows[0];
    const todayStr = getSaudiDateIso();

    if (!stats) {
        try {
            const updateInfo = await db.query("UPDATE dungeon_stats SET campfires = $1, last_campfire_reset = $2 WHERE userid = $3 AND guildid = $4", [maxCampfires, todayStr, userID, guildID]);
            
            if (updateInfo.rowCount === 0) {
                await db.query("INSERT INTO dungeon_stats (guildid, userid, tickets, last_reset, campfires, last_campfire_reset) VALUES ($1, $2, 0, '', $3, $4)", [guildID, userID, maxCampfires, todayStr]);
            }
        } catch (e) { console.log(e); }
        
        stats = { campfires: maxCampfires, last_campfire_reset: todayStr };
    }

    let dbDate = stats.last_campfire_reset || '';
    let currentCampfires = (stats.campfires !== null && stats.campfires !== undefined) ? parseInt(stats.campfires) : maxCampfires;

    if (dbDate !== todayStr) {
        console.log(`[Campfire] Resetting for ${userID}. New max: ${maxCampfires}`);
        await db.query("UPDATE dungeon_stats SET campfires = $1, last_campfire_reset = $2 WHERE userid = $3 AND guildid = $4", [maxCampfires, todayStr, userID, guildID]);
        
        currentCampfires = maxCampfires;
    }

    if (action === 'check') {
        return { count: currentCampfires, max: maxCampfires };
    }

    if (action === 'consume') {
        if (currentCampfires > 0) {
            const newCount = currentCampfires - 1;
            await db.query("UPDATE dungeon_stats SET campfires = $1 WHERE userid = $2 AND guildid = $3", [newCount, userID, guildID]);
            return { success: true, count: newCount, max: maxCampfires };
        } else {
            return { success: false, count: 0, max: maxCampfires };
        }
    }

    return { count: currentCampfires, max: maxCampfires };
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
    calculateThreat,
    manageCampfires 
};
