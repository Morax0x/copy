const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
// تم حذف السطرين الخاصين بـ new SQlite

module.exports = {
    data: new SlashCommandBuilder()
        .setName('القائمة-السوداء-للفل')
        .setDescription('إدارة القائمة السوداء لنقاط الخبرة (XP).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub
            .setName('عرض')
            .setDescription('عرض جميع المستخدمين والقنوات في القائمة السوداء.')
            .addIntegerOption(opt => opt.setName('صفحة').setDescription('رقم الصفحة').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('اضافة-مستخدم')
            .setDescription('إضافة مستخدم إلى القائمة السوداء (يمنعه من كسب XP).')
            .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المراد إضافته').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('ازالة-مستخدم')
            .setDescription('إزالة مستخدم من القائمة السوداء.')
            .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المراد إزالته').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('اضافة-قناة')
            .setDescription('إضافة قناة إلى القائمة السوداء (يمنع كسب XP فيها).')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة المراد إضافتها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('ازالة-قناة')
            .setDescription('إزالة قناة من القائمة السوداء.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة المراد إزالتها').setRequired(true))
        ),

    name: 'blacklist',
    aliases: ['blacklist'],
    category: "Admin", // تم نقله إلى مجلد الادمن
    description: "Blacklist user/channel from leveling up/gaining XP...",
    cooldown: 3,
    async execute (interactionOrMessage, args) {

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

        // --- ( 🌟 تم التصحيح هنا 🌟 ) ---
        // استخدام اتصال قاعدة البيانات الجاهز من البوت
        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; // جعل الردود الناجحة عامة
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`You do not have permission to use this command!`);
        }

        // --- توحيد المدخلات ---
        let subcommand;
        let targetUser, targetChannel, page = 1;

        if (isSlash) {
            subcommand = interaction.options.getSubcommand(); // 'عرض', 'اضافة-مستخدم', etc.
            if (subcommand === 'اضافة-مستخدم' || subcommand === 'ازالة-مستخدم') {
                targetUser = interaction.options.getMember('المستخدم');
            }
            if (subcommand === 'اضافة-قناة' || subcommand === 'ازالة-قناة') {
                targetChannel = interaction.options.getChannel('القناة');
            }
            if (subcommand === 'عرض') {
                page = interaction.options.getInteger('صفحة') || 1;
            }
        } else {
            const type = args[0]?.toLowerCase(); // 'user', 'channel', 'list'
            const action = args[2]?.toLowerCase(); // 'remove' or undefined

            if (type === 'list') {
                subcommand = 'عرض';
                page = parseInt(args[1]) || 1;
            } else if (type === 'user') {
                targetUser = message.mentions.members.first() || guild.members.cache.get(args[1]) || guild.members.cache.find(x => x.user.username.toLowerCase() === args.slice(1).join(" ") || x.user.username === args[1]);
                subcommand = (action === 'remove') ? 'ازالة-مستخدم' : 'اضافة-مستخدم';
            } else if (type === 'channel') {
                targetChannel = guild.channels.cache.get(args[1]) || guild.channels.cache.find(c => c.name === args[1].toLowerCase()) || message.mentions.channels.first();
                subcommand = (action === 'remove') ? 'ازالة-قناة' : 'اضافة-قناة';
            } else {
                return replyError('Require arguments: `User`, `Channel`, or `List`');
            }
        }

        // --- المنطق الموحد ---
        const ifExists = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);

        switch (subcommand) {
            case 'عرض':
                const lists = sql.prepare("SELECT * FROM blacklistTable WHERE guild = ?").all(guild.id);
                if (!lists.length) {
                    return reply('The blacklist is currently empty.');
                }

                const itemsPerPage = 10;
                const totalPages = Math.ceil(lists.length / itemsPerPage);
                if (page > totalPages || page < 1) {
                    return replyError(`Invalid page number! There are only ${totalPages} pages`);
                }

                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = page * itemsPerPage;
                const pageItems = lists.slice(startIndex, endIndex);

                const description = pageItems.map((item, index) => {
                    const identifier = item.type === "User" ? `<@${item.typeId}>` : `<#${item.typeId}>`;
                    return `**${startIndex + index + 1}.** ${item.type} - ${identifier}`;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`🚫 XP Blacklist (Page ${page}/${totalPages})`)
                    .setDescription(description)
                    .setColor('Red')
                    .setFooter({ text: `Total: ${lists.length} items` });

                return reply({ embeds: [embed], ephemeral: false });

            case 'اضافة-مستخدم':
                if (!targetUser) return replyError('Cannot find user!');
                const userId = `${guild.id}-${targetUser.id}`;
                if (ifExists.get(userId)) return replyError('This user is already blacklisted!');

                sql.prepare("INSERT OR REPLACE INTO blacklistTable (guild, typeId, type, id) VALUES (?, ?, ?, ?);").run(guild.id, targetUser.id, "User", userId);
                return reply(`User ${targetUser} has been blacklisted!`);

            case 'ازالة-مستخدم':
                if (!targetUser) return replyError('Cannot find user!');
                const removeUserId = `${guild.id}-${targetUser.id}`;
                if (!ifExists.get(removeUserId)) return replyError('This user is not blacklisted!');

                sql.prepare("DELETE FROM blacklistTable WHERE id = ?").run(removeUserId);
                return reply(`Successfully removed user ${targetUser} from blacklist.`);

            case 'اضافة-قناة':
                if (!targetChannel) return replyError('Cannot find channel!');
                const channelId = `${guild.id}-${targetChannel.id}`;
                if (ifExists.get(channelId)) return replyError('This channel is already blacklisted!');

                sql.prepare("INSERT OR REPLACE INTO blacklistTable (guild, typeId, type, id) VALUES (?, ?, ?, ?);").run(guild.id, targetChannel.id, "Channel", channelId);
                return reply(`Channel ${targetChannel} has been blacklisted!`);

            case 'ازالة-قناة':
                if (!targetChannel) return replyError('Cannot find channel!');
                const removeChannelId = `${guild.id}-${targetChannel.id}`;
                if (!ifExists.get(removeChannelId)) {
                    // --- ( 🌟 تم التصحيح هنا 🌟 ) ---
                    return replyError('This channel is not blacklisted!'); 
                }

                sql.prepare("DELETE FROM blacklistTable WHERE id = ?").run(removeChannelId);
                return reply(`Successfully removed channel ${targetChannel} from blacklist.`);

            default:
                return replyError('Invalid command structure. Use `blacklist <user|channel|list> ...`');
        }
    }
}