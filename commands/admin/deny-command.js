const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('منع-امر')
        .setDescription('يمنع تشغيل أمر معين في قناة أو كاتاغوري معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('الأمر')
                .setDescription('اسم الأمر (البرمجي) الذي تريد منعه')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('القناة')
                .setDescription('القناة أو الكاتاغوري لمنع الأمر فيها')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)),

    name: 'deny-command',
    aliases: ['منع-امر'],
    category: "Leveling",
    description: 'يمنع تشغيل أمر معين في قناة أو كاتاغوري معينة.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let commandName, channel;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            commandName = interaction.options.getString('الأمر').toLowerCase();
            channel = interaction.options.getChannel('القناة');
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            commandName = args[0]?.toLowerCase();
            channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]) || message.channel;
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

        if (!isSlash && (!commandName || !channel)) {
            return reply('**الاستخدام:** `-deny-command <command_name> <#channel/category>`');
        }

        const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
        if (!command) {
            return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`, true);
        }

        try {
            const result = sql.prepare("DELETE FROM command_permissions WHERE guildID = ? AND channelID = ? AND commandName = ?")
                             .run(guild.id, channel.id, command.name);

            if (result.changes > 0) {
                return reply(`✅ | تم إزالة أمر \`${command.name}\` من ${channel}.`);
            } else {
                return reply(`ℹ️ | أمر \`${command.name}\` لم يكن مسموحاً في ${channel} أصلاً.`);
            }

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};