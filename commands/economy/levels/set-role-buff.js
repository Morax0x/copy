const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'set-role-buff',
    aliases: ['setrolebuff', 'srb'],
    category: "Leveling",
    description: "Sets a permanent XP buff/debuff for a specific role.",
    async execute(message, args) {
        const sql = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`You do not have permission to use this command!`);
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
        const percent = parseInt(args[1]);

        if (!role) {
            return message.reply("Please mention a role or provide a role ID. `(Usage: -srb <@role> <percent>)`");
        }

       
        if (isNaN(percent)) {
            return message.reply("Please provide a valid percentage number (e.g., `50` or `-25`). `(Usage: -srb <@role> <percent>)`");
        }
        // --- نهاية التعديل ---

        try {
            if (percent === 0) {
                sql.prepare("DELETE FROM role_buffs WHERE roleID = ?").run(role.id);
                return message.reply(`XP buff/debuff for ${role} has been removed.`);
            } else {
                sql.prepare("INSERT OR REPLACE INTO role_buffs (guildID, roleID, buffPercent) VALUES (?, ?, ?)")
                    .run(message.guild.id, role.id, percent);

                const action = percent > 0 ? "buff" : "debuff";
                return message.reply(`XP ${action} for ${role} has been set to **${percent}%**.`);
            }
        } catch (error) {
            console.error("Error in set-role-buff:", error);
            return message.reply("An error occurred. Make sure the database is set up correctly.");
        }
    }
};