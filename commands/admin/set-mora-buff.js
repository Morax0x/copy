const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تعيين-تعزيز-الرول')
        .setDescription('يحدد تعزيز أو إضعاف مورا دائم لرتبة معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addRoleOption(option =>
            option.setName('الرتبة')
            .setDescription('الرتبة التي تريد تطبيق التعزيز عليها')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('النسبة')
            .setDescription('النسبة المئوية (مثل 50 أو -25). 0 لإلغاء التعزيز.')
            .setRequired(true)),

    name: 'set-mora-buff',
    aliases: ['setmorabuff', 'smb'],
    category: "Admin",
    description: "Sets a permanent Mora buff or debuff for a specific role.",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;
        let role, percent;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            role = interaction.options.getRole('الرتبة');
            percent = interaction.options.getInteger('النسبة');
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            percent = parseInt(args[1]);
        }

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; // جعل الردود الناجحة عامة

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const sql = client.sql;

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`You do not have permission to use this command!`);
        }

        if (!role) {
            return replyError("Please mention a role or provide a role ID. `(Usage: /تعيين-تعزيز-الرول <@role> <percent>)`");
        }

        if (isNaN(percent)) {
            return replyError("Please provide a valid percentage number (e.g., `50` or `-25`). `(Usage: /تعيين-تعزيز-الرول <@role> <percent>)`");
        }

        try {
            if (percent === 0) {
                sql.prepare("DELETE FROM role_mora_buffs WHERE roleID = ?").run(role.id);
                return reply(`Mora buff/debuff for ${role} has been removed.`);
            } else {
                sql.prepare("INSERT OR REPLACE INTO role_mora_buffs (guildID, roleID, buffPercent) VALUES (?, ?, ?)")
                    .run(guild.id, role.id, percent);

                const action = percent > 0 ? "buff" : "debuff";
                return reply(`Mora ${action} for ${role} has been set to **${percent}%**.`);
            }
        } catch (error) {
            console.error("Error in set-mora-buff:", error);
            return replyError("An error occurred. Make sure the database is set up correctly.");
        }
    }
};