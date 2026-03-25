const weaponsConfig = require('../json/weapons-config.json');
const { calculateBuffMultiplier, calculateMoraBuff } = require("./streak-handler.js");
const { getUserRace, getWeaponData } = require('./pvp-core.js'); 

let calculateRequiredXP;
try {
    ({ calculateRequiredXP } = require('./handler-utils.js'));
} catch (e) {
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
    
    const wRes = await db.query(`SELECT "userID", "raceName", "weaponLevel" FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, [guildID, TARGET_OWNER_ID]);
    const weapons = wRes.rows;

    const lvlRes = await db.query(`SELECT "user" as "userID", "level" FROM levels WHERE "guild" = $1`, [guildID]);
    const levelsMap = new Map(lvlRes.rows.map(r => [r.userID || r.userid, r.level]));

    const skillRes = await db.query(`SELECT "userID", SUM("skillLevel") as "totalLevels" FROM user_skills WHERE "guildID" = $1 GROUP BY "userID"`, [guildID]);
    const skillsMap = new Map(skillRes.rows.map(r => [r.userID || r.userid, parseInt(r.totalLevels || r.totallevels) || 0]));

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === (w.raceName || w.racename));
        if(!conf) continue;
        const wLvl = w.weaponLevel || w.weaponlevel;
        const dmg = conf.base_damage + (conf.damage_increment * (wLvl - 1));
        const uid = w.userID || w.userid;
        const playerLevel = levelsMap.get(uid) || 1;
        const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
        const skillLevelsTotal = skillsMap.get(uid) || 0;
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: uid, powerScore });
    }
    
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

async function getProfileData(client, db, guildId, targetMember, targetUser, authorUser, cleanName) {
    const userId = targetUser.id;

    let levelData = null;
    if (client.getLevel) {
        levelData = await client.getLevel(userId, guildId);
    }
    if (!levelData) {
        const lvlRes = await db.query(`SELECT "xp", "level", "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
        levelData = lvlRes.rows[0] || { xp: 0, level: 1, mora: 0, bank: 0 };
    }
    
    const totalMora = Number(levelData.mora || 0) + Number(levelData.bank || 0);
    const currentXP = Number(levelData.xp) || 0;
    const requiredXP = calculateRequiredXP(levelData.level);

    const repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    const repData = repRes.rows[0] || { rep_points: 0 };
    const rankInfo = getRepRankInfo(repData.rep_points || repData.reppoints || 0);

    const userRaceData = await getUserRace(targetMember, db);
    const raceNameRaw = userRaceData ? (userRaceData.raceName || userRaceData.racename) : null;
    const raceName = raceNameRaw ? (RACE_TRANSLATIONS.get(raceNameRaw) || raceNameRaw) : "مجهول";
    
    const weaponData = await getWeaponData(db, targetMember);
    const weaponName = weaponData ? weaponData.name : "بدون سلاح";
    const weaponDmg = weaponData ? weaponData.currentDamage : 0;
    const maxHp = PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL);

    const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildId, userId]);
    const streakData = streakRes.rows[0];
    const streakCount = streakData ? (streakData.streakCount || streakData.streakcount || 0) : 0;
    let hasItemShields = streakData ? (streakData.hasItemShield || streakData.hasitemshield || 0) : 0;
    let hasGraceShield = (streakData && (streakData.hasGracePeriod === 1 || streakData.hasgraceperiod === 1)) ? 1 : 0;
    const totalShields = Number(hasItemShields) + Number(hasGraceShield);

    const xpBuffMultiplier = await calculateBuffMultiplier(targetMember, db);
    const moraBuffMultiplier = await calculateMoraBuff(targetMember, db);
    const xpBuffPercent = Math.floor((xpBuffMultiplier - 1) * 100);
    const moraBuffPercent = Math.floor((moraBuffMultiplier - 1) * 100);

    let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
    if (userId !== TARGET_OWNER_ID) {
        const allScores = await db.query(`SELECT "user" FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY "totalXP" DESC`, [guildId, TARGET_OWNER_ID]);
        let rLvl = allScores.rows.findIndex(s => s.user === userId) + 1;
        ranks.level = rLvl > 0 ? rLvl.toString() : "0";

        const allMora = await db.query(`SELECT "user" FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY (CAST(COALESCE("mora", '0') AS BIGINT) + CAST(COALESCE("bank", '0') AS BIGINT)) DESC`, [guildId, TARGET_OWNER_ID]);
        let rMora = allMora.rows.findIndex(s => s.user === userId) + 1;
        ranks.mora = rMora > 0 ? rMora.toString() : "0";

        const allStreaks = await db.query(`SELECT "userID" FROM streaks WHERE "guildID" = $1 AND "userID" != $2 ORDER BY "streakCount" DESC`, [guildId, TARGET_OWNER_ID]);
        let rStreak = allStreaks.rows.findIndex(s => (s.userID || s.userid) === userId) + 1;
        ranks.streak = rStreak > 0 ? rStreak.toString() : "0";

        let rPower = await calculateStrongestRank(db, guildId, userId);
        ranks.power = rPower > 0 ? rPower.toString() : "0";
    }

    let displayMora = totalMora.toLocaleString();
    if (userId === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) {
        displayMora = "???";
    }

    return {
        user: targetUser,
        displayName: cleanName,
        rankInfo: rankInfo,
        repPoints: repData.rep_points || repData.reppoints || 0,
        level: levelData.level,
        currentXP: currentXP,
        requiredXP: requiredXP,
        mora: displayMora,
        raceName: raceName,
        weaponName: weaponName,
        weaponDmg: weaponDmg,
        maxHp: maxHp,
        streakCount: streakCount,
        xpBuff: xpBuffPercent,
        moraBuff: moraBuffPercent,
        shields: totalShields,
        ranks: ranks
    };
}

module.exports = { getProfileData, RACE_TRANSLATIONS };
