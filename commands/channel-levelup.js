const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// تم حذف SQlite، سنستخدم الاتصال الجاهز

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-قناة-اللفل')
        .setDescription('تحديد القناة التي سترسل فيها رسائل رفع المستوى (اللفل).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub
            .setName('افتراضي')
            .setDescription('إرسال رسالة اللفل في نفس القناة التي تمت الكتابة فيها.')
        )
        .addSubcommand(sub => sub
            .setName('تحديد-قناة')
            .setDescription('إرسال جميع رسائل اللفل في قناة واحدة محددة.')
            .addChannelOption(opt => 
                opt.setName('القناة')
                .setDescription('القناة المحددة لإرسال الرسائل فيها')
                .setRequired(true))
        ),

    name: 'channel-levelup',
    aliases: ['setchannel', 'channellevelup'],
    category: "Admin",
    description: "Set specific channel to send level up message",
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

        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; 
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const usage = "Require arguments: `Default`, `Channel ID or Mention Channel`\n> Default: Send message in the channel user leveled up in.\n> Channel ID or Mention Channel: Send message in the specific channel.";

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`You do not have permission to use this command!`);
        }

        let channelArg = null;
        let isDefault = false;

        if (isSlash) {
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'افتراضي') {
                isDefault = true;
            } else {
                channelArg = interaction.options.getChannel('القناة');
            }
        } else {
            if (!args.length) {
                return replyError(usage);
            }
            const arg = args[0];
            if (arg.toLowerCase() === 'default') {
                isDefault = true;
            } else {
                channelArg = message.guild.channels.cache.get(arg) || message.guild.channels.cache.find(c => c.name === arg.toLowerCase()) || message.mentions.channels.first();
                if (!channelArg) {
                    return replyError(usage);
                }
            }
        }

        if (isDefault) {
            sql.prepare("INSERT OR REPLACE INTO channel (guild, channel) VALUES (?, ?);").run(guild.id, "Default");
            return reply(`Level Up Channel has been set to Default Settings`);
        }

        if (channelArg) {
            const permissionFlags = channelArg.permissionsFor(guild.members.me);
            if(!permissionFlags.has(PermissionsBitField.Flags.SendMessages) || !permissionFlags.has(PermissionsBitField.Flags.ViewChannel) ) {
                return replyError(`I don't have permission to send messages in or view ${channelArg}!`);
            }
            sql.prepare("INSERT OR REPLACE INTO channel (guild, channel) VALUES (?, ?);").run(guild.id, channelArg.id);
            return reply(`Level Up Channel has been set to ${channelArg}`);
        }

        return replyError(usage);
    }
}