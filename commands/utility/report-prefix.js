const { SlashCommandBuilder } = require("discord.js");
const { getReportSettings, hasReportPermission, processReportLogic, sendReportError } = require("../../handlers/report-handler.js");

module.exports = {
    name: 'بلاغ',
    aliases: ['report'],
    category: "Utility",
    description: "التبليغ عن عضو باستخدام أمر نصي.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        if (isSlash) return;

        const message = interactionOrMessage;
        const client = message.client;
        const db = client.sql;

        const settings = await getReportSettings(db, message.guild.id);
        const reportChannel = settings ? (settings.reportchannelid || settings.reportChannelID) : null;

        if (!reportChannel || message.channel.id !== reportChannel) {
            return;
        }

        const hasPerm = await hasReportPermission(db, message.member);
        if (!hasPerm) {
            await message.delete().catch(() => {});
            return sendReportError(message.author, "❖ ليس لـديـك صلاحيـات التـبليـغ", "ليس لديك صلاحيات التبليغ. يرجى رفع مستواك في السيرفر لتقديم البلاغات.", true);
        }

        const targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const reason = args.slice(1).join(' ');

        if (!targetMember || !reason) {
            const description = "- طـريـقـة الـتـبـليـغ هـي:\n\n`بلاغ (@منشن او ID الي تبلغ عليه) سبب البلاغ`\n\n- بسبب جهلك بطريقة تقديم البلاغ تم حرمانك من تقديم البلاغات لمدة ساعتين <a:6fuckyou:1401255926807400559>";
            return sendReportError(message, "✶ تـم تقـديـم الـبلاغ بطـريقـة غـير صحـيحـة !", description);
        }

        await processReportLogic(client, message, targetMember, reason, null);
    }
};
