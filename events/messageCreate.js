const { Events, ChannelType, PermissionsBitField, EmbedBuilder, Colors, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError } = require("../handlers/report-handler.js");
const { generateLevelUpCard } = require('../generators/levelup-card-generator');
const { askMorax } = require('../handlers/ai-handler');
const aiConfig = require('../utils/aiConfig'); 
const aiLimitHandler = require('../utils/aiLimitHandler');

const { updateGuildStat } = require('../handlers/guild-board-handler.js');

const DISBOARD_BOT_ID = '302050872383242240'; 
const autoResponderCooldowns = new Collection();
const treeCooldowns = new Set();
const paymentCooldowns = new Set();

const ghostModeUsers = new Set();

// ⚡ ذاكرة الإعدادات السريعة (تمنع البطء مع كل رسالة)
const settingsCache = new Map();
let lastSettingsUpdate = 0;

if (!global.afkMessagesCache) global.afkMessagesCache = new Collection();

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

// ⚡ دالة قراءة الإعدادات بسرعة الضوء
async function getSettings(db, guildId) {
    const now = Date.now();
    if (settingsCache.has(guildId) && now - lastSettingsUpdate < 300000) {
        return settingsCache.get(guildId);
    }
    try {
        const res = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guildId]);
        const data = res.rows[0];
        if (data) {
            settingsCache.set(guildId, data);
            lastSettingsUpdate = now;
        }
        return data;
    } catch (e) { return null; }
}

async function recordBump(client, guildID, userID) {
    const db = client.sql;
    if (!db) return;
      
    const dateStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    const dailyID = `${userID}-${guildID}-${dateStr}`;
    const weeklyID = `${userID}-${guildID}-${weekStr}`;
    const totalID = `${userID}-${guildID}`;
    
    try {
        await db.query(`INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "disboard_bumps", "boost_channel_reactions") VALUES ($1,$2,$3,$4,1,0) ON CONFLICT("id") DO UPDATE SET "disboard_bumps" = COALESCE(user_daily_stats."disboard_bumps", 0) + 1`, [dailyID, userID, guildID, dateStr]).catch(()=>{});
        await db.query(`INSERT INTO user_weekly_stats ("id", "userID", "guildID", "weekStartDate", "disboard_bumps") VALUES ($1,$2,$3,$4,1) ON CONFLICT("id") DO UPDATE SET "disboard_bumps" = COALESCE(user_weekly_stats."disboard_bumps", 0) + 1`, [weeklyID, userID, guildID, weekStr]).catch(()=>{});
        await db.query(`INSERT INTO user_total_stats ("id", "userID", "guildID", "total_disboard_bumps") VALUES ($1,$2,$3,1) ON CONFLICT("userID", "guildID") DO UPDATE SET "total_disboard_bumps" = COALESCE(user_total_stats."total_disboard_bumps", 0) + 1`, [totalID, userID, guildID]).catch(()=>{});
        
        const member = await client.guilds.cache.get(guildID)?.members.fetch(userID).catch(() => null);
        if (member && client.checkQuests) {
            const updatedDailyRes = await db.query(`SELECT * FROM user_daily_stats WHERE "id" = $1`, [dailyID]);
            const updatedTotalRes = await db.query(`SELECT * FROM user_total_stats WHERE "id" = $1`, [totalID]);
            if (updatedDailyRes.rows[0]) client.checkQuests(client, member, updatedDailyRes.rows[0], 'daily', dateStr).catch(()=>{});
            if (updatedTotalRes.rows[0]) client.checkAchievements(client, member, null, updatedTotalRes.rows[0]).catch(()=>{});
        }
    } catch (e) { console.error(e); }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const db = client.sql;
        if (!db || !message.guild) return; 

        if (message.author.bot && message.author.id !== DISBOARD_BOT_ID) return;

        // ⚡ جلب الإعدادات من الذاكرة العشوائية (سريع جداً)
        const settings = await getSettings(db, message.guild.id);
        let Prefix = settings?.prefix || "-";

        try {
            if (message.member) {
                const conflictRulesRes = await db.query(`SELECT "role_id", "anti_roles" FROM role_settings WHERE "anti_roles" IS NOT NULL AND "anti_roles" != ''`);
                const conflictRules = conflictRulesRes.rows;
                if (conflictRules.length > 0) {
                    const memberRoleIds = message.member.roles.cache.map(r => r.id);
                    for (const rule of conflictRules) {
                        if (memberRoleIds.includes(rule.role_id)) {
                            const prohibitedRoles = rule.anti_roles.split(',');
                            const hasForbidden = prohibitedRoles.filter(id => memberRoleIds.includes(id));
                            if (hasForbidden.length > 0) {
                                message.member.roles.remove(hasForbidden).catch(() => {});
                            }
                        }
                    }
                }
            }
        } catch (error) {}

        try {
            const afkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]);
            const afkData = afkDataRes.rows[0];

            if (afkData) {
                const content = message.content.trim();
                const ghostKey = `${message.author.id}-${message.guild.id}`;
                const isGhostMessage = content.startsWith('(') && content.endsWith(')');
                
                const allowGhost = isGhostMessage && !ghostModeUsers.has(ghostKey);

                if (!allowGhost) {
                    const now = Math.floor(Date.now() / 1000);
                    const diffSeconds = now - Number(afkData.timestamp);
                    
                    const minutes = Math.floor(diffSeconds / 60); 
                    
                    const cappedMinutes = Math.min(minutes, 720); 
                    const reward = (minutes >= 60) ? (cappedMinutes * 1) : 0;

                    if (reward > 0) {
                        db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [reward, message.author.id, message.guild.id]).catch(()=>{});
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

                    db.query(`DELETE FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]).catch(()=>{});
                    
                    ghostModeUsers.delete(ghostKey);

                    try {
                        const currentName = message.member.displayName;
                        if (currentName.includes("[AFK] ")) {
                            message.member.setNickname(currentName.replace("[AFK] ", "")).catch(()=>{});
                        }
                    } catch (e) {}

                    const timeAgo = `<t:${afkData.timestamp}:R>`;
                    
                    let replyContent = `👋 **✶أهلاً بعودتك يا ${message.author}!**\n⏱️ **✶مدة الغياب:** ${timeAgo}\n🔔 **✶تم منشنتك:** ${afkData.mentionsCount || afkData.mentionscount} مرة أثناء غيابك`;
                    
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
                            message.channel.send(`🔔 **✶ تنبيـه:** ${message.author} عاد من وضع  الغيـاب المؤقـت!\n${pings}`).catch(()=>{});
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

                    const targetAfkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [targetID, message.guild.id]);
                    const targetAfkData = targetAfkDataRes.rows[0];

                    if (targetAfkData) {
                        db.query(`UPDATE afk SET "mentionsCount" = "mentionsCount" + 1 WHERE "userID" = $1 AND "guildID" = $2`, [targetID, message.guild.id]).catch(()=>{});

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
        } catch (err) {}

        if (message.author.id === DISBOARD_BOT_ID) {
            if (settings && (settings.bumpChannelID || settings.bumpchannelid) && message.channel.id !== (settings.bumpChannelID || settings.bumpchannelid)) return;

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
                recordBump(client, message.guild.id, bumperID); // لا ننتظر النتيجة للسرعة
                message.react('👊').catch(() => {});
                const nextBumpTime = Date.now() + 7200000;
                const nextBumpTimeSec = Math.floor(nextBumpTime / 1000);
                message.channel.send({
                    content: `بُورك النشــر، وسُمــع الــنداء \nعــدّاد المــجد بدأ مــن جــديــد <:2cenema:1428340793676009502>\n\n- النشر التالي بعد: <t:${nextBumpTimeSec}:R>`,
                    files: ["https://i.postimg.cc/1XTvpgMV/image.gif"]
                }).catch(() => {});
                message.channel.setName('˖✶⁺〢🍀・الـنـشـر').catch(err => {});
            }
            return;
        }

        // 🔥 التعديل هنا: الرد بـ "نـعـم .. ؟" عند المنشن المجرد
        const mentionRegex = new RegExp(`^<@!?${client.user.id}>( |)$`);
        if (mentionRegex.test(message.content)) {
            return message.reply("نـعـم .. ؟").catch(() => {});
        }

        if (message.mentions.has(client.user) && !message.author.bot && !message.content.startsWith(Prefix)) {
            
            const argsRaw = message.content.trim().split(/ +/);
            const firstWord = argsRaw[0].toLowerCase();
            const isCommand = client.commands.find(cmd => (cmd.name === firstWord) || (cmd.aliases && cmd.aliases.includes(firstWord)));
            let isShortcut = false;
            try {
                const scRes = await db.query(`SELECT 1 FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [message.guild.id, message.channel.id, firstWord]);
                if(scRes.rows.length > 0) isShortcut = true;
            } catch(e) {}

            if (!isCommand && !isShortcut) {
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
                    if (settings && (settings.roleAdvisor || settings.roleadvisor) && message.member.roles.cache.has(settings.roleAdvisor || settings.roleadvisor)) {
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

                    // 🔥 إصلاح خطأ `Cannot read properties of undefined` بتمرير `db`
                    if (!isOwnerMentioning && !isWisdomKing) aiLimitHandler.incrementUsage(message.author.id, db);

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

                } catch (err) {}
                return; 
            }
        }

        if (message.author.bot && settings && (settings.treeChannelID || settings.treechannelid) && message.channel.id === (settings.treeChannelID || settings.treechannelid)) {
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
                             client.incrementQuestStats(userID, message.guild.id, 'water_tree', 1).catch(()=>{});
                             message.react('💧').catch(() => {});
                         }
                     }
                 }
             }
        }

        if (message.author.bot) return;

        if (db) {
            try {
                const isChannelIgnoredRes = await db.query(`SELECT * FROM xp_ignore WHERE "guildID" = $1 AND "id" = $2`, [message.guild.id, message.channel.id]);
                if (isChannelIgnoredRes.rows.length > 0) return; 
            } catch (e) {}
        }

        try {
            const userID = message.author.id;
            const guildID = message.guild.id;

            updateGuildStat(client, guildID, userID, 'messages', 1).catch(e => {});

            if (settings && (settings.chatterChannelID || settings.chatterchannelid) && message.channel.id === (settings.chatterChannelID || settings.chatterchannelid)) {
                const todayDate = getTodayDateString();
                const dailyIdForBadge = `${userID}-${guildID}-${todayDate}`;
                
                try {
                    await db.query(`
                        INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "main_chat_messages") 
                        VALUES ($1, $2, $3, $4, 1) 
                        ON CONFLICT("id") DO UPDATE SET "main_chat_messages" = COALESCE(user_daily_stats."main_chat_messages", 0) + 1
                    `, [dailyIdForBadge, userID, guildID, todayDate]);

                    const dailyDataCheckRes = await db.query(`SELECT "main_chat_messages", "chatter_badge_given" FROM user_daily_stats WHERE "id" = $1`, [dailyIdForBadge]);
                    const dailyDataCheck = dailyDataCheckRes.rows[0];
                    
                    if (dailyDataCheck && Number(dailyDataCheck.main_chat_messages) >= 100 && Number(dailyDataCheck.chatter_badge_given || 0) === 0) {
                        await db.query(`UPDATE user_daily_stats SET "chatter_badge_given" = 1 WHERE "id" = $1`, [dailyIdForBadge]);
                        
                        let roleToGive = settings.roleChatterBadge || settings.rolechatterbadge || settings.roleChatter || settings.rolechatter;
                        if (roleToGive) message.member.roles.add(roleToGive).catch(()=>{});

                        if (settings.guildAnnounceChannelID || settings.guildannouncechannelid) {
                            const announceChannel = message.guild.channels.cache.get(settings.guildAnnounceChannelID || settings.guildannouncechannelid);
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
                } catch(e) {}
            }

            if (client.incrementQuestStats) {
                client.incrementQuestStats(userID, guildID, 'messages', 1).catch(()=>{});
                if (message.attachments.size > 0) client.incrementQuestStats(userID, guildID, 'images', 1).catch(()=>{});
                if (message.stickers.size > 0) client.incrementQuestStats(userID, guildID, 'stickers', message.stickers.size).catch(()=>{});
                const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu;
                const emojis = message.content.match(emojiRegex);
                if (emojis) client.incrementQuestStats(userID, guildID, 'emojis_sent', emojis.length).catch(()=>{});
            }
            if (message.mentions.users.size > 0) {
                message.mentions.users.forEach(async (user) => {
                    if (user.id !== message.author.id && !user.bot) {
                        if (client.incrementQuestStats) client.incrementQuestStats(user.id, guildID, 'mentions_received', 1).catch(()=>{});
                    }
                });
            }
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'replies_sent', 1).catch(()=>{});
                    }
                } catch(e) {}
            }
            if (settings && (settings.countingChannelID || settings.countingchannelid) && message.channel.id === (settings.countingChannelID || settings.countingchannelid)) {
                if (!isNaN(message.content.trim())) {
                    if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'counting_channel', 1).catch(()=>{});
                }
            }
            
            if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'meow_count', 1).catch(()=>{});
                
                await db.query(`INSERT INTO levels ("user", "guild", "total_meow_count") VALUES ($1, $2, 1) ON CONFLICT ("user", "guild") DO UPDATE SET "total_meow_count" = COALESCE(levels."total_meow_count", 0) + 1`, [userID, guildID]).catch(()=>{});
                
                if (client.checkAchievements) {
                    const updatedLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                    client.checkAchievements(client, message.member, updatedLevelRes.rows[0], null).catch(()=>{});
                }
            }
            
            const isMediaChannelRes = await db.query(`SELECT * FROM media_streak_channels WHERE "guildID" = $1 AND "channelID" = $2`, [guildID, message.channel.id]);
            if (isMediaChannelRes.rows.length > 0) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    handleMediaStreakMessage(message).catch(()=>{}); 
                }
            }
            handleStreakMessage(message).catch(()=>{}); 

            let getXpfromDB = settings?.customXP || settings?.customxp || 25;
            let getCooldownfromDB = settings?.customCooldown || settings?.customcooldown || 60000;

            if (!client.talkedRecently.get(message.author.id)) {
                let buff = await calculateBuffMultiplier(message.member, db);

                if (settings && (settings.roleChatter || settings.rolechatter) && message.member.roles.cache.has(settings.roleChatter || settings.rolechatter)) {
                    buff += 0.50; 
                }

                const xpGained = Math.floor((Math.random() * getXpfromDB + 1) * buff);
                
                let currentLevelData = await client.getLevel(userID, guildID);
                
                if (!currentLevelData) {
                    currentLevelData = { user: userID, guild: guildID, level: 1, xp: xpGained, totalXP: xpGained };
                } else {
                    currentLevelData.xp = Number(currentLevelData.xp) + xpGained;
                    currentLevelData.totalXP = Number(currentLevelData.totalXP || currentLevelData.totalxp || 0) + xpGained;
                    currentLevelData.level = Number(currentLevelData.level);
                }
                
                const nextXP = 5 * (currentLevelData.level ** 2) + (50 * currentLevelData.level) + 100;
                
                if (currentLevelData.xp >= nextXP) {
                    const oldLvl = currentLevelData.level;
                    currentLevelData.xp -= nextXP; 
                    currentLevelData.level++;
                    
                    client.setLevel(currentLevelData).catch(()=>{});
                    
                    try {
                        const card = await generateLevelUpCard(message.member, oldLvl, currentLevelData.level, { mora: 0, hp: 0 });
                        const channelId = settings?.levelChannel || settings?.levelchannel || message.channel.id;
                        const channel = message.guild.channels.cache.get(channelId);
                        if (channel) {
                            const notifData = await client.getQuestNotif(`${message.author.id}-${message.guild.id}`);
                            const isMentionOn = notifData ? (notifData.levelNotif || notifData.levelnotif) : 1; 
                            const userReference = isMentionOn ? message.author : `**${message.member.displayName}**`;
                            let contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userReference} <a:wii:1435572329039007889>\n` +
                                             `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                                             `★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${currentLevelData.level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>`;
                            const milestones = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
                            if (milestones.includes(currentLevelData.level)) {
                                contentMsg += `\n★  فتـحـت ميزة جديـدة راجع قنـاة المستويات !`;
                            }
                            await channel.send({ content: contentMsg, files: [card] });
                        }
                    } catch (error) {
                        let backupMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${message.author} <a:wii:1435572329039007889>\n` +
                                        `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                                        `★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${currentLevelData.level}〃`;
                        message.channel.send(backupMsg).catch(()=>{});
                    }
                } else {
                    client.setLevel(currentLevelData).catch(()=>{}); 
                }
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }
            
            try {
                const finalLvl = currentLevelData ? Number(currentLevelData.level) : 1;
                let currentLevelRoleRes = await db.query(`SELECT * FROM level_roles WHERE "guildID" = $1 AND "level" = $2`, [message.guild.id, finalLvl]);
                let currentLevelRole = currentLevelRoleRes.rows[0];
                if (currentLevelRole && message.member) {
                    if (!message.member.roles.cache.has(currentLevelRole.roleID || currentLevelRole.roleid)) {
                        message.member.roles.add(currentLevelRole.roleID || currentLevelRole.roleid).catch(e => {});
                        const oldRolesRes = await db.query(`SELECT "roleID" FROM level_roles WHERE "guildID" = $1 AND "level" < $2`, [message.guild.id, finalLvl]);
                        for (const roleData of oldRolesRes.rows) {
                            if (message.member.roles.cache.has(roleData.roleID || roleData.roleid)) {
                                message.member.roles.remove(roleData.roleID || roleData.roleid).catch(e => {});
                            }
                        }
                    }
                }
            } catch (e) { }

        } catch (err) {}

        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase().trim();
            let shortcutRes = await db.query(`SELECT "commandName" FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [message.guild.id, message.channel.id, shortcutWord]);
            let shortcut = shortcutRes.rows[0];
            if (!shortcut) {
                 shortcutRes = await db.query(`SELECT "commandName" FROM command_shortcuts WHERE "guildID" = $1 AND "shortcutWord" = $2 AND ("channelID" IS NULL OR "channelID" = 'null' OR "channelID" = '')`, [message.guild.id, shortcutWord]);
                 shortcut = shortcutRes.rows[0];
            }
            if (shortcut) {
                const targetName = (shortcut.commandName || shortcut.commandname).toLowerCase();
                const cmd = client.commands.find(c => (c.name && c.name.toLowerCase() === targetName) || (c.aliases && c.aliases.includes(targetName)));
                if (cmd) {
                    if (checkPermissions(message, cmd)) {
                        const cooldownMsg = checkCooldown(message, cmd);
                        if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); return; }
                        try {
                            const finalArgs = argsRaw.slice(1);
                            finalArgs.prefix = ""; 
                            await cmd.execute(message, finalArgs); 
                        } catch (e) {}
                    }
                    return; 
                }
            }
        } catch (err) {}

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            if (commandName.length > 0) {
                const command = client.commands.find(cmd => (cmd.name && cmd.name.toLowerCase() === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
                if (command) {
                    args.prefix = Prefix;
                    let isAllowed = false;
                    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) { isAllowed = true; } 
                    else if (settings && ((settings.casinoChannelID || settings.casinochannelid) === message.channel.id || (settings.casinoChannelID2 || settings.casinochannelid2) === message.channel.id) && command.category === 'Economy') { isAllowed = true; }
                    else {
                        try {
                            const channelPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [message.guild.id, command.name, message.channel.id]);
                            const categoryPermRes = message.channel.parentId ? await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [message.guild.id, command.name, message.channel.parentId]) : {rows: []};
                            if (channelPermRes.rows.length > 0 || categoryPermRes.rows.length > 0) { isAllowed = true; }
                        } catch (err) { isAllowed = false; }
                    }
                    if (isAllowed) {
                        try {
                            const isBlacklistedRes = await db.query(`SELECT 1 FROM blacklistTable WHERE "id" = $1`, [message.author.id]);
                            if (isBlacklistedRes.rows.length > 0) return; 
                        } catch(e) {}
                        if (checkPermissions(message, command)) {
                            const cooldownMsg = checkCooldown(message, command);
                            if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); } 
                            else { try { await command.execute(message, args); } catch (error) { message.reply("❌ حدث خطأ."); } }
                        }
                    }
                    return; 
                }
            }
        }

        if (settings && (((settings.casinoChannelID || settings.casinochannelid) && message.channel.id === (settings.casinoChannelID || settings.casinochannelid)) || ((settings.casinoChannelID2 || settings.casinochannelid2) && message.channel.id === (settings.casinoChannelID2 || settings.casinochannelid2)))) {
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
            const autoReplyRes = await db.query(`SELECT * FROM auto_responses WHERE "guildID" = $1 AND "trigger" = $2`, [message.guild.id, content]);
            const autoReply = autoReplyRes.rows[0];
            if (autoReply) {
                if (autoReply.expiresAt && Date.now() > autoReply.expiresAt) {
                    db.query(`DELETE FROM auto_responses WHERE "id" = $1`, [autoReply.id]).catch(()=>{});
                } 
                else {
                    let isAllowedChannel = true;
                    try {
                        if (autoReply.allowedChannels || autoReply.allowedchannels) {
                            const allowed = JSON.parse(autoReply.allowedChannels || autoReply.allowedchannels);
                            if (allowed.length > 0 && !allowed.includes(message.channel.id)) isAllowedChannel = false;
                        }
                        if (autoReply.ignoredChannels || autoReply.ignoredchannels) {
                            const ignored = JSON.parse(autoReply.ignoredChannels || autoReply.ignoredchannels);
                            if (ignored.length > 0 && ignored.includes(message.channel.id)) isAllowedChannel = false;
                        }
                    } catch (e) {} 
                    if (isAllowedChannel) {
                        const cooldownKey = `ar_${autoReply.id}_${message.channel.id}`;
                        const cooldownTime = (autoReply.cooldown || 600) * 1000;
                        const now = Date.now();
                        if (message.author.id === message.guild.ownerId || !autoResponderCooldowns.has(cooldownKey) || now > autoResponderCooldowns.get(cooldownKey)) {
                            const files = autoReply.images ? JSON.parse(autoReply.images) : [];
                            safeReply(message, { content: autoReply.response, files: files, allowedMentions: { repliedUser: false } }).catch(() => {});
                            autoResponderCooldowns.set(cooldownKey, now + cooldownTime);
                            setTimeout(() => autoResponderCooldowns.delete(cooldownKey), cooldownTime);
                        }
                    }
                }
            }
        } catch (err) {}
    },
};
