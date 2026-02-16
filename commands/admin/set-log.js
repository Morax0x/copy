const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'set-log',
    description: 'تحديد قناة سجلات الاقتصاد.',
    category: 'Admin',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("🚫");

        const channel = message.mentions.channels.first() || message.channel;
        const sql = message.client.sql;

        // 1. تأكد من وجود السيرفر في الجدول أولاً
        sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(message.guild.id);

        // 2. الآن قم بالتحديث
        sql.prepare("UPDATE settings SET transactionLogChannelID = ? WHERE guild = ?").run(channel.id, message.guild.id);

        message.reply(`✅ **تم تعيين قناة سجلات الاقتصاد:** ${channel}`);
    }
};
