const { Events, ChannelType, PermissionsBitField, EmbedBuilder, Colors, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError } = require("../handlers/report-handler.js");
const { generateLevelUpCard } = require('../generators/levelup-card-generator');
const { askMorax } = require('../handlers/ai-handler');
const aiConfig = require('../utils/aiConfig'); 
const aiLimitHandler = require('../utils/aiLimitHandler');

// استدعاء دالة التحديث الآمنة للوحة الملوك
const { updateGuildStat } = require('../handlers/guild-board-handler.js');

const DISBOARD_BOT_ID = '302050872383242240'; 
const autoResponderCooldowns = new Collection();
const treeCooldowns = new Set();
const paymentCooldowns = new Set();

const ghostModeUsers = new Set();

if (!global.afkMessagesCache) global.afkMessagesCache = new Collection();

// 🔥 توحيد صارم لتوقيت السعودية (KSA) لمنع أي تضارب في تسجيل الأيام 🔥
function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function getWeekStartDateString() {
    const ksaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const diff = ksaTime.getDate() - (ksaTime.getDay() + 2) % 7; 
    const friday = new Date(ksaTime.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);
}

async function safeReply(message, options) {
    try {
        return await message.reply(options);
    } catch (error) {
        if (error.code === 10008 || error.code === 50035) {
            const { allowedMentions, ...newOptions } = options;
            return await message.channel.send(newOptions).catch(() => null);
        }
        throw error;
    }
}

// 🔥 تحصين نظام تسجيل البومب (Atomic Update) 🔥
async function recordBump(client, guildID, userID) {
    const sql = client.sql;
    if (!sql || !sql.open) return;
      
    const dateStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    const dailyID = `${userID}-${guildID}-${dateStr}`;
    const weeklyID = `${userID}-${guildID}-${weekStr}`;
    const totalID = `${userID}-${guildID}`;
    try {
        sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, disboard_bumps, boost_channel_reactions) VALUES (?,?,?,?,1,0) ON CONFLICT(id) DO UPDATE SET disboard_bumps = CAST(COALESCE(disboard_bumps, 0) AS INTEGER) + 1`).run(dailyID, userID, guildID, dateStr);
        sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, disboard_bumps) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = CAST(COALESCE(disboard_bumps, 0) AS INTEGER) + 1`).run(weeklyID, userID, guildID, weekStr);
        sql.prepare(`INSERT INTO user_total_stats (id, userID, guildID, total_disboard_bumps) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET total_disboard_bumps = CAST(COALESCE(total_disboard_bumps, 0) AS INTEGER) + 1`).run(totalID, userID, guildID);
        
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
                    const ghostKey = `${message.author.id}-${message.guild.id}`;
                    const isGhostMessage = content.startsWith('(') && content.endsWith(')');
                    
                    const allowGhost = isGhostMessage && !ghostModeUsers.has(ghostKey);

                    if (!allowGhost) {
                        const now = Math.floor(Date.now() / 1000);
                        const diffSeconds = now - afkData.timestamp;
                        
                        const minutes = Math.floor(diffSeconds / 60); 
                        
                        const cappedMinutes = Math.min(minutes, 720); 
                        const reward = (minutes >= 60) ? (cappedMinutes * 1) : 0;

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
                        
                        ghostModeUsers.delete(ghostKey);

                        try {
                            const currentName = message.member.displayName;
                            if (currentName.includes("[AFK] ")) {
                                await message.member.setNickname(currentName.replace("[AFK] ", ""));
                            }
                        } catch (e) {}

                        const timeAgo = `<t:${afkData.timestamp}:R>`;
                        
                        let replyContent = `👋 **✶أهلاً بعودتك يا ${message.author}!**\n⏱️ **✶مدة الغياب:** ${timeAgo}\n🔔 **✶تم منشنتك:** ${afkData.mentionsCount} مرة أثناء غيابك`;
                        
                        if (reward > 0) {
                            replyContent += `\n💰 **✶مكافأة الراحة:** حصلت على **${reward}** <:mora:1435647151349698621> لأنك كنت غائباً ${timeAgo}`;
                        }

                        const welcomeMsg = await safeReply(message, { 
                            content: replyContent,
                            components: msgBtnRow ? [msgBtnRow] : [] 
                        });
                        
                        if (welcomeMsg) {
                            const deleteTime = msgBtnRow ? 120000 : 60000;
                            setTimeout(() => welcomeMsg.delete().catch(() => {}), deleteTime);
                        }

                        const subscribers = JSON.parse(afkData.subscribers || '[]');
                        if (subscribers.length > 0) {
                            const everyoneRole = message.guild.roles.everyone;
                            const perms = message.channel.permissionsFor(everyoneRole);
                            if (perms.has(PermissionsBitField.Flags.ViewChannel)) {
                                const pings = subscribers.map(id => `<@${id}>`).join(' ');
                                await message.channel.send(`🔔 **✶ تنبيـه:** ${message.author} عاد من وضع  الغيـاب المؤقـت!\n${pings}`).catch(()=>{});
                            } 
                        }
                    } else {
                        ghostModeUsers.add(ghostKey);
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

                            const replyMsg = await safeReply(message, {
                                embeds: [embed],
                                components: [row],
                                allowedMentions: { repliedUser: true }
                            });

                            if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => {}), 60000);
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
            
            if (message.content.startsWith(Prefix)) {
            } 
            else {
                const argsRaw = message.content.trim().split(/ +/);
                const firstWord = argsRaw[0].toLowerCase();
                const isCommand = client.commands.find(cmd => (cmd.name === firstWord) || (cmd.aliases && cmd.aliases.includes(firstWord)));
                let isShortcut = false;
                try {
                    isShortcut = sql.prepare("SELECT 1 FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?").get(message.guild.id, message.channel.id, firstWord);
                } catch(e) {}

                if (isCommand || isShortcut) {
                } 
                else {
                    if (message.reference) {
                        try {
                            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                            if (repliedMsg && repliedMsg.author.id === client.user.id) {
                                if (repliedMsg.embeds.length > 0 || repliedMsg.interaction) return;
                            }
                        } catch (e) {}
                    }

                    if (message.content.includes("@everyone") || message.content.includes("@here")) return;

                    let aiChannelData = aiConfig.getChannelSettings(message.channel.id);
                    
                    const OWNER_ID = "1145327691772481577"; 
                    const isOwnerMentioning = message.author.id === OWNER_ID;

                    let isWisdomKing = false;
                    try {
                        if (settings && settings.roleAdvisor && message.member.roles.cache.has(settings.roleAdvisor)) {
                            isWisdomKing = true;
                        }
                    } catch(e) {}

                    if (!isOwnerMentioning && !isWisdomKing) {
                        if (!aiChannelData && message.channel.parentId) {
                            if (aiConfig.isRestrictedCategory(message.channel.parentId)) {
                                const paidStatus = aiConfig.getPaidChannelStatus(message.channel.id);
                                if (paidStatus) {
                                    aiChannelData = { nsfw: paidStatus.mode === 'NSFW' ? 1 : 0 };
                                } else {
                                    if (paymentCooldowns.has(message.channel.id)) return; 
                                    paymentCooldowns.add(message.channel.id);
                                    setTimeout(() => paymentCooldowns.delete(message.channel.id), 60000); 
                                    const payBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ai_pay_category_1000').setLabel('فتح الشات (1000 مورا)').setEmoji('🔓').setStyle(ButtonStyle.Primary));
                                    return message.reply({ content: `🚫 **هذه الدردشة خارج نطاق صلاحياتي..**\nلفتح ميزة الدردشة معي هنا لمدة **يوم كامل (24 ساعة)**، عليك دفع **1000 مـورا**.`, components: [payBtn] }).catch(()=>{});
                                }
                            }
                        }
                        if (!aiChannelData) return;
                    }

                    const usageStatus = await aiLimitHandler.checkUserUsage(message.member);
                    if (!usageStatus.canChat && !isOwnerMentioning && !isWisdomKing) {
                        if (paymentCooldowns.has(message.author.id)) return; 
                        paymentCooldowns.add(message.author.id);
                        setTimeout(() => paymentCooldowns.delete(message.author.id), 5 * 60 * 1000);
                        const payButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ai_topup_2500').setLabel('ادفـع 2500 مورا').setEmoji(client.EMOJI_MORA || '💰').setStyle(ButtonStyle.Success));
                        return message.reply({ content: `✶ نـفـد وقـتي معـك ... \n✶ ان اردت استكمال محادثتنا ارفع مستواك او ادفـع مـورا لتجديد رصيـد محادثتنـا`, components: [payButton] }).catch(()=>{});
                    }

                    if (paymentCooldowns.has(message.author.id)) paymentCooldowns.delete(message.author.id);

                    const isNsfw = aiChannelData ? Boolean(aiChannelData.nsfw) : false; 

                    try {
                        await message.channel.sendTyping();
                        const cleanContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();
                        
                        let imageAttachment = null;
                        
                        if (message.attachments.size > 0) {
                            const attachment = message.attachments.first();
                            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                                imageAttachment = { url: attachment.url, mimeType: attachment.contentType };
                            }
                        } 
                        else if (message.stickers.size > 0) {
                            const sticker = message.stickers.first();
                            if (sticker.format === 1 || sticker.format === 2) { 
                                 imageAttachment = { url: sticker.url, mimeType: 'image/png' };
                            }
                        }

                        if (!cleanContent && !imageAttachment) return message.reply("نـعـم .. ؟");

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

                        if (!isOwnerMentioning && !isWisdomKing) aiLimitHandler.incrementUsage(message.author.id);

                        const safeReplyMsg = reply.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
                        const replyOptions = { repliedUser: true, parse: ['users'] };

                        if (safeReplyMsg.length > 2000) {
                            const chunks = safeReplyMsg.match(/[\s\S]{1,1950}/g) || [];
                            for (const chunk of chunks) {
                                await safeReply(message, { content: chunk, allowedMentions: replyOptions });
                            }
                        } else {
                            await safeReply(message, { content: safeReplyMsg, allowedMentions: replyOptions });
                        }

                    } catch (err) { console.error("AI Response Failed:", err); }
                    return; 
                }
            }
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

            // 🔥 استدعاء التحديث للوحة الملوك المعزولة 🔥
            updateGuildStat(client, guildID, userID, 'messages', 1);

            // 🔥 نظام منح وسام ثرثار الحانة محصّن بـ CAST و Atomic Update 🔥
            if (settings && settings.chatterChannelID && message.channel.id === settings.chatterChannelID) {
                const todayDate = getTodayDateString();
                const dailyIdForBadge = `${userID}-${guildID}-${todayDate}`;
                
                try { sql.prepare("ALTER TABLE user_daily_stats ADD COLUMN main_chat_messages INTEGER DEFAULT 0").run(); } catch(e){}
                try { sql.prepare("ALTER TABLE user_daily_stats ADD COLUMN chatter_badge_given INTEGER DEFAULT 0").run(); } catch(e){}
                
                sql.prepare(`
                    INSERT INTO user_daily_stats (id, userID, guildID, date, main_chat_messages) 
                    VALUES (?, ?, ?, ?, 1) 
                    ON CONFLICT(id) DO UPDATE SET main_chat_messages = CAST(COALESCE(main_chat_messages, 0) AS INTEGER) + 1
                `).run(dailyIdForBadge, userID, guildID, todayDate);

                const dailyDataCheck = sql.prepare("SELECT main_chat_messages, chatter_badge_given FROM user_daily_stats WHERE id = ?").get(dailyIdForBadge);
                
                if (dailyDataCheck && dailyDataCheck.main_chat_messages >= 100 && dailyDataCheck.chatter_badge_given === 0) {
                    sql.prepare("UPDATE user_daily_stats SET chatter_badge_given = 1 WHERE id = ?").run(dailyIdForBadge);
                    
                    let roleToGive = settings.roleChatterBadge || settings.roleChatter;
                    if (roleToGive) message.member.roles.add(roleToGive).catch(()=>{});

                    if (settings.guildAnnounceChannelID) {
                        const announceChannel = message.guild.channels.cache.get(settings.guildAnnounceChannelID);
                        if (announceChannel) {
                            const badgeEmbed = new EmbedBuilder()
                                .setTitle('🗣️ انـجـاز يـومـي: ثـرثـار الـحـانـة!')
                                .setDescription(`🎉 أثبت <@${userID}> أنه روح المكان!\n\nلقد أرسل **100 رسالة** في الشات الرئيسي اليوم واستحق وسام الشرف بجدارة!`)
                                .setColor('#F1C40F')
                                .setThumbnail(message.author.displayAvatarURL());
                            announceChannel.send({ content: `<@${userID}>`, embeds: [badgeEmbed] }).catch(()=>{});
                        }
                    } else {
                        message.channel.send(`🗣️ **وســام جديــد!**\n<@${userID}> أرسل 100 رسالة وحصل على وسام **🗣️ ثرثار الحانة**!`).catch(()=>{});
                    }
                }
            }

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
                let buff = calculateBuffMultiplier(message.member, sql);

                if (settings && settings.roleChatter && message.member.roles.cache.has(settings.roleChatter)) {
                    buff += 0.50; 
                }

                const xp = Math.floor((Math.random() * getXpfromDB + 1) * buff);
                level.xp += xp; 
                level.totalXP += xp;
                
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
                            await safeReply(message, { content: autoReply.response, files: files, allowedMentions: { repliedUser: false } }).catch(() => {});
                            autoResponderCooldowns.set(cooldownKey, now + cooldownTime);
                            setTimeout(() => autoResponderCooldowns.delete(cooldownKey), cooldownTime);
                        }
                    }
                }
            }
        } catch (err) { console.error("[Auto Responder Error]", err); }
    },
};
