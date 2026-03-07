const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    // --- إعدادات Slash Command ---
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('🔒 يقفل القناة (يمنع الكل من الكتابة).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('القناة المراد قفلها')
                .setRequired(false)
        ),

    // --- إعدادات Prefix Command ---
    name: 'lock',
    aliases: ['قفل', 'close'],
    description: "يقفل القناة المحددة أو الحالية.",
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
                SendMessages: false,
                SendMessagesInThreads: false
            });

            await replyFunc({ content: `تـم قـفـل ${targetChannel} <a:MugiStronk:1438795606872166462>` });

        } catch (error) {
            console.error("[Lock Command Error]:", error);
            await replyFunc({ content: "❌ **حدث خطأ أثناء القفل (تأكد من أن رتبة البوت أعلى من رتبة القناة).**", ephemeral: true });
        }
    }
};
