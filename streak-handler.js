// streak-handler.js

const { PermissionsBitField, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const KSA_TIMEZONE = 'Asia/Riyadh';

const EMOJI_MEDIA_STREAK = '<a:Streak:1438932297519730808>';
const EMOJI_SHIELD = '<:Shield:1437804676224516146>';

// 🔥🔥 قائمة المعالجة الحالية لمنع التضارب (Race Conditions) 🔥🔥
const processingUsers = new Set();

// ( 🌟 القائمة الحصر.ية للفواصل المسموحة فقط 🌟 )
const SEPARATORS_CLEAN_LIST = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|'];
const DEFAULT_SEPARATOR = '»';

function getKSADateString(dateObject) {
    return new Date(dateObject).toLocaleString('en-CA', {
        timeZone: KSA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function getDayDifference(dateStr1, dateStr2) {
    const date1 = new Date(dateStr1);
    const date2 = new Date(dateStr2);
    date1.setUTCHours(0, 0, 0, 0);
    date2.setUTCHours(0, 0, 0, 0);
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.round(diffTime / DAY_MS);
}

// 🌟 دالة حساب معزز الخبرة (XP) 🌟
function calculateBuffMultiplier(member, sql) {
    if (!sql || typeof sql.prepare !== 'function') return 1.0;
    if (!member || !member.roles || !member.roles.cache) return 1.0;
    
    const getUserBuffs = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND expiresAt > ? AND buffType = 'xp'");
    let totalPercent = 0.0;
    
    const day = new Date().getUTCDay();
    if (day === 5 || day === 6 || day === 0) totalPercent += 0.10;
    
    const userRoles = member.roles.cache.map(r => r.id);
    if (userRoles.length > 0) {
        const placeholders = userRoles.map(() => '?').join(',');
        try {
            const roleBuffs = sql.prepare(`SELECT * FROM role_buffs WHERE roleID IN (${placeholders})`).all(...userRoles);
            let rolesTotalBuff = 0;
            for (const buff of roleBuffs) {
                rolesTotalBuff += buff.buffPercent;
            }
            totalPercent += (rolesTotalBuff / 100);
        } catch (e) {
            console.error("Error calculating XP Role Buff:", e);
        }
    }
    
    let itemBuffTotal = 0;
    const userBuffs = getUserBuffs.all(member.id, member.guild.id, Date.now());
    for (const buff of userBuffs) {
        itemBuffTotal += buff.multiplier;
    }
    totalPercent += itemBuffTotal;

    if (totalPercent < -1.0) totalPercent = -1.0;
    return 1.0 + totalPercent;
}

// 🌟 دالة حساب معزز المورا (الأموال) 🌟
function calculateMoraBuff(member, sql) {
    if (!sql || typeof sql.prepare !== 'function') return 1.0;
    if (!member || !member.roles || !member.roles.cache) return 1.0;

    let totalBuffPercent = 0;

    const day = new Date().getUTCDay(); 
    if (day === 5 || day === 6 || day === 0) {
        totalBuffPercent += 10; 
    }

    const userRoles = member.roles.cache.map(r => r.id);
    const guildID = member.guild.id;
    try {
        const allBuffRoles = sql.prepare("SELECT * FROM role_mora_buffs WHERE guildID = ?").all(guildID);
        let roleBuffSum = 0;
        for (const roleId of userRoles) {
            const buffRole = allBuffRoles.find(r => r.roleID === roleId);
            if (buffRole) roleBuffSum += buffRole.buffPercent;
        }
        totalBuffPercent += roleBuffSum;
    } catch (e) {
        console.error("Error calculating Mora Role Buff:", e);
    }

    const tempBuffs = sql.prepare("SELECT * FROM user_buffs WHERE guildID = ? AND userID = ? AND buffType = 'mora' AND expiresAt > ?")
        .all(guildID, member.id, Date.now());

    tempBuffs.forEach(buff => {
        totalBuffPercent += buff.buffPercent;
    });

    let finalMultiplier = 1 + (totalBuffPercent / 100);
    if (finalMultiplier < 0) finalMultiplier = 0;

    return finalMultiplier;
}

// 🌟 دالة تحديث الاسم (بالفواصل المحددة فقط) 🌟
async function updateNickname(member, sql) {
    if (!member) return;
    if (!sql || typeof sql.prepare !== 'function') return;
    
    if (member.id === member.guild.ownerId) return;
    if (!member.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return;
    if (!member.manageable) return;

    const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
    const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?").get(member.guild.id);
    const streakEmoji = settings?.streakEmoji || '🔥';

    let separator = streakData?.separator;
    const checkList = SEPARATORS_CLEAN_LIST.map(s => s.replace('\\', ''));
    if (!checkList.includes(separator)) {
        separator = DEFAULT_SEPARATOR;
    }

    const streakCount = streakData?.streakCount || 0;
    const nicknameActive = streakData?.nicknameActive ?? 1;

    let baseName = member.displayName;

    // تنظيف الاسم
    baseName = baseName.replace(/^\[\d+\]\s*/, '').trim();
    const cleanRegex = new RegExp(`\\s*(${SEPARATORS_CLEAN_LIST.join('|')})\\s*\\d+.*$`, 'i');
    baseName = baseName.replace(cleanRegex, '').trim();
    baseName = baseName.replace(cleanRegex, '').trim();

    let newName;
    if (streakCount > 0 && nicknameActive) {
        newName = `${baseName} ${separator} ${streakCount} ${streakEmoji}`;
    } else {
        newName = baseName;
    }

    if (newName.length > 32) {
        const suffix = ` ${separator} ${streakCount} ${streakEmoji}`;
        baseName = baseName.substring(0, 32 - suffix.length);
        newName = `${baseName}${suffix}`;
    }

    // 🔥 الحماية من السبام: فقط عدل إذا كان الاسم مختلفاً 🔥
    if (member.displayName !== newName) {
        try {
            await member.setNickname(newName);
        } catch (err) {}
    }
}

async function checkDailyStreaks(client, sql) {
    console.log("[Streak] 🔄 بدء الفحص اليومي للستريك...");
    const allStreaks = sql.prepare("SELECT * FROM streaks WHERE streakCount > 0").all();
    const todayKSA = getKSADateString(Date.now());

    const updateStreak = sql.prepare("UPDATE streaks SET streakCount = @streakCount, hasGracePeriod = @hasGracePeriod, hasItemShield = @hasItemShield, lastMessageTimestamp = @lastMessageTimestamp WHERE id = @id");
    const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?");

    for (const streakData of allStreaks) {
        const lastDateKSA = getKSADateString(streakData.lastMessageTimestamp);
        const diffDays = getDayDifference(todayKSA, lastDateKSA);

        if (diffDays <= 1) continue;

        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID);
            member = await guild.members.fetch(streakData.userID);
        } catch (err) { continue; }

        const streakEmoji = settings.get(streakData.guildID)?.streakEmoji || '🔥';
        const sendDM = streakData.dmNotify === 1;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`الذهاب إلى: ${member.guild.name}`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${member.guild.id}`)
        );

        if (diffDays === 2) {
            if (streakData.hasItemShield === 1) {
                streakData.hasItemShield = 0;
                streakData.lastMessageTimestamp = Date.now(); 
                updateStreak.run(streakData);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- 🛡️ **تم تفعيل درع المتجر!**\n- تم حماية الستريك الخاص بك (${streakData.streakCount} ${streakEmoji}) من الضياع.\n- لا تنسَ التفاعل اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else if (streakData.hasGracePeriod === 1) {
                streakData.hasGracePeriod = 0;
                streakData.lastMessageTimestamp = Date.now(); 
                updateStreak.run(streakData);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- 🛡️ **تم تفعيل فترة السماح المجانية!**\n- تم حماية الستريك الخاص بك (${streakData.streakCount} ${streakEmoji}).\n- لا تنسَ التفاعل اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else {
                const oldStreak = streakData.streakCount;
                streakData.streakCount = 0;
                streakData.hasGracePeriod = 0;
                updateStreak.run(streakData);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت الـستريـك 💔\n- لم تكن تملك اي درع للحماية.\n- كـان ستريـكك: ${oldStreak}`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
                if (streakData.nicknameActive === 1) await updateNickname(member, sql);
            }

        } else if (diffDays > 2) {
            const oldStreak = streakData.streakCount;
            streakData.streakCount = 0;
            streakData.hasGracePeriod = 0;
            updateStreak.run(streakData);
            if (sendDM) {
                const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                    .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت الـستريـك 💔\n- لقد انقطعت عن السيرفر مدة طويلة.\n- كـان ستريـكك: ${oldStreak}`);
                member.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
            if (streakData.nicknameActive === 1) await updateNickname(member, sql);
        }
    }
    console.log(`[Streak] ✅ اكتمل الفحص اليومي للستريك. (تم فحص ${allStreaks.length} عضو)`);
}

async function handleStreakMessage(message) {
    const sql = message.client.sql;
    
    // 🔥🔥 منع التضارب: إذا كان العضو قيد المعالجة، تجاهل الرسالة 🔥🔥
    const processId = `${message.guild.id}-${message.author.id}`;
    if (processingUsers.has(processId)) return;
    processingUsers.add(processId);

    try {
        try {
             sql.prepare("ALTER TABLE streaks ADD COLUMN has12hWarning INTEGER DEFAULT 0").run();
        } catch (e) {}

        const getStreak = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?");
        const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield, nicknameActive, hasReceivedFreeShield, separator, dmNotify, highestStreak, has12hWarning) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield, @nicknameActive, @hasReceivedFreeShield, @separator, @dmNotify, @highestStreak, @has12hWarning);");
        const updateStreakData = sql.prepare("UPDATE streaks SET lastMessageTimestamp = @lastMessageTimestamp, streakCount = @streakCount, highestStreak = @highestStreak, has12hWarning = 0 WHERE id = @id");

        const getLevel = message.client.getLevel;
        const setLevel = message.client.setLevel;

        const now = Date.now();
        const todayKSA = getKSADateString(now);

        const guildID = message.guild.id;
        const userID = message.author.id;
        const id = `${guildID}-${userID}`;

        let streakData = getStreak.get(guildID, userID);

        if (!streakData) {
            streakData = {
                id: id, guildID, userID,
                streakCount: 1,
                lastMessageTimestamp: now,
                hasGracePeriod: 1,
                hasItemShield: 0,
                nicknameActive: 1,
                hasReceivedFreeShield: 1,
                separator: DEFAULT_SEPARATOR, 
                dmNotify: 1,
                highestStreak: 1,
                has12hWarning: 0
            };
            setStreak.run(streakData);
            await updateNickname(message.member, sql);

        } else {
            const cleanCheckList = SEPARATORS_CLEAN_LIST.map(s => s.replace('\\', ''));
            if (!cleanCheckList.includes(streakData.separator)) {
                streakData.separator = DEFAULT_SEPARATOR;
                sql.prepare("UPDATE streaks SET separator = ? WHERE id = ?").run(DEFAULT_SEPARATOR, id);
            }

            // فحص وتعديل الاسم (مع الحماية الموجودة في الدالة)
            if (streakData.nicknameActive === 1) {
                await updateNickname(message.member, sql);
            }

            const lastDateKSA = getKSADateString(streakData.lastMessageTimestamp);
            
            // إذا كان في نفس اليوم، نحدث التوقيت فقط لتجنب التحذيرات
            if (todayKSA === lastDateKSA) {
                sql.prepare("UPDATE streaks SET lastMessageTimestamp = ?, has12hWarning = 0 WHERE id = ?").run(now, id);
                return; // 🛑 خروج مبكر لمنع التضارب
            }

            if (typeof streakData.dmNotify === 'undefined' || typeof streakData.highestStreak === 'undefined') {
                streakData.dmNotify = streakData.dmNotify ?? 1;
                streakData.highestStreak = streakData.highestStreak ?? streakData.streakCount;
                sql.prepare("UPDATE streaks SET dmNotify = ?, highestStreak = ? WHERE id = ?").run(streakData.dmNotify, streakData.highestStreak, id);
            }

            if (streakData.streakCount === 0) {
                streakData.streakCount = 1;
                streakData.lastMessageTimestamp = now;
                streakData.hasGracePeriod = 0;
                streakData.hasItemShield = 0;
                if (streakData.highestStreak < 1) streakData.highestStreak = 1;
                streakData.has12hWarning = 0;
                setStreak.run(streakData);
                await updateNickname(message.member, sql);
            } else {
                const diffDays = getDayDifference(todayKSA, lastDateKSA);
                if (diffDays === 1) {
                    streakData.streakCount += 1;
                    streakData.lastMessageTimestamp = now;
                    if (streakData.streakCount > streakData.highestStreak) {
                        streakData.highestStreak = streakData.streakCount;
                    }
                    updateStreakData.run(streakData);
                    
                    if (streakData.streakCount > 10) {
                        let levelData = getLevel.get(userID, guildID);
                        if (!levelData) levelData = { ...message.client.defaultData, user: userID, guild: guildID };
                        levelData.mora = (levelData.mora || 0) + 100;
                        levelData.xp = (levelData.xp || 0) + 100;
                        levelData.totalXP = (levelData.totalXP || 0) + 100;
                        setLevel.run(levelData);
                    }
                    await updateNickname(message.member, sql);
                } else {
                    // تحديث الوقت فقط وتصفير التحذير (حالة احتياطية)
                    sql.prepare("UPDATE streaks SET lastMessageTimestamp = ?, has12hWarning = 0 WHERE id = ?").run(now, id);
                }
            }
        }
    } catch (err) {
        console.error("Streak Error:", err);
    } finally {
        // 🔥🔥 فك القفل بعد 2 ثانية (لضمان انتهاء التحديثات) 🔥🔥
        setTimeout(() => processingUsers.delete(processId), 2000);
    }
}

async function handleMediaStreakMessage(message) {
    const sql = message.client.sql;
    try {
        sql.prepare("ALTER TABLE media_streaks ADD COLUMN lastChannelID TEXT").run();
    } catch (e) {}

    const getStreak = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?");
    const setStreak = sql.prepare("INSERT OR REPLACE INTO media_streaks (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak, lastChannelID) VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak, @lastChannelID);");
    const updateStreakData = sql.prepare("UPDATE media_streaks SET lastMediaTimestamp = @lastMediaTimestamp, streakCount = @streakCount, highestStreak = @highestStreak, lastChannelID = @lastChannelID WHERE id = @id");

    const now = Date.now();
    const todayKSA = getKSADateString(now);
    const guildID = message.guild.id;
    const userID = message.author.id;
    const channelID = message.channel.id;
    const id = `${guildID}-${userID}`;

    let streakData = getStreak.get(guildID, userID);
    let isNewStreakToday = false; 

    if (!streakData) {
        streakData = {
            id: id, guildID, userID,
            streakCount: 1,
            lastMediaTimestamp: now,
            hasGracePeriod: 1,
            hasItemShield: 0,
            hasReceivedFreeShield: 1,
            dmNotify: 1,
            highestStreak: 1,
            lastChannelID: channelID
        };
        setStreak.run(streakData);
        isNewStreakToday = true;
    } else {
        const lastDateKSA = getKSADateString(streakData.lastMediaTimestamp);
        
        if (streakData.lastChannelID !== channelID) {
            sql.prepare("UPDATE media_streaks SET lastChannelID = ? WHERE id = ?").run(channelID, id);
            streakData.lastChannelID = channelID;
        }

        if (todayKSA === lastDateKSA) return;

        if (typeof streakData.dmNotify === 'undefined' || typeof streakData.highestStreak === 'undefined') {
            streakData.dmNotify = streakData.dmNotify ?? 1;
            streakData.highestStreak = streakData.highestStreak ?? streakData.streakCount;
            sql.prepare("UPDATE media_streaks SET dmNotify = ?, highestStreak = ? WHERE id = ?").run(streakData.dmNotify, streakData.highestStreak, id);
        }

        if (streakData.streakCount === 0) {
            streakData.streakCount = 1;
            streakData.lastMediaTimestamp = now;
            streakData.hasGracePeriod = 0;
            streakData.hasItemShield = 0;
            streakData.lastChannelID = channelID;
            if (streakData.highestStreak < 1) streakData.highestStreak = 1;
            setStreak.run(streakData);
            isNewStreakToday = true;
        } else {
            const diffDays = getDayDifference(todayKSA, lastDateKSA);
            if (diffDays === 1) {
                streakData.streakCount += 1;
                streakData.lastMediaTimestamp = now;
                streakData.lastChannelID = channelID;
                if (streakData.streakCount > streakData.highestStreak) streakData.highestStreak = streakData.streakCount;
                updateStreakData.run(streakData);
                isNewStreakToday = true;
            } else {
                streakData.streakCount = 1;
                streakData.lastMediaTimestamp = now;
                streakData.hasGracePeriod = 0;
                streakData.hasItemShield = 0;
                streakData.lastChannelID = channelID;
                setStreak.run(streakData);
                isNewStreakToday = true;
            }
        }
    }

    if (isNewStreakToday) {
        if (streakData.streakCount > 10) {
            try {
                let levelData = message.client.getLevel.get(userID, guildID);
                if (!levelData) levelData = { ...message.client.defaultData, user: userID, guild: guildID };
                levelData.mora = (levelData.mora || 0) + 100;
                levelData.xp = (levelData.xp || 0) + 100;
                levelData.totalXP = (levelData.totalXP || 0) + 100;
                message.client.setLevel.run(levelData);
            } catch (err) { console.error("[Media Streak] Failed to give rewards:", err); }
        }
        
        try {
            const reactionEmoji = EMOJI_MEDIA_STREAK.match(/<a?:\w+:(\d+)>/);
            if(reactionEmoji) await message.react(reactionEmoji[1]);
        } catch (e) {}

        try {
            const totalShields = (streakData.hasGracePeriod || 0) + (streakData.hasItemShield || 0);
            const shieldText = totalShields > 0 ? ` | ${totalShields} ${EMOJI_SHIELD}` : '';
            const replyMsg = await message.reply({
                content: `✥ تـم تـحديـث ستـريـك الميـديـا: ${streakData.streakCount} ${EMOJI_MEDIA_STREAK}${shieldText}`,
                allowedMentions: { repliedUser: false } 
            });
            setTimeout(() => { replyMsg.delete().catch(e => {}); }, 10000);
        } catch (e) {}
    }
}

async function checkDailyMediaStreaks(client, sql) {
    console.log("[Media Streak] 🔄 بدء الفحص اليومي لستريك الميديا...");
    try {
        sql.prepare("ALTER TABLE media_streaks ADD COLUMN lastChannelID TEXT").run();
    } catch (e) {}

    const allStreaks = sql.prepare("SELECT * FROM media_streaks WHERE streakCount > 0").all();
    const todayKSA = getKSADateString(Date.now());
    const updateStreak = sql.prepare("UPDATE media_streaks SET streakCount = @streakCount, hasGracePeriod = @hasGracePeriod, hasItemShield = @hasItemShield, lastMediaTimestamp = @lastMediaTimestamp WHERE id = @id");

    for (const streakData of allStreaks) {
        const lastDateKSA = getKSADateString(streakData.lastMediaTimestamp);
        const diffDays = getDayDifference(todayKSA, lastDateKSA);
        if (diffDays <= 1) continue; 

        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID);
            member = await guild.members.fetch(streakData.userID);
        } catch (err) { continue; }

        const sendDM = streakData.dmNotify === 1;
        const emoji = EMOJI_MEDIA_STREAK;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`الذهاب إلى: ${member.guild.name}`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${member.guild.id}`)
        );

        if (diffDays === 2) {
            if (streakData.hasItemShield === 1) {
                streakData.hasItemShield = 0;
                streakData.lastMediaTimestamp = Date.now(); 
                updateStreak.run(streakData);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle(`✶ اشـعـارات ستريك الميديا ${emoji}`).setColor(Colors.Green)
                        .setDescription(`- 🛡️ **تم تفعيل درع المتجر!**\n- تم حماية ستريك الميديا (${streakData.streakCount} ${emoji}).\n- لا تنسَ الإرسال اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else if (streakData.hasGracePeriod === 1) {
                streakData.hasGracePeriod = 0;
                streakData.lastMediaTimestamp = Date.now(); 
                updateStreak.run(streakData);
                if (sendDM) {
                      const embed = new EmbedBuilder().setTitle(`✶ اشـعـارات ستريك الميديا ${emoji}`).setColor(Colors.Green)
                        .setDescription(`- 🛡️ **تم تفعيل فترة السماح!**\n- تم حماية ستريك الميديا (${streakData.streakCount} ${emoji}).\n- لا تنسَ الإرسال اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else {
                streakData.streakCount = 0;
                streakData.hasGracePeriod = 0;
                updateStreak.run(streakData);
                if(sendDM) {
                      const embed = new EmbedBuilder().setTitle(`✶ اشـعـارات ستريك الميديا ${emoji}`).setColor(Colors.Red)
                        .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت ستريك الميديا 💔\n- لم تكن تملك أي درع.\n- حاول مرة أخرى!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            }
        } else if (diffDays > 2) {
            streakData.streakCount = 0;
            streakData.hasGracePeriod = 0;
            updateStreak.run(streakData);
            if(sendDM) {
                const embed = new EmbedBuilder().setTitle(`✶ اشـعـارات ستريك الميديا ${emoji}`).setColor(Colors.Red)
                   .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت ستريك الميديا 💔\n- انقطعت لفترة طويلة.\n- حاول مرة أخرى!`);
               member.send({ embeds: [embed], components: [row] }).catch(() => {});
           }
        }
    }
    console.log(`[Media Streak] ✅ اكتمل الفحص اليومي لستريك الميديا.`);
}

async function sendMediaStreakReminders(client, sql) {
    console.log("[Media Streak] ⏰ إرسال تذكيرات الستريك (3 العصر)...");
    try {
        sql.prepare("ALTER TABLE media_streaks ADD COLUMN lastChannelID TEXT").run();
    } catch (e) {}

    const todayKSA = getKSADateString(Date.now());
    const allMediaChannels = sql.prepare("SELECT * FROM media_streak_channels").all();
    const activeStreaks = sql.prepare("SELECT * FROM media_streaks WHERE streakCount > 0").all();
    const usersToRemind = [];

    for (const streak of activeStreaks) {
        const lastDateKSA = getKSADateString(streak.lastMediaTimestamp);
        if (lastDateKSA !== todayKSA) {
            usersToRemind.push(streak);
        }
    }

    if (usersToRemind.length === 0) return;

    for (const channelData of allMediaChannels) {
        const guildID = channelData.guildID;
        const channelID = channelData.channelID;

        const usersForThisChannel = usersToRemind.filter(streak => 
            streak.guildID === guildID && 
            (streak.lastChannelID === channelID || !streak.lastChannelID) 
        );

        if (usersForThisChannel.length === 0 && !channelData.lastReminderMessageID) continue;

        try {
            const channel = await client.channels.fetch(channelID);
            
            if (channelData.lastReminderMessageID) {
                try {
                    const oldMessage = await channel.messages.fetch(channelData.lastReminderMessageID);
                    if (oldMessage) await oldMessage.delete();
                } catch (e) {}
            }

            if (usersForThisChannel.length > 0) {
                const mentions = usersForThisChannel.map(s => `<@${s.userID}>`).join(' ');
                const embed = new EmbedBuilder().setTitle(`🔔 تـذكـيـر ستـريـك المـيـديـا`).setColor(Colors.Yellow)
                    .setDescription(`- نـود تـذكيـركـم بـإرسـال المـيـديـا الخـاصـة بكـم لهـذا اليـوم ${EMOJI_MEDIA_STREAK}\n\n- بـاقـي علـى نهـايـة اليـوم أقـل مـن 9 سـاعـات!`)
                    .setThumbnail('https://i.postimg.cc/8z0Xw04N/attention.png'); 

                const sentMessage = await channel.send({ content: mentions, embeds: [embed] });
                
                sql.prepare("UPDATE media_streak_channels SET lastReminderMessageID = ? WHERE guildID = ? AND channelID = ?").run(sentMessage.id, guildID, channelID);
            } else {
                sql.prepare("UPDATE media_streak_channels SET lastReminderMessageID = NULL WHERE guildID = ? AND channelID = ?").run(guildID, channelID);
            }

        } catch (err) {
            console.error(`[Media Streak] Reminder Error in Channel ${channelID}:`, err.message);
        }
    }
}

async function sendDailyMediaUpdate(client, sql) {
    console.log("[Media Streak] 📰 إرسال التقرير اليومي...");
    try {
        sql.prepare("ALTER TABLE media_streak_channels ADD COLUMN lastDailyMsgID TEXT").run();
    } catch (e) {}

    const allMediaChannels = sql.prepare("SELECT * FROM media_streak_channels").all();
    const guildsStats = {};

    for (const channelData of allMediaChannels) {
        const guildID = channelData.guildID;
        
        if (!guildsStats[guildID]) {
            const topStreaks = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND streakCount > 0 ORDER BY streakCount DESC LIMIT 3").all(guildID);
            let description = `**${EMOJI_MEDIA_STREAK} بـدأ يـوم جـديـد لستريـك الميـديـا! ${EMOJI_MEDIA_STREAK}**\n\n- لا تنسـوا إرسـال المـيـديـا الخـاصـة بكـم لهـذا اليـوم.\n\n`;
            
            const embed = new EmbedBuilder().setTitle("☀️ تـحـديـث ستـريـك المـيـديـا").setColor(Colors.Aqua);

            if (topStreaks.length > 0) {
                description += "**🏆 قـائـمـة الأعـلـى فـي الستـريـك:**\n";
                const leaderboard = topStreaks.map((streak, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const rank = medals[index] || `**${index + 1}.**`;
                    return `${rank} <@${streak.userID}> - \`${streak.streakCount}\` ${EMOJI_MEDIA_STREAK}`;
                });
                description += leaderboard.join('\n');

                try {
                    const topMember = await client.guilds.cache.get(guildID)?.members.fetch(topStreaks[0].userID).catch(() => null);
                    if (topMember) {
                        embed.setThumbnail(topMember.user.displayAvatarURL({ dynamic: true }));
                    } else {
                        embed.setThumbnail('https://i.postimg.cc/mD7Q31TR/New-Day.png');
                    }
                } catch (e) {
                    embed.setThumbnail('https://i.postimg.cc/mD7Q31TR/New-Day.png');
                }

            } else {
                description += "لا يوجـد أحـد لـديـه ستريـك مـيـديـا حـالـيـاً. كـن أول الـمـشاركـيـن!";
                embed.setThumbnail('https://i.postimg.cc/mD7Q31TR/New-Day.png');
            }
            
            embed.setDescription(description).setImage('https://i.postimg.cc/mD7Q31TR/New-Day.png');
            
            guildsStats[guildID] = embed;
        }

        try {
            const channel = await client.channels.fetch(channelData.channelID);
            
            if (channelData.lastDailyMsgID) {
                try {
                    const oldMsg = await channel.messages.fetch(channelData.lastDailyMsgID);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {}
            }

            if (channelData.lastReminderMessageID) {
                 try {
                    const oldRemind = await channel.messages.fetch(channelData.lastReminderMessageID);
                    if (oldRemind) await oldRemind.delete();
                } catch (e) {}
                sql.prepare("UPDATE media_streak_channels SET lastReminderMessageID = NULL WHERE guildID = ? AND channelID = ?").run(guildID, channelData.channelID);
            }

            const sentMsg = await channel.send({ embeds: [guildsStats[guildID]] });
            sql.prepare("UPDATE media_streak_channels SET lastDailyMsgID = ? WHERE guildID = ? AND channelID = ?").run(sentMsg.id, guildID, channelData.channelID);

        } catch (err) {
            console.error(`[Media Streak Update] Failed for channel ${channelData.channelID}:`, err.message);
        }
    }
}

async function sendStreakWarnings(client, sql) {
    console.log("[Streak Warning] ⏰ بدء فحص تحذيرات الـ 12 ساعة...");
    try {
         sql.prepare("ALTER TABLE streaks ADD COLUMN has12hWarning INTEGER DEFAULT 0").run();
    } catch (e) {}

    const now = Date.now();
    const twelveHoursAgo = now - (12 * 60 * 60 * 1000);
    const thirtySixHoursAgo = now - (36 * 60 * 60 * 1000);

    const updateWarning = sql.prepare("UPDATE streaks SET has12hWarning = 1 WHERE id = ?");
    const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?");

    const usersToWarn = sql.prepare(`SELECT * FROM streaks WHERE streakCount > 0 AND has12hWarning = 0 AND dmNotify = 1 AND lastMessageTimestamp < ? AND lastMessageTimestamp > ?`).all(twelveHoursAgo, thirtySixHoursAgo);

    let warnedCount = 0;
    for (const streakData of usersToWarn) {
        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID);
            member = await guild.members.fetch(streakData.userID);
        } catch (err) { continue; }

        const streakEmoji = settings.get(streakData.guildID)?.streakEmoji || '🔥';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`الذهاب إلى: ${member.guild.name}`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${member.guild.id}`)
        );

        const embed = new EmbedBuilder().setTitle('✶ تـحـذيـر الـستريـك').setColor(Colors.Yellow)
            .setImage('https://i.postimg.cc/8z0Xw04N/attention.png') 
            .setDescription(`- لـقـد مـضـى أكـثـر مـن 12 سـاعـة عـلـى آخـر رسـالـة لـك\n- سـتريـكك الـحـالي: ${streakData.streakCount} ${streakEmoji}\n- سارع بإرسال رسالة قبل أن يضيع الستريك!`);

        await member.send({ embeds: [embed], components: [row] }).then(() => {
            updateWarning.run(streakData.id);
            warnedCount++;
        }).catch(() => {});
    }
    console.log(`[Streak Warning] ✅ اكتمل فحص التحذيرات. (تم إرسال ${warnedCount} تحذير)`);
}

module.exports = {
    calculateBuffMultiplier,
    updateNickname,
    handleStreakMessage,
    handleMediaStreakMessage,
    checkDailyStreaks,
    checkDailyMediaStreaks,
    sendMediaStreakReminders,
    sendDailyMediaUpdate,
    sendStreakWarnings,
    calculateMoraBuff: calculateMoraBuff 
};
