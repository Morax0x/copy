const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'ban',
    description: 'حظر عضو من السيرفر',
    aliases: ['تفو', 'حظر', 'باند', 'نفي'],
    category: 'Admin',
    usage: 'ban <@user/ID> [السبب]',
    
    async execute(message, args) {
        const sql = message.client.sql;

        // 1. التحقق من صلاحيات المشرف (تجاهل تام إذا لم يملك صلاحية)
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

        // 2. التحقق من صلاحيات البوت
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ content: '❌ **لا أملك صلاحية "Ban Members".**', allowedMentions: { repliedUser: false } });
        }

        // 3. جلب العضو المستهدف
        const targetArg = args[0];
        const reason = args.slice(1).join(" ") || "مخالفة القوانين - طرد نهائي";

        if (!targetArg) {
            return message.reply({ content: '❓ **منشن الضحية.**', allowedMentions: { repliedUser: false } });
        }

        let targetMember;
        try {
            targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
        } catch (err) {
            // محاولة الباند حتى لو الشخص مو موجود بالسيرفر (Hackban)
            try {
                const user = await message.client.users.fetch(targetArg);
                return hackBan(message, user, reason, sql);
            } catch (e) {
                return message.reply({ content: '❌ **لم يتم العثور على العضو.**', allowedMentions: { repliedUser: false } });
            }
        }

        // 4. التحقق من الرتب
        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك حظر نفسك.**');
        if (targetMember.id === message.guild.ownerId) return message.reply('❌ **لا يمكنك حظر مالك السيرفر.**');
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك حظر شخص رتبته أعلى منك أو مساوية لك.**');
        }
        if (!targetMember.bannable) {
            return message.reply('❌ **لا يمكنني حظر هذا العضو (رتبته أعلى مني).**');
        }

        // 5. تجهيز رقم القضية
        let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
        let newCaseID = lastCase ? lastCase.caseID + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;

        // 6. إرسال رسالة بالخاص للضحية (التصميم السابق)
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✥ تـم نفـيـك من الامبراطورية')
                .setDescription('✶ تـم حرمانـك من دخـول اراضي الامبراطوريـة مدى الحـياة')
                .setColor('Random')
                .setImage('https://i.postimg.cc/V62NcMxz/lick-(1).gif');

            await targetMember.send({ embeds: [dmEmbed] });
        } catch (e) { }

        // 7. تنفيذ الباند
        try {
            await targetMember.ban({ reason: `[Banned by ${message.author.tag}] Reason: ${reason}` });
        } catch (err) {
            console.error(err);
            return message.reply('❌ **حدث خطأ أثناء محاولة الحظر.**');
        }

        // 8. حفظ القضية
        sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES (?, ?, ?, 'BAN', ?, ?, ?, ?)`)
            .run(uniqueID, message.guild.id, newCaseID, targetMember.id, message.author.id, reason, Date.now());

        // 9. الرد في الشات (التعديل الجديد)
        const chatEmbed = new EmbedBuilder()
            .setDescription('✥ تـم النفـي من الامبراطـوريـة')
            .setColor('Random')
            .setImage('https://i.postimg.cc/V62NcMxz/lick-(1).gif');

        message.reply({ embeds: [chatEmbed], allowedMentions: { repliedUser: false } });

        // 10. إرسال اللوق (للمشرفين)
        sendModLog(message, targetMember.user, reason, newCaseID);
    }
};

// --- دالة المساعدة للحظر الخارجي (Hackban) ---
async function hackBan(message, user, reason, sql) {
    try {
        await message.guild.members.ban(user.id, { reason: `[Hackban by ${message.author.tag}] Reason: ${reason}` });
        
        let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
        let newCaseID = lastCase ? lastCase.caseID + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;
        
        sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES (?, ?, ?, 'BAN', ?, ?, ?, ?)`)
           .run(uniqueID, message.guild.id, newCaseID, user.id, message.author.id, reason, Date.now());

        // الرد الجديد للهاك باند أيضاً
        const chatEmbed = new EmbedBuilder()
            .setDescription('✥ تـم النفـي من الامبراطـوريـة')
            .setColor('Random')
            .setImage('https://i.postimg.cc/V62NcMxz/lick-(1).gif');

        message.reply({ embeds: [chatEmbed] });
        
        sendModLog(message, user, reason, newCaseID, true);
    } catch (e) {
        message.reply("❌ حدث خطأ، تأكد أن الآيدي صحيح.");
    }
}

// --- دالة اللوق ---
function sendModLog(message, user, reason, caseID, isHackban = false) {
    const sql = message.client.sql;
    const settings = sql.prepare("SELECT modLogChannelID FROM settings WHERE guild = ?").get(message.guild.id);
    if (settings && settings.modLogChannelID) {
        const logChannel = message.guild.channels.cache.get(settings.modLogChannelID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(isHackban ? `🔴 New HackBan | Case #${caseID}` : `🔴 New Ban | Case #${caseID}`)
                .setColor(Colors.Red)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: '👤 العضو', value: `${user.tag} (${user.id})`, inline: true },
                    { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: '📝 السبب', value: reason },
                    { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                )
                .setFooter({ text: `EMorax Security System` });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
}
