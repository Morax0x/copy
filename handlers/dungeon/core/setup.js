// handlers/dungeon/core/setup.js

const { getRealPlayerData } = require('../utils');
const { cleanName } = require('./battle-utils');

/**
 * دالة لقراءة وتطبيق البفات الخاصة بالأعراق من الداتابيس
 * @param {Object} member - عضو الديسكورد (للتحقق من الرتب)
 * @param {Object} player - بيانات اللاعب في اللعبة (للتعديل عليها)
 * @param {String} currentThemeKey - كود الدانجون الحالي
 * @param {String} guildId - آيدي السيرفر
 * @param {Object} sql - قاعدة البيانات
 */
function applyDynamicBuffs(member, player, currentThemeKey, guildId, sql) {
    if (!currentThemeKey || !member) return "";
    
    // 1. التأكد من وجود الجدول لتجنب الأخطاء
    try {
        const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='race_dungeon_buffs'").get();
        if (!tableCheck['count(*)']) return "";
    } catch (e) { return ""; }

    let buffMsg = "";

    // 2. جلب جميع رتب اللاعب
    const memberRoles = member.roles.cache.map(r => r.id);
    if (memberRoles.length === 0) return "";

    // 3. البحث عن ميزة تطابق (رتبة اللاعب + نوع الدانجون الحالي)
    // نستخدم Placeholders ديناميكية لعدد الرتب
    const placeholders = memberRoles.map(() => '?').join(',');
    
    try {
        const activeBuff = sql.prepare(`
            SELECT * FROM race_dungeon_buffs 
            WHERE guildID = ? AND dungeonKey = ? AND roleID IN (${placeholders})
            LIMIT 1
        `).get(guildId, currentThemeKey, ...memberRoles);

        if (activeBuff) {
            const val = activeBuff.buffValue / 100; // تحويل النسبة (مثلاً 5 إلى 0.05)
            
            switch (activeBuff.statType) {
                case 'atk':
                    const atkBonus = Math.floor(player.atk * val);
                    player.atk += atkBonus;
                    buffMsg = `⚔️ قوة العرق: +${atkBonus} هجوم`;
                    break;
                case 'hp':
                    const hpBonus = Math.floor(player.maxHp * val);
                    player.maxHp += hpBonus;
                    player.hp += hpBonus;
                    buffMsg = `❤️ حيوية العرق: +${hpBonus} HP`;
                    break;
                case 'def':
                    // الدفاع يضاف كنسبة تخفيض (مثلاً 0.05)
                    player.defense = (player.defense || 0) + val; 
                    buffMsg = `🛡️ صلابة العرق: +${activeBuff.buffValue}% دفاع`;
                    break;
                case 'shield':
                    const shieldBonus = Math.floor(player.maxHp * val);
                    player.shield = (player.shield || 0) + shieldBonus;
                    player.startingShield = (player.startingShield || 0) + shieldBonus; // لضمان بقاء الدرع
                    buffMsg = `💠 حماية العرق: +${shieldBonus} درع`;
                    break;
                case 'lifesteal':
                    player.lifesteal = (player.lifesteal || 0) + val;
                    buffMsg = `🩸 شفاء العرق: +${activeBuff.buffValue}% امتصاص`;
                    break;
                case 'crit':
                    // الكريت يضاف كنسبة (0.05) وليس رقم صحيح
                    player.critRate = (player.critRate || 0) + val;
                    buffMsg = `✨ تركيز العرق: +${activeBuff.buffValue}% كريت`;
                    break;
            }
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
            let playerData = getRealPlayerData(m, sql, cls);
            
            // 🔥🔥🔥 إضافة الكلاس الأصلي (لحل مشكلة الإحياء) 🔥🔥🔥
            playerData.originalClass = cls;

            // تنظيف الاسم فوراً
            playerData.name = cleanName(playerData.name);
            // تهيئة متغير الدرع المشتراة
            playerData.startingShield = 0; 
            
            // 🔥🔥🔥 إضافة متغيرات نظام التهديد (Threat System) 🔥🔥🔥
            playerData.threat = 0; // يبدأ من صفر
            playerData.totalDamage = 0; // لحساب الإحصائيات
            
            // 🔥🔥🔥 الإضافة الجديدة: عداد طوابق الدرع (للمرتزقة) 🔥🔥🔥
            playerData.shieldFloorsCount = 0; 

            // ✅✅✅ إصلاح المستدعي: إضافة خانة فارغة للاستدعاء ✅✅✅
            playerData.summon = null; 

            // ============================================================
            // 🔥🔥🔥 تطبيق ميزات العرق (New Race Buffs) 🔥🔥🔥
            // ============================================================
            // ✅ التعديل هنا: تمرير العضو (m) بشكل منفصل عن بيانات اللاعب (playerData)
            const raceBuffMsg = applyDynamicBuffs(m, playerData, themeKey, guild.id, sql);
            if (raceBuffMsg) {
                playerData.raceBuffText = raceBuffMsg; // لحفظ النص وعرضه في السجل لاحقاً
            }

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
