const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'give-buff',
    aliases: ['addbuff'],
    category: "Leveling",
    description: "Gives a temporary XP buff to a user.",
    async execute(message, args) {
        // 1. لا ننشئ اتصالاً جديداً، بل نستخدم الاتصال الموجود في العميل
        const sql = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`You do not have permission to use this command!`);
        }

        const user = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const percent = parseInt(args[1]);
        const hours = parseInt(args[2]);

        if (!user || isNaN(percent) || isNaN(hours) || percent <= 0 || hours <= 0) {
            return message.reply("Usage: `-give-buff <@user> <percent> <duration_in_hours>`");
        }

        const expiresAt = Date.now() + (hours * 60 * 60 * 1000);

        // 2. نحسب المضاعف (Multiplier)
        const multiplier = percent / 100;

        try {
            // 3. نستخدم أمر INSERT الصحيح والكامل
            sql.prepare(
                "INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(message.guild.id, user.id, percent, expiresAt, 'xp', multiplier);

            return message.reply(`Successfully gave a **${percent}%** XP buff to ${user} for **${hours}** hours.`);

        } catch (error) {
            console.error("Error in give-buff:", error);
            // إذا استمر الخطأ "no such table" بعد هذا التعديل،
            // فهذا يعني أنك تحتاج فقط إلى إعادة تشغيل البوت
            if (error.code === 'SQLITE_ERROR' && error.message.includes('no such table')) {
                return message.reply("An error occurred. Please restart the bot to apply database updates.");
            }
            return message.reply("An error occurred while trying to add the buff.");
        }
    }
};