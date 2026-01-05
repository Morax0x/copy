const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");

// دالة لمعرفة وزن المستخدم (عدد الفرص/التذاكر)
async function getUserWeight(member, sql) {
    if (!member) return 1;
    const userRoles = member.roles.cache.map(r => r.id);
    if (userRoles.length === 0) return 1;

    const placeholders = userRoles.map(() => '?').join(',');
    
    try {
        const weights = sql.prepare(`
            SELECT MAX(weight) as maxWeight
            FROM giveaway_weights
            WHERE guildID = ? AND roleID IN (${placeholders})
        `).get(member.guild.id, ...userRoles);
        return weights?.maxWeight || 1;
    } catch (e) {
        return 1;
    }
}

// دالة بدء القيف اواي (يدوي - Slash Command)
async function startGiveaway(client, interaction, channel, duration, winnerCount, prize, xpReward, moraReward) {
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

    const sql = client.sql;
    sql.prepare(`
        INSERT INTO active_giveaways (messageID, guildID, channelID, prize, endsAt, winnerCount, xpReward, moraReward, isFinished)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(message.id, interaction.guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward);

    setTimeout(() => {
        endGiveaway(client, message.id);
    }, duration);

    return message;
}

// دالة معالجة التفاعل (مشاركة)
async function handleGiveawayInteraction(client, interaction) {
    const messageID = interaction.message.id;
    const userID = interaction.user.id;
    const sql = client.sql;

    const giveaway = sql.prepare("SELECT * FROM active_giveaways WHERE messageID = ? AND isFinished = 0").get(messageID);
    
    if (!giveaway) {
        return interaction.reply({ content: "❌ هذا القيف اواي منتهي أو غير موجود.", ephemeral: true });
    }

    if (Date.now() > giveaway.endsAt) {
        return interaction.reply({ content: "⏰ لقد انتهى وقت المشاركة!", ephemeral: true });
    }

    const existingEntry = sql.prepare("SELECT * FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").get(messageID, userID);
    
    if (existingEntry) {
        sql.prepare("DELETE FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").run(messageID, userID);
        
        const count = sql.prepare("SELECT COUNT(*) as count FROM giveaway_entries WHERE giveawayID = ?").get(messageID).count;
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const row = ActionRowBuilder.from(interaction.message.components[0]);
        row.components[0].setLabel(`مشاركة (${count})`);
        await interaction.message.edit({ embeds: [embed], components: [row] });

        return interaction.reply({ content: "❌ تم إلغاء مشاركتك.", ephemeral: true });
    }

    const weight = await getUserWeight(interaction.member, sql);
    sql.prepare("INSERT INTO giveaway_entries (giveawayID, userID, weight) VALUES (?, ?, ?)").run(messageID, userID, weight);

    const count = sql.prepare("SELECT COUNT(*) as count FROM giveaway_entries WHERE giveawayID = ?").get(messageID).count;
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components[0].setLabel(`مشاركة (${count})`);
    
    await interaction.message.edit({ embeds: [embed], components: [row] });
    
    return interaction.reply({ content: `✅ **تم تسجيل مشاركتك!** (عدد فرصك: ${weight})`, ephemeral: true });
}

// دالة إنهاء القيف اواي
async function endGiveaway(client, messageID, force = false) {
    const sql = client.sql; 
    const giveaway = sql.prepare("SELECT * FROM active_giveaways WHERE messageID = ?").get(messageID);

    if (!giveaway) {
        if (force) console.log("لم يتم العثور على القيفاواي.");
        return;
    }

    if (!force && giveaway.endsAt > Date.now() && giveaway.isFinished === 0) {
        const timeLeft = giveaway.endsAt - Date.now();
        setTimeout(() => endGiveaway(client, messageID), timeLeft);
        return;
    }

    if (!force && giveaway.isFinished === 1) return;

    sql.prepare("UPDATE active_giveaways SET isFinished = 1 WHERE messageID = ?").run(messageID);

    const entries = sql.prepare("SELECT * FROM giveaway_entries WHERE giveawayID = ?").all(messageID);

    let channel;
    try {
        const guild = await client.guilds.fetch(giveaway.guildID);
        channel = await guild.channels.fetch(giveaway.channelID);
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
            pool.push(entry.userID);
        }
    }

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const winners = new Set();
    const countToWin = Math.min(giveaway.winnerCount, entries.length);
    let attempts = 0;

    while (winners.size < countToWin && attempts < 1000 && pool.length > 0) {
        const randomIndex = Math.floor(Math.random() * pool.length);
        const winnerID = pool[randomIndex];
        winners.add(winnerID);
        attempts++;
    }

    const winnerIDs = Array.from(winners);
    const winnerString = winnerIDs.map(id => `<@${id}>`).join(', ');
    const moraReward = giveaway.moraReward || 0;
    const xpReward = giveaway.xpReward || 0;

    if (moraReward > 0 || xpReward > 0) {
        for (const winnerID of winnerIDs) {
            try {
                let levelData = client.getLevel.get(winnerID, giveaway.guildID);
                if (!levelData) levelData = { ...client.defaultData, user: winnerID, guild: giveaway.guildID };
                
                const oldLevel = levelData.level; 
                levelData.mora = (levelData.mora || 0) + moraReward;
                levelData.xp = (levelData.xp || 0) + xpReward;
                levelData.totalXP = (levelData.totalXP || 0) + xpReward;
                
                let nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                while (levelData.xp >= nextXP) {
                    levelData.level++;
                    levelData.xp -= nextXP;
                    nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                }
                client.setLevel.run(levelData);
                
                if (levelData.level > oldLevel && client.sendLevelUpMessage) {
                    const member = await channel.guild.members.fetch(winnerID).catch(() => null);
                    if (member) {
                        const fakeInteraction = { guild: channel.guild, channel: channel, members: { me: channel.guild.members.me } };
                        await client.sendLevelUpMessage(fakeInteraction, member, levelData.level, oldLevel, levelData);
                    }
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
    const sql = client.sql;
    const giveaway = sql.prepare("SELECT * FROM active_giveaways WHERE messageID = ?").get(messageID);
    
    if (!giveaway) return interaction.reply({ content: "❌ لم يتم العثور على قيف اواي بهذا الآيدي.", ephemeral: true });
    if (giveaway.isFinished === 0) return interaction.reply({ content: "⚠️ هذا القيف اواي لا يزال جارياً!", ephemeral: true });

    const entries = sql.prepare("SELECT userID, weight FROM giveaway_entries WHERE giveawayID = ?").all(messageID);
    if (entries.length === 0) return interaction.reply({ content: "❌ لا يوجد مشاركين.", ephemeral: true });

    const pool = [];
    for (const entry of entries) {
        for (let i = 0; i < entry.weight; i++) {
            pool.push(entry.userID);
        }
    }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    await interaction.reply(`🎉 **الري-رول الجديد!** الفائز هو: <@${winner}>! 🥳`);
}

// =======================================================
// 🔥 دالة القيفاواي العشوائي (المعدلة) 🔥
// =======================================================
async function createRandomDropGiveaway(client, guild) {
    const sql = client.sql;

    const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
    if (!settings || !settings.dropGiveawayChannelID) return false;
    
    const channel = guild.channels.cache.get(settings.dropGiveawayChannelID);
    if (!channel) return false;

    // 1. الإعدادات الافتراضية مع التنسيق الجديد
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

    // 2. تحديد الجوائز (من 300 إلى 1500)
    const moraReward = Math.floor(Math.random() * 1201) + 300; 
    const xpReward = Math.floor(Math.random() * 1201) + 300;     
    
    const winnerCount = Math.floor(Math.random() * 3) + 1;        
    const durationMs = 5 * 60 * 1000; 
    const endsAt = Date.now() + durationMs;
    const endsAtTimestamp = Math.floor(endsAt / 1000);

    const prize = `🎁 ${moraReward.toLocaleString()} Mora & ${xpReward.toLocaleString()} XP`;

    const title = settings.dropTitle || DEFAULTS.dropTitle;
    
    // 3. استبدال المتغيرات
    const description = (settings.dropDescription || DEFAULTS.dropDescription)
        .replace(/{prize}/g, prize)
        .replace(/{winners}/g, winnerCount)
        .replace(/{time}/g, `<t:${endsAtTimestamp}:R>`)
        .replace(/{time_full}/g, `<t:${endsAtTimestamp}:f>`)
        .replace(/{mora}/g, moraReward.toLocaleString())
        .replace(/{xp}/g, xpReward.toLocaleString());

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(settings.dropColor || DEFAULTS.dropColor)
        .setTimestamp(endsAt)
        .setFooter({ text: settings.dropFooter || DEFAULTS.dropFooter });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('g_enter_drop') 
            .setLabel(settings.dropButtonLabel || DEFAULTS.dropButtonLabel)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(settings.dropButtonEmoji || DEFAULTS.dropButtonEmoji)
    );

    const message = await channel.send({ 
        content: settings.dropMessageContent || DEFAULTS.dropMessageContent,
        embeds: [embed], 
        components: [row] 
    });

    sql.prepare(
        "INSERT INTO active_giveaways (messageID, guildID, channelID, prize, endsAt, winnerCount, xpReward, moraReward, isFinished) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    ).run(message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward);

    setTimeout(() => { endGiveaway(client, message.id); }, durationMs); 

    return true; 
}

// دالة التهيئة
async function initGiveaways(client) {
    const sql = client.sql;
    const activeGiveaways = sql.prepare("SELECT * FROM active_giveaways WHERE isFinished = 0").all();
    
    for (const giveaway of activeGiveaways) {
        const now = Date.now();
        const timeLeft = giveaway.endsAt - now;

        if (timeLeft <= 0) {
            endGiveaway(client, giveaway.messageID);
        } else {
            setTimeout(() => { endGiveaway(client, giveaway.messageID); }, timeLeft);
        }
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
