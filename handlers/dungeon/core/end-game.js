const { EmbedBuilder } = require('discord.js');
const { getRandomImage } = require('../utils'); 
const { 
    EMOJI_MORA, 
    EMOJI_XP, 
    EMOJI_BUFF, 
    EMOJI_NERF, 
    WIN_IMAGES, 
    LOSE_IMAGES 
} = require('../constants'); 

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../guild-board-handler.js'));
} catch (e) {}

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests, client) {
    if (!sql) return;
    
    let title = "", color = "", randomImage = null;

    if (status === 'win') { 
        title = "❖ أسطـورة الدانـجون !"; 
        const randomHex = Math.floor(Math.random() * 16777215).toString(16);
        color = `#${randomHex}`; 
        randomImage = getRandomImage(WIN_IMAGES); 
    } 
    else if (status === 'retreat' || status === 'camp') { 
        title = "❖ انـسـحـاب تـكـتيـكـي !"; 
        color = "#FFFF00"; 
        randomImage = getRandomImage(WIN_IMAGES); 
    } 
    else { 
        title = "❖ هزيمـة ساحقـة ..."; 
        color = "#FF0000"; 
        randomImage = getRandomImage(LOSE_IMAGES); 
    }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
    
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => ((p.totalDamage || 0) > (c.totalDamage || 0)) ? p : c) : null;
    if (mvpPlayer && (mvpPlayer.totalDamage || 0) === 0) {
        mvpPlayer = null; 
    }
    
    const repMilestones = {
        20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1,
        55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 
        80: 5, 85: 5, 90: 5, 95: 5, 100: 5
    };

    let sessionStartFloor = 1;
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) {
        const sessionData = activeDungeonRequests.get(hostId);
        if (sessionData && sessionData.startFloor) {
            sessionStartFloor = sessionData.startFloor;
        }
    }

    let lootString = "";
    for (const p of allParticipants) {
        let finalMora = 0;
        let finalXp = 0;

        if (p.rewardsClaimed) {
            finalMora = p.finalMora || 0;
            finalXp = p.finalXp || 0;
        } else {
            if (status === 'lose' && floor > 20) {
                finalMora = 1000;
                finalXp = 100;
            } else {
                finalMora = Math.floor(p.loot.mora || 0);
                finalXp = Math.floor(p.loot.xp || 0);
                
                if (p.isDead) { 
                    finalMora = Math.floor(finalMora * 0.5); 
                    finalXp = Math.floor(finalXp * 0.5); 
                }
            }
            
            // 🔥 الإصلاح: إضافة علامات التنصيص
            await sql.query(`UPDATE levels SET "xp" = "xp" + $1, "mora" = "mora" + $2 WHERE "user" = $3 AND "guild" = $4`, [finalXp, finalMora, p.id, guildId]).catch(()=>{});
        }

        let effectiveEndFloor = floor;
        if (p.isDead && p.deathFloor) effectiveEndFloor = p.deathFloor - 1; 
        else if (p.retreatFloor) effectiveEndFloor = p.retreatFloor; 
        else if (status === 'lose') effectiveEndFloor = Math.max(1, floor - 1); 

        let playerStartFloor = p.startFloor || sessionStartFloor;
        if (playerStartFloor > effectiveEndFloor) playerStartFloor = effectiveEndFloor;

        let repReward = 0;
        for (let f = playerStartFloor; f <= effectiveEndFloor; f++) {
            if (repMilestones[f]) {
                repReward += repMilestones[f];
            }
        }

        if (repReward > 0) {
            try {
                // 🔥 الإصلاح: إضافة علامات التنصيص
                await sql.query(`
                    INSERT INTO user_reputation ("userID", "guildID", "rep_points") 
                    VALUES ($1, $2, $3) 
                    ON CONFLICT ("userID", "guildID") 
                    DO UPDATE SET "rep_points" = COALESCE(user_reputation."rep_points", 0) + $4
                `, [p.id, guildId, repReward, repReward]);
            } catch (err) {}
        }

        if (updateGuildStat && client) {
            if (mvpPlayer) {
                if (p.id === mvpPlayer.id) {
                    await updateGuildStat(client, guildId, p.id, 'max_dungeon_floor', effectiveEndFloor);
                }
            } else {
                await updateGuildStat(client, guildId, p.id, 'max_dungeon_floor', effectiveEndFloor);
            }
        }
        
        let statusEmoji = "";
        if (p.isDead) { 
            const deathFloorInfo = p.deathFloor ? `(مات في ${p.deathFloor})` : "(مات)";
            statusEmoji = `💀 ${deathFloorInfo}`;
        } else if (p.retreatFloor) {
            statusEmoji = `🏃‍♂️ (انسحب في ${p.retreatFloor})`;
        } else if (status === 'camp') {
            statusEmoji = "⛺ (مخيم)";
        } else {
            statusEmoji = "✅";
        }

        let repString = repReward > 0 ? ` | 🌟 سمعة: **${repReward}**` : "";
        lootString += `✬ <@${p.id}> ${statusEmoji}: ${finalMora.toLocaleString()} ${EMOJI_MORA} | ${finalXp.toLocaleString()} XP${repString}\n`;
    }

    let description = `**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'لا يوجد'}\n\n${lootString}`;

    if (status === 'camp') {
        description += `\n**🏕️ تـم نصـب خيمـة وحفـظ التقـدم عنـد الطابـق ${floor + 1}**`;
    }

    if (floor >= 10 && mvpPlayer && status !== 'camp') {
        let extraRewardText = "";
        if (mvpPlayer.totalDamage > 10000) {
            extraRewardText = " + 500 مـورا";
            // 🔥 الإصلاح: إضافة علامات التنصيص
            await sql.query(`UPDATE levels SET "mora" = "mora" + 500 WHERE "user" = $1 AND "guild" = $2`, [mvpPlayer.id, guildId]).catch(()=>{});
        }
        description += `\n\n<a:mTrophy:1438797228826300518> **نجـم المعركـة:**\n✶ <@${mvpPlayer.id}> (الـضـرر: ${mvpPlayer.totalDamage.toLocaleString()})\nحـصـل عـلى تعـزيـز 15% مورا واكس بي لـ 15د${extraRewardText} <a:buff:1438796257522094081>`;
    }

    if (floor >= 10 && status === 'lose') {
        description += `\n\n**💀 لعنـة الهزيمـة:**\nأصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`;
        const debuffDuration = 15 * 60 * 1000;
        const expiresAt = Date.now() + debuffDuration;
        
        for (const p of allParticipants) {
            // 🔥 الإصلاح السحري: استخدام علامات التنصيص المزدوجة حول الأسماء لـ PostgreSQL
            await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'mora', -0.15]).catch(()=>{});
            await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'xp', -0.15]).catch(()=>{});
        }
    }

    if (floor >= 10 && status !== 'lose' && status !== 'camp' && mvpPlayer) {
        const buffDuration = 15 * 60 * 1000; 
        const expiresAt = Date.now() + buffDuration;
        // 🔥 الإصلاح: إضافة علامات التنصيص
        await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15]).catch(()=>{});
        await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15]).catch(()=>{});
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setImage(randomImage)
        .setTimestamp();

    await mainChannel.send({ content: allParticipants.map(p => `<@${p.id}>`).join(' '), embeds: [embed] }).catch(()=>{});
    
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) {
        activeDungeonRequests.delete(hostId);
    }
    
    try {
        if (status === 'camp') {
            await thread.send({ content: `**⛺ تم حفظ التقدم وإغلاق البوابة مؤقتاً. نراكم قريباً!**` });
        } else {
            await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        }
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { sendEndMessage };
