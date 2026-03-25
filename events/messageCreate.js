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

// 🔥 تحصين نظام تسجيل البومب (PostgreSQL Compatible) 🔥
async function recordBump(client, guildID, userID) {
    const db = client.sql;
    if (!db) return;
      
    const dateStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    const dailyID = `${userID}-${guildID}-${dateStr}`;
    const weeklyID = `${userID}-${guildID}-${weekStr}`;
    const totalID = `${userID}-${guildID}`;
    try {
        await db.query(`INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "disboard_bumps", "boost_channel_reactions") VALUES ($1,$2,$3,$4,1,0) ON CONFLICT("id") DO UPDATE SET "disboard_bumps" = COALESCE(user_daily_stats."disboard_bumps", 0) + 1`, [dailyID, userID, guildID, dateStr]).catch(()=> db.query(`INSERT INTO user_daily_stats (id, userid, guildid, date, disboard_bumps, boost_channel_reactions) VALUES ($1,$2,$3,$4,1,0) ON CONFLICT(id) DO UPDATE SET disboard_bumps = COALESCE(user_daily_stats.disboard_bumps, 0) + 1`, [dailyID, userID, guildID, dateStr]));
        
        await db.query(`INSERT INTO user_weekly_stats ("id", "userID", "guildID", "weekStartDate", "disboard_bumps") VALUES ($1,$2,$3,$4,1) ON CONFLICT("id") DO UPDATE SET "disboard_bumps" = COALESCE(user_weekly_stats."disboard_bumps", 0) + 1`, [weeklyID, userID, guildID, weekStr]).catch(()=> db.query(`INSERT INTO user_weekly_stats (id, userid, guildid, weekstartdate, disboard_bumps) VALUES ($1,$2,$3,$4,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = COALESCE(user_weekly_stats.disboard_bumps, 0) + 1`, [weeklyID, userID, guildID, weekStr]));
        
        await db.query(`INSERT INTO user_total_stats ("id", "userID", "guildID", "total_disboard_bumps") VALUES ($1,$2,$3,1) ON CONFLICT("id") DO UPDATE SET "total_disboard_bumps" = COALESCE(user_total_stats."total_disboard_bumps", 0) + 1`, [totalID, userID, guildID]).catch(()=> db.query(`INSERT INTO user_total_stats (id, userid, guildid, total_disboard_bumps) VALUES ($1,$2,$3,1) ON CONFLICT(id) DO UPDATE SET total_disboard_bumps = COALESCE(user_total_stats.total_disboard_bumps, 0) + 1`, [totalID, userID, guildID]));
        
        const member = await client.guilds.cache.get(guildID)?.members.fetch(userID).catch(() => null);
        if (member && client.checkQuests) {
            let updatedDailyRes;
            try { updatedDailyRes = await db.query(`SELECT * FROM user_daily_stats WHERE "id" = $1`, [dailyID]); } catch(e) { updatedDailyRes = await db.query(`SELECT * FROM user_daily_stats WHERE id = $1`, [dailyID]); }
            const updatedDaily = updatedDailyRes?.rows[0];
            
            let updatedTotalRes;
            try { updatedTotalRes = await db.query(`SELECT * FROM user_total_stats WHERE "id" = $1`, [totalID]); } catch(e) { updatedTotalRes = await db.query(`SELECT * FROM user_total_stats WHERE id = $1`, [totalID]); }
            const updatedTotal = updatedTotalRes?.rows[0];

            if (updatedDaily) await client.checkQuests(client, member, updatedDaily, 'daily', dateStr);
            if (updatedTotal) await client.checkAchievements(client, member, null, updatedTotal);
        }
    } catch (e) { console.error(e); }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const db = client.sql;
        
        // ⚠️ تم إزالة شرط !sql.open الخاطئ الذي كان يقتل الحدث ⚠️
        if (!db) return; 

        if (message.author.bot && message.author.id !== DISBOARD_BOT_ID) return;
        if (!message.guild) return;

        try {
            if (message.member) {
                let conflictRulesRes;
                try { conflictRulesRes = await db.query(`SELECT "role_id", "anti_roles" FROM role_settings WHERE "anti_roles" IS NOT NULL AND "anti_roles" != ''`); }
                catch(e) { conflictRulesRes = await db.query(`SELECT role_id, anti_roles FROM role_settings WHERE anti_roles IS NOT NULL AND anti_roles != ''`).catch(()=>({rows:[]})); }
                
                const conflictRules = conflictRulesRes.rows;
                if (conflictRules.length > 0) {
                    const memberRoleIds = message.member.roles.cache.map(r => r.id);
                    for (const rule of conflictRules) {
                        const roleId = rule.role_id || rule.role_id;
                        const antiRoles = rule.anti_roles || rule.anti_roles;
                        if (memberRoleIds.includes(roleId)) {
                            const prohibitedRoles = antiRoles.split(',');
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
            let afkDataRes;
            try { afkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]); }
            catch(e) { afkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [message.author.id, message.guild.id]).catch(()=>({rows:[]})); }
            
            const afkData = afkDataRes?.rows[0];

            if (afkData) {
                const content = message.content.trim();
                const ghostKey = `${message.author.id}-${message.guild.id}`;
                const isGhostMessage = content.startsWith('(') && content.endsWith(')');
                
                const allowGhost = isGhostMessage && !ghostModeUsers.has(ghostKey);

                if (!allowGhost) {
                    const now = Math.floor(Date.now() / 1000);
                    const afkTime = Number(afkData.timestamp || afkData.timestamp);
                    const diffSeconds = now - afkTime;
                    
                    const minutes = Math.floor(diffSeconds / 60); 
                    const cappedMinutes = Math.min(minutes, 720); 
                    const reward = (minutes >= 60) ? (cappedMinutes * 1) : 0;

                    if (reward > 0) {
                        try {
                            await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [reward, message.author.id, message.guild.id]);
                        } catch(e) {
                            await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [reward, message.author.id, message.guild.id]).catch(()=>{});
                        }
                    }

                    const storedMessagesStr = afkData.messages || afkData.messages || '[]';
                    const storedMessages = JSON.parse(storedMessagesStr);
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

                    try { await db.query(`DELETE FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]); }
                    catch(e) { await db.query(`DELETE FROM afk WHERE userid = $1 AND guildid = $2`, [message.author.id, message.guild.id]).catch(()=>{}); }
                    
                    ghostModeUsers.delete(ghostKey);

                    try {
                        const currentName = message.member.displayName;
                        if (currentName.includes("[AFK] ")) {
                            await message.member.setNickname(currentName.replace("[AFK] ", ""));
                        }
                    } catch (e) {}

                    const timeAgo = `<t:${afkTime}:R>`;
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

                    const subscribersStr = afkData.subscribers || afkData.subscribers || '[]';
                    const subscribers = JSON.parse(subscribersStr);
                    if (subscribers.length > 0) {
                        const everyoneRole = message.guild.roles.everyone;
                        const perms = message.channel.permissionsFor(everyoneRole);
                        if (perms.has(PermissionsBitField.Flags.ViewChannel)) {
                            const pings = subscribers.map(id => `<@${id}>`).join(' ');
                            await message.channel.send(`🔔 **✶ تنبيـه:** ${message.author} عاد من وضع الغيـاب المؤقـت!\n${pings}`).catch(()=>{});
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

                    let targetAfkDataRes;
                    try { targetAfkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [targetID, message.guild.id]); }
                    catch(e) { targetAfkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [targetID, message.guild.id]).catch(()=>({rows:[]})); }
                    const targetAfkData = targetAfkDataRes?.rows[0];

                    if (targetAfkData) {
                        try { await db.query(`UPDATE afk SET "mentionsCount" = COALESCE("mentionsCount", 0) + 1 WHERE "userID" = $1 AND "guildID" = $2`, [targetID, message.guild.id]); }
                        catch(e) { await db.query(`UPDATE afk SET mentionscount = COALESCE(mentionscount, 0) + 1 WHERE userid = $1 AND guildid = $2`, [targetID, message.guild.id]).catch(()=>{}); }

                        const member = message.guild.members.cache.get(targetID);
                        const afkTime = targetAfkData.timestamp || targetAfkData.timestamp;
                        const timeAgo = `<t:${afkTime}:R>`;

                        const embed = new EmbedBuilder()
                            .setColor("Random")
                            .setThumbnail(member ? member.user.displayAvatarURL() : null)
                            .setDescription(
                                `😴 **${member ? member.displayName : 'العضو'}**\n ✶ في وضع الغيـاب المؤقـت(AFK)\n📝 **السبب:** ${targetAfkData.reason || targetAfkData.reason}\n⏳ **منـذ:** ${timeAgo}`
                            );

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`notify_afk_${targetID}`).setLabel('نبهني عند عودتـه 🔔').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`leave_msg_afk_${targetID}`).setLabel('اترك رسالـة 📩').setStyle(ButtonStyle.Primary)
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
        } catch (err) { console.error("[AFK System Error]", err); }

        let settingsRes;
        try { settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [message.guild.id]); }
        catch(e) { settingsRes = await db.query(`SELECT * FROM settings WHERE guild = $1`, [message.guild.id]).catch(()=>({rows:[]})); }
        const settings = settingsRes?.rows[0] || {};

        if (message.author.id === DISBOARD_BOT_ID) {
            const bumpChannelID = settings.bumpChannelID || settings.bumpchannelid;
            if (bumpChannelID && message.channel.id !== bumpChannelID) return;

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
                
                try { await db.query(`UPDATE settings SET "nextBumpTime" = $1, "lastBumperID" = $2 WHERE "guild" = $3`, [nextBumpTime, bumperID, message.guild.id]); }
                catch(e) { await db.query(`UPDATE settings SET nextbumptime = $1, lastbumperid = $2 WHERE guild = $3`, [nextBumpTime, bumperID, message.guild.id]).catch(()=>{}); }
            }
            return;
        }

        let Prefix = settings.prefix || "-";

        if (message.mentions.has(client.user) && !message.author.bot) {
            if (!message.content.startsWith(Prefix)) {
                const argsRaw = message.content.trim().split(/ +/);
                const firstWord = argsRaw[0].toLowerCase();
                const isCommand = client.commands.find(cmd => (cmd.name === firstWord) || (cmd.aliases && cmd.aliases.includes(firstWord)));
                let isShortcut = false;
                try {
                    let scRes;
                    try { scRes = await db.query(`SELECT 1 FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [message.guild.id, message.channel.id, firstWord]); }
                    catch(e) { scRes = await db.query(`SELECT 1 FROM command_shortcuts WHERE guildid = $1 AND channelid = $2 AND shortcutword = $3`, [message.guild.id, message.channel.id, firstWord]).catch(()=>({rows:[]})); }
                    isShortcut = !!scRes.rows[0];
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
                        const roleAdv = settings.roleAdvisor || settings.roleadvisor;
                        if (roleAdv && message.member.roles.cache.has(roleAdv)) isWisdomKing = true;
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
                        } else if (message.stickers.size > 0) {
                            const sticker = message.stickers.first();
                            if (sticker.format === 1 || sticker.format === 2) { 
                                 imageAttachment = { url: sticker.url, mimeType: 'image/png' };
                            }
                        }

                        if (!cleanContent && !imageAttachment) return message.reply("نـعـم .. ؟");

                        const reply = await askMorax(message.author.id, message.guild.id, message.channel.id, cleanContent, message.member.displayName, imageAttachment, isNsfw, message);
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

        const treeChannelID = settings.treeChannelID || settings.treechannelid;
        if (message.author.bot && treeChannelID && message.channel.id === treeChannelID) {
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

        let isChannelIgnored = false;
        try {
            let ignRes;
            try { ignRes = await db.query(`SELECT 1 FROM xp_ignore WHERE "guildID" = $1 AND "id" = $2`, [message.guild.id, message.channel.id]); }
            catch(e) { ignRes = await db.query(`SELECT 1 FROM xp_ignore WHERE guildid = $1 AND id = $2`, [message.guild.id, message.channel.id]).catch(()=>({rows:[]})); }
            if (ignRes.rows[0]) isChannelIgnored = true;
            
            if (!isChannelIgnored && message.channel.parentId) {
                let catIgnRes;
                try { catIgnRes = await db.query(`SELECT 1 FROM xp_ignore WHERE "guildID" = $1 AND "id" = $2`, [message.guild.id, message.channel.parentId]); }
                catch(e) { catIgnRes = await db.query(`SELECT 1 FROM xp_ignore WHERE guildid = $1 AND id = $2`, [message.guild.id, message.channel.parentId]).catch(()=>({rows:[]})); }
                if (catIgnRes.rows[0]) isChannelIgnored = true;
            }
        } catch(e) {}

        if (isChannelIgnored) return;

        try {
            const userID = message.author.id;
            const guildID = message.guild.id;

            updateGuildStat(client, guildID, userID, 'messages', 1);

            const chatterChannelID = settings.chatterChannelID || settings.chatterchannelid;
            if (chatterChannelID && message.channel.id === chatterChannelID) {
                const todayDate = getTodayDateString();
                const dailyIdForBadge = `${userID}-${guildID}-${todayDate}`;
                
                try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS "main_chat_messages" INTEGER DEFAULT 0`); } catch(e){}
                try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS "chatter_badge_given" INTEGER DEFAULT 0`); } catch(e){}
                
                try {
                    await db.query(`INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "main_chat_messages") VALUES ($1, $2, $3, $4, 1) ON CONFLICT("id") DO UPDATE SET "main_chat_messages" = COALESCE(user_daily_stats."main_chat_messages", 0) + 1`, [dailyIdForBadge, userID, guildID, todayDate]);
                } catch(e) {
                    await db.query(`INSERT INTO user_daily_stats (id, userid, guildid, date, main_chat_messages) VALUES ($1, $2, $3, $4, 1) ON CONFLICT(id) DO UPDATE SET main_chat_messages = COALESCE(user_daily_stats.main_chat_messages, 0) + 1`, [dailyIdForBadge, userID, guildID, todayDate]).catch(()=>{});
                }

                let badgeRes;
                try { badgeRes = await db.query(`SELECT "main_chat_messages", "chatter_badge_given" FROM user_daily_stats WHERE "id" = $1`, [dailyIdForBadge]); }
                catch(e) { badgeRes = await db.query(`SELECT main_chat_messages, chatter_badge_given FROM user_daily_stats WHERE id = $1`, [dailyIdForBadge]).catch(()=>({rows:[]})); }
                const dailyDataCheck = badgeRes.rows[0];
                
                if (dailyDataCheck && Number(dailyDataCheck.main_chat_messages || dailyDataCheck.main_chat_messages) >= 100 && Number(dailyDataCheck.chatter_badge_given || dailyDataCheck.chatter_badge_given) === 0) {
                    try { await db.query(`UPDATE user_daily_stats SET "chatter_badge_given" = 1 WHERE "id" = $1`, [dailyIdForBadge]); }
                    catch(e) { await db.query(`UPDATE user_daily_stats SET chatter_badge_given = 1 WHERE id = $1`, [dailyIdForBadge]).catch(()=>{}); }
                    
                    let roleToGive = settings.roleChatterBadge || settings.rolechatterbadge || settings.roleChatter || settings.rolechatter;
                    if (roleToGive) message.member.roles.add(roleToGive).catch(()=>{});

                    const announceChanId = settings.guildAnnounceChannelID || settings.guildannouncechannelid;
                    if (announceChanId) {
                        const announceChannel = message.guild.channels.cache.get(announceChanId);
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
                message.mentions.users.forEach(async (u) => {
                    if (u.id !== message.author.id && !u.bot) {
                        if (client.incrementQuestStats) await client.incrementQuestStats(u.id, guildID, 'mentions_received', 1);
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
            const countChanId = settings.countingChannelID || settings.countingchannelid;
            if (countChanId && message.channel.id === countChanId) {
                if (!isNaN(message.content.trim())) {
                    if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'counting_channel', 1);
                }
            }
            if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'meow_count', 1);
                try {
                    await db.query(`UPDATE levels SET "total_meow_count" = COALESCE("total_meow_count", 0) + 1 WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                } catch(e) {
                    await db.query(`UPDATE levels SET total_meow_count = COALESCE(total_meow_count, 0) + 1 WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
                }
                
                if (client.checkAchievements) {
                    let lvlCheckRes;
                    try { lvlCheckRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]); }
                    catch(e) { lvlCheckRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
                    if (lvlCheckRes.rows[0]) await client.checkAchievements(client, message.member, lvlCheckRes.rows[0], null);
                }
            }
            
            let isMediaChannel = false;
            try {
                let mRes;
                try { mRes = await db.query(`SELECT 1 FROM media_streak_channels WHERE "guildID" = $1 AND "channelID" = $2`, [guildID, message.channel.id]); }
                catch(e) { mRes = await db.query(`SELECT 1 FROM media_streak_channels WHERE guildid = $1 AND channelid = $2`, [guildID, message.channel.id]).catch(()=>({rows:[]})); }
                if (mRes.rows[0]) isMediaChannel = true;
            } catch(e) {}

            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    await handleMediaStreakMessage(message);
                }
            }
            await handleStreakMessage(message);

            // 🔥 ترقية نظام الـ XP ليصبح PostgreSQL بالكامل 🔥
            let levelDataRes;
            try { levelDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [message.author.id, message.guild.id]); }
            catch(e) { levelDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [message.author.id, message.guild.id]).catch(()=>({rows:[]})); }
            
            let level = levelDataRes.rows[0];
            const completeDefaultLevelData = { xp: 0, level: 1, totalXP: 0, mora: 0, bank: 0 };
            if (!level) level = { ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
            
            let getXpfromDB = settings.customXP || settings.customxp || 25;
            let getCooldownfromDB = settings.customCooldown || settings.customcooldown || 60000;

            if (!client.talkedRecently.get(message.author.id)) {
                let buff = calculateBuffMultiplier(message.member, db); 
                const roleChatter = settings.roleChatter || settings.rolechatter;
                if (roleChatter && message.member.roles.cache.has(roleChatter)) buff += 0.50; 

                const xp = Math.floor((Math.random() * getXpfromDB + 1) * buff);
                level.xp = Number(level.xp || 0) + xp; 
                level.totalXP = Number(level.totalXP || level.totalxp || 0) + xp;
                level.level = Number(level.level || 1);
                
                const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
                let leveledUp = false;
                let oldLvl = level.level;

                if (level.xp >= nextXP) {
                    leveledUp = true;
                    level.xp -= nextXP; 
                    level.level++;
                }

                // حفظ البيانات
                try {
                    await db.query(`INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora") VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("user", "guild") DO UPDATE SET "xp" = EXCLUDED."xp", "level" = EXCLUDED."level", "totalXP" = EXCLUDED."totalXP"`, [message.author.id, message.guild.id, level.xp, level.level, level.totalXP, Number(level.mora||0)]);
                } catch(e) {
                    await db.query(`INSERT INTO levels (userid, guildid, xp, level, totalxp, mora) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (userid, guildid) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level, totalxp = EXCLUDED.totalxp`, [message.author.id, message.guild.id, level.xp, level.level, level.totalXP, Number(level.mora||0)]).catch(()=>{});
                }

                if (leveledUp) {
                    try {
                        const card = await generateLevelUpCard(message.member, oldLvl, level.level, { mora: 0, hp: 0 });
                        const channelId = settings.levelChannel || settings.levelchannel || message.channel.id;
                        const channel = message.guild.channels.cache.get(channelId);
                        if (channel) {
                            let notifRes;
                            try { notifRes = await db.query(`SELECT "levelNotif" FROM quest_notifications WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]); }
                            catch(e) { notifRes = await db.query(`SELECT levelnotif as "levelNotif" FROM quest_notifications WHERE userid = $1 AND guildid = $2`, [message.author.id, message.guild.id]).catch(()=>({rows:[]})); }
                            
                            const isMentionOn = notifRes.rows[0] ? notifRes.rows[0].levelNotif : 1; 
                            const userReference = isMentionOn ? message.author : `**${message.member.displayName}**`;
                            let contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userReference} <a:wii:1435572329039007889>\n` +
                                             `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                                             `★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${level.level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>`;
                            const milestones = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
                            if (milestones.includes(level.level)) contentMsg += `\n★  فتـحـت ميزة جديـدة راجع قنـاة المستويات !`;
                            
                            await channel.send({ content: contentMsg, files: [card] });
                        }
                    } catch (error) {
                        console.error("فشل في رسم بطاقة التلفيل:", error);
                        message.channel.send(`╭⭒★︰ <a:wi:1435572304988868769> ${message.author} <a:wii:1435572329039007889>\n✶ مبارك صعودك في سُلّم الإمبراطورية\n★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${level.level}〃`).catch(()=>{});
                    }
                }
                
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }
            
            try {
                let lrRes;
                try { lrRes = await db.query(`SELECT * FROM level_roles WHERE "guildID" = $1 AND "level" = $2`, [message.guild.id, level.level]); }
                catch(e) { lrRes = await db.query(`SELECT * FROM level_roles WHERE guildid = $1 AND level = $2`, [message.guild.id, level.level]).catch(()=>({rows:[]})); }
                let currentLevelRole = lrRes.rows[0];

                if (currentLevelRole && message.member) {
                    const rID = currentLevelRole.roleID || currentLevelRole.roleid;
                    if (!message.member.roles.cache.has(rID)) {
                        await message.member.roles.add(rID).catch(e => {});
                        
                        let oldRolesRes;
                        try { oldRolesRes = await db.query(`SELECT "roleID" FROM level_roles WHERE "guildID" = $1 AND "level" < $2`, [message.guild.id, level.level]); }
                        catch(e) { oldRolesRes = await db.query(`SELECT roleid as "roleID" FROM level_roles WHERE guildid = $1 AND level < $2`, [message.guild.id, level.level]).catch(()=>({rows:[]})); }
                        
                        for (const roleData of oldRolesRes.rows) {
                            const oID = roleData.roleID || roleData.roleid;
                            if (message.member.roles.cache.has(oID)) await message.member.roles.remove(oID).catch(e => {});
                        }
                    }
                }
            } catch (e) {}

        } catch (err) { console.error("[Stats Error]", err); }

        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase().trim();
            
            let shortcut = null;
            try {
                let scRes;
                try { scRes = await db.query(`SELECT "commandName" FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [message.guild.id, message.channel.id, shortcutWord]); }
                catch(e) { scRes = await db.query(`SELECT commandname as "commandName" FROM command_shortcuts WHERE guildid = $1 AND channelid = $2 AND shortcutword = $3`, [message.guild.id, message.channel.id, shortcutWord]).catch(()=>({rows:[]})); }
                shortcut = scRes.rows[0];
                
                if (!shortcut) {
                    let scRes2;
                    try { scRes2 = await db.query(`SELECT "commandName" FROM command_shortcuts WHERE "guildID" = $1 AND "shortcutWord" = $2 AND ("channelID" IS NULL OR "channelID" = '' OR "channelID" = 'null')`, [message.guild.id, shortcutWord]); }
                    catch(e) { scRes2 = await db.query(`SELECT commandname as "commandName" FROM command_shortcuts WHERE guildid = $1 AND shortcutword = $2 AND (channelid IS NULL OR channelid = '' OR channelid = 'null')`, [message.guild.id, shortcutWord]).catch(()=>({rows:[]})); }
                    shortcut = scRes2.rows[0];
                }
            } catch(e) {}

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
                        } catch (e) { console.error(`[Shortcut Exec Error]`, e); }
                    }
                    return; 
                }
            }
        } catch (err) {}

        const mentionRegex = new RegExp(`^<@!?${client.user.id}>( |)$`);
        if (mentionRegex.test(message.content)) {
            return message.reply(`البريفكس الخاص بي هو: \`${Prefix}\``).catch(() => {});
        }

        // 🔥 معالج الأوامر بالبريفكس (PostgreSQL Compatible) 🔥
        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            if (commandName.length > 0) {
                const command = client.commands.find(cmd => (cmd.name && cmd.name.toLowerCase() === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
                if (command) {
                    args.prefix = Prefix;
                    let isAllowed = false;
                    const casChan = settings.casinoChannelID || settings.casinochannelid;
                    const casChan2 = settings.casinoChannelID2 || settings.casinochannelid2;

                    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) { isAllowed = true; } 
                    else if ((casChan === message.channel.id || casChan2 === message.channel.id) && command.category === 'Economy') { isAllowed = true; }
                    else {
                        try {
                            let pRes;
                            try { pRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [message.guild.id, command.name, message.channel.id]); }
                            catch(e) { pRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2 AND channelid = $3`, [message.guild.id, command.name, message.channel.id]).catch(()=>({rows:[]})); }
                            if (pRes.rows[0]) isAllowed = true;

                            if (!isAllowed && message.channel.parentId) {
                                let cRes;
                                try { cRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [message.guild.id, command.name, message.channel.parentId]); }
                                catch(e) { cRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2 AND channelid = $3`, [message.guild.id, command.name, message.channel.parentId]).catch(()=>({rows:[]})); }
                                if (cRes.rows[0]) isAllowed = true;
                            }
                        } catch (err) { isAllowed = false; }
                    }

                    if (isAllowed) {
                        try {
                            let bRes;
                            try { bRes = await db.query(`SELECT 1 FROM blacklist WHERE "userID" = $1`, [message.author.id]); }
                            catch(e) { bRes = await db.query(`SELECT 1 FROM blacklist WHERE userid = $1`, [message.author.id]).catch(()=>({rows:[]})); }
                            if (bRes.rows[0]) return; 
                        } catch(e) {}

                        if (checkPermissions(message, command)) {
                            const cooldownMsg = checkCooldown(message, command);
                            if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); } 
                            else { 
                                try { await command.execute(message, args); } 
                                catch (error) { console.error(error); message.reply("❌ حدث خطأ أثناء تنفيذ الأمر.").catch(()=>{}); } 
                            }
                        }
                    }
                    return; 
                }
            }
        }

        const casChan = settings.casinoChannelID || settings.casinochannelid;
        const casChan2 = settings.casinoChannelID2 || settings.casinochannelid2;
        if ((casChan && message.channel.id === casChan) || (casChan2 && message.channel.id === casChan2)) {
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
            let arRes;
            try { arRes = await db.query(`SELECT * FROM auto_responses WHERE "guildID" = $1 AND "trigger" = $2`, [message.guild.id, content]); }
            catch(e) { arRes = await db.query(`SELECT * FROM auto_responses WHERE guildid = $1 AND "trigger" = $2`, [message.guild.id, content]).catch(()=>({rows:[]})); }
            const autoReply = arRes.rows[0];

            if (autoReply) {
                const expiresAt = Number(autoReply.expiresAt || autoReply.expiresat);
                if (expiresAt && Date.now() > expiresAt) {
                    try { await db.query(`DELETE FROM auto_responses WHERE "id" = $1`, [autoReply.id]); }
                    catch(e) { await db.query(`DELETE FROM auto_responses WHERE id = $1`, [autoReply.id]).catch(()=>{}); }
                } 
                else {
                    let isAllowedChannel = true;
                    try {
                        const aChan = autoReply.allowedChannels || autoReply.allowedchannels;
                        if (aChan) {
                            const allowed = JSON.parse(aChan);
                            if (allowed.length > 0 && !allowed.includes(message.channel.id)) isAllowedChannel = false;
                        }
                        const iChan = autoReply.ignoredChannels || autoReply.ignoredchannels;
                        if (iChan) {
                            const ignored = JSON.parse(iChan);
                            if (ignored.length > 0 && ignored.includes(message.channel.id)) isAllowedChannel = false;
                        }
                    } catch (e) {} 

                    if (isAllowedChannel) {
                        const cooldownKey = `ar_${autoReply.id}_${message.channel.id}`;
                        const cooldownTime = (Number(autoReply.cooldown) || 600) * 1000;
                        const now = Date.now();
                        if (message.author.id === message.guild.ownerId || !autoResponderCooldowns.has(cooldownKey) || now > autoResponderCooldowns.get(cooldownKey)) {
                            const filesStr = autoReply.images || '[]';
                            const files = JSON.parse(filesStr);
                            await safeReply(message, { content: autoReply.response, files: files, allowedMentions: { repliedUser: false } }).catch(() => {});
                            autoResponderCooldowns.set(cooldownKey, now + cooldownTime);
                            setTimeout(() => autoResponderCooldowns.delete(cooldownKey), cooldownTime);
                        }
                    }
                }
            }
        } catch (err) {}
    },
};
