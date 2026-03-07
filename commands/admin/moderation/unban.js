const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'unban',
    description: 'إلغاء حظر عضو',
    aliases: ['عفو', 'فك_حظر'],
    category: 'Admin',
    usage: 'unban <userID> [reason]',

    async execute(message, args) {
        const db = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

        const targetID = args[0];
        const reason = args.slice(1).join(" ") || "عفو إداري";

        if (!targetID) return message.reply('❓ **حط ايدي العضو المحظور.**');

        try {
            const user = await message.guild.members.unban(targetID, reason);

            message.reply(`✅ **تم فك الحظر عن:** \`${user.tag || targetID}\``);

            const lastCaseRes = await db.query("SELECT caseID FROM mod_cases WHERE guildID = $1 ORDER BY caseID DESC LIMIT 1", [message.guild.id]);
            let lastCase = lastCaseRes.rows[0];
            let newCaseID = lastCase ? parseInt(lastCase.caseid || lastCase.caseID) + 1 : 1;
            const uniqueID = `${message.guild.id}-${newCaseID}`;

            await db.query(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                         VALUES ($1, $2, $3, 'UNBAN', $4, $5, $6, $7)`, 
                         [uniqueID, message.guild.id, newCaseID, targetID, message.author.id, reason, Date.now()]);

            await sendModLog(message, user, reason, newCaseID, db);

        } catch (err) {
            return message.reply('❌ **الآيدي غلط أو العضو غير محظور.**');
        }
    }
};

async function sendModLog(message, user, reason, caseID, db) {
    const settingsRes = await db.query("SELECT modLogChannelID FROM settings WHERE guild = $1", [message.guild.id]);
    const settings = settingsRes.rows[0];
    
    if (settings && (settings.modlogchannelid || settings.modLogChannelID)) {
        const logChannel = message.guild.channels.cache.get(settings.modlogchannelid || settings.modLogChannelID);
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
