const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('كازينو')
        .setDescription('يحدد روم الكازينو (الذي تعمل فيه الأوامر الاقتصادية بدون بريفكس).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
                .setDescription('القناة الكتابية التي تريد تحديدها كـ "روم كازينو"')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)), // (يجبر المستخدم على اختيار قناة نصية فقط)

    name: 'set-casino-room',
    aliases: ['كازينو', 'تحديد-روم-الكازينو'],
    category: "Leveling", 
    description: 'يحدد روم الكازينو (الذي تعمل فيه الأوامر الاقتصادية بدون بريفكس).',

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

        if (!channel || channel.type !== ChannelType.GuildText) {
            return reply('**الاستخدام:** `-set-casino-room <#channel>`\n(قم بعمل منشن لروم *كتابي*).', true);
        }

        try {
            sql.prepare(`
                INSERT INTO settings (guild, casinoChannelID) 
                VALUES (@guild, @casinoChannelID) 
                ON CONFLICT(guild) DO UPDATE SET 
                casinoChannelID = excluded.casinoChannelID
            `).run({
                guild: guild.id,
                casinoChannelID: channel.id
            });

            return reply(`✅ | تم تحديد روم الكازينو بنجاح إلى: ${channel}.`);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};