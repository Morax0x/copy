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

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests) {
    if (!sql || !sql.open) return;
    let title = "", color = "", randomImage = null;

    if (status === 'win') { title = "❖ أسطـورة الدانـجون !"; color = "#00FF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else if (status === 'retreat') { title = "❖ انـسـحـاب تـكـتيـكـي !"; color = "#FFFF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else { title = "❖ هزيمـة ساحقـة ..."; color = "#FF0000"; randomImage = getRandomImage(LOSE_IMAGES); }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
    
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => (p.totalDamage > c.totalDamage) ? p : c) : null;
    
    let lootString = "";
    allParticipants.forEach(p => {
        let finalMora = 0;
        let finalXp = 0;

        // ==========================================
        // ❖ نظام عقوبة الموت بعد الطابق 20 ❖
        // ==========================================
        if (status === 'lose' && floor > 20) {
            // تجاهل الغنائم المتراكمة وإعطاء تعويض بسيط فقط
            finalMora = 1000;
            finalXp = 100;
        } else {
            // الحساب الطبيعي
            finalMora = Math.floor(p.loot.mora);
            finalXp = Math.floor(p.loot.xp);
            
            if (p.isDead) { 
                finalMora = Math.floor(finalMora * 0.5); 
                finalXp = Math.floor(finalXp * 0.5); 
            }
        }
        
        let statusEmoji = "";
        if (p.isDead) { 
            const deathFloorInfo = p.deathFloor ? `(مات في ${p.deathFloor})` : "(مات)";
            statusEmoji = `💀 ${deathFloorInfo}`;
        } else if (p.retreatFloor) {
            statusEmoji = `🏃‍♂️ (انسحب في ${p.retreatFloor})`;
        } else {
            statusEmoji = "✅";
        }

        sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
        lootString += `✬ <@${p.id}> ${statusEmoji}: ${finalMora} ${EMOJI_MORA} | ${finalXp} XP\n`;
    });

    let description = `**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'N/A'}\n\n${lootString}`;

    if (floor >= 10 && mvpPlayer) {
        description += `\n\n**✨ جائـزة نجـم المعركـة:**\n<@${mvpPlayer.id}> (ضرر: ${mvpPlayer.totalDamage.toLocaleString()})\nحصل على تعزيز **15%** مورا واكس بي لـ **15د** ${EMOJI_BUFF}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color).setImage(randomImage).setTimestamp();

    await mainChannel.send({ content: allParticipants.map(p => `<@${p.id}>`).join(' '), embeds: [embed] }).catch(()=>{});
    activeDungeonRequests.delete(hostId);
    
    if (floor >= 10) {
        if (status === 'lose') {
            const debuffDuration = 15 * 60 * 1000;
            const expiresAt = Date.now() + debuffDuration;
            
            allParticipants.forEach(p => {
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'mora', -0.15);
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'xp', -0.15);
            });
            await mainChannel.send(`**💀 لعنـة الهزيمـة:** أصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`).catch(()=>{});

        } else if (mvpPlayer) {
            const buffDuration = 15 * 60 * 1000; 
            const expiresAt = Date.now() + buffDuration;
            
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15);
        }
    }

    try {
        await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { sendEndMessage };
