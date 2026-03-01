const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'unban',
    description: 'إلغاء حظر عضو (بدون رسالة خاص)',
    aliases: ['عفو', 'فك_حظر'],
    category: 'Admin',
    usage: 'unban <userID> [reason]',

    async execute(message, args) {
        const sql = message.client.sql;

        // 1. التحقق من الصلاحيات (تجاهل تام إذا لم يملك)
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

        // 2. جلب الآيدي
        const targetID = args[0];
        const reason = args.slice(1).join(" ") || "عفو إداري";

        if (!targetID) return message.reply('❓ **حط ايدي العضو المحظور.**');

        // 3. تنفيذ فك الحظر
        try {
            // محاولة فك الحظر
            const user = await message.guild.members.unban(targetID, reason);

            // رد بسيط في الشات
            message.reply(`✅ **تم فك الحظر عن:** \`${user.tag || targetID}\``);

            // --- توثيق في الداتابيس واللوق (اختياري لكن مفيد للنظام) ---
            
            // حساب رقم القضية
            let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
            let newCaseID = lastCase ? lastCase.caseID + 1 : 1;
            const uniqueID = `${message.guild.id}-${newCaseID}`;

            // حفظ في الداتابيس
            sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                         VALUES (?, ?, ?, 'UNBAN', ?, ?, ?, ?)`)
                .run(uniqueID, message.guild.id, newCaseID, targetID, message.author.id, reason, Date.now());

            // إرسال للوق (Log)
            sendModLog(message, user, reason, newCaseID);

        } catch (err) {
            // غالباً الخطأ يكون أن الآيدي غلط أو الشخص مو محظور أصلاً
            return message.reply('❌ **الآيدي غلط أو العضو غير محظور.**');
        }
    }
};

// دالة اللوق البسيطة
function sendModLog(message, user, reason, caseID) {
    const sql = message.client.sql;
    const settings = sql.prepare("SELECT modLogChannelID FROM settings WHERE guild = ?").get(message.guild.id);
    if (settings && settings.modLogChannelID) {
        const logChannel = message.guild.channels.cache.get(settings.modLogChannelID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(`🟢 New Unban | Case #${caseID}`)
                .setColor(Colors.Green)
                .setDescription(`**User:** ${user.tag || user.id}\n**By:** ${message.author.tag}\n**Reason:** ${reason}`)
                .setFooter({ text: `EMorax Security System` })
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
}
