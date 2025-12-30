const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'warn',
    description: 'توجيه تحذير رسمي لعضو',
    aliases: ['ت', 'تحذير', 'انذار'],
    category: 'Admin',
    usage: 'warn <@user> [reason]',
    
    async execute(message, args) {
        const sql = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;

        const targetArg = args[0];
        if (!targetArg) return message.reply('❓ **الرجاء تحديد العضـو.**');
        
        let targetMember;
        try {
            targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
        } catch (err) {
            return message.reply('❌ **لم يتم العثور على العضو.**');
        }

        if (targetMember.user.bot) return message.reply('❌ **لا يمكنك تحذير البوتات.**');
        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك تحذير نفسك.**');
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك تحذير شخص رتبته أعلى منك.**');
        }

        const reason = args.slice(1).join(" ") || "مخالفة القوانين";
        let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
        let newCaseID = lastCase ? lastCase.caseID + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;

        // إشعار الخاص (معدل ليكون بسطر واحد)
        let dmSent = false;
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✥ تـلـقـيت تـحذيـر')
                .setColor(Colors.Red)
                // استخدام Description لدمج العنوان والقيمة
                .setDescription(`**✶ السبب:** ${reason}\n**✶ السيرفر:** ${message.guild.name}\n**✶ بواسـطـة:** <@${message.author.id}>`)
                .setImage('https://i.postimg.cc/VkD37Gqk/a5d06761d4d3fed9158d034359c934b4.gif');

            await targetMember.send({ embeds: [dmEmbed] });
            dmSent = true;
        } catch (e) { dmSent = false; }

        sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES (?, ?, ?, 'WARN', ?, ?, ?, ?)`)
            .run(uniqueID, message.guild.id, newCaseID, targetMember.id, message.author.id, reason, Date.now());

        const successEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setDescription(`⚠️ **تم تحذير ${targetMember.user.tag}**\n📁 **القضية رقم:** \`#${newCaseID}\`\n📝 **السبب:** ${reason}`)
            .setFooter({ text: dmSent ? 'تم إشعاره بالخاص' : 'لم يتم إشعاره (الخاص مغلق)' });
        
        message.reply({ embeds: [successEmbed], allowedMentions: { repliedUser: false } });

        sendModLog(message, targetMember, 'WARN', reason, newCaseID);
    }
};

function sendModLog(message, targetMember, type, reason, caseID) {
    const sql = message.client.sql;
    const settings = sql.prepare("SELECT modLogChannelID FROM settings WHERE guild = ?").get(message.guild.id);
    if (settings && settings.modLogChannelID) {
        const logChannel = message.guild.channels.cache.get(settings.modLogChannelID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(`⚠️ New Warning | Case #${caseID}`)
                .setColor(Colors.Yellow)
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: '👤 العضو', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
                    { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: '📝 السبب', value: reason },
                    { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                )
                .setFooter({ text: `EMorax Security System` });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
}
