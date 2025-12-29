const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'warnings',
    description: 'عرض سجل تحذيرات عضو معين',
    aliases: ['warns', 'التحذيرات', 'انذارات'],
    category: 'Admin',
    usage: 'warnings <@user>',
    
    async execute(message, args) {
        const sql = message.client.sql;

        // 1. التحقق من صلاحيات المشرف (Kick Members كحد أدنى)
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply('❌ **ليس لديك صلاحية لعرض التحذيرات.**');
        }

        // 2. جلب العضو
        const targetArg = args[0];
        if (!targetArg) return message.reply('❓ **الرجاء تحديد العضو لعرض تحذيراته.**');
        
        let targetUser;
        try {
            // نحاول نجلبه كـ Member وإذا خرج نجلبه كـ User (عشان نشوف تحذيرات اللي غادروا السيرفر)
            const member = message.mentions.members.first() || await message.guild.members.fetch(targetArg).catch(() => null);
            targetUser = member ? member.user : await message.client.users.fetch(targetArg);
        } catch (err) {
            return message.reply('❌ **لم يتم العثور على العضو.**');
        }

        // 3. جلب التحذيرات من الداتابيس
        // نجلب فقط النوع 'WARN' ونرتبها من الأحدث للأقدم
        const warnings = sql.prepare("SELECT * FROM mod_cases WHERE guildID = ? AND targetID = ? AND type = 'WARN' ORDER BY caseID DESC").all(message.guild.id, targetUser.id);

        // 4. إذا ما عنده تحذيرات
        if (!warnings || warnings.length === 0) {
            return message.reply(`✅ **${targetUser.tag} صفحته بيضاء ولا يوجد لديه أي تحذيرات.**`);
        }

        // 5. تجهيز الإيمبد
        const embed = new EmbedBuilder()
            .setTitle(`📜 سجل تحذيرات: ${targetUser.tag}`)
            .setColor(Colors.Orange)
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ text: `عدد التحذيرات: ${warnings.length}` });

        // عرض آخر 10 تحذيرات فقط لتجنب تجاوز حدود ديسكورد
        const recentWarnings = warnings.slice(0, 10);
        
        let description = "";
        
        recentWarnings.forEach(warning => {
            const moderator = message.guild.members.cache.get(warning.moderatorID)?.user.tag || warning.moderatorID;
            const date = `<t:${Math.floor(warning.timestamp / 1000)}:R>`; // يظهر "قبل يومين"، "قبل ساعة"
            
            description += `**Case #${warning.caseID}**\n` +
                           `👮 **بواسطة:** ${moderator}\n` +
                           `📝 **السبب:** ${warning.reason}\n` +
                           `⏰ **الوقت:** ${date}\n` +
                           `───────────────\n`;
        });

        if (warnings.length > 10) {
            description += `*...و ${warnings.length - 10} تحذيرات أخرى أقدم.*`;
        }

        embed.setDescription(description);

        message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
};
