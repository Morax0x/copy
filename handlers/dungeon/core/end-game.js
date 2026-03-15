const { EmbedBuilder } = require('discord.js');
const { getRandomImage } = require('../utils'); 
const { EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF, WIN_IMAGES, LOSE_IMAGES } = require('../constants'); 

let updateGuildStat;
try { ({ updateGuildStat } = require('../../guild-board-handler.js')); } catch (e) {}

// 🔥 تم إعادة بناء دالة الحفظ لتكون محصنة وآمنة 100% وتتزامن مع الكاش 🔥
async function safeUpdateLevels(db, userId, guildId, addMora, addXp, context, client) {
    if (!db || (addMora === 0 && addXp === 0)) return;
    try {
        let userData = null;
        if (client && typeof client.getLevel === 'function') {
            userData = await client.getLevel(userId, guildId);
        }
        
        if (!userData) {
            userData = { ...client.defaultData, user: userId, guild: guildId, level: 1, xp: 0, totalXP: 0, mora: 0, bank: 0 };
        }

        // تحديث الكاش فوراً
        userData.mora = String(Number(userData.mora || 0) + addMora);
        userData.xp = String(Number(userData.xp || 0) + addXp);
        userData.totalXP = String(Number(userData.totalXP || userData.totalxp || 0) + addXp);

        if (client && typeof client.setLevel === 'function') {
            await client.setLevel(userData);
        }

        // تحديث الداتابيز بطريقة مباشرة لمنع القلتشات
        try {
            await db.query(`
                INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") 
                VALUES ($1, $2, $3, $4, $4, 1) 
                ON CONFLICT ("user", "guild") DO UPDATE SET 
                "mora" = CAST(COALESCE(levels."mora", '0') AS BIGINT) + $3, 
                "xp" = CAST(COALESCE(levels."xp", '0') AS BIGINT) + $4, 
                "totalXP" = CAST(COALESCE(levels."totalXP", '0') AS BIGINT) + $4
            `, [userId, guildId, addMora, addXp]);
        } catch(e) {
            await db.query(`
                INSERT INTO levels (userid, guildid, mora, xp, totalxp, level) 
                VALUES ($1, $2, $3, $4, $4, 1) 
                ON CONFLICT (userid, guildid) DO UPDATE SET 
                mora = CAST(COALESCE(levels.mora, '0') AS BIGINT) + $3, 
                xp = CAST(COALESCE(levels.xp, '0') AS BIGINT) + $4, 
                totalxp = CAST(COALESCE(levels.totalxp, '0') AS BIGINT) + $4
            `, [userId, guildId, addMora, addXp]).catch(()=>{});
        }
    } catch (e) {
        console.error(`[🚨 DUNGEON ERROR] in safeUpdateLevels:`, e);
    }
}

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests, client) {
    if (!sql) return;
    
    let title = "", color = "", randomImage = null;

    if (status === 'win') { 
        title = "❖ أسطـورة الدانـجون !"; 
        color = `#${Math.floor(Math.random() * 16777215).toString(16)}`; 
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
    if (mvpPlayer && (mvpPlayer.totalDamage || 0) === 0) mvpPlayer = null; 
    
    const repMilestones = {
        20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1,
        55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 
        80: 5, 85: 5, 90: 5, 95: 5, 100: 5
    };

    let sessionStartFloor = 1;
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) {
        const sessionData = activeDungeonRequests.get(hostId);
        if (sessionData && sessionData.startFloor) sessionStartFloor = sessionData.startFloor;
    }

    let lootString = "";
    for (const p of allParticipants) {
        let finalMora = 0;
        let finalXp = 0;

        if (p.rewardsClaimed) {
            finalMora = p.finalMora || 0;
            finalXp = p.finalXp || 0;
            // اللاعب أخذ جائزته عند الانسحاب المبكر
        } else {
            if (status === 'lose' && floor > 20) {
                finalMora = 1000;
                finalXp = 100;
            } else {
                finalMora = Math.floor(p.loot?.mora || 0);
                finalXp = Math.floor(p.loot?.xp || 0);
                if (p.isDead) { finalMora = Math.floor(finalMora * 0.5); finalXp = Math.floor(finalXp * 0.5); }
            }
            
            await safeUpdateLevels(sql, p.id, guildId, finalMora, finalXp, "END GAME", client);
        }

        // 🔥 إنصاف اللاعب المضحي: يُحسب له الطابق الذي مات فيه ولن ننقص منه 1 إذا ساعد فريقه بالانتحار
        let effectiveEndFloor = floor;
        if (status === 'lose') effectiveEndFloor = Math.max(1, floor - 1); 
        else if (p.retreatFloor) effectiveEndFloor = p.retreatFloor; 
        else if (p.isDead && p.deathFloor) effectiveEndFloor = p.deathFloor; 

        let playerStartFloor = p.startFloor || sessionStartFloor;
        if (playerStartFloor > effectiveEndFloor) playerStartFloor = effectiveEndFloor;

        let repReward = 0;
        for (let f = playerStartFloor; f <= effectiveEndFloor; f++) {
            if (repMilestones[f]) repReward += repMilestones[f];
        }

        if (repReward > 0) {
            try {
                await sql.query(`
                    INSERT INTO user_reputation ("userID", "guildID", "rep_points") 
                    VALUES ($1, $2, $3) 
                    ON CONFLICT ("userID", "guildID") 
                    DO UPDATE SET "rep_points" = COALESCE(user_reputation."rep_points", 0) + $4
                `, [p.id, guildId, repReward, repReward]);
            } catch (err1) {
                try {
                    await sql.query(`
                        INSERT INTO user_reputation (userid, guildid, rep_points) 
                        VALUES ($1, $2, $3) 
                        ON CONFLICT (userid, guildid) 
                        DO UPDATE SET rep_points = COALESCE(user_reputation.rep_points, 0) + $4
                    `, [p.id, guildId, repReward, repReward]);
                } catch (err2) {}
            }
        }

        if (updateGuildStat && client) {
            await updateGuildStat(client, guildId, p.id, 'max_dungeon_floor', effectiveEndFloor);
        }
        
        let statusEmoji = p.isDead ? `💀 ${p.deathFloor ? `(مات في ${p.deathFloor})` : ""}` : p.retreatFloor ? `🏃‍♂️ (انسحب في ${p.retreatFloor})` : status === 'camp' ? "⛺ (مخيم)" : "✅";
        let repString = repReward > 0 ? ` | 🌟 سمعة: **${repReward}**` : "";
        lootString += `✬ <@${p.id}> ${statusEmoji}: ${finalMora.toLocaleString()} ${EMOJI_MORA} | ${finalXp.toLocaleString()} XP${repString}\n`;
    }

    let description = `**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'لا يوجد'}\n\n${lootString}`;

    if (status === 'camp') description += `\n**🏕️ تـم نصـب خيمـة وحفـظ التقـدم عنـد الطابـق ${floor + 1}**`;

    if (floor >= 10 && mvpPlayer && status !== 'camp') {
        let extraRewardText = "";
        if (mvpPlayer.totalDamage > 10000) {
            extraRewardText = " + 500 مـورا";
            await safeUpdateLevels(sql, mvpPlayer.id, guildId, 500, 0, "MVP REWARD", client);
        }
        description += `\n\n<a:mTrophy:1438797228826300518> **نجـم المعركـة:**\n✶ <@${mvpPlayer.id}> (الـضـرر: ${mvpPlayer.totalDamage.toLocaleString()})\nحـصـل عـلى تعـزيـز 15% مورا واكس بي لـ 15د${extraRewardText} <a:buff:1438796257522094081>`;
    }

    if (floor >= 10 && status === 'lose') {
        description += `\n\n**💀 لعنـة الهزيمـة:**\nأصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`;
        const debuffDuration = 15 * 60 * 1000;
        const expiresAt = Date.now() + debuffDuration;
        
        for (const p of allParticipants) {
            try {
                await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'mora', -0.15]);
                await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'xp', -0.15]);
            } catch(e1) {
                try {
                    await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'mora', -0.15]);
                    await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'xp', -0.15]);
                } catch(e2) {}
            }
        }
    }

    if (floor >= 10 && status !== 'lose' && status !== 'camp' && mvpPlayer) {
        const buffDuration = 15 * 60 * 1000; 
        const expiresAt = Date.now() + buffDuration;
        try {
            await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15]);
            await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15]);
        } catch(e1) {
            try {
                await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15]);
                await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15]);
            } catch(e2) {}
        }
    }

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setImage(randomImage).setTimestamp();
    await mainChannel.send({ content: allParticipants.map(p => `<@${p.id}>`).join(' '), embeds: [embed] }).catch(()=>{});
    
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) activeDungeonRequests.delete(hostId);
    
    try {
        if (status === 'camp') await thread.send({ content: `**⛺ تم حفظ التقدم وإغلاق البوابة مؤقتاً. نراكم قريباً!**` });
        else await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { sendEndMessage };
