const { PermissionsBitField, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صلاحيات-الاوامر')
        .setDescription('يعرض قائمة بجميع الأوامر المسموحة وأماكنها.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    name: 'list-command-perms',
    aliases: ['صلاحيات-الاوامر'],
    category: "Leveling",
    description: 'يعرض قائمة بجميع الأوامر المسموحة وأماكنها.',

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
                // الرد يمكن أن يكون عاماً لأنه معلومات إدارية
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
            const permissions = sql.prepare("SELECT * FROM command_permissions WHERE guildID = ? ORDER BY channelID, commandName").all(guild.id);
            const settings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?").get(guild.id);

            let description = "**القنوات المسموحة (Whitelist):**\n";

            if (permissions.length > 0) {
                description += permissions.map(p => `• في <#${p.channelID}> ➔ مسموح أمر: \`${p.commandName}\``).join('\n');
            } else {
                description += "لم يتم تحديد أي صلاحيات (سيتم تجاهل الأعضاء العاديين).\n";
            }

            description += "\n**إعدادات خاصة:**\n";
            if (settings && settings.casinoChannelID) {
                description += `- **روم الكازينو (بدون بريفكس):** <#${settings.casinoChannelID}>`;
            } else {
                description += "- لم يتم تحديد روم كازينو.\n";
            }

            description += "\n\n*(ملاحظة: الإداريون يمكنهم استخدام الأوامر في كل مكان)*";

            const embed = new EmbedBuilder()
                .setTitle('⚙️ إعدادات صلاحيات الأوامر')
                .setColor('Blue')
                .setDescription(description);

            return reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            return reply({ content: '❌ | حدث خطأ أثناء جلب البيانات.', ephemeral: true });
        }
    }
};