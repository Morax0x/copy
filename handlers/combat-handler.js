const { getUserRace, getWeaponData } = require('./pvp-core.js');
const skillsConfig = require('../json/skills-config.json');
const weaponsConfig = require('../json/weapons-config.json');
const potionItems = require('../json/potions.json');

const OWNER_ID = "1145327691772481577"; 

async function getCombatData(db, targetMember, targetUser, guildId, RACE_TRANSLATIONS) {
    const userRace = await getUserRace(targetMember, db);
    const weaponData = await getWeaponData(db, targetMember);
    
    const userSkillsDB = db.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillLevel > 0").all(targetUser.id, guildId) || [];
    
    let userLevelData = db.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(targetUser.id, guildId);
    const userLevel = userLevelData ? Number(userLevelData.level) : 1;

    let potionsList = [];
    const userInventory = db.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ? AND quantity > 0").all(targetUser.id, guildId) || [];
    
    if (userInventory.length > 0) {
        for (const item of userInventory) {
            const potionInfo = potionItems.find(p => String(p.id) === String(item.itemID));
            if (potionInfo) {
                potionsList.push({ name: potionInfo.name, qty: Number(item.quantity) });
            }
        }
    }

    let totalSpent = 0;
    let allSkillsList = [];
    let raceSkillId = null;

    const rawRace = userRace ? userRace.raceName : "مجهول";
    const arabicRaceName = RACE_TRANSLATIONS.get(rawRace) || rawRace;

    if (userRace && weaponData) {
        const originalWeaponConfig = weaponsConfig.find(w => w.race === rawRace);
        if (originalWeaponConfig) {
            for (let i = 0; i < weaponData.currentLevel; i++) {
                totalSpent += originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
            }
        }
    }

    if (userRace) {
        const cleanRaceName = rawRace.toLowerCase().trim().replace(/\s+/g, '_');
        raceSkillId = `race_${cleanRaceName}_skill`;
    }

    let hasRaceSkillInDB = false;

    if (userSkillsDB.length > 0) {
        for (const dbSkill of userSkillsDB) {
            const skillID = dbSkill.skillID;
            const skillLevel = Number(dbSkill.skillLevel);
            const skillConfig = skillsConfig.find(s => s.id === skillID);
            
            if (skillConfig) {
                if (skillConfig.name.includes("شق زمكان") && targetUser.id !== OWNER_ID) continue; 
                if (skillID.startsWith('race_') && raceSkillId && skillID !== raceSkillId) continue; 

                if (raceSkillId && skillID === raceSkillId) hasRaceSkillInDB = true;

                allSkillsList.push({
                    id: skillID, 
                    name: skillConfig.name,
                    level: skillLevel,
                    description: skillConfig.description
                });
                
                for (let i = 0; i < skillLevel; i++) {
                    totalSpent += skillConfig.base_price + (skillConfig.price_increment * i);
                }
            }
        }
    }

    if (userRace && raceSkillId && !hasRaceSkillInDB) {
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && (!raceSkillConfig.name.includes("شق زمكان") || targetUser.id === OWNER_ID)) {
            allSkillsList.push({
                id: raceSkillId,
                name: raceSkillConfig.name,
                level: 1, 
                description: raceSkillConfig.description + " [غير مطورة]"
            });
        }
    }

    allSkillsList.sort((a, b) => b.level - a.level);

    return {
        weaponData,
        arabicRaceName,
        allSkillsList,
        totalSpent,
        userLevel,
        potionsList 
    };
}

module.exports = { getCombatData };
