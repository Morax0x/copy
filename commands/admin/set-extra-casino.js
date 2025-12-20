const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('كازينو-اضافي')
        .setDescription('يحدد روم كازينو إضافي (للعب فقط بدون إشعارات).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
                .setDescription('القناة الإضافية للكازينو')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)), 

    name: 'set-extra-casino',
    aliases: ['كازينو2', 'تحديد-كازينو-اضافي'],
    category: "Leveling", 
    description: 'يحدد روم كازينو إضافي (تعمل فيه الأوامر بدون بريفكس).',

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
            if (isSlash) return interaction.reply({ content, ephemeral });
            else return message.reply(content);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', true);
        }

        if (!channel || channel.type !== ChannelType.GuildText) {
            return reply('**الاستخدام:** `-set-extra-casino <#channel>`', true);
        }

        try {
            // التعديل هنا: يتم الحفظ في casinoChannelID2
            sql.prepare(`
                INSERT INTO settings (guild, casinoChannelID2) 
                VALUES (@guild, @casinoChannelID2) 
                ON CONFLICT(guild) DO UPDATE SET 
                casinoChannelID2 = excluded.casinoChannelID2
            `).run({
                guild: guild.id,
                casinoChannelID2: channel.id
            });

            return reply(`✅ | تم تحديد روم الكازينو **الإضافي** بنجاح: ${channel}\n(ستعمل فيه الأوامر بدون بريفكس، لكن الإشعارات ستبقى في الروم الأساسي).`);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};
