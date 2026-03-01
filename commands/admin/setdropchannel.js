const { PermissionsBitField, EmbedBuilder, ChannelType, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('دروب')
        .setDescription('تعيين القناة التي ستُرسل فيها القيفاوايات المفاجئة (Drops)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
                .setDescription('القناة النصية التي تريد إرسال القيفاوايات إليها')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)),

    name: 'setdropchannel',
    aliases: ['setgachannel', 'تعيين-قناة-المفاجآت'],
    description: 'تعيين القناة التي ستُرسل فيها القيفاوايات المفاجئة (Drops)',
    category: "Settings",
    permissions: ['ManageGuild'],

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let channel;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            channel = interaction.options.getChannel('القناة');
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.reply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply({ content: '❌ ليس لديك صلاحية `إدارة السيرفر` لاستخدام هذا الأمر!', ephemeral: true });
        }

        if (!channel || channel.type !== ChannelType.GuildText) {
            return reply({ content: '❌ يجب تحديد قناة نصية صالحة.', ephemeral: true });
        }

        const botPerms = channel.permissionsFor(guild.members.me);
        if (!botPerms.has(PermissionsBitField.Flags.SendMessages) || !botPerms.has(PermissionsBitField.Flags.EmbedLinks)) {
            return reply({ content: '❌ ليس لدي صلاحية `Send Messages` و `Embed Links` في هذه القناة!', ephemeral: true });
        }

        try {
            const stmt = sql.prepare("UPDATE settings SET dropGiveawayChannelID = ? WHERE guild = ?");
            stmt.run(channel.id, guild.id);

            const embed = new EmbedBuilder()
                .setColor(0x57F287) // أخضر
                .setTitle('✅ تم تعيين قناة القيفاوايات المفاجئة')
                .setDescription(`سيتم إرسال القيفاوايات المفاجئة (Drops) تلقائياً في ${channel} عند تفاعل الشات.`);

            await reply({ embeds: [embed] });

        } catch (err) {
            console.error("Error in setdropchannel:", err);
            await reply({ content: "❌ حدث خطأ أثناء محاولة حفظ الإعداد.", ephemeral: true });
        }
    }
};