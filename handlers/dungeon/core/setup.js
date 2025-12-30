// dungeon/core/setup.js
const { getRealPlayerData } = require('../utils'); // تأكد من المسار الصحيح لـ utils
const { cleanName } = require('./battle-utils'); // استدعاء الدالة من ملفها الجديد

async function setupPlayers(guild, partyIDs, partyClasses, sql, OWNER_ID) {
    let players = [];
    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            let playerData = getRealPlayerData(m, sql, cls);
            
            // تنظيف الاسم
            playerData.name = cleanName(playerData.name);
            playerData.startingShield = 0; 
            
            // --- منطق الختم ---
            playerData.isSealed = false;
            playerData.sealMultiplier = 1.0; 
            
            if (m.id !== OWNER_ID) {
                let maxItemLevel = 0;

                // فحص المهارات
                if (playerData.skills && typeof playerData.skills === 'object') {
                    const skillValues = Object.values(playerData.skills);
                    for (const skill of skillValues) {
                        const lvl = parseInt(skill.currentLevel) || parseInt(skill.level) || 0;
                        if (lvl > maxItemLevel) maxItemLevel = lvl;
                    }
                }

                // فحص السلاح
                if (playerData.weapon && typeof playerData.weapon === 'object') {
                    const wLvl = parseInt(playerData.weapon.currentLevel) || parseInt(playerData.weapon.level) || parseInt(playerData.weapon.lvl) || 0;
                    if (wLvl > maxItemLevel) maxItemLevel = wLvl;
                }

                // قرار الختم
                if (maxItemLevel > 10) {
                    playerData.isSealed = true;
                    playerData.sealMultiplier = 0.2; // البداية 20%
                }
            }
            players.push(playerData);
        }
    });

    return players;
}

module.exports = { setupPlayers };
