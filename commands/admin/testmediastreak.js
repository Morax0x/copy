const { PermissionsBitField, EmbedBuilder, SlashCommandBuilder, ChannelType, Colors } = require("discord.js");
const { handleMediaStreakMessage, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate } = require('../../streak-handler.js');

function createFakeMessage(client, targetMember, interactionOrMessage, isSlash) {
    const originalChannel = interactionOrMessage.channel;

    return {
        client: client,
        guild: targetMember.guild,
        author: targetMember.user, 
        member: targetMember,     

        react: (emoji) => {
            if (!isSlash) {
                return interactionOrMessage.react(emoji);
            }
        },
        reply: (options) => {
            return originalChannel.send(options);
        },
        channel: originalChannel 
    };
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('تجربة-ميديا-ستريك')
        .setDescription('لاختبار سيناريوهات ستريك الميديا (للمالك فقط)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub =>
            sub.setName('new')
                .setDescription('محاكاة ستريك جديد (أول رسالة)')
                .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المستهدف (افتراضي: أنت)')))
        .addSubcommand(sub =>
            sub.setName('continue')
                .setDescription('محاكاة استمرار ستريك (رسالة في اليوم التالي)')
                .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المستهدف (افتراضي: أنت)')))
        .addSubcommand(sub =>
            sub.setName('check')
                .setDescription('تشغيل الفحص اليومي للستريك يدوياً'))
        .addSubcommand(sub =>
            sub.setName('lose')
                .setDescription('محاكاة خسارة ستريك (مرور 3 أيام)')
                .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المستهدف (افتراضي: أنت)')))
        .addSubcommand(sub =>
            sub.setName('grace')
                .setDescription('محاكاة استهلاك الدرع المجاني (مرور يومين)')
                .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المستهدف (افتراضي: أنت)')))
        .addSubcommand(sub =>
            sub.setName('item')
                .setDescription('محاكاة استهلاك درع المتجر (مرور يومين)')
                .addUserOption(opt => opt.setName('المستخدم').setDescription('المستخدم المستهدف (افتراضي: أنت)')))
        .addSubcommand(sub =>
            sub.setName('reminder')
                .setDescription('محاكاة إرسال رسالة التذكير (3 العصر)'))
        .addSubcommand(sub =>
            sub.setName('update')
                .setDescription('محاكاة إرسال التقرير اليومي (12 الليل)')),

    name: 'testmediastreak',
    aliases: ['testmedia'],
    description: 'لاختبار سيناريوهات ستريك الميديا (للمالك فقط)',
    category: "Admin",
    permissions: ['Administrator'],

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let action, targetMember;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            action = interaction.options.getSubcommand();
            const targetUser = interaction.options.getUser('المستخدم') || interaction.user;
            targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            action = args[0] ? args[0].toLowerCase() : null;
            targetMember = message.mentions.members.first() || message.member;
        }

        const reply = async (content) => {
            if (isSlash) {
                // نفترض أن الردود من هذا الأمر مخفية
                await interaction.reply({ content, ephemeral: true });
            } else {
                await message.reply(content);
            }
        };

        if (member.id !== guild.ownerId) { 
            return reply("❌ هذا الأمر للمالك فقط.");
        }

        if (!targetMember) {
            return reply("❌ لم أتمكن من العثور على العضو المستهدف.");
        }

        if (!action) {
            return reply("الاستخدام: `-testmediastreak <action> [@user]`\nالإجراءات: `new`, `continue`, `check`, `lose`, `grace`, `item`, `reminder`, `update`");
        }

        const id = `${targetMember.guild.id}-${targetMember.id}`;
        const getStreak = sql.prepare("SELECT * FROM media_streaks WHERE id = ?");
        const setStreak = sql.prepare("INSERT OR REPLACE INTO media_streaks (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak);");

        let streakData = getStreak.get(id);
        if (!streakData) {
            streakData = { id, guildID: targetMember.guild.id, userID: targetMember.id, streakCount: 0, lastMediaTimestamp: 0, hasGracePeriod: 0, hasItemShield: 0, hasReceivedFreeShield: 0, dmNotify: 1, highestStreak: 0 };
        }

        const fakeMessage = createFakeMessage(client, targetMember, interactionOrMessage, isSlash);

        const now = Date.now();
        const yesterday = now - (24 * 60 * 60 * 1000);
        const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
        const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

        try {
            switch (action) {
                case 'new':
                    streakData.streakCount = 0;
                    streakData.lastMediaTimestamp = 0;
                    setStreak.run(streakData);
                    if (isSlash) await interaction.deferReply({ephemeral: true});
                    await handleMediaStreakMessage(fakeMessage);
                    const newReply = `✅ **تم محاكاة (ستريك جديد)** لـ ${targetMember}. (تفقد الردود ⬆️)`;
                    return isSlash ? interaction.editReply(newReply) : message.reply(newReply);

                case 'continue':
                    streakData.streakCount = 5;
                    streakData.lastMediaTimestamp = yesterday;
                    setStreak.run(streakData);
                    if (isSlash) await interaction.deferReply({ephemeral: true});
                    await handleMediaStreakMessage(fakeMessage);
                    const continueReply = `✅ **تم محاكاة (استمرار ستريك)** لـ ${targetMember}. (تفقد الردود ⬆️)`;
                    return isSlash ? interaction.editReply(continueReply) : message.reply(continueReply);

                case 'check':
                    await reply("⏳ جارٍ تشغيل فحص الستريك اليومي...");
                    await checkDailyMediaStreaks(message.client, sql);
                    return isSlash ? interaction.followUp({ content: `✅ **تم تشغيل (فحص الستريك اليومي)** يدوياً.`, ephemeral: true}) : message.reply(`✅ **تم تشغيل (فحص الستريك اليومي)** يدوياً.`);

                case 'lose':
                    streakData.streakCount = 5;
                    streakData.lastMediaTimestamp = threeDaysAgo;
                    streakData.hasGracePeriod = 0;
                    streakData.hasItemShield = 0;
                    setStreak.run(streakData);
                    await reply("⏳ جارٍ فحص الخسارة...");
                    await checkDailyMediaStreaks(message.client, sql);
                    return isSlash ? interaction.editReply(`✅ **تم محاكاة (خسارة ستريك)** لـ ${targetMember}.`) : message.reply(`✅ **تم محاكاة (خسارة ستريك)** لـ ${targetMember}.`);

                case 'grace':
                    streakData.streakCount = 5;
                    streakData.lastMediaTimestamp = twoDaysAgo;
                    streakData.hasGracePeriod = 1;
                    streakData.hasItemShield = 0;
                    setStreak.run(streakData);
                    await reply("⏳ جارٍ فحص الدرع المجاني...");
                    await checkDailyMediaStreaks(message.client, sql);
                    return isSlash ? interaction.editReply(`✅ **تم محاكاة (استهلاك درع مجاني)** لـ ${targetMember}.`) : message.reply(`✅ **تم محاكاة (استهلاك درع مجاني)** لـ ${targetMember}.`);

                case 'item':
                    streakData.streakCount = 5;
                    streakData.lastMediaTimestamp = twoDaysAgo;
                    streakData.hasGracePeriod = 0;
                    streakData.hasItemShield = 1;
                    setStreak.run(streakData);
                    await reply("⏳ جارٍ فحص درع المتجر...");
                    await checkDailyMediaStreaks(message.client, sql);
                    return isSlash ? interaction.editReply(`✅ **تم محاكاة (استهلاك درع متجر)** لـ ${targetMember}.`) : message.reply(`✅ **تم محاكاة (استهلاك درع متجر)** لـ ${targetMember}.`);

                case 'reminder':
                    await reply("⏳ جارٍ تشغيل دالة إرسال التذكيرات (3 العصر)...");
                    await sendMediaStreakReminders(message.client, sql);
                    return isSlash ? interaction.editReply(`✅ **تم محاكاة (رسالة التذكير)**. تفقد القناة المخصصة للميديا.`) : message.reply(`✅ **تم محاكاة (رسالة التذكير)**. تفقد القناة المخصصة للميديا.`);

                case 'update':
                    await reply("⏳ جارٍ تشغيل دالة إرسال التحديث اليومي (12 الليل)...");
                    await sendDailyMediaUpdate(message.client, sql);
                    return isSlash ? interaction.editReply(`✅ **تم محاكاة (رسالة التحديث اليومي)**. تفقد القناة المخصصة للميديا.`) : message.reply(`✅ **تم محاكاة (رسالة التحديث اليومي)**. تفقد القناة المخصصة للميديا.`);

                default:
                    return reply("❌ إجراء غير معروف. الإجراءات: `new`, `continue`, `check`, `lose`, `grace`, `item`, `reminder`, `update`");
            }
        } catch (e) {
            console.error("[Test Streak] Error:", e);
            const errorReply = "❌ حدث خطأ أثناء الاختبار. انظر الكونسول.";
            if (isSlash && !interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: errorReply, ephemeral: true });
            } else if (isSlash) {
                return interaction.editReply(errorReply);
            } else {
                return message.reply(errorReply);
            }
        }
    }
};