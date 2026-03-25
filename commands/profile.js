const weaponsConfig = require('../json/weapons-config.json');
const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
const { getUserRace, getWeaponData } = require('./pvp-core.js'); 

let calculateRequiredXP;
try { ({ calculateRequiredXP } = require('./handler-utils.js')); } 
catch (e) {
    calculateRequiredXP = function(lvl) {
        if (lvl < 35) return 5 * (lvl ** 2) + (50 * lvl) + 100;
        return 15 * (lvl ** 2) + (150 * lvl);
    };
}

const TARGET_OWNER_ID = "1145327691772481577";
const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبة SS', color: '#FF0055' }; 
    if (points >= 500)  return { name: '💎 رتبة S', color: '#9D00FF' }; 
    if (points >= 250)  return { name: '🥇 رتبة A', color: '#FFD700' }; 
    if (points >= 100)  return { name: '🥈 رتبة B', color: '#00FF88' }; 
    if (points >= 50)   return { name: '🥉 رتبة C', color: '#00BFFF' }; 
    if (points >= 25)   return { name: '⚔️ رتبة D', color: '#A9A9A9' }; 
    if (points >= 10)   return { name: '🛡️ رتبة E', color: '#B87333' }; 
    return { name: '🪵 رتبة F', color: '#654321' }; 
}

async function calculateStrongestRank(db, guildID, targetUserID) {
    if (targetUserID === TARGET_OWNER_ID) return 0;
    
    const weapons = db.prepare("SELECT userID, raceName, weaponLevel FROM user_weapons WHERE guildID = ? AND userID != ?").all(guildID, TARGET_OWNER_ID);
    const levels = db.prepare("SELECT user as userID, level FROM levels WHERE guild = ?").all(guildID);
    const levelsMap = new Map(levels.map(r => [r.userID, r.level]));
    const skills = db.prepare("SELECT userID, SUM(skillLevel) as totalLevels FROM user_skills WHERE guildID = ? GROUP BY userID").all(guildID);
    const skillsMap = new Map(skills.map(r => [r.userID, parseInt(r.totalLevels) || 0]));

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === w.raceName);
        if(!conf) continue;
        const dmg = conf.base_damage + (conf.damage_increment * (w.weaponLevel - 1));
        const playerLevel = levelsMap.get(w.userID) || 1;
        const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
        const skillLevelsTotal = skillsMap.get(w.userID) || 0;
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: w.userID, powerScore });
    }
    
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

async function getProfileData(client, db, guildId, targetMember, targetUser, authorUser, cleanName) {
    const userId = targetUser.id;

    let levelData = null;
    if (client.getLevel) levelData = await client.getLevel.get(userId, guildId);
    if (!levelData) {
        levelData = db.prepare("SELECT xp, level, mora, bank FROM levels WHERE user = ? AND guild = ?").get(userId, guildId) || { xp: 0, level: 1, mora: 0, bank: 0 };
    }
    
    const totalMora = Number(levelData.mora || 0) + Number(levelData.bank || 0);
    const currentXP = Number(levelData.xp) || 0;
    const requiredXP = calculateRequiredXP(levelData.level);

    const repData = db.prepare("SELECT rep_points FROM user_reputation WHERE userID = ? AND guildID = ?").get(userId, guildId) || { rep_points: 0 };
    const rankInfo = getRepRankInfo(repData.rep_points || 0);

    const userRaceData = await getUserRace(targetMember, db);
    const raceNameRaw = userRaceData ? userRaceData.raceName : null;
    const raceName = raceNameRaw ? (RACE_TRANSLATIONS.get(raceNameRaw) || raceNameRaw) : "مجهول";
    
    const weaponData = await getWeaponData(db, targetMember);
    const weaponName = weaponData ? weaponData.name : "بدون سلاح";
    const weaponDmg = weaponData ? weaponData.currentDamage : 0;
    const maxHp = PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL);

    const streakData = db.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildId, userId) || {};
    const streakCount = streakData.streakCount || 0;
    const totalShields = Number(streakData.hasItemShield || 0) + Number(streakData.hasGracePeriod === 1 ? 1 : 0);

    const xpBuffMultiplier = await calculateBuffMultiplier(targetMember, db);
    const moraBuffMultiplier = await calculateMoraBuff(targetMember, db);
    const xpBuffPercent = Math.floor((xpBuffMultiplier - 1) * 100);
    const moraBuffPercent = Math.floor((moraBuffMultiplier - 1) * 100);

    let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
    if (userId !== TARGET_OWNER_ID) {
        ranks.level = (db.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY totalXP DESC").all(guildId, TARGET_OWNER_ID).findIndex(s => s.user === userId) + 1).toString();
        ranks.mora = (db.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY (CAST(COALESCE(mora, '0') AS INTEGER) + CAST(COALESCE(bank, '0') AS INTEGER)) DESC").all(guildId, TARGET_OWNER_ID).findIndex(s => s.user === userId) + 1).toString();
        ranks.streak = (db.prepare("SELECT userID FROM streaks WHERE guildID = ? AND userID != ? ORDER BY streakCount DESC").all(guildId, TARGET_OWNER_ID).findIndex(s => s.userID === userId) + 1).toString();
        ranks.power = (await calculateStrongestRank(db, guildId, userId)).toString();
    }

    let displayMora = totalMora.toLocaleString();
    if (userId === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) displayMora = "???";

    return {
        user: targetUser, displayName: cleanName, rankInfo: rankInfo, repPoints: repData.rep_points || 0,
        level: levelData.level, currentXP: currentXP, requiredXP: requiredXP, mora: displayMora, raceName: raceName,
        weaponName: weaponName, weaponDmg: weaponDmg, maxHp: maxHp, streakCount: streakCount, xpBuff: xpBuffPercent,
        moraBuff: moraBuffPercent, shields: totalShields, ranks: ranks
    };
}

module.exports = { getProfileData, RACE_TRANSLATIONS };
