const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'ban',
    description: 'حظر عضو من السيرفر مع توثيق القضية',
    aliases: ['حظر', 'باند'],
    category: 'Admin',
    usage: 'ban <@user/ID> [السبب]',
    
    async execute(message, args) {
        const sql = message.client.sql;

        // 1. التحقق من صلاحيات المشرف
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ content: '❌ **ليس لديك صلاحية لحظر الأعضاء.**', allowedMentions: { repliedUser: false } });
        }

        // 2. التحقق من صلاحيات البوت
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ content: '❌ **لا أملك صلاحية "Ban Members" للقيام بهذا الأمر.**', allowedMentions: { repliedUser: false } });
        }

        // 3. جلب العضو المستهدف
        const targetArg = args[0];
        if (!targetArg) {
            return message.reply({ content: '❓ **الرجاء تحديد العضو: منشن أو آيدي.**', allowedMentions: { repliedUser: false } });
        }

        let targetMember;
        try {
            targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
        } catch (err) {
            // محاولة الباند حتى لو الشخص مو موجود بالسيرفر (Hackban)
            try {
                const user = await message.client.users.fetch(targetArg);
                return hackBan(message, user, args.slice(1).join(" "), sql);
            } catch (e) {
                return message.reply({ content: '❌ **لم يتم العثور على العضو.**', allowedMentions: { repliedUser: false } });
            }
        }

        // 4. التحقق من الرتب (Hierarchy Check)
        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك حظر نفسك.**');
        if (targetMember.id === message.guild.ownerId) return message.reply('❌ **لا يمكنك حظر مالك السيرفر.**');
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك حظر شخص رتبته أعلى منك أو مساوية لك.**');
        }
        if (!targetMember.bannable) {
            return message.reply('❌ **لا يمكنني حظر هذا العضو (رتبته أعلى مني).**');
        }

        // 5. تجهيز السبب
        let reason = args.slice(1).join(" ") || "غير محدد";

        // 6. نظام القضايا (Case System)
        // نجلب آخر رقم قضية ونزيد عليه 1
        let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
        let newCaseID = lastCase ? lastCase.caseID + 1 : 1;

        // 7. إرسال رسالة بالخاص للعضو (قبل الباند)
        let dmSent = false;
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle(`🚫 تم حظرك من سيرفر: ${message.guild.name}`)
                .setColor(Colors.Red)
                .addFields(
                    { name: 'السبب', value: reason },
                    { name: 'بواسطة', value: message.author.tag }
                )
                .setTimestamp();
            await targetMember.send({ embeds: [dmEmbed] });
            dmSent = true;
        } catch (e) {
            dmSent = false;
        }

        // 8. تنفيذ الباند
        try {
            await targetMember.ban({ reason: `[Banned by ${message.author.tag}] Reason: ${reason}` });
        } catch (err) {
            console.error(err);
            return message.reply('❌ **حدث خطأ أثناء محاولة الحظر.**');
        }

        // 9. حفظ القضية في الداتابيس
        const uniqueID = `${message.guild.id}-${newCaseID}`;
        sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES (?, ?, ?, 'BAN', ?, ?, ?, ?)`)
           .run(uniqueID, message.guild.id, newCaseID, targetMember.id, message.author.id, reason, Date.now());

        // 10. إرسال رسالة التأكيد في الشات
        const successEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setDescription(`✅ **تم حظر ${targetMember.user.tag} بنجاح.**\n📁 **القضية رقم:** \`#${newCaseID}\`\n📝 **السبب:** ${reason}`)
            .setFooter({ text: dmSent ? 'تم إشعاره بالخاص' : 'لم يتم إشعاره (الخاص مغلق)' });
        
        message.reply({ embeds: [successEmbed], allowedMentions: { repliedUser: false } });

        // 11. إرسال اللوق (Log)
        const settings = sql.prepare("SELECT modLogChannelID FROM settings WHERE guild = ?").get(message.guild.id);
        if (settings && settings.modLogChannelID) {
            const logChannel = message.guild.channels.cache.get(settings.modLogChannelID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`🔴 New Ban | Case #${newCaseID}`)
                    .setColor(Colors.Red)
                    .setThumbnail(targetMember.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 العضو', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
                        { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: '📝 السبب', value: reason },
                        { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                    )
                    .setFooter({ text: `EMorax Security System` });
                logChannel.send({ embeds: [logEmbed] });
            }
        }
    }
};

// دالة مساعدة للباند عن طريق الآيدي (Hackban) في حال الشخص مو بالسيرفر
async function hackBan(message, user, reason, sql) {
    // نفس منطق الحفظ واللوق لكن بدون التحقق من الرتب داخل السيرفر
    // ... (يمكن إضافتها إذا أردت، لكن الكود أعلاه يغطي 99% من الحالات)
    // لتنفيذها ببساطة:
    try {
        await message.guild.members.ban(user.id, { reason: `[Hackban by ${message.author.tag}] Reason: ${reason}` });
        
        // حساب الكيس
        let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
        let newCaseID = lastCase ? lastCase.caseID + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;
        
        sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) VALUES (?, ?, ?, 'BAN', ?, ?, ?, ?)`).run(uniqueID, message.guild.id, newCaseID, user.id, message.author.id, reason, Date.now());

        message.reply(`✅ **تم حظر ${user.tag} (خارج السيرفر) بنجاح.** \`#${newCaseID}\``);
        
        // إرسال اللوق (نفس الكود السابق)
        const settings = sql.prepare("SELECT modLogChannelID FROM settings WHERE guild = ?").get(message.guild.id);
        if (settings && settings.modLogChannelID) {
            const logChannel = message.guild.channels.cache.get(settings.modLogChannelID);
            if(logChannel) {
                 const logEmbed = new EmbedBuilder().setTitle(`🔴 New HackBan | Case #${newCaseID}`).setColor(Colors.DarkRed).setDescription(`**User:** ${user.tag}\n**By:** ${message.author.tag}\n**Reason:** ${reason}`);
                 logChannel.send({ embeds: [logEmbed] });
            }
        }
    } catch (e) {
        message.reply("❌ حدث خطأ، تأكد أن الآيدي صحيح.");
    }
}
