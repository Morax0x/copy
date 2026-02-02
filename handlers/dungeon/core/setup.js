// handlers/dungeon/core/setup.js

const { getRealPlayerData } = require('../utils');
const { cleanName } = require('./battle-utils');

/**
 * دالة لقراءة وتطبيق البفات الخاصة بالأعراق من الداتابيس
 */
function applyDynamicBuffs(member, player, currentThemeKey, guildId, sql) {
    if (!currentThemeKey || !member) return "";
    
    // 1. التأكد من وجود الجدول
    try {
        const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='race_dungeon_buffs'").get();
        if (!tableCheck['count(*)']) return "";
    } catch (e) { return ""; }

    let buffMsg = "";

    // 2. جلب جميع رتب اللاعب
    const memberRoles = member.roles.cache.map(r => r.id);
    if (memberRoles.length === 0) {
        console.log(`[RaceBuff] Player ${member.user.tag} has no roles to check.`);
        return "";
    }

    // 3. البحث عن ميزة تطابق
    const placeholders = memberRoles.map(() => '?').join(',');
    
    try {
        // طباعة معلومات التشخيص (ستظهر في الكونسول فقط)
        // console.log(`[RaceBuff] Checking for Guild: ${guildId}, Dungeon: ${currentThemeKey}, Roles: ${memberRoles.length}`);

        const activeBuff = sql.prepare(`
            SELECT * FROM race_dungeon_buffs 
            WHERE guildID = ? AND dungeonKey = ? AND roleID IN (${placeholders})
            LIMIT 1
        `).get(guildId, currentThemeKey, ...memberRoles);

        if (activeBuff) {
            console.log(`[RaceBuff] FOUND! Stat: ${activeBuff.statType}, Value: ${activeBuff.buffValue}`);

            // تحويل القيمة
            let val = parseFloat(activeBuff.buffValue); 
            if (isNaN(val)) val = 0;

            // تحويل النسبة المئوية (50 -> 0.5)
            const multiplier = val / 100; 
            
            // تصحيح القيم لضمان أنها أرقام
            player.atk = Number(player.atk) || 0;
            player.maxHp = Number(player.maxHp) || 100;
            player.hp = Number(player.hp) || player.maxHp;
            player.def = Number(player.def) || 0;
            player.shield = Number(player.shield) || 0;
            player.critRate = Number(player.critRate) || 0;

            // 🔥 توحيد حالة الأحرف (Lower Case) لحل مشكلة ATK vs atk
            const statTypeClean = activeBuff.statType.toLowerCase().trim();

            switch (statTypeClean) {
                case 'atk':
                case 'attack':
                    const atkBonus = Math.floor(player.atk * multiplier);
                    player.atk += atkBonus;
                    buffMsg = `⚔️ قوة العرق: +${atkBonus} هجوم`;
                    break;

                case 'hp':
                case 'health':
                    const hpBonus = Math.floor(player.maxHp * multiplier);
                    player.maxHp += hpBonus;
                    player.hp += hpBonus; 
                    buffMsg = `❤️ حيوية العرق: +${hpBonus} HP`;
                    break;

                case 'def':
                case 'defense':
                    // الدفاع يضاف كنسبة مئوية (تخفيض ضرر)
                    player.def = (player.def || 0) + multiplier; 
                    player.defense = player.def; 
                    buffMsg = `🛡️ صلابة العرق: +${val}% دفاع`;
                    break;

                case 'shield':
                    const shieldBonus = Math.floor(player.maxHp * multiplier);
                    player.shield += shieldBonus;
                    player.startingShield = (player.startingShield || 0) + shieldBonus;
                    buffMsg = `💠 حماية العرق: +${shieldBonus} درع`;
                    break;

                case 'lifesteal':
                    player.lifesteal = (player.lifesteal || 0) + multiplier;
                    buffMsg = `🩸 شفاء العرق: +${val}% امتصاص`;
                    break;

                case 'crit':
                case 'critrate':
                    player.critRate += multiplier;
                    buffMsg = `✨ تركيز العرق: +${val}% كريت`;
                    break;
                
                default:
                    console.log(`[RaceBuff] Error: Unknown stat type '${statTypeClean}'`);
            }
        } else {
            // console.log(`[RaceBuff] No active buff found for these roles in ${currentThemeKey}`);
        }
    } catch(e) {
        console.error("[Race Buff Error]", e);
    }

    return buffMsg;
}

// ✅ الدالة الأساسية لتجهيز اللاعبين
async function setupPlayers(guild, partyIDs, partyClasses, sql, OWNER_ID, themeKey) {
    let players = [];
    
    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m, index) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            
            // جلب البيانات
            let playerData = getRealPlayerData(m, sql, cls);
            
            // تنظيف الأرقام
            playerData.atk = Number(playerData.atk);
            playerData.maxHp = Number(playerData.maxHp);
            playerData.hp = playerData.maxHp; 
            
            playerData.originalClass = cls;
            playerData.name = cleanName(playerData.name);
            playerData.startingShield = 0; 
            playerData.threat = 0;
            playerData.totalDamage = 0;
            playerData.shieldFloorsCount = 0; 
            playerData.summon = null; 

            // ============================================================
            // 🔥 تطبيق ميزات العرق (مع التشخيص)
            // ============================================================
            const raceBuffMsg = applyDynamicBuffs(m, playerData, themeKey, guild.id, sql);
            if (raceBuffMsg) {
                playerData.raceBuffText = raceBuffMsg;
            }

            // ============================================================
            // 🔥 فحص الختم
            // ============================================================
            playerData.isSealed = false;
            playerData.sealMultiplier = 1.0; 
            
            if (m.id !== OWNER_ID) {
                let maxItemLevel = 0;
                if (playerData.skills && typeof playerData.skills === 'object') {
                    const skillValues = Object.values(playerData.skills);
                    for (const skill of skillValues) {
                        const lvl = parseInt(skill.currentLevel) || parseInt(skill.level) || 0;
                        if (lvl > maxItemLevel) maxItemLevel = lvl;
                    }
                }
                if (playerData.weapon && typeof playerData.weapon === 'object') {
                    const wLvl = parseInt(playerData.weapon.currentLevel) || parseInt(playerData.weapon.level) || parseInt(playerData.weapon.lvl) || 0;
                    if (wLvl > maxItemLevel) maxItemLevel = wLvl;
                }
                if (maxItemLevel > 10) {
                    playerData.isSealed = true;
                    playerData.sealMultiplier = 0.2;
                }
            }

            players.push(playerData);
        }
    });

    return players;
}

module.exports = { setupPlayers };
