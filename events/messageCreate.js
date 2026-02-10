// events/messageCreate.js

const { Events, ChannelType, PermissionsBitField, EmbedBuilder, Colors, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError } = require("../handlers/report-handler.js");
const { generateLevelUpCard } = require('../generators/levelup-card-generator');
const { askMorax } = require('../handlers/ai-handler');
const aiConfig = require('../utils/aiConfig'); 
const aiLimitHandler = require('../utils/aiLimitHandler');

const DISBOARD_BOT_ID = '302050872383242240'; 
const autoResponderCooldowns = new Collection();
const treeCooldowns = new Set();
const paymentCooldowns = new Set();

if (!global.afkMessagesCache) global.afkMessagesCache = new Collection();

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}

async function recordBump(client, guildID, userID) {
    const sql = client.sql;
    if (!sql || !sql.open) return;
     
    const dateStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    const dailyID = `${userID}-${guildID}-${dateStr}`;
    const weeklyID = `${userID}-${guildID}-${weekStr}`;
    const totalID = `${userID}-${guildID}`;
    try {
        sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, disboard_bumps, boost_channel_reactions) VALUES (?,?,?,?,1,0) ON CONFLICT(id) DO UPDATE SET disboard_bumps = disboard_bumps + 1`).run(dailyID, userID, guildID, dateStr);
        sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, disboard_bumps) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = disboard_bumps + 1`).run(weeklyID, userID, guildID, weekStr);
        sql.prepare(`INSERT INTO user_total_stats (id, userID, guildID, total_disboard_bumps) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET total_disboard_bumps = total_disboard_bumps + 1`).run(totalID, userID, guildID);
        const member = await client.guilds.cache.get(guildID)?.members.fetch(userID).catch(() => null);
        if (member && client.checkQuests) {
            const updatedDaily = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyID);
            const updatedTotal = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?").get(totalID);
            if (updatedDaily) await client.checkQuests(client, member, updatedDaily, 'daily', dateStr);
            if (updatedTotal) await client.checkAchievements(client, member, null, updatedTotal);
        }
    } catch (e) { console.error(e); }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;
        if (!sql || !sql.open) return; 

        if (message.author.bot && message.author.id !== DISBOARD_BOT_ID) return;
        if (!message.guild) return;

        try {
            if (message.member) {
                const conflictRules = sql.prepare("SELECT role_id, anti_roles FROM role_settings WHERE anti_roles IS NOT NULL AND anti_roles != ''").all();
                if (conflictRules.length > 0) {
                    const memberRoleIds = message.member.roles.cache.map(r => r.id);
                    for (const rule of conflictRules) {
                        if (memberRoleIds.includes(rule.role_id)) {
                            const prohibitedRoles = rule.anti_roles.split(',');
                            const hasForbidden = prohibitedRoles.filter(id => memberRoleIds.includes(id));
                            if (hasForbidden.length > 0) {
                                await message.member.roles.remove(hasForbidden).catch(() => {});
                            }
                        }
                    }
                }
            }
        } catch (error) { console.error("[Anti-Role Auto Cleaner Error]", error); }

        try {
            const isAfkTableExists = sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='afk'").get();
             
            if (isAfkTableExists) {
                const afkData = sql.prepare("SELECT * FROM afk WHERE userID = ? AND guildID = ?").get(message.author.id, message.guild.id);

                if (afkData) {
                    const content = message.content.trim();
                    if (!(content.startsWith('(') && content.endsWith(')'))) {
                        const now = Math.floor(Date.now() / 1000);
                        const diffSeconds = now - afkData.timestamp;
                        
                        // الحساب بالدقائق (2 مورا لكل دقيقة)
                        const minutes = Math.floor(diffSeconds / 60); 
                        const calculatedMinutes = Math.min(minutes, 1440); // الحد الأقصى 24 ساعة
                        const reward = calculatedMinutes * 2; 

                        if (reward > 0) {
                            let userLevel = client.getLevel.get(message.author.id, message.guild.id);
                            if (userLevel) {
                                userLevel.mora += reward;
                                client.setLevel.run(userLevel);
                            }
                        }

                        const storedMessages = JSON.parse(afkData.messages || '[]');
                        let msgBtnRow = null;

                        if (storedMessages.length > 0) {
                            global.afkMessagesCache.set(message.author.id, storedMessages);
                            setTimeout(() => global.afkMessagesCache.delete(message.author.id), 5 * 60 * 1000);

                            msgBtnRow = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('show_afk_msgs')
                                    .setLabel(`عرض الرسائل (${storedMessages.length})`)
                                    .setEmoji('📩')
                                    .setStyle(ButtonStyle.Primary)
                            );
                        }

                        sql.prepare("DELETE FROM afk WHERE userID = ? AND guildID = ?").run(message.author.id, message.guild.id);

                        try {
                            const currentName = message.member.displayName;
                            if (currentName.includes("[AFK] ")) {
                                await message.member.setNickname(currentName.replace("[AFK] ", ""));
                            }
                        } catch (e) {}

                        // العداد الديناميكي من ديسكورد (منذ X دقيقة)
                        const timeAgo = `<t:${afkData.timestamp}:R>`;
                        
                        let replyContent = `👋 **✶أهلاً بعودتك يا ${message.author}!**\n⏱️ **✶مدة الغياب:** ${timeAgo}\n🔔 **✶تم منشنتك:** ${afkData.mentionsCount} مرة أثناء غيابك`;
                        
                        // 🔥🔥 التعديل: استخدام العداد الديناميكي في رسالة الجائزة 🔥🔥
                        if (reward > 0) {
                            replyContent += `\n💰 **✶مكافأة الراحة:** حصلت على **${reward}** <:mora:1435647151349698621> لأنك كنت غائباً ${timeAgo}`;
                        }

                        const welcomeMsg = await message.reply({ 
                            content: replyContent,
                            components: msgBtnRow ? [msgBtnRow] : [] 
                        });
                        
                        if (!msgBtnRow) {
                            setTimeout(() => welcomeMsg.delete().catch(() => {}), 60000);
                        } else {
                            setTimeout(() => welcomeMsg.delete().catch(() => {}), 120000);
                        }

                        const subscribers = JSON.parse(afkData.subscribers || '[]');
                        if (subscribers.length > 0) {
                            const everyoneRole = message.guild.roles.everyone;
                            const perms = message.channel.permissionsFor(everyoneRole);
                            if (perms.has(PermissionsBitField.Flags.ViewChannel)) {
                                const pings = subscribers.map(id => `<@${id}>`).join(' ');
                                const notifyMsg = await message.channel.send(`🔔 **✶ تنبيـه:** ${message.author} عاد من وضع  الغيـاب المؤقـت!\n${pings}`);
                                setTimeout(() => notifyMsg.delete().catch(() => {}), 60000);
                            } 
                        }
                    } 
                }

                if (message.mentions.members.size > 0) {
                    const mentionedIds = new Set(message.mentions.members.map(m => m.id));

                    mentionedIds.forEach(async targetID => {
                        if (targetID === message.author.id) return;

                        const targetAfkData = sql.prepare("SELECT * FROM afk WHERE userID = ? AND guildID = ?").get(targetID, message.guild.id);

                        if (targetAfkData) {
                            sql.prepare("UPDATE afk SET mentionsCount = mentionsCount + 1 WHERE userID = ? AND guildID = ?").run(targetID, message.guild.id);

                            const member = message.guild.members.cache.get(targetID);
                            const timeAgo = `<t:${targetAfkData.timestamp}:R>`;

                            const embed = new EmbedBuilder()
                                .setColor("Random")
                                .setThumbnail(member ? member.user.displayAvatarURL() : null)
                                .setDescription(
                                    `😴 **${member ? member.displayName : 'العضو'}**\n ✶ في وضع الغيـاب المؤقـت(AFK)\n📝 **السبب:** ${targetAfkData.reason}\n⏳ **منـذ:** ${timeAgo}`
                                );

                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`notify_afk_${targetID}`)
                                    .setLabel('نبهني عند عودتـه 🔔')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId(`leave_msg_afk_${targetID}`)
                                    .setLabel('اترك رسالـة 📩')
                                    .setStyle(ButtonStyle.Primary)
                            );

                            const replyMsg = await message.reply({
                                embeds: [embed],
                                components: [row],
                                allowedMentions: { repliedUser: true }
                            });

                            setTimeout(() => replyMsg.delete().catch(() => {}), 60000);
                        }
                    });
                }
            }
        } catch (err) { console.error("[AFK System Error]", err); }

        if (message.author.id === DISBOARD_BOT_ID) {
            let settingsData;
            try { settingsData = sql.prepare("SELECT bumpChannelID, bumpNotifyRoleID FROM settings WHERE guild = ?").get(message.guild.id); } 
            catch (e) { settingsData = sql.prepare("SELECT bumpChannelID FROM settings WHERE guild = ?").get(message.guild.id); }
            
            if (settingsData && settingsData.bumpChannelID && message.channel.id !== settingsData.bumpChannelID) return;

            let bumperID = null;
            if (message.interaction && message.interaction.commandName === 'bump') bumperID = message.interaction.user.id;
            else if (message.embeds.length > 0) {
                const desc = message.embeds[0].description || "";
                if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                    const match = desc.match(/<@!?(\d+)>/); 
                    if (match && match[1]) bumperID = match[1];
                }
            }

            if (bumperID) {
                await recordBump(client, message.guild.id, bumperID);
                await message.react('👊').catch(() => {});
                const nextBumpTime = Date.now() + 7200000;
                const nextBumpTimeSec = Math.floor(nextBumpTime / 1000);
                message.channel.send({
                    content: `بُورك النشــر، وسُمــع الــنداء \nعــدّاد المــجد بدأ مــن جــديــد <:2cenema:1428340793676009502>\n\n- النشر التالي بعد: <t:${nextBumpTimeSec}:R>`,
                    files: ["https://i.postimg.cc/1XTvpgMV/image.gif"]
                }).catch(() => {});
                message.channel.setName('˖✶⁺〢🍀・الـنـشـر').catch(err => console.error("[Bump Rename Error]", err.message));
                try { sql.prepare("UPDATE settings SET nextBumpTime = ?, lastBumperID = ? WHERE guild = ?").run(nextBumpTime, bumperID, message.guild.id); } catch (e) {}
            }
            return;
        }

        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id);

        let Prefix = settings?.prefix || "-";

        if (message.mentions.has(client.user) && !message.author.bot) {
            if (message.content.includes("@everyone") || message.content.includes("@here")) return;

            let aiChannelData = aiConfig.getChannelSettings(message.channel.id);
            let isPaidSession = false;

            if (!aiChannelData && message.channel.parentId) {
                if (aiConfig.isRestrictedCategory(message.channel.parentId)) {
                    const paidStatus = aiConfig.getPaidChannelStatus(message.channel.id);
                     
                    if (paidStatus) {
                        aiChannelData = { nsfw: paidStatus.mode === 'NSFW' ? 1 : 0 };
                        isPaidSession = true;
                    } else {
                        if (paymentCooldowns.has(message.channel.id)) return; 

                        paymentCooldowns.add(message.channel.id);
                        setTimeout(() => paymentCooldowns.delete(message.channel.id), 60000); 

                        const payBtn = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('ai_pay_category_1000')
                                .setLabel('فتح الشات (1000 مورا)')
                                .setEmoji('🔓')
                                .setStyle(ButtonStyle.Primary)
                        );

                        return message.reply({
                            content: `🚫 **هذه الدردشة خارج نطاق صلاحياتي..**\nلفتح ميزة الدردشة معي هنا لمدة **يوم كامل (24 ساعة)**، عليك دفع **1000 مـورا**.`,
                            components: [payBtn]
                        });
                    }
                }
            }

            if (!aiChannelData) return;

            const usageStatus = await aiLimitHandler.checkUserUsage(message.member);

            if (!usageStatus.canChat) {
                if (paymentCooldowns.has(message.author.id)) {
                    return; 
                }

                paymentCooldowns.add(message.author.id);
                setTimeout(() => paymentCooldowns.delete(message.author.id), 5 * 60 * 1000);

                const payButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ai_topup_2500') 
                        .setLabel('ادفـع 2500 مورا')
                        .setEmoji(client.EMOJI_MORA || '💰')
                        .setStyle(ButtonStyle.Success)
                );

                return message.reply({
                    content: `✶ نـفـد وقـتي معـك ... \n✶ ان اردت استكمال محادثتنا ارفع مستواك او ادفـع مـورا لتجديد رصيـد محادثتنـا`,
                    components: [payButton]
                });
            }

            if (paymentCooldowns.has(message.author.id)) {
                paymentCooldowns.delete(message.author.id);
            }

            const isNsfw = Boolean(aiChannelData.nsfw); 

            try {
                await message.channel.sendTyping();
                const cleanContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();
                if (!cleanContent) return message.reply("نـعـم .. ؟");

                let imageAttachment = null;
                if (message.attachments.size > 0) {
                    const attachment = message.attachments.first();
                    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                        imageAttachment = { url: attachment.url, mimeType: attachment.contentType };
                    }
                }

                const reply = await askMorax(
                    message.author.id, 
                    message.guild.id, 
                    message.channel.id, 
                    cleanContent, 
                    message.member.displayName,
                    imageAttachment, 
                    isNsfw,
                    message 
                );
                
                if (!reply) return;

                aiLimitHandler.incrementUsage(message.author.id);

                const safeReply = reply.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');

                const replyOptions = {
                    repliedUser: true, 
                    parse: ['users']    
                };

                if (safeReply.length > 2000) {
                    const chunks = safeReply.match(/[\s\S]{1,1950}/g) || [];
                    for (const chunk of chunks) {
                        await message.reply({ 
                            content: chunk, 
                            allowedMentions: replyOptions 
                        });
                    }
                } else {
                    return message.reply({ 
                        content: safeReply, 
                        allowedMentions: replyOptions 
                    });
                }

            } catch (err) { console.error("AI Response Failed:", err); }
            return;
        }

        if (message.author.bot && settings && settings.treeChannelID && message.channel.id === settings.treeChannelID) {
             const fullContent = (message.content || "") + " " + (message.embeds[0]?.description || "") + " " + (message.embeds[0]?.title || "");
             const lowerContent = fullContent.toLowerCase();
             const validPhrases = ["watered the tree", "سقى الشجرة", "has watered", "قام بسقاية"];
             if (validPhrases.some(p => lowerContent.includes(p))) {
                 const match = fullContent.match(/<@!?(\d+)>/);
                 if (match && match[1]) {
                     const userID = match[1];
                     if (userID !== client.user.id && !treeCooldowns.has(userID)) {
                         treeCooldowns.add(userID);
                         setTimeout(() => treeCooldowns.delete(userID), 60000);
                         if (client.incrementQuestStats) {
                             await client.incrementQuestStats(userID, message.guild.id, 'water_tree', 1);
                             message.react('💧').catch(() => {});
                         }
                     }
                 }
             }
        }

        if (message.author.bot) return;

        if (sql && sql.open) {
            const isChannelIgnored = sql.prepare("SELECT * FROM xp_ignore WHERE guildID = ? AND id = ?").get(message.guild.id, message.channel.id);
            let isCategoryIgnored = false;
            if (message.channel.parentId) {
                isCategoryIgnored = sql.prepare("SELECT * FROM xp_ignore WHERE guildID = ? AND id = ?").get(message.guild.id, message.channel.parentId);
            }
            if (isChannelIgnored || isCategoryIgnored) return; 
        }

        try {
            const userID = message.author.id;
            const guildID = message.guild.id;
            if (client.incrementQuestStats) {
                await client.incrementQuestStats(userID, guildID, 'messages', 1);
                if (message.attachments.size > 0) await client.incrementQuestStats(userID, guildID, 'images', 1);
                if (message.stickers.size > 0) await client.incrementQuestStats(userID, guildID, 'stickers', message.stickers.size);
                const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu;
                const emojis = message.content.match(emojiRegex);
                if (emojis) await client.incrementQuestStats(userID, guildID, 'emojis_sent', emojis.length);
            }
            if (message.mentions.users.size > 0) {
                message.mentions.users.forEach(async (user) => {
                    if (user.id !== message.author.id && !user.bot) {
                        if (client.incrementQuestStats) await client.incrementQuestStats(user.id, guildID, 'mentions_received', 1);
                    }
                });
            }
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'replies_sent', 1);
                    }
                } catch(e) {}
            }
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                if (!isNaN(message.content.trim())) {
                    if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'counting_channel', 1);
                }
            }
            if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'meow_count', 1);
                let level = client.getLevel.get(userID, guildID);
                if (level) {
                    level.total_meow_count = (level.total_meow_count || 0) + 1;
                    client.setLevel.run(level);
                    if (client.checkAchievements) await client.checkAchievements(client, message.member, level, null);
                }
            }
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(guildID, message.channel.id);
            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    await handleMediaStreakMessage(message);
                }
            }
            await handleStreakMessage(message);
            let level = client.getLevel.get(message.author.id, message.guild.id);
            const completeDefaultLevelData = { xp: 0, level: 1, totalXP: 0, mora: 0, lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, lastInterest: 0, totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0, totalVCTime: 0, lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0, lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, total_meow_count: 0, boost_count: 0, lastPVP: 0 };
            if (!level) level = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
            let getXpfromDB = settings?.customXP || 25;
            let getCooldownfromDB = settings?.customCooldown || 60000;
            if (!client.talkedRecently.get(message.author.id)) {
                const buff = calculateBuffMultiplier(message.member, sql);
                const xp = Math.floor((Math.random() * getXpfromDB + 1) * buff);
                level.xp += xp; level.totalXP += xp;
                const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
                if (level.xp >= nextXP) {
                    const oldLvl = level.level;
                    level.xp -= nextXP; level.level++;
                    client.setLevel.run(level);
                    try {
                        const card = await generateLevelUpCard(message.member, oldLvl, level.level, { mora: 0, hp: 0 });
                        const channelId = settings?.levelChannel || message.channel.id;
                        const channel = message.guild.channels.cache.get(channelId);
                        if (channel) {
                            const notifData = sql.prepare("SELECT levelNotif FROM quest_notifications WHERE userID = ? AND guildID = ?").get(message.author.id, message.guild.id);
                            const isMentionOn = notifData ? notifData.levelNotif : 1; 
                            const userReference = isMentionOn ? message.author : `**${message.member.displayName}**`;
                            let contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userReference} <a:wii:1435572329039007889>\n` +
                                             `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                                             `★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${level.level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>`;
                            const milestones = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
                            if (milestones.includes(level.level)) {
                                contentMsg += `\n★  فتـحـت ميزة جديـدة راجع قنـاة المستويات !`;
                            }
                            await channel.send({ content: contentMsg, files: [card] });
                        }
                    } catch (error) {
                        console.error("فشل في رسم بطاقة التلفيل:", error);
                        let backupMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${message.author} <a:wii:1435572329039007889>\n` +
                                        `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                                        `★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${level.level}〃`;
                        message.channel.send(backupMsg);
                    }
                } else {
                    client.setLevel.run(level);
                }
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }
            try {
                let currentLevelRole = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND level = ?").get(message.guild.id, level.level);
                if (currentLevelRole && message.member) {
                    if (!message.member.roles.cache.has(currentLevelRole.roleID)) {
                        await message.member.roles.add(currentLevelRole.roleID).catch(e => console.error(`[Level Role Add Error]: ${e.message}`));
                        const oldRoles = sql.prepare("SELECT roleID FROM level_roles WHERE guildID = ? AND level < ?").all(message.guild.id, level.level);
                        for (const roleData of oldRoles) {
                            if (message.member.roles.cache.has(roleData.roleID)) {
                                await message.member.roles.remove(roleData.roleID).catch(e => {});
                            }
                        }
                    }
                }
            } catch (e) { console.error("[Level Role Logic Error]: ", e); }
        } catch (err) { console.error("[Stats Error]", err); }

        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase().trim();
            let shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?")
                .get(message.guild.id, message.channel.id, shortcutWord);
            if (!shortcut) {
                 shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND shortcutWord = ? AND (channelID IS NULL OR channelID = 'null' OR channelID = '')")
                .get(message.guild.id, shortcutWord);
            }
            if (shortcut) {
                const targetName = shortcut.commandName.toLowerCase();
                const cmd = client.commands.find(c => (c.name && c.name.toLowerCase() === targetName) || (c.aliases && c.aliases.includes(targetName)));
                if (cmd) {
                    if (checkPermissions(message, cmd)) {
                        const cooldownMsg = checkCooldown(message, cmd);
                        if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); return; }
                        try {
                            const finalArgs = argsRaw.slice(1);
                            finalArgs.prefix = ""; 
                            await cmd.execute(message, finalArgs); 
                        } catch (e) { console.error(`[Shortcut Exec Error]`, e); }
                    }
                    return; 
                }
            }
        } catch (err) { console.error("[Shortcut Handler Error]", err); }

        const mentionRegex = new RegExp(`^<@!?${client.user.id}>( |)$`);
        if (mentionRegex.test(message.content)) {
            return message.reply(`البريفكس الخاص بي هو: \`${Prefix}\``).catch(() => {});
        }

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            if (commandName.length > 0) {
                const command = client.commands.find(cmd => (cmd.name && cmd.name.toLowerCase() === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
                if (command) {
                    args.prefix = Prefix;
                    let isAllowed = false;
                    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) { isAllowed = true; } 
                    else if (settings && (settings.casinoChannelID === message.channel.id || settings.casinoChannelID2 === message.channel.id) && command.category === 'Economy') { isAllowed = true; }
                    else {
                        try {
                            const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.id);
                            const categoryPerm = message.channel.parentId ? sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.parentId) : null;
                            if (channelPerm || categoryPerm) { isAllowed = true; }
                        } catch (err) { isAllowed = false; }
                    }
                    if (isAllowed) {
                        try {
                            const isBlacklisted = sql.prepare("SELECT 1 FROM blacklist WHERE userID = ?").get(message.author.id);
                            if (isBlacklisted) return; 
                        } catch(e) {}
                        if (checkPermissions(message, command)) {
                            const cooldownMsg = checkCooldown(message, command);
                            if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); } 
                            else { try { await command.execute(message, args); } catch (error) { console.error(error); message.reply("❌ حدث خطأ."); } }
                        }
                    }
                    return; 
                }
            }
        }

        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            if (message.content.trim().startsWith("بلاغ")) {
                const args = message.content.trim().split(/ +/); args.shift(); await message.delete().catch(() => {});
                const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(message.guild.id).map(r => r.roleID);
                const hasPerm = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || allowedRoles.length === 0 || message.member.roles.cache.some(r => allowedRoles.includes(r.id));
                if (!hasPerm) return sendReportError(message, "❖ ليس لـديـك صلاحيـات", "ليس لديك صلاحيات التبليغ.");
                const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
                const reason = args.slice(1).join(" ");
                if (!target || !reason) return sendReportError(message, "✶ خطأ في التنسيق", "`بلاغ @user السبب`");
                await processReportLogic(client, message, target, reason);
            }
            return; 
        }

        if (settings && ((settings.casinoChannelID && message.channel.id === settings.casinoChannelID) || (settings.casinoChannelID2 && message.channel.id === settings.casinoChannelID2))) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.find(cmd => (cmd.name && cmd.name.toLowerCase() === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
            if (command && command.category === "Economy") {
                if (!checkPermissions(message, command)) return;
                try { await command.execute(message, args); } catch (error) {}
            }
            return;
        }

        try {
            const content = message.content.trim();
            const autoReply = sql.prepare("SELECT * FROM auto_responses WHERE guildID = ? AND trigger = ?").get(message.guild.id, content);
            if (autoReply) {
                if (autoReply.expiresAt && Date.now() > autoReply.expiresAt) {
                    sql.prepare("DELETE FROM auto_responses WHERE id = ?").run(autoReply.id);
                } 
                else {
                    let isAllowedChannel = true;
                    try {
                        if (autoReply.allowedChannels) {
                            const allowed = JSON.parse(autoReply.allowedChannels);
                            if (allowed.length > 0 && !allowed.includes(message.channel.id)) isAllowedChannel = false;
                        }
                        if (autoReply.ignoredChannels) {
                            const ignored = JSON.parse(autoReply.ignoredChannels);
                            if (ignored.length > 0 && ignored.includes(message.channel.id)) isAllowedChannel = false;
                        }
                    } catch (e) {} 
                    if (isAllowedChannel) {
                        const cooldownKey = `ar_${autoReply.id}_${message.channel.id}`;
                        const cooldownTime = (autoReply.cooldown || 600) * 1000;
                        const now = Date.now();
                        if (message.author.id === message.guild.ownerId || !autoResponderCooldowns.has(cooldownKey) || now > autoResponderCooldowns.get(cooldownKey)) {
                            const files = autoReply.images ? JSON.parse(autoReply.images) : [];
                            await message.reply({ content: autoReply.response, files: files, allowedMentions: { repliedUser: false } }).catch(() => {});
                            autoResponderCooldowns.set(cooldownKey, now + cooldownTime);
                            setTimeout(() => autoResponderCooldowns.delete(cooldownKey), cooldownTime);
                        }
                    }
                }
            }
        } catch (err) { console.error("[Auto Responder Error]", err); }
    },
};
