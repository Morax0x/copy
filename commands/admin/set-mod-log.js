const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'setmodlog',
    description: 'تعيين قناة سجلات الإشراف',
    category: 'Admin',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('ليس لديك صلاحية.');
        
        const channel = message.mentions.channels.first() || message.channel;
        const sql = message.client.sql;
        
        sql.prepare("UPDATE settings SET modLogChannelID = ? WHERE guild = ?").run(channel.id, message.guild.id);
        
        message.reply(`✅ **تم تعيين قناة سجلات الإشراف إلى:** ${channel}`);
    }
};
