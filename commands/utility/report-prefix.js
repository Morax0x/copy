const { SlashCommandBuilder } = require("discord.js"); // (نحتاج هذا فقط لتعريف أنه هجين)
const { getReportSettings, hasReportPermission, processReportLogic, sendReportError } = require("../../handlers/report-handler.js");

module.exports = {
    // (هذا أمر بريفكس فقط، لذلك لا نحتاج data)
    name: 'بلاغ',
    aliases: ['report'],
    category: "Utility",
    description: "التبليغ عن عضو باستخدام أمر نصي.",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        if (isSlash) return; // هذا الأمر للبريفكس فقط

        const message = interactionOrMessage;
        const client = message.client;
        const sql = client.sql;

        const settings = getReportSettings(sql, message.guild.id);

        // (التحقق إذا كان الأمر في القناة الصحيحة)
        if (!settings.reportChannelID || message.channel.id !== settings.reportChannelID) {
            return; // تجاهل الأمر إذا لم يكن في القناة المخصصة
        }

        // (التحقق من الصلاحيات)
        if (!hasReportPermission(sql, message.member)) {
            await message.delete().catch(() => {});
            return sendReportError(message.author, "❖ ليس لـديـك صلاحيـات التـبليـغ", "ليس لديك صلاحيات التبليغ. يرجى رفع مستواك في السيرفر لتقديم البلاغات.", true);
        }

        const targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const reason = args.slice(1).join(' ');

        if (!targetMember || !reason) {
            const description = "- طـريـقـة الـتـبـليـغ هـي:\n\n`بلاغ (@منشن او ID الي تبلغ عليه) سبب البلاغ`\n\n- بسبب جهلك بطريقة تقديم البلاغ تم حرمانك من تقديم البلاغات لمدة ساعتين <a:6fuckyou:1401255926807400559>";
            return sendReportError(message, "✶ تـم تقـديـم الـبلاغ بطـريقـة غـير صحـيحـة !", description);
        }

        // (استدعاء المنطق الرئيسي)
        await processReportLogic(client, message, targetMember, reason, null);
    }
};