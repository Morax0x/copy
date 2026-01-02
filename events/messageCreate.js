const { Events, ChannelType, PermissionsBitField, EmbedBuilder, Colors, Collection } = require('discord.js');
const config = require('../config.json');
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError } = require("../handlers/report-handler.js");
// 🔥 إضافة استدعاء مولد بطاقة التلفيل 🔥
const { generateLevelUpCard } = require('../generators/levelup-card-generator');

const DISBOARD_BOT_ID = '302050872383242240'; 

// كوليكشن لحفظ الكولداون
const autoResponderCooldowns = new Collection();
const treeCooldowns = new Set();

// دوال مساعدة للتواريخ
function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}

async function recordBump(client, guildID, userID) {
    const sql = client.sql;
    // 🔥 حماية: عدم التسجيل إذا كانت القاعدة مغلقة
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
        if (message.author.bot && message.author.id !== DISBOARD_BOT_ID) return;
        if (!message.guild) return;

        const client = message.client;
        const sql = client.sql;

        // 🔥🔥 [الحل النهائي] منع الكراش عند إغلاق قاعدة البيانات 🔥🔥
        if (!sql || !sql.open) {
            // يتم تجاهل الرسالة بصمت لأن البوت في وضع صيانة/نسخ احتياطي
            return;
        }

        // ============================================================
        // 1. كشف البومب (نظام التنبيه الجديد) 🔥
        // ============================================================
        if (message.author.id === DISBOARD_BOT_ID) {
            // جلب إعدادات القناة والرتبة
            let settingsData;
            try {
                settingsData = sql.prepare("SELECT bumpChannelID, bumpNotifyRoleID FROM settings WHERE guild = ?").get(message.guild.id);
            } catch (e) {
                settingsData = sql.prepare("SELECT bumpChannelID FROM settings WHERE guild = ?").get(message.guild.id);
            }
            
            // التحقق مما إذا كان البومب في القناة المخصصة (إذا تم تحديدها)
            if (settingsData && settingsData.bumpChannelID && message.channel.id !== settingsData.bumpChannelID) {
                return;
            }

            let bumperID = null;
            if (message.interaction && message.interaction.commandName === 'bump') {
                bumperID = message.interaction.user.id;
            } else if (message.embeds.length > 0) {
                const desc = message.embeds[0].description || "";
                if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                    const match = desc.match(/<@!?(\d+)>/); 
                    if (match && match[1]) bumperID = match[1];
                }
            }

            if (bumperID) {
                await recordBump(client, message.guild.id, bumperID);
                await message.react('👊').catch(() => {});

                // حساب وقت التنبيه القادم (بعد ساعتين)
                const nextBumpTime = Date.now() + 7200000;
                const nextBumpTimeSec = Math.floor(nextBumpTime / 1000);

                // --- 1. الرد الفوري ---
                message.channel.send({
                    content: `بُورك النشــر، وسُمــع الــنداء \nعــدّاد المــجد بدأ مــن جــديــد <:2cenema:1428340793676009502>\n\n- النشر التالي بعد: <t:${nextBumpTimeSec}:R>`,
                    files: ["https://i.postimg.cc/1XTvpgMV/image.gif"]
                }).catch(() => {});

                // 🔥 تغيير اسم الروم (تم النشر - انتظار) 🔥
                message.channel.setName('˖✶⁺〢🍀・الـنـشـر').catch(err => console.error("[Bump Rename Error]", err.message));

                // --- 2. حفظ وقت التنبيه في الداتابيس (الحل الجذري) ---
                // بدلاً من setTimeout، نحفظ الوقت في الداتابيس ليقوم index.js بفحصه
                try {
                    sql.prepare("UPDATE settings SET nextBumpTime = ?, lastBumperID = ? WHERE guild = ?").run(nextBumpTime, bumperID, message.guild.id);
                } catch (e) {
                    console.error("[Bump DB Save Error]", e);
                }
            }
            return;
        }

        // جلب الإعدادات مرة واحدة لباقي الميزات
        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id);

        // 2. سقاية الشجرة (للبوتات)
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

        // =========================================================
        // 🚫 نظام منع اللفل (XP Ignore) - [الكود الجديد]
        // =========================================================
        if (sql && sql.open) {
            // 1. فحص هل القناة نفسها محظورة؟
            const isChannelIgnored = sql.prepare("SELECT * FROM xp_ignore WHERE guildID = ? AND id = ?").get(message.guild.id, message.channel.id);
            
            // 2. فحص هل الكاتيغوري (الأب) محظور؟
            let isCategoryIgnored = false;
            if (message.channel.parentId) {
                isCategoryIgnored = sql.prepare("SELECT * FROM xp_ignore WHERE guildID = ? AND id = ?").get(message.guild.id, message.channel.parentId);
            }

            // إذا كانت القناة أو الكاتيغوري في القائمة، نوقف الدالة فوراً ولا نحسب أي شيء
            if (isChannelIgnored || isCategoryIgnored) {
                return; // 🛑 توقف هنا، لن يتم احتساب أي لفل أو رسائل
            }
        }
        // =========================================================

        // ============================================================
        // نظام الإحصائيات والـ XP
        // ============================================================
        try {
            const userID = message.author.id;
            const guildID = message.guild.id;

            // أ) الإحصائيات (Quests)
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

            // ب) الردود (Replies)
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'replies_sent', 1);
                    }
                } catch(e) {}
            }

            // ج) قنوات العد
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                if (!isNaN(message.content.trim())) {
                    if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'counting_channel', 1);
                }
            }

            // د) مياو
            if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'meow_count', 1);
                let level = client.getLevel.get(userID, guildID);
                if (level) {
                    level.total_meow_count = (level.total_meow_count || 0) + 1;
                    client.setLevel.run(level);
                    if (client.checkAchievements) await client.checkAchievements(client, message.member, level, null);
                }
            }

            // هـ) ميديا ستريك
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(guildID, message.channel.id);
            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    await handleMediaStreakMessage(message);
                }
            }

            // و) نظام الـ XP والستريك اليومي
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
                
                // 🔥🔥 التحقق من التلفيل (Level Up) مع البطاقة الجديدة 🔥🔥
                if (level.xp >= nextXP) {
                    const oldLvl = level.level;
                    level.xp -= nextXP; level.level++;
                    
                    // حفظ البيانات الجديدة (المستوى والخبرة فقط)
                    client.setLevel.run(level);

                    // رسم وإرسال البطاقة
                    try {
                        const card = await generateLevelUpCard(message.member, oldLvl, level.level, { mora: 0, hp: 0 });
                        
                        // تحديد القناة
                        const channelId = settings?.levelChannel || message.channel.id;
                        const channel = message.guild.channels.cache.get(channelId);

                        if (channel) {
                            // 🔥🔥 التحقق من إعدادات الإشعارات (المنشن) من لوحة الإنجازات 🔥🔥
                            // جدول quest_notifications يحتوي على عمود levelNotif
                            const notifData = sql.prepare("SELECT levelNotif FROM quest_notifications WHERE userID = ? AND guildID = ?").get(message.author.id, message.guild.id);
                            
                            // إذا لم يكن هناك سجل، الافتراضي هو 1 (تشغيل المنشن)
                            // إذا كان levelNotif = 0 (طفى الإشعارات)، نستخدم الاسم فقط بدون منشن
                            const isMentionOn = notifData ? notifData.levelNotif : 1; 
                            
                            // المتغير الذي سنستخدمه في الرسالة
                            const userReference = isMentionOn ? message.author : `**${message.member.displayName}**`;

                            // 🔥🔥 النص الفخم (الإمبراطوري) مع استخدام userReference بدلاً من message.author 🔥🔥
                            let contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userReference} <a:wii:1435572329039007889>\n` +
                                             `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                                             `★ فقد كـسرت حـاجـز الـمستوى〃${oldLvl}〃وبلغـت المسـتـوى الـ 〃${level.level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>`;

                            // 🔥🔥 التحقق من المستويات المميزة (Milestones) 🔥🔥
                            const milestones = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
                            if (milestones.includes(level.level)) {
                                contentMsg += `\n★  فتـحـت ميزة جديـدة راجع قنـاة المستويات !`;
                            }

                            await channel.send({ 
                                content: contentMsg,
                                files: [card] 
                            });
                        }
                    } catch (error) {
                        console.error("فشل في رسم بطاقة التلفيل:", error);
                        // رسالة نصية احتياطية
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

            // أدوار اللفل
            try {
                let Roles = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND level = ?").get(message.guild.id, level.level);
                if (Roles && message.member && !message.member.roles.cache.has(Roles.roleID)) {
                    message.member.roles.add(Roles.roleID).catch(e => {});
                }
            } catch (e) {}

        } catch (err) { console.error("[Stats Error]", err); }


        // ============================================================
        // 3. معالج الاختصارات (Shortcuts)
        // ============================================================
        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase().trim();

            // 🔥 التصحيح هنا: إضافة SELECT 🔥
            let shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?")
                .get(message.guild.id, message.channel.id, shortcutWord);

            if (!shortcut) {
                 shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND shortcutWord = ? AND (channelID IS NULL OR channelID = 'null' OR channelID = '')")
                .get(message.guild.id, shortcutWord);
            }

            if (shortcut) {
                const targetName = shortcut.commandName.toLowerCase();
                const cmd = client.commands.find(c => 
                    (c.name && c.name.toLowerCase() === targetName) || 
                    (c.aliases && c.aliases.includes(targetName))
                );

                if (cmd) {
                    // الاختصارات تعتبر "استثناء" ومسموحة تلقائياً إذا وجدت في القناة الصحيحة
                    if (checkPermissions(message, cmd)) {
                        const cooldownMsg = checkCooldown(message, cmd);
                        if (cooldownMsg) {
                             if (typeof cooldownMsg === 'string') message.reply(cooldownMsg);
                             return;
                        }
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

        // ============================================================
        // 4. معالج البريفكس (Prefix Handler)
        // ============================================================
        let Prefix = settings?.prefix || "-";
        
        const mentionRegex = new RegExp(`^<@!?${client.user.id}>( |)$`);
        if (mentionRegex.test(message.content)) {
            return message.reply(`البريفكس الخاص بي هو: \`${Prefix}\``).catch(() => {});
        }

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            
            if (commandName.length > 0) {
                const command = client.commands.find(cmd => 
                    (cmd.name && cmd.name.toLowerCase() === commandName) || 
                    (cmd.aliases && cmd.aliases.includes(commandName))
                );
                
                if (command) {
                    args.prefix = Prefix;
                    let isAllowed = false;
                    
                    // ========================================================
                    // ⛔ نظام الحظر الشامل ⛔
                    // ========================================================
                    
                    // 1. السماح للأدمن (Administrator)
                    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        isAllowed = true;
                    } 
                    // 2. السماح في الكازينو (اقتصاد فقط)
                    else if (settings && (settings.casinoChannelID === message.channel.id || settings.casinoChannelID2 === message.channel.id) && command.category === 'Economy') {
                        isAllowed = true;
                    }
                    // 3. السماح بالقنوات المحددة يدوياً (عن طريق allow-command)
                    else {
                        try {
                            const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.id);
                            // التحقق من الكاتجوري إذا لزم الأمر
                            const categoryPerm = message.channel.parentId ? sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.parentId) : null;
                            
                            if (channelPerm || categoryPerm) {
                                isAllowed = true;
                            }
                        } catch (err) { isAllowed = false; }
                    }
                    // ========================================================

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

        // 5. القنوات الخاصة (نظام البلاغات)
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

        // ============================================================
        // الكازينو بدون بريفكس (الأول + الثاني)
        // ============================================================
        // 🔥 تعديل: السماح بالكتابة بدون بريفكس في كلا الرومين 🔥
        if (settings && ((settings.casinoChannelID && message.channel.id === settings.casinoChannelID) || (settings.casinoChannelID2 && message.channel.id === settings.casinoChannelID2))) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.find(cmd => 
                (cmd.name && cmd.name.toLowerCase() === commandName) || 
                (cmd.aliases && cmd.aliases.includes(commandName))
            );
            if (command && command.category === "Economy") {
                if (!checkPermissions(message, command)) return;
                try { await command.execute(message, args); } catch (error) {}
            }
            return;
        }

        // ============================================================
        // 6. نظام الردود التلقائية
        // ============================================================
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
