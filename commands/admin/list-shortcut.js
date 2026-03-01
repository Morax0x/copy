const { PermissionsBitField, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('الاختصارات')
        .setDescription('يعرض قائمة بجميع الاختصارات المفعلة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    name: 'list-shortcuts',
    aliases: ['الاختصارات'],
    category: "Leveling",
    description: 'يعرض قائمة بجميع الاختصارات المفعلة.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.reply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const errorPayload = { content: '❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', ephemeral: true };
            if (isSlash) {
                return interaction.reply(errorPayload);
            } else {
                return message.reply(errorPayload.content);
            }
        }

        try {
            const shortcuts = sql.prepare("SELECT * FROM command_shortcuts WHERE guildID = ?").all(guild.id);

            if (shortcuts.length === 0) {
                return reply({ content: "ℹ️ | لا توجد أي اختصارات مفعلة في هذا السيرفر.", ephemeral: true });
            }

            const description = shortcuts
                .map(s => `• في <#${s.channelID}>: \`${s.shortcutWord}\` ➔ \`-${s.commandName}\``)
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle('⚙️ قائمة الاختصارات المفعلة')
                .setColor('Blue')
                .setDescription(description);

            return reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            return reply({ content: '❌ | حدث خطأ أثناء جلب البيانات.', ephemeral: true });
        }
    }
};