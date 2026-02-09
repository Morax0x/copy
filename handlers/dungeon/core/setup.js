// handlers/dungeon/core/setup.js

const { getRealPlayerData } = require('../utils');
const { cleanName } = require('./battle-utils');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

/**
 * دالة لقراءة وتطبيق البفات الخاصة بالأعراق من الداتابيس (تراكمي)
 */
function applyDynamicBuffs(member, player, currentThemeKey, guildId, sql) {
    if (!currentThemeKey || !member) return "";
    
    // 1. التأكد من وجود الجدول
    try {
        const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='race_dungeon_buffs'").get();
        if (!tableCheck['count(*)']) return "";
    } catch (e) { return ""; }

    let buffMsgArray = [];

    // 2. جلب جميع رتب اللاعب
    const memberRoles = member.roles.cache.map(r => r.id);
    if (memberRoles.length === 0) {
        // console.log(`[RaceBuff] Player ${member.user.tag} has no roles to check.`);
        return "";
    }

    // 3. البحث عن جميع البفات المتطابقة (Stackable)
    const placeholders = memberRoles.map(() => '?').join(',');
    
    try {
        // 🔥 التعديل: إزالة LIMIT 1 لجلب كل البفات
        const activeBuffs = sql.prepare(`
            SELECT * FROM race_dungeon_buffs 
            WHERE guildID = ? AND dungeonKey = ? AND roleID IN (${placeholders})
        `).all(guildId, currentThemeKey, ...memberRoles);

        if (activeBuffs && activeBuffs.length > 0) {
            // console.log(`[RaceBuff] Found ${activeBuffs.length} buffs for ${member.user.tag}`);

            // تجهيز القيم الافتراضية
            player.atk = Number(player.atk) || 0;
            player.maxHp = Number(player.maxHp) || 100;
            player.hp = Number(player.hp) || player.maxHp;
            player.def = Number(player.def) || 0;
            player.shield = Number(player.shield) || 0;
            player.critRate = Number(player.critRate) || 0;
            player.lifesteal = Number(player.lifesteal) || 0;

            // حلقة لتطبيق كل بف على حدة
            for (const buff of activeBuffs) {
                let val = parseFloat(buff.buffValue); 
                if (isNaN(val)) continue;

                const multiplier = val / 100; 
                const statTypeClean = buff.statType.toLowerCase().trim();

                switch (statTypeClean) {
                    case 'atk':
                    case 'attack':
                        const atkBonus = Math.floor(player.atk * multiplier);
                        player.atk += atkBonus;
                        buffMsgArray.push(`⚔️ +${Math.floor(val)}% هجوم`);
                        break;

                    case 'hp':
                    case 'health':
                        const hpBonus = Math.floor(player.maxHp * multiplier);
                        player.maxHp += hpBonus;
                        player.hp += hpBonus; 
                        buffMsgArray.push(`❤️ +${Math.floor(val)}% HP`);
                        break;

                    case 'def':
                    case 'defense':
                        player.def += multiplier; 
                        player.defense = player.def; 
                        buffMsgArray.push(`🛡️ +${Math.floor(val)}% دفاع`);
                        break;

                    case 'shield':
                        const shieldBonus = Math.floor(player.maxHp * multiplier);
                        player.shield += shieldBonus;
                        player.startingShield = (player.startingShield || 0) + shieldBonus;
                        buffMsgArray.push(`💠 +${shieldBonus} درع`);
                        break;

                    case 'lifesteal':
                        player.lifesteal += multiplier; // تراكمي (مثلا 0.1 + 0.05 = 0.15)
                        buffMsgArray.push(`🩸 +${Math.floor(val)}% شفاء`);
                        break;

                    case 'crit':
                    case 'critrate':
                        player.critRate += multiplier;
                        buffMsgArray.push(`✨ +${Math.floor(val)}% كريت`);
                        break;
                    
                    default:
                        console.log(`[RaceBuff] Unknown stat: ${statTypeClean}`);
                }
            }
        }
    } catch(e) {
        console.error("[Race Buff Error]", e);
    }

    return buffMsgArray.length > 0 ? `🌟 **ميزات العرق:** ${buffMsgArray.join(' | ')}` : "";
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
            
            // تنظيف البيانات
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
            // 🔥 تطبيق ميزات العرق (تراكمي)
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

// تعديل الدالة لتقبل startFloor (الافتراضي 1)
async function startDungeonLobby(message, startFloor = 1) {
    const client = message.client;
    const sql = client.sql;
    
    // 🔥 هذا السطر يحل مشكلة الـ TypeError: Cannot read properties of undefined (reading 'username') 🔥
    const host = message.author || message.user; 

    // الأزرار
    const activeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join_dungeon').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('start_dungeon_game').setLabel('بدء المعركة').setStyle(ButtonStyle.Danger).setEmoji('🔥'),
        new ButtonBuilder().setCustomId('cancel_dungeon').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    );

    const lobbyEmbed = new EmbedBuilder()
        .setTitle(`🏰 بوابة الدانجون (الطابق ${startFloor})`) // تحديث العنوان
        .setDescription(
            `القائد **${host.username}** يجمع فريقاً!\n` +
            `اضغط على "انضمام" للمشاركة.\n\n` +
            `🛑 **ملاحظة:** ستبدأ الرحلة مباشرة من الطابق **${startFloor}**.`
        )
        .setColor('DarkRed')
        .setThumbnail(host.displayAvatarURL());

    // في حالة السلاش، نستخدم reply أو followUp، وفي حالة الرسالة نستخدم channel.send
    let msg;
    if (message.reply && typeof message.reply === 'function') {
         // إذا كان تفاعلاً (Interaction) ولم يتم الرد عليه بعد
         if (!message.replied && !message.deferred) {
             msg = await message.reply({ embeds: [lobbyEmbed], components: [activeRow], fetchReply: true });
         } else {
             msg = await message.followUp({ embeds: [lobbyEmbed], components: [activeRow], fetchReply: true });
         }
    } else {
         msg = await message.channel.send({ embeds: [lobbyEmbed], components: [activeRow] });
    }

    // حفظ البيانات في active_dungeons
    const gameData = {
        hostID: host.id,
        players: [host.id], // القائد دائماً موجود
        currentFloor: startFloor, // 🔥 هنا التغيير المهم
        status: 'lobby',
        hp: {}, // سيتم ملؤه عند البدء
        maxHp: {},
        startTime: Date.now()
    };

    // استخدام القناة الصحيحة (سواء كانت من رسالة أو تفاعل)
    const channelId = message.channel ? message.channel.id : message.channelId;
    const guildId = message.guild ? message.guild.id : message.guildId;

    sql.prepare("INSERT OR REPLACE INTO active_dungeons (channelID, guildID, hostID, data) VALUES (?, ?, ?, ?)").run(channelId, guildId, host.id, JSON.stringify(gameData));
}

module.exports = { setupPlayers, startDungeonLobby };
