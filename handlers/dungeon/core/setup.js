const { getRealPlayerData } = require('../utils');
const { cleanName } = require('./battle-utils');

async function setupPlayers(guild, partyIDs, partyClasses, sql, OWNER_ID) {
    let players = [];
    
    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m, index) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            let playerData = getRealPlayerData(m, sql, cls);
            
            // تنظيف الاسم فوراً
            playerData.name = cleanName(playerData.name);
            // تهيئة متغير الدرع المشتراة
            playerData.startingShield = 0; 
            
            // ============================================================
            // 🔥🔥🔥 الفحص الحقيقي للختم (Deep Scan) 🔥🔥🔥
            // ============================================================
            playerData.isSealed = false;
            playerData.sealMultiplier = 1.0; 
            
            if (m.id !== OWNER_ID) {
                let maxItemLevel = 0;

                // 1. فحص المهارات (Skills)
                if (playerData.skills && typeof playerData.skills === 'object') {
                    const skillValues = Object.values(playerData.skills);
                    for (const skill of skillValues) {
                        const lvl = parseInt(skill.currentLevel) || parseInt(skill.level) || 0;
                        if (lvl > maxItemLevel) maxItemLevel = lvl;
                    }
                }

                // 2. فحص السلاح (Weapon)
                if (playerData.weapon && typeof playerData.weapon === 'object') {
                    const wLvl = parseInt(playerData.weapon.currentLevel) || parseInt(playerData.weapon.level) || parseInt(playerData.weapon.lvl) || 0;
                    if (wLvl > maxItemLevel) maxItemLevel = wLvl;
                }

                // 3. قرار الختم
                if (maxItemLevel > 10) {
                    playerData.isSealed = true;
                    playerData.sealMultiplier = 0.2; // البداية 20%
                }
            }
            // ============================================================

            players.push(playerData);
        }
    });

    return players;
}

module.exports = { setupPlayers };
