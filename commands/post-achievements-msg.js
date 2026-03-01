const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// ( 1 ) تم حذف السطرين الخاصين بـ new SQLite لأن هذا الكوماند لا يحتاجها

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('نشر-لوحة-الانجازات')
        .setDescription('ينشر رسالة تفاعلية ثابتة لصفحة المهام والإنجازات.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    // ---------------------------------

    name: 'post-achievements-msg',
    aliases: ['postach', 'post-quests'],
    category: "Admin",
    description: 'ينشر رسالة تفاعلية ثابتة لصفحة المهام والإنجازات في القناة الحالية.',

    async execute(interactionOrMessage, args) {

        // --- ( 3 ) إضافة معالج الأوامر الهجينة ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
        }

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };
        // ------------------------------------

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError("❌ ليس لديك صلاحيات إدارية لاستخدام هذا الأمر.");
        }

        // 1. بناء رسالة التعليمات (نفس الكود الأصلي)
        const initialEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🏆 لوحة المهام والإنجازات 🏆')
            .setDescription('اضغط على أحد الأزرار أدناه لعرض التقدم الخاص بك في المهام اليومية، الأسبوعية، أو الإنجازات الدائمة (سيظهر الرد لك فقط).')
            .addFields(
                { name: '🗓️ المهام اليومية', value: 'تُجدد يومياً في الساعة 00:00 بتوقيت الخادم.', inline: true },
                { name: '📅 المهام الأسبوعية', value: 'تُجدد كل يوم اثنين في الساعة 00:00 بتوقيت الخادم.', inline: true },
                { name: '✨ الإنجازات الدائمة', value: 'تُمنح لمرة واحدة، ولا تُجدد أبداً.', inline: true }
            )
            .setFooter({ text: 'اضغط على الزر المطلوب لعرض تقدمك.' });

        // 2. بناء الأزرار (نفس الكود الأصلي)
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('quests_daily_static').setLabel('المهام اليومية').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('quests_weekly_static').setLabel('المهام الأسبوعية').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('quests_achievements_static').setLabel('الإنجازات الدائمة').setStyle(ButtonStyle.Primary)
        );

        try {
            // ( 4 ) إرسال الرسالة في القناة الحالية (باستخدام القناة الموحدة)
            await channel.send({ embeds: [initialEmbed], components: [buttons] });

            // ( 5 ) التعامل مع رسالة الأمر الأصلية
            if (isSlash) {
                // إذا كان سلاش، أرسل رد خاص
                await interaction.editReply({ content: '✅ تم نشر لوحة الإنجازات بنجاح.', ephemeral: true });
            } else {
                // إذا كان بريفكس، احذف رسالة الأمر (مثل الكود الأصلي)
                await message.delete().catch(() => null); 
            }

        } catch (error) {
            console.error("خطأ في نشر رسالة الإنجازات:", error);
            await replyError("❌ حدث خطأ أثناء نشر الرسالة. تأكد من صلاحيات البوت.");
        }
    }
};