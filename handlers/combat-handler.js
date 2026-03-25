const { getUserRace, getWeaponData } = require('./pvp-core.js');
const skillsConfig = require('../json/skills-config.json');
const weaponsConfig = require('../json/weapons-config.json');
const potionItems = require('../json/potions.json');

const OWNER_ID = "1145327691772481577"; 

async function getCombatData(db, targetMember, targetUser, guildId, RACE_TRANSLATIONS) {
    const userRace = await getUserRace(targetMember, db);
    const weaponData = await getWeaponData(db, targetMember);
    
    let userSkillsRes;
    try { userSkillsRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillLevel" > 0`, [targetUser.id, guildId]); }
    catch(e) { userSkillsRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skilllevel > 0`, [targetUser.id, guildId]).catch(()=>({rows:[]})); }
    const userSkillsDB = userSkillsRes.rows;

    let userLvlRes;
    try { userLvlRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]); }
    catch(e) { userLvlRes = await db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [targetUser.id, guildId]).catch(()=>({rows:[]})); }
    const userLevel = userLvlRes.rows[0] ? Number(userLvlRes.rows[0].level) : 1;

    // 🔥 استخراج الجرعات potionsList كما طلبت تماماً 🔥
    let potionsList = [];
    try {
        let userInventoryRes;
        try { userInventoryRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "quantity" > 0`, [targetUser.id, guildId]); }
        catch(e) { userInventoryRes = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2 AND quantity > 0`, [targetUser.id, guildId]).catch(()=>({rows:[]})); }
        
        const userInventory = userInventoryRes.rows;
        if (userInventory && userInventory.length > 0) {
            for (const item of userInventory) {
                const itemId = item.itemID || item.itemid;
                const potionInfo = potionItems.find(p => String(p.id) === String(itemId));
                if (potionInfo) {
                    potionsList.push({ name: potionInfo.name, qty: Number(item.quantity) });
                }
            }
        }
    } catch (e) { }

    let totalSpent = 0;
    let allSkillsList = [];
    let raceSkillId = null;

    const rawRace = userRace ? (userRace.raceName || userRace.racename) : "مجهول";
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
            const skillID = dbSkill.skillID || dbSkill.skillid;
            const skillLevel = Number(dbSkill.skillLevel || dbSkill.skilllevel);
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
        potionsList // تم الحفاظ عليها هنا لتمريرها إن احتجت
    };
}

module.exports = { getCombatData };
