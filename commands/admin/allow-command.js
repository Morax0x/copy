const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سماح-امر')
        .setDescription('يسمح بتشغيل أمر معين في قناة أو كاتاغوري معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('الأمر')
                .setDescription('اسم الأمر (البرمجي) الذي تريد السماح به')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('القناة')
                .setDescription('القناة أو الكاتاغوري للسماح بالأمر فيها')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)),

    name: 'allow-command',
    aliases: ['سماح-امر'],
    category: "Leveling",
    description: 'يسمح بتشغيل أمر معين في قناة أو كاتاغوري معينة.',

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
            return reply('**الاستخدام:** `-allow-command <command_name> <#channel/category>`\n**مثال:** `-allow-command profile #الرئيسية`');
        }

        if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildCategory) {
             return reply('❌ | يرجى عمل منشن لروم كتابي أو كاتاغوري.', true);
        }

        const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
        if (!command) {
            return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`, true);
        }

        try {
            sql.prepare("INSERT OR IGNORE INTO command_permissions (guildID, channelID, commandName) VALUES (?, ?, ?)")
               .run(guild.id, channel.id, command.name);

            return reply(`✅ | تم السماح لأمر \`${command.name}\` بالعمل في: ${channel}.`);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};