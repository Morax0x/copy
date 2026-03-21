const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");

// 🔥 استيراد الدالة المركزية للتلفيل 🔥
let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('./handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
    } catch(e2) {
        console.error("Missing handler-utils.js in giveaway-handler", e2);
    }
}

async function getUserWeight(member, db) {
    if (!member || !db) return 1;
    const userRoles = member.roles.cache.map(r => r.id);
    if (userRoles.length === 0) return 1;

    const placeholders = userRoles.map((_, i) => `$${i + 2}`).join(',');
    
    try {
        const res = await db.query(`
            SELECT MAX(weight) as maxweight
            FROM giveaway_weights
            WHERE "guildID" = $1 AND "roleID" IN (${placeholders})
        `, [member.guild.id, ...userRoles]);
        
        return res.rows[0]?.maxweight || 1;
    } catch (e) {
        return 1;
    }
}

async function startGiveaway(client, interaction, channel, duration, winnerCount, prize, xpReward, moraReward) {
    const db = client.sql; 
    if (!db) return;

    const endsAt = Date.now() + duration;
    
    const embed = new EmbedBuilder()
        .setTitle("🎉 **GIVEAWAY** 🎉")
        .setDescription(
            `**الجائزة:** ${prize}\n` +
            `**عدد الفائزين:** ${winnerCount}\n` +
            `**ينتهي:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:f>)\n\n` +
            `**الجوائز الإضافية:**\n` +
            `💰 مورا: **${moraReward}** | ✨ خبرة: **${xpReward}**\n\n` +
            `اضغط على الزر بالأسفل للمشاركة! ⤵️`
        )
        .setColor(Colors.Blue)
        .setTimestamp(endsAt)
        .setFooter({ text: `ينتهي في` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('g_enter') 
            .setLabel('مشاركة (0)')
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Primary)
    );

    const message = await channel.send({ embeds: [embed], components: [row] });

    await db.query(`
        INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
    `, [message.id, interaction.guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]);

    setTimeout(() => {
        endGiveaway(client, message.id);
    }, duration);

    return message;
}

async function handleGiveawayInteraction(client, interaction) {
    const db = client.sql; 
    if (!db) return;

    const messageID = interaction.message.id;
    const userID = interaction.user.id;

    const giveawayRes = await db.query('SELECT * FROM active_giveaways WHERE "messageID" = $1 AND "isFinished" = 0', [messageID]);
    const giveaway = giveawayRes.rows[0];
    
    if (!giveaway) {
        return interaction.reply({ content: "❌ هذا القيف اواي منتهي أو غير موجود.", ephemeral: true });
    }

    if (Date.now() > (giveaway.endsAt || giveaway.endsat)) {
        return interaction.reply({ content: "⏰ لقد انتهى وقت المشاركة!", ephemeral: true });
    }

    const existingEntryRes = await db.query('SELECT * FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2', [messageID, userID]);
    const existingEntry = existingEntryRes.rows[0];
    
    if (existingEntry) {
        await db.query('DELETE FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2', [messageID, userID]);
        
        const countRes = await db.query('SELECT COUNT(*) as count FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
        const count = countRes.rows[0].count;

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const row = ActionRowBuilder.from(interaction.message.components[0]);
        row.components[0].setLabel(`مشاركة (${count})`);
        await interaction.message.edit({ embeds: [embed], components: [row] });

        return interaction.reply({ content: "❌ تم إلغاء مشاركتك.", ephemeral: true });
    }

    const weight = await getUserWeight(interaction.member, db);
    await db.query('INSERT INTO giveaway_entries ("giveawayID", "userID", "weight") VALUES ($1, $2, $3)', [messageID, userID, weight]);

    const countRes = await db.query('SELECT COUNT(*) as count FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
    const count = countRes.rows[0].count;

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components[0].setLabel(`مشاركة (${count})`);
    
    await interaction.message.edit({ embeds: [embed], components: [row] });
    
    return interaction.reply({ content: `✅ **تم تسجيل مشاركتك!** (عدد فرصك: ${weight})`, ephemeral: true });
}

async function endGiveaway(client, messageID, force = false) {
    const db = client.sql; 
    if (!db) return;

    const giveawayRes = await db.query('SELECT * FROM active_giveaways WHERE "messageID" = $1', [messageID]);
    const giveaway = giveawayRes.rows[0];

    if (!giveaway) {
        if (force) console.log("لم يتم العثور على القيفاواي.");
        return;
    }

    const endsAt = giveaway.endsAt || giveaway.endsat;
    const isFinished = giveaway.isFinished || giveaway.isfinished;

    if (!force && endsAt > Date.now() && isFinished === 0) {
        const timeLeft = endsAt - Date.now();
        setTimeout(() => endGiveaway(client, messageID), timeLeft);
        return;
    }

    if (!force && isFinished === 1) return;

    await db.query('UPDATE active_giveaways SET "isFinished" = 1 WHERE "messageID" = $1', [messageID]);

    const entriesRes = await db.query('SELECT * FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
    const entries = entriesRes.rows;

    let channel;
    try {
        const guild = await client.guilds.fetch(giveaway.guildID || giveaway.guildid);
        channel = await guild.channels.fetch(giveaway.channelID || giveaway.channelid);
    } catch (e) { return; }

    const originalMessage = await channel.messages.fetch(messageID).catch(() => null);

    if (entries.length === 0) {
        if (originalMessage) {
            const originalEmbed = originalMessage.embeds[0];
            const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
            newEmbed.setTitle(`[انـتـهـى] ${originalEmbed.title || "Giveaway"}`).setColor("Red").setFooter({ text: "انتهى (لا مشاركين)" });
            
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('g_ended').setLabel('انتهى').setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('🏁')
            );
            await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] });
            await channel.send({ content: `⚠️ القيفاواي (${giveaway.prize}) انتهى ولم يشارك أحد.` });
        }
        return; 
    }

    const pool = [];
    for (const entry of entries) {
        for (let i = 0; i < entry.weight; i++) {
            pool.push(entry.userID || entry.userid);
        }
    }

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const winners = new Set();
    const countToWin = Math.min(giveaway.winnerCount || giveaway.winnercount, entries.length);
    let attempts = 0;

    while (winners.size < countToWin && attempts < 1000 && pool.length > 0) {
        const randomIndex = Math.floor(Math.random() * pool.length);
        const winnerID = pool[randomIndex];
        winners.add(winnerID);
        attempts++;
    }

    const winnerIDs = Array.from(winners);
    const winnerString = winnerIDs.map(id => `<@${id}>`).join(', ');
    const moraReward = giveaway.moraReward || giveaway.morareward || 0;
    const xpReward = giveaway.xpReward || giveaway.xpreward || 0;
    const guildId = giveaway.guildID || giveaway.guildid;

    // 🔥 التحديث الجذري هنا: توزيع الجوائز بالدالة المركزية الجديدة 🔥
    if (moraReward > 0 || xpReward > 0) {
        for (const winnerID of winnerIDs) {
            try {
                const guild = channel.guild;
                const member = await guild.members.fetch(winnerID).catch(() => null);
                
                if (member && addXPAndCheckLevel) {
                    // نمرر false للـ isMessageEvent لكي لا يعطيه كرت تلفيل إذا رفع لفله بسبب الجائزة
                    await addXPAndCheckLevel(client, member, db, xpReward, moraReward, false);
                } else {
                    //Fallback in case member left
                    try { await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1, "xp" = COALESCE(CAST("xp" AS BIGINT), 0) + $2, "totalXP" = COALESCE(CAST("totalXP" AS BIGINT), 0) + $2 WHERE "user" = $3 AND "guild" = $4`, [moraReward, xpReward, winnerID, guildId]); }
                    catch(e) { await db.query(`UPDATE levels SET mora = COALESCE(CAST(mora AS BIGINT), 0) + $1, xp = COALESCE(CAST(xp AS BIGINT), 0) + $2, totalxp = COALESCE(CAST(totalxp AS BIGINT), 0) + $2 WHERE userid = $3 AND guildid = $4`, [moraReward, xpReward, winnerID, guildId]).catch(()=>{}); }
                }
            } catch (err) { console.error(err); }
        }
    }

    const announcementEmbed = new EmbedBuilder().setTitle(`✥ انـتـهى الـقـيفـاواي`).setColor("DarkGrey");
    const winnerLabel = winnerIDs.length > 1 ? "الـفـائـزون:" : "الـفـائـز:";
    
    let winDescription = `✦ ${winnerLabel} ${winnerString}\n✦ الـجـائـزة: **${giveaway.prize}**`;
    if (moraReward > 0) winDescription += `\n✦ مـورا: **${moraReward}**`;
    if (xpReward > 0) winDescription += `\n✬ اكس بي: **${xpReward}**`;
    
    announcementEmbed.setDescription(winDescription);
    await channel.send({ content: winnerString, embeds: [announcementEmbed] });

    if (originalMessage) {
        const originalEmbed = originalMessage.embeds[0];
        const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
        newEmbed.setTitle(`[انـتـهـى] ${originalEmbed.title || "Giveaway"}`).setColor("DarkGrey").setFooter({ text: "انتهى" });
        
        let newDesc = originalEmbed.description.replace(/.*ينتهي.*<t:\d+:R>.*\n?/i, "");
        newDesc += `\n\n**${winnerLabel}** ${winnerString}\n**عدد المشاركين:** ${entries.length}`;
        newEmbed.setDescription(newDesc);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_ended').setLabel(`انتهى (${entries.length})`).setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('🏁')
        );
        await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] });
    }
}

async function rerollGiveaway(client, interaction, messageID) {
    const db = client.sql; 
    if (!db) return;

    const giveawayRes = await db.query('SELECT * FROM active_giveaways WHERE "messageID" = $1', [messageID]);
    const giveaway = giveawayRes.rows[0];
    
    if (!giveaway) return interaction.reply({ content: "❌ لم يتم العثور على قيف اواي بهذا الآيدي.", ephemeral: true });
    
    const isFinished = giveaway.isFinished || giveaway.isfinished;
    if (isFinished === 0) return interaction.reply({ content: "⚠️ هذا القيف اواي لا يزال جارياً!", ephemeral: true });

    const entriesRes = await db.query('SELECT "userID", "weight" FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
    const entries = entriesRes.rows;
    if (entries.length === 0) return interaction.reply({ content: "❌ لا يوجد مشاركين.", ephemeral: true });

    const pool = [];
    for (const entry of entries) {
        for (let i = 0; i < entry.weight; i++) {
            pool.push(entry.userID || entry.userid);
        }
    }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    await interaction.reply(`🎉 **الري-رول الجديد!** الفائز هو: <@${winner}>! 🥳`);
}

async function createRandomDropGiveaway(client, guild) {
    const db = client.sql; 
    if (!db) return false;

    const settingsRes = await db.query('SELECT * FROM settings WHERE "guild" = $1', [guild.id]);
    const settings = settingsRes.rows[0];

    if (!settings || (!settings.dropGiveawayChannelID && !settings.dropgiveawaychannelid)) return false;
    
    const channel = guild.channels.cache.get(settings.dropGiveawayChannelID || settings.dropgiveawaychannelid);
    if (!channel) return false;

    const DEFAULTS = {
        dropTitle: "🎉 **GIVEAWAY DROP** 🎉",
        dropDescription: `**الجائزة:** جوائز عشوائية قيمة\n` +
                         `**عدد الفائزين:** {winners}\n` +
                         `**ينتهي:** {time} ({time_full})\n\n` +
                         `**الجوائز:**\n` +
                         `💰 مورا: **{mora}** | ✨ خبرة: **{xp}**\n\n` +
                         `اضغط على الزر بالأسفل للمشاركة! ⤵️`,
        dropColor: "Gold",
        dropFooter: "ينتهي في",
        dropButtonLabel: "مشاركة (0)",
        dropButtonEmoji: "🎉",
        dropMessageContent: "✨ **قيفاواي مفاجئ ظهر!** ✨"
    };

    const moraReward = Math.floor(Math.random() * 1201) + 300; 
    const xpReward = Math.floor(Math.random() * 1201) + 300;     
    
    const winnerCount = Math.floor(Math.random() * 3) + 1;        
    const durationMs = 5 * 60 * 1000; 
    const endsAt = Date.now() + durationMs;
    const endsAtTimestamp = Math.floor(endsAt / 1000);

    const prize = `🎁 ${moraReward.toLocaleString()} Mora & ${xpReward.toLocaleString()} XP`;

    const title = settings.dropTitle || settings.droptitle || DEFAULTS.dropTitle;
    
    const description = (settings.dropDescription || settings.dropdescription || DEFAULTS.dropDescription)
        .replace(/{prize}/g, prize)
        .replace(/{winners}/g, winnerCount)
        .replace(/{time}/g, `<t:${endsAtTimestamp}:R>`)
        .replace(/{time_full}/g, `<t:${endsAtTimestamp}:f>`)
        .replace(/{mora}/g, moraReward.toLocaleString())
        .replace(/{xp}/g, xpReward.toLocaleString());

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(settings.dropColor || settings.dropcolor || DEFAULTS.dropColor)
        .setTimestamp(endsAt)
        .setFooter({ text: settings.dropFooter || settings.dropfooter || DEFAULTS.dropFooter });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('g_enter_drop') 
            .setLabel(settings.dropButtonLabel || settings.dropbuttonlabel || DEFAULTS.dropButtonLabel)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(settings.dropButtonEmoji || settings.dropbuttonemoji || DEFAULTS.dropButtonEmoji)
    );

    const message = await channel.send({ 
        content: settings.dropMessageContent || settings.dropmessagecontent || DEFAULTS.dropMessageContent,
        embeds: [embed], 
        components: [row] 
    });

    await db.query(`
        INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished") 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
    `, [message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]);

    setTimeout(() => { endGiveaway(client, message.id); }, durationMs); 

    return true; 
}

async function initGiveaways(client) {
    const db = client.sql; 
    if (!db) return;

    try {
        const activeGiveawaysRes = await db.query('SELECT * FROM active_giveaways WHERE "isFinished" = 0');
        const activeGiveaways = activeGiveawaysRes.rows;

        for (const giveaway of activeGiveaways) {
            const now = Date.now();
            const endsAt = giveaway.endsAt || giveaway.endsat;
            const timeLeft = endsAt - now;

            if (timeLeft <= 0) {
                endGiveaway(client, giveaway.messageID || giveaway.messageid);
            } else {
                setTimeout(() => { endGiveaway(client, giveaway.messageID || giveaway.messageid); }, timeLeft);
            }
        }
    } catch (e) {
        console.error("خطأ في تشغيل القيفاوايات النشطة:", e.message);
    }
}

module.exports = {
    getUserWeight,
    startGiveaway,
    handleGiveawayInteraction,
    endGiveaway,
    rerollGiveaway,
    createRandomDropGiveaway,
    initGiveaways
};
