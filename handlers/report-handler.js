const { EmbedBuilder, Colors } = require("discord.js");

const COOLDOWN_DURATION = 86400; // 24 ساعة (بالثواني)
const JAIL_DURATION = 10800;     // 3 ساعات (بالثواني)

function getReportSettings(sql, guildID) {
    return sql.prepare("SELECT * FROM report_settings WHERE guildID = ?").get(guildID) || {};
}

function hasReportPermission(sql, member) {
    if (member.permissions.has('Administrator') || member.id === member.guild.ownerId) {
        return true;
    }
    const settings = getReportSettings(sql, member.guild.id);
    if (!settings.logChannelID) return false; 

    const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(member.guild.id);
    if (allowedRoles.length === 0) return true; 

    const allowedRoleIDs = allowedRoles.map(r => r.roleID);
    return member.roles.cache.some(r => allowedRoleIDs.includes(r.id));
}

// --- ( 🌟 دالة إرسال رسائل الخطأ والنجاح 🌟 ) ---
async function sendReportError(destination, title, description, ephemeral = false) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(Colors.Red)
        .setImage("https://i.postimg.cc/L5hmJ9nT/h-K6-Ldr-K-1-2.gif");

    // (للأوامر النصية - الرسائل)
    if (destination.channel && !destination.isCommand && !destination.isInteraction) { 
        try { await destination.delete(); } catch(e) {} // نحذف رسالة العضو
        
        // ✅ نرسل الرسالة ولا نحذفها تلقائياً
        return destination.channel.send({ content: `${destination.author}`, embeds: [embed] });
    }

    // (لأوامر السلاش والتفاعلات)
    try {
        if (destination.replied || destination.deferred) {
            await destination.followUp({ embeds: [embed], ephemeral: ephemeral });
        } else {
            await destination.reply({ embeds: [embed], ephemeral: ephemeral });
        }
    } catch (e) {
        console.error("Failed to send report error:", e);
    }
}

async function processReportLogic(client, interactionOrMessage, targetMember, reason, reportedMessageLink = null) {
    const sql = client.sql;
    const guild = interactionOrMessage.guild;
    const reporter = interactionOrMessage.member;
    const settings = getReportSettings(sql, guild.id);

    const LOG_CHANNEL_ID = settings.logChannelID;
    const JAIL_ROLE_ID = settings.jailRoleID;
    const ARENA_ROLE_ID = settings.arenaRoleID; 
    const UNLIMITED_ROLE_ID = settings.unlimitedRoleID;
    const TEST_ROLE_ID = settings.testRoleID;
    const REPORT_CHANNEL_ID = settings.reportChannelID; 

    const isSlash = !!interactionOrMessage.isChatInputCommand || !!interactionOrMessage.isContextMenuCommand || !!interactionOrMessage.isModalSubmit;
     
    if (targetMember.id === reporter.id) return sendReportError(interactionOrMessage, "❖ بـلاغ مـرفـوض", "متـوحـد انـت؟ تبلغ على نفسـك؟.", true);
    if (targetMember.id === guild.ownerId) return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "تبلغ على موراكس؟ بتودينا بداهية اذلف.", true);
    if (targetMember.user.bot) return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "صـاحـي انت؟ تبلغ علـة بوت؟؟.", true);

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const unlimitedRole = UNLIMITED_ROLE_ID ? guild.roles.cache.get(UNLIMITED_ROLE_ID) : null;
    const testRole = TEST_ROLE_ID ? guild.roles.cache.get(TEST_ROLE_ID) : null;

    const isUnlimited = (reporter.permissions.has('Administrator') || reporter.id === guild.ownerId || (unlimitedRole && reporter.roles.cache.has(unlimitedRole.id)) || (testRole && reporter.roles.cache.has(testRole.id)));

    if (!isUnlimited) {
        const cooldownRecord = sql.prepare("SELECT timestamp FROM active_reports WHERE guildID = ? AND targetID = ? AND reporterID = ?").get(guild.id, targetMember.id, reporter.id);
        if (cooldownRecord && (currentTimestamp - cooldownRecord.timestamp) < COOLDOWN_DURATION) {
            return sendReportError(interactionOrMessage, "❖ بـلاغ مـكـرر !", "حـلاوة هي؟ كل شوي تبلغ عليـه.", true);
        }
    }

    sql.prepare("DELETE FROM active_reports WHERE timestamp < ?").run(currentTimestamp - COOLDOWN_DURATION);
    sql.prepare("INSERT OR REPLACE INTO active_reports (guildID, targetID, reporterID, timestamp) VALUES (?, ?, ?, ?)")
       .run(guild.id, targetMember.id, reporter.id, currentTimestamp);
    const reportCount = sql.prepare("SELECT COUNT(DISTINCT reporterID) as count FROM active_reports WHERE guildID = ? AND targetID = ?").get(guild.id, targetMember.id).count;

    const embedSuccess = new EmbedBuilder()
        .setTitle("❖ تـم تقديـم البلاغ بنـجـاح")
        .setDescription(`✶ متلقي البلاغ: ${targetMember}\n✶ سبب البلاغ: ${reason}\n✶ عدد البلاغات: ${reportCount}`)
        .setColor(Colors.Red) 
        .setImage("https://i.postimg.cc/NGDJd8LZ/image.png");

    if (isSlash) {
        if (interactionOrMessage.replied || interactionOrMessage.deferred) {
            await interactionOrMessage.followUp({ embeds: [embedSuccess], ephemeral: true });
        } else {
            await interactionOrMessage.reply({ embeds: [embedSuccess], ephemeral: true });
        }
        const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;
        if (reportChannel) {
            const publicEmbed = new EmbedBuilder(embedSuccess.toJSON()).setFooter({ text: "APPS RE" }); 
            await reportChannel.send({ content: `${targetMember}`, embeds: [publicEmbed] });
        }
    } else {
        await interactionOrMessage.channel.send({ content: `${targetMember}`, embeds: [embedSuccess] });
    }

    const logChannel = LOG_CHANNEL_ID ? guild.channels.cache.get(LOG_CHANNEL_ID) : null;
    if (logChannel) {
        const reportLink = reportedMessageLink ? `\n**🔗 رابط الرسالة:** [إضغط هنا](${reportedMessageLink})` : "";
        const logEmbed = new EmbedBuilder()
            .setTitle("📢 بــلاغ جــديــد")
            .setDescription(`✶ المبلغ: ${reporter}\n✶ متلقي البلاغ: ${targetMember}\n✶ سبب البلاغ: ${reason}${reportLink}\n✶ عدد البلاغات: ${reportCount}`)
            .setColor(Colors.Red).setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
    }

    // --- ( 🚨 منطقة تنفيذ العقوبة عند الوصول لـ 2 بلاغات 🚨 ) ---
    if (reportCount >= 2) {
        try {
            const jailRole = JAIL_ROLE_ID ? guild.roles.cache.get(JAIL_ROLE_ID) : null;
            const arenaRole = ARENA_ROLE_ID ? guild.roles.cache.get(ARENA_ROLE_ID) : null;
            
            // 1. إزالة رتبة الساحة (إذا وجدت)
            if (arenaRole && targetMember.roles.cache.has(arenaRole.id)) {
                await targetMember.roles.remove(arenaRole, "تلقى بلاغين (سحب رتبة الساحة)");
            }
            
            // 2. إضافة رتبة السجن (إذا وجدت)
            if (jailRole) {
                await targetMember.roles.add(jailRole, "تلقى بلاغين (إعطاء رتبة السجن)");
            }

            // 3. إعطاء تايم اوت (Timeout) لمدة 3 ساعات
            // JAIL_DURATION بالثواني (10800)، نضربه في 1000 ليصبح ملي ثانية
            if (targetMember.moderatable) {
                await targetMember.timeout(JAIL_DURATION * 1000, "تلقى بلاغين - سجن تلقائي");
            }

            // تسجيل العقوبة في الداتابيس
            const unjailTime = currentTimestamp + JAIL_DURATION;
            sql.prepare("INSERT OR REPLACE INTO jailed_members (guildID, userID, unjailTime) VALUES (?, ?, ?)").run(guild.id, targetMember.id, unjailTime);
            sql.prepare("DELETE FROM active_reports WHERE guildID = ? AND targetID = ?").run(guild.id, targetMember.id);

            const jailEmbed = new EmbedBuilder()
                .setTitle("❖ تلقـى بلاغين وتـم سـجـنـه!")
                .setDescription(`✶ المنفي: ${targetMember}\n✶ المدة: 3 ساعات`)
                .setColor(Colors.Blue)
                .setImage("https://i.postimg.cc/L6TpBZMs/image.png");
                
            const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;
            if (reportChannel) await reportChannel.send({ embeds: [jailEmbed] });

        } catch (e) { 
            console.error("Jail/Timeout Execution Error:", e); 
        }
    }
}

// --- ( 🔄 دالة فحص انتهاء مدة السجن تلقائياً 🔄 ) ---
async function checkUnjailTask(client) {
    const sql = client.sql;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const jailedToRelease = sql.prepare("SELECT * FROM jailed_members WHERE unjailTime <= ?").all(currentTimestamp);
    
    for (const record of jailedToRelease) {
        const guild = client.guilds.cache.get(record.guildID);
        // تنظيف البيانات القديمة إذا السيرفر غير موجود
        if (!guild) { 
            sql.prepare("DELETE FROM jailed_members WHERE guildID = ? AND userID = ?").run(record.guildID, record.userID); 
            continue; 
        }

        const settings = getReportSettings(sql, guild.id);
        const jailRoleID = settings.jailRoleID;
        // تنظيف إذا لم يتم إعداد رتبة السجن
        if (!jailRoleID) { 
            sql.prepare("DELETE FROM jailed_members WHERE guildID = ? AND userID = ?").run(record.guildID, record.userID); 
            continue; 
        }

        const jailRole = guild.roles.cache.get(jailRoleID);
        const logChannel = settings.logChannelID ? guild.channels.cache.get(settings.logChannelID) : null;
        
        try {
            const member = await guild.members.fetch(record.userID);
            if (member) {
                // 1. إزالة رتبة السجن
                if (jailRole && member.roles.cache.has(jailRole.id)) {
                    await member.roles.remove(jailRole, "انتهاء مدة السجن التلقائي");
                }
                
                // 2. إزالة التايم اوت (تصفيره)
                if (member.isCommunicationDisabled()) {
                    await member.timeout(null, "انتهاء مدة السجن التلقائي");
                }

                if (logChannel) {
                    await logChannel.send({ 
                        embeds: [new EmbedBuilder()
                            .setTitle("🎉 تـم الإفـراج عن سجين")
                            .setDescription(`المستخدم ${member} تم الإفراج عنه وانتهاء عقوبة التايم أوت.`)
                            .setColor(Colors.Green)
                        ] 
                    });
                }
            }
        } catch (e) {
            // خطأ بسيط (العضو غادر السيرفر مثلاً)
        }
        
        // حذف السجل من الداتابيس بعد التنفيذ
        sql.prepare("DELETE FROM jailed_members WHERE guildID = ? AND userID = ?").run(record.guildID, record.userID);
    }
}

module.exports = { getReportSettings, hasReportPermission, sendReportError, processReportLogic, checkUnjailTask };
