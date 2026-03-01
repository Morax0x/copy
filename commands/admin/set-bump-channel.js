const { PermissionsBitField, SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-قناة-البومب')
        .setDescription('يحدد القناة التي يتم فيها تتبع رسائل Disboard (البومب).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
            .setDescription('القناة المخصصة للبومب')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)), // (يضمن أنها قناة نصية فقط)

    name: 'set-bump-channel',
    aliases: ['setbump'],
    category: "Admin",
    description: "يحدد القناة التي يتم فيها تتبع رسائل Disboard (البومب).",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            if (isSlash) return interaction.editReply({ content, ephemeral: true });
            return message.reply({ content, ephemeral: true });
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        let channel;
        if (isSlash) {
            channel = interaction.options.getChannel('القناة');
        } else {
            channel = message.mentions.channels.first() || guild.channels.cache.get(args[0]);
            if (!channel) {
                return replyError("الاستخدام: `-setbump <#channel>`");
            }
        }

        if (channel.type !== ChannelType.GuildText) {
            return replyError("الرجاء تحديد قناة نصية فقط.");
        }

        try {
            sql.prepare("INSERT INTO settings (guild, bumpChannelID) VALUES (?, ?) ON CONFLICT(guild) DO UPDATE SET bumpChannelID = excluded.bumpChannelID")
               .run(guild.id, channel.id);

            return reply(`✅ تم تحديد قناة البومب (Disboard) بنجاح إلى ${channel}.`);
        } catch (err) {
            console.error("Set Bump Channel Error:", err);
            return replyError("حدث خطأ أثناء حفظ الإعدادات.");
        }
    }
};