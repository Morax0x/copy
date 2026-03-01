const { SlashCommandBuilder, ChannelType, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ستريك-ميديا')
        .setDescription('إدارة رومات ستريك الميديا')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('اضافة')
                .setDescription('إضافة قناة إلى رومات ستريك الميديا')
                .addChannelOption(option => 
                    option.setName('القناة')
                        .setDescription('القناة التي تريد إضافتها')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('حذف')
                .setDescription('إزالة قناة من رومات ستريك الميديا')
                .addChannelOption(option =>
                    option.setName('القناة')
                        .setDescription('القناة التي تريد إزالتها')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('قائمة')
                .setDescription('عرض جميع رومات ستريك الميديا المسجلة')),

    name: 'set-media-streak',
    description: 'إدارة رومات ستريك الميديا',
    aliases: ['ستريك-ميديا', 'ميديا-ستريك', 'set-media', 'روم-الميديا'],
    category: 'Admin',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let subcommand, channel;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            subcommand = interaction.options.getSubcommand();
            channel = interaction.options.getChannel('القناة'); // قد يكون null إذا كان الأمر 'قائمة'
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            subcommand = args[0] ? args[0].toLowerCase() : null;
            channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.reply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return reply({ content: "❌ ليس لديك صلاحيات لتنفيذ هذا الأمر.", ephemeral: true });
        }

        const embed = new EmbedBuilder().setColor(Colors.Green).setTimestamp();

        try {
            if (subcommand === 'add' || subcommand === 'اضافة' || subcommand === 'إضافة') {
                if (!channel) {
                    embed.setColor(Colors.Red).setDescription(`❌ يجب منشن الروم أو وضع الـ ID.\n**الاستخدام:** \`-set-media-streak add #channel\``);
                    return reply({ embeds: [embed], ephemeral: true });
                }

                const existing = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(guild.id, channel.id);
                if (existing) {
                    embed.setColor(Colors.Red).setDescription(`❌ روم ${channel} مضاف مسبقاً.`);
                    return reply({ embeds: [embed], ephemeral: true });
                }
                sql.prepare("INSERT INTO media_streak_channels (guildID, channelID) VALUES (?, ?)")
                   .run(guild.id, channel.id);
                embed.setDescription(`✅ تم إضافة روم ${channel} إلى رومات ستريك الميديا.`);
                await reply({ embeds: [embed] });

            } else if (subcommand === 'remove' || subcommand === 'حذف') {
                if (!channel) {
                    embed.setColor(Colors.Red).setDescription(`❌ يجب منشن الروم أو وضع الـ ID.\n**الاستخدام:** \`-set-media-streak remove #channel\``);
                    return reply({ embeds: [embed], ephemeral: true });
                }

                const existing = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(guild.id, channel.id);
                if (!existing) {
                    embed.setColor(Colors.Red).setDescription(`❌ روم ${channel} غير موجود في القائمة أصلاً.`);
                    return reply({ embeds: [embed], ephemeral: true });
                }
                sql.prepare("DELETE FROM media_streak_channels WHERE guildID = ? AND channelID = ?")
                   .run(guild.id, channel.id);
                embed.setDescription(`✅ تم إزالة روم ${channel} من رومات ستريك الميديا.`);
                await reply({ embeds: [embed] });

            } else if (subcommand === 'list' || subcommand === 'قائمة') {
                const channels = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ?").all(guild.id);
                if (channels.length === 0) {
                    embed.setColor(Colors.Yellow).setDescription("ℹ️ لا توجد أي رومات مخصصة لستريك الميديا حالياً.");
                    return reply({ embeds: [embed] });
                }
                const channelList = channels.map(c => `<#${c.channelID}>`).join('\n');
                embed.setTitle('📸 رومات ستريك الميديا المسجلة').setDescription(channelList);
                await reply({ embeds: [embed] });

            } else {
                embed.setColor(Colors.Red).setDescription(
                    "❌ أمر غير صحيح. الاستخدام:\n\n" +
                    "`/ستريك-ميديا اضافة` [القناة]\n" +
                    "`/ستريك-ميديا حذف` [القناة]\n" +
                    "`/ستريك-ميديا قائمة`\n\n" +
                    "**أو أوامر البريفكس:**\n" +
                    "`-ستريك-ميديا اضافة #channel`\n" +
                    "`-ستريك-ميديا حذف #channel`\n" +
                    "`-ستريك-ميديا قائمة`"
                );
                await reply({ embeds: [embed], ephemeral: true });
            }
        } catch (err) {
            console.error("Error in /set-media-streak:", err);
            await reply({ content: "حدث خطأ أثناء تنفيذ الأمر.", ephemeral: true });
        }
    },
};