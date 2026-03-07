const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('🔓 يفتح القناة للكتابة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('القناة المراد فتحها')
                .setRequired(false)
        ),

    name: 'unlock',
    aliases: ['فتح', 'open'],
    description: "يفتح القناة المحددة أو الحالية.",
    category: "Moderation",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let member, targetChannel, replyFunc;

        if (isSlash) {
            member = interactionOrMessage.member;
            targetChannel = interactionOrMessage.options.getChannel('channel') || interactionOrMessage.channel;
            replyFunc = async (msg) => interactionOrMessage.reply(msg);
        } else {
            member = interactionOrMessage.member;
            targetChannel = interactionOrMessage.mentions.channels.first() || interactionOrMessage.channel;
            replyFunc = async (msg) => interactionOrMessage.reply(msg);
        }

        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return replyFunc({ content: "⛔️ **لا تملك صلاحية `Manage Channels`!**", ephemeral: true });
        }

        try {
            await targetChannel.permissionOverwrites.edit(interactionOrMessage.guild.roles.everyone, {
                SendMessages: null,
                SendMessagesInThreads: null
            });

            await replyFunc({ content: `تـم فـتـح ${targetChannel} <:0Pray:1437067281493524502>` });

        } catch (error) {
            console.error(error);
            await replyFunc({ content: "❌ **حدث خطأ أثناء الفتح.**", ephemeral: true });
        }
    }
};
