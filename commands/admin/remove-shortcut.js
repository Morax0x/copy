const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('حذف-اختصار')
        .setDescription('يحذف اختصاراً من قناة معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
                .setDescription('القناة أو الكاتاغوري التي سيتم حذف الاختصار منها')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory))
        .addStringOption(option =>
            option.setName('الاختصار')
                .setDescription('الكلمة التي تريد حذفها')
                .setRequired(true)),

    name: 'remove-shortcut',
    aliases: ['حذف-اختصار'],
    category: "Leveling",
    description: 'يحذف اختصاراً من قناة معينة.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let channel, shortcutWord;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            channel = interaction.options.getChannel('القناة');
            shortcutWord = interaction.options.getString('الاختصار').toLowerCase();
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            channel = message.mentions.channels.first();
            shortcutWord = args[1]?.toLowerCase();
        }

        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', true);
        }

        if (!isSlash && (!channel || !shortcutWord)) {
            return reply('**الاستخدام:** `-remove-shortcut <#channel> <الكلمة>`');
        }

        try {
            const result = sql.prepare("DELETE FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?")
                             .run(guild.id, channel.id, shortcutWord);

            if (result.changes > 0) {
                return reply(`✅ | تم حذف اختصار \`${shortcutWord}\` من ${channel}.`);
            } else {
                return reply(`ℹ️ | لم يتم العثور على اختصار بهذا الاسم في تلك القناة.`, true);
            }

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};