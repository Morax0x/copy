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
        const res = await db.query("SELECT * FROM settings WHERE guild = $1", [guildId]);
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
        db.query(`INSERT INTO user_daily_stats (id, userID, guildID, date, disboard_bumps, boost_channel_reactions) VALUES ($1,$2,$3,$4,1,0) ON CONFLICT(id) DO UPDATE SET disboard_bumps = COALESCE(user_daily_stats.disboard_bumps, 0) + 1`, [dailyID, userID, guildID, dateStr]).catch(()=>{});
        db.query(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, disboard_bumps) VALUES ($1,$2,$3,$4,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = COALESCE(user_weekly_stats.disboard_bumps, 0) + 1`, [weeklyID, userID, guildID, weekStr]).catch(()=>{});
        db.query(`INSERT INTO user_total_stats (id, userID, guildID, total_disboard_bumps) VALUES ($1,$2,$3,1) ON CONFLICT(id) DO UPDATE SET total_disboard_bumps = COALESCE(user_total_stats.total_disboard_bumps, 0) + 1`, [totalID, userID, guildID]).catch(()=>{});
        
        const member = await client.guilds.cache.get(guildID)?.members.fetch(userID).catch(() => null);
        if (member && client.checkQuests) {
            const updatedDailyRes = await db.query("SELECT * FROM user_daily_stats WHERE id = $1", [dailyID]);
            const updatedTotalRes = await db.query("SELECT * FROM user_total_stats WHERE id = $1", [totalID]);
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

        // 🚨 خطة الطوارئ: اعتراض أمر الهجرة الكبرى (mc) فوراً! 🚨
        const cleanMsg = message.content.trim();
        if (cleanMsg.startsWith('-mc') || cleanMsg.startsWith('-هجرة')) {
            const OWNER_ID = "1145327691772481577";
            if (message.author.id === OWNER_ID) {
                try {
                    // 🔥 تصحيح مسار الملف بحرف o صغير 🔥
                    const migrateCmd = require('../commands/owner/migrate-cloud.js');
                    await migrateCmd.execute(message, []);
                    return; 
                } catch (e) {
                    console.error("[Migrate Trigger Error]:", e);
                    return message.reply(`⚠️ حدث خطأ أو لم يتم العثور على مسار الملف: ${e.message}`);
                }
            }
        }

        // ⚡ جلب الإعدادات من الذاكرة العشوائية (سريع جداً)
        const settings = await getSettings(db, message.guild.id);
        let Prefix = settings?.prefix || "-";

        try {
            if (message.member) {
                const conflictRulesRes = await db.query("SELECT role_id, anti_roles FROM role_settings WHERE anti_roles IS NOT NULL AND anti_roles != ''");
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
            const afkDataRes = await db.query("SELECT * FROM afk WHERE userID = $1 AND guildID = $2", [message.author.id, message.guild.id]);
            const afkData = afkDataRes.rows[0];

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
                        db.query("UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3", [reward, message.author.id, message.guild.id]).catch(()=>{});
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

                    db.query("DELETE FROM afk WHERE userID = $1 AND guildID = $2", [message.author.id, message.guild.id]).catch(()=>{});
                    ghostModeUsers.delete(ghostKey);

                    try {
                        const currentName = message.member.displayName;
                        if (currentName.includes("[AFK] ")) {
                            message.member.setNickname(currentName.replace("[AFK] ", "")).catch(()=>{});
                        }
                    } catch (e) {}

                    const timeAgo = `<t:${afkData.timestamp}:R>`;
                    let replyContent = `👋 **✶أهلاً بعودتك يا ${message.author}!**\n⏱️ **✶مدة الغياب:** ${timeAgo}\n🔔 **✶تم منشنتك:** ${afkData.mentionscount || afkData.mentionsCount} مرة أثناء غيابك`;
                    
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
                    const targetAfkDataRes = await db.query("SELECT * FROM afk WHERE userID = $1 AND guildID = $2", [targetID, message.guild.id]);
                    const targetAfkData = targetAfkDataRes.rows[0];
                    if (targetAfkData) {
                        db.query("UPDATE afk SET mentionsCount = mentionsCount + 1 WHERE userID = $1 AND guildID = $2", [targetID, message.guild.id]).catch(()=>{});
                        const member = message.guild.members.cache.get(targetID);
                        const timeAgo = `<t:${targetAfkData.timestamp}:R>`;
                        const embed = new EmbedBuilder()
                            .setColor("Random")
                            .setThumbnail(member ? member.user.displayAvatarURL() : null)
                            .setDescription(`😴 **${member ? member.displayName : 'العضو'}**\n ✶ في وضع الغيـاب المؤقـت(AFK)\n📝 **السبب:** ${targetAfkData.reason}\n⏳ **منـذ:** ${timeAgo}`);

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`notify_afk_${targetID}`).setLabel('نبهني عند عودتـه 🔔').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`leave_msg_afk_${targetID}`).setLabel('اترك رسالـة 📩').setStyle(ButtonStyle.Primary)
                        );

                        const replyMsg = await safeReply(message, { embeds: [embed], components: [row], allowedMentions: { repliedUser: true } });
                        if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => {}), 60000);
                    }
                });
            }
        } catch (err) {}

        if (message.author.id === DISBOARD_BOT_ID) {
            if (settings && (settings.bumpchannelid || settings.bumpChannelID) && message.channel.id !== (settings.bumpchannelid || settings.bumpChannelID)) return;
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
                recordBump(client, message.guild.id, bumperID);
                message.react('👊').catch(() => {});
                const nextBumpTime = Date.now() + 7200000;
                message.channel.send({
                    content: `بُورك النشــر، وسُمــع الــنداء \nعــدّاد المــجد بدأ مــن جــديــد <:2cenema:1428340793676009502>\n\n- النشر التالي بعد: <t:${Math.floor(nextBumpTime / 1000)}:R>`,
                    files: ["https://i.postimg.cc/1XTvpgMV/image.gif"]
                }).catch(() => {});
                message.channel.setName('˖✶⁺〢🍀・الـنـشـر').catch(err => {});
                try { db.query("UPDATE settings SET nextBumpTime = $1, lastBumperID = $2 WHERE guild = $3", [nextBumpTime, bumperID, message.guild.id]); } catch (e) {}
            }
            return;
        }

        if (message.mentions.has(client.user) && !message.author.bot) {
            if (!message.content.startsWith(Prefix)) {
                const argsRaw = message.content.trim().split(/ +/);
                const firstWord = argsRaw[0].toLowerCase();
                const isCommand = client.commands.find(cmd => (cmd.name === firstWord) || (cmd.aliases && cmd.aliases.includes(firstWord)));
                let isShortcut = false;
                try {
                    const scRes = await db.query("SELECT 1 FROM command_shortcuts WHERE guildID = $1 AND channelID = $2 AND shortcutWord = $3", [message.guild.id, message.channel.id, firstWord]);
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
                        if (settings && (settings.roleadvisor || settings.roleAdvisor) && message.member.roles.cache.has(settings.roleadvisor || settings.roleAdvisor)) {
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

                    try {
                        await message.channel.sendTyping();
                        const cleanContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();
                        let imageAttachment = null;
                        if (message.attachments.size > 0) {
                            const attachment = message.attachments.first();
                            if (attachment.contentType?.startsWith('image/')) imageAttachment = { url: attachment.url, mimeType: attachment.contentType };
                        } else if (message.stickers.size > 0) {
                            const sticker = message.stickers.first();
                            if (sticker.format === 1 || sticker.format === 2) imageAttachment = { url: sticker.url, mimeType: 'image/png' };
                        }
                        if (!cleanContent && !imageAttachment) return message.reply("نـعـم .. ؟");
                        const reply = await askMorax(message.author.id, message.guild.id, message.channel.id, cleanContent, message.member.displayName, imageAttachment, aiChannelData?.nsfw, message);
                        if (!reply) return;
                        if (!isOwnerMentioning && !isWisdomKing) aiLimitHandler.incrementUsage(message.author.id);
                        const safeReplyMsg = reply.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
                        if (safeReplyMsg.length > 2000) {
                            const chunks = safeReplyMsg.match(/[\s\S]{1,1950}/g) || [];
                            for (const chunk of chunks) await safeReply(message, { content: chunk, allowedMentions: { repliedUser: true } });
                        } else {
                            await safeReply(message, { content: safeReplyMsg, allowedMentions: { repliedUser: true } });
                        }
                    } catch (err) {}
                    return; 
                }
            }
        }

        if (message.author.bot && settings && (settings.treechannelid || settings.treeChannelID) && message.channel.id === (settings.treechannelid || settings.treeChannelID)) {
             const fullContent = (message.content || "") + " " + (message.embeds[0]?.description || "") + " " + (message.embeds[0]?.title || "");
             if (["watered the tree", "سقى الشجرة", "has watered", "قام بسقاية"].some(p => fullContent.toLowerCase().includes(p))) {
                 const match = fullContent.match(/<@!?(\d+)>/);
                 if (match && match[1] && match[1] !== client.user.id && !treeCooldowns.has(match[1])) {
                     treeCooldowns.add(match[1]);
                     setTimeout(() => treeCooldowns.delete(match[1]), 60000);
                     if (client.incrementQuestStats) {
                         client.incrementQuestStats(match[1], message.guild.id, 'water_tree', 1).catch(()=>{});
                         message.react('💧').catch(() => {});
                     }
                 }
             }
        }

        if (message.author.bot) return;

        if (db) {
            try {
                const isChannelIgnoredRes = await db.query("SELECT * FROM xp_ignore WHERE guildID = $1 AND id = $2", [message.guild.id, message.channel.id]);
                if (isChannelIgnoredRes.rows.length > 0) return; 
            } catch (e) {}
        }

        try {
            const userID = message.author.id;
            const guildID = message.guild.id;

            updateGuildStat(client, guildID, userID, 'messages', 1).catch(e => {});

            if (settings && (settings.chatterchannelid || settings.chatterChannelID) && message.channel.id === (settings.chatterchannelid || settings.chatterChannelID)) {
                const todayDate = getTodayDateString();
                const dailyIdForBadge = `${userID}-${guildID}-${todayDate}`;
                try {
                    await db.query(`INSERT INTO user_daily_stats (id, userID, guildID, date, main_chat_messages) VALUES ($1, $2, $3, $4, 1) ON CONFLICT(id) DO UPDATE SET main_chat_messages = COALESCE(user_daily_stats.main_chat_messages, 0) + 1`, [dailyIdForBadge, userID, guildID, todayDate]);
                    const dailyDataCheckRes = await db.query("SELECT main_chat_messages, chatter_badge_given FROM user_daily_stats WHERE id = $1", [dailyIdForBadge]);
                    const dailyDataCheck = dailyDataCheckRes.rows[0];
                    if (dailyDataCheck && parseInt(dailyDataCheck.main_chat_messages) >= 100 && parseInt(dailyDataCheck.chatter_badge_given || 0) === 0) {
                        await db.query("UPDATE user_daily_stats SET chatter_badge_given = 1 WHERE id = $1", [dailyIdForBadge]);
                        let roleToGive = settings.rolechatterbadge || settings.roleChatterBadge || settings.rolechatter || settings.roleChatter;
                        if (roleToGive) message.member.roles.add(roleToGive).catch(()=>{});
                        const announceChannel = message.guild.channels.cache.get(settings.guildannouncechannelid || settings.guildAnnounceChannelID);
                        if (announceChannel) {
                            const badgeEmbed = new EmbedBuilder().setTitle('🗣️ انـجـاز يـومـي: ثـرثـار الـحـانـة!').setDescription(`🎉 أثبت <@${userID}> أنه روح المكان!\n\nلقد أرسل **100 رسالة** في الشات الرئيسي اليوم واستحق وسام الشرف بجدارة!`).setColor('#F1C40F').setThumbnail(message.author.displayAvatarURL());
                            announceChannel.send({ content: `<@${userID}>`, embeds: [badgeEmbed] }).catch(()=>{});
                        }
                    }
                } catch(e) {}
            }

            if (client.incrementQuestStats) {
                client.incrementQuestStats(userID, guildID, 'messages', 1).catch(()=>{});
                if (message.attachments.size > 0) client.incrementQuestStats(userID, guildID, 'images', 1).catch(()=>{});
                if (message.stickers.size > 0) client.incrementQuestStats(userID, guildID, 'stickers', message.stickers.size).catch(()=>{});
                const emojis = message.content.match(/<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu);
                if (emojis) client.incrementQuestStats(userID, guildID, 'emojis_sent', emojis.length).catch(()=>{});
            }
            
            if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'meow_count', 1).catch(()=>{});
                db.query("INSERT INTO levels (userid, guildid, total_meow_count) VALUES ($1, $2, 1) ON CONFLICT (userid, guildid) DO UPDATE SET total_meow_count = COALESCE(levels.total_meow_count, 0) + 1", [userID, guildID]).catch(()=>{});
            }
            
            await handleStreakMessage(message).catch(()=>{}); 

            let getXpfromDB = settings?.customxp || settings?.customXP || 25;
            let getCooldownfromDB = settings?.customcooldown || settings?.customCooldown || 60000;

            if (!client.talkedRecently.get(message.author.id)) {
                let buff = await calculateBuffMultiplier(message.member, db);
                if (settings && (settings.rolechatter || settings.roleChatter) && message.member.roles.cache.has(settings.rolechatter || settings.roleChatter)) buff += 0.50; 
                const xpGained = Math.floor((Math.random() * getXpfromDB + 1) * buff);
                let currentLevelData = await client.getLevel(userID, guildID);
                if (!currentLevelData) {
                    currentLevelData = { user: userID, guild: guildID, level: 1, xp: xpGained, totalXP: xpGained };
                } else {
                    currentLevelData.xp = parseInt(currentLevelData.xp) + xpGained;
                    currentLevelData.totalXP = parseInt(currentLevelData.totalxp || currentLevelData.totalXP) + xpGained;
                }
                const nextXP = 5 * (currentLevelData.level ** 2) + (50 * currentLevelData.level) + 100;
                if (currentLevelData.xp >= nextXP) {
                    const oldLvl = currentLevelData.level;
                    currentLevelData.xp -= nextXP; 
                    currentLevelData.level++;
                    client.setLevel(currentLevelData).catch(()=>{});
                    const channel = message.guild.channels.cache.get(settings?.levelchannel || settings?.levelChannel || message.channel.id);
                    if (channel) {
                        const card = await generateLevelUpCard(message.member, oldLvl, currentLevelData.level, { mora: 0, hp: 0 }).catch(()=>null);
                        const notifData = await client.getQuestNotif(`${message.author.id}-${message.guild.id}`);
                        const userRef = (notifData?.levelnotif ?? 1) ? message.author : `**${message.member.displayName}**`;
                        let contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userRef} <a:wii:1435572329039007889>\n✶ مبارك صعودك في سُلّم الإمبراطورية\n★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${currentLevelData.level}〃 <a:MugiStronk:1438795606872166462> فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>`;
                        channel.send({ content: contentMsg, files: card ? [card] : [] }).catch(()=>{});
                    }
                } else {
                    client.setLevel(currentLevelData).catch(()=>{}); 
                }
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }
        } catch (err) {}

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.find(cmd => (cmd.name === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
            if (command) {
                args.prefix = Prefix;
                let isAllowed = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
                if (!isAllowed && settings && ((settings.casinochannelid || settings.casinoChannelID) === message.channel.id) && command.category === 'Economy') isAllowed = true;
                if (!isAllowed) {
                    const permRes = await db.query("SELECT 1 FROM command_permissions WHERE guildID = $1 AND commandName = $2 AND channelID = $3", [message.guild.id, command.name, message.channel.id]);
                    if (permRes.rows.length > 0) isAllowed = true;
                }
                if (isAllowed) {
                    if (checkPermissions(message, command)) {
                        const cooldownMsg = checkCooldown(message, command);
                        if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); } 
                        else { try { await command.execute(message, args); } catch (e) {} }
                    }
                }
            }
        }
        
        try {
            const autoReplyRes = await db.query("SELECT * FROM auto_responses WHERE guildID = $1 AND trigger = $2", [message.guild.id, message.content.trim()]);
            const autoReply = autoReplyRes.rows[0];
            if (autoReply) {
                const cooldownKey = `ar_${autoReply.id}_${message.channel.id}`;
                if (!autoResponderCooldowns.has(cooldownKey)) {
                    safeReply(message, { content: autoReply.response, files: autoReply.images ? JSON.parse(autoReply.images) : [], allowedMentions: { repliedUser: false } }).catch(()=>{});
                    autoResponderCooldowns.set(cooldownKey, true);
                    setTimeout(() => autoResponderCooldowns.delete(cooldownKey), (autoReply.cooldown || 600) * 1000);
                }
            }
        } catch (err) {}
    },
};
