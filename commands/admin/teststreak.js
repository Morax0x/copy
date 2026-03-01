const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
const { checkDailyStreaks, sendStreakWarnings } = require('../../streak-handler.js'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تجربة-ستريك')
        .setDescription('يضبط بيانات ستريك عضو معين للاختبار (بالساعات).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('الساعات')
                .setDescription('عدد الساعات في الماضي (اكتب "warn" لاختبار التحذير)')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('المستخدم المستهدف (افتراضي: أنت)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('درع-مجاني')
                .setDescription('تحديد حالة الدرع المجاني (0 = لا يوجد, 1 = يوجد)')
                .setRequired(false)
                .addChoices({ name: 'لا يوجد', value: 0 }, { name: 'يوجد', value: 1 }))
        .addIntegerOption(option =>
            option.setName('درع-المتجر')
                .setDescription('تحديد حالة درع المتجر (0 = لا يوجد, 1 = يوجد)')
                .setRequired(false)
                .addChoices({ name: 'لا يوجد', value: 0 }, { name: 'يوجد', value: 1 })),

    name: 'teststreak',
    description: 'يضبط بيانات ستريك عضو معين للاختبار (بالساعات).',
    category: "Admin",
    permissions: ['ManageGuild'],

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let targetUser, hourArg, graceShield, itemShield;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            const target = interaction.options.getUser('المستخدم') || interaction.user;
            targetUser = await guild.members.fetch(target.id).catch(() => null);
            hourArg = interaction.options.getString('الساعات').toLowerCase();
            graceShield = interaction.options.getInteger('درع-مجاني');
            itemShield = interaction.options.getInteger('درع-المتجر');
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            let hourArgIndex;
            const mentionedUser = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

            if (mentionedUser) {
                targetUser = mentionedUser;
                hourArgIndex = 1; 
            } else {
                targetUser = message.member;
                hourArgIndex = 0; 
            }

            hourArg = args[hourArgIndex]?.toLowerCase();
            graceShield = args[hourArgIndex + 1] ? parseInt(args[hourArgIndex + 1]) : null;
            itemShield = args[hourArgIndex + 2] ? parseInt(args[hourArgIndex + 2]) : null;
        }

        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        const followUp = async (content) => {
            if (isSlash) {
                return interaction.followUp({ content, ephemeral: true });
            } else {
                return message.channel.send(content);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply(`❌ ليس لديك صلاحية \`Manage Guild\` لاستخدام هذا الأمر!`, true);
        }

        if (!targetUser) {
            return reply("❌ لم أتمكن من العثور على العضو المستهدف.", true);
        }

        const hours = parseFloat(hourArg);

        if (isNaN(hours) && hourArg !== 'warn') { 
            return reply(
                "الرجاء تحديد الساعات بشكل صحيح.\n" +
                "**للاختبار على نفسك:** `!teststreak <ساعات/warn> [درع مجاني 0/1] [درع متجر 0/1]`\n" +
                "**للاختبار على غيرك:** `!teststreak <@منشن> <ساعات/warn> [درع مجاني 0/1] [درع متجر 0/1]`\n" +
                "**مثال خسارة:** `!teststreak @user 30 0 0`\n" +
                "**مثال تحذير:** `!teststreak warn`",
                true
            );
        }

        const HOUR_MS = 60 * 60 * 1000; 
        const userID = targetUser.id;
        const guildID = guild.id;
        const id = `${guildID}-${userID}`;

        try {
            const getStreak = sql.prepare("SELECT * FROM streaks WHERE id = ?");
            let streakData = getStreak.get(id);

            if (!streakData) {
                return reply(`❌ لم أجد ستريك للمستخدم ${targetUser}. يجب أن يرسل رسالة واحدة أولاً لبدء ستريك.`);
            }

            if (hourArg === 'warn') {
                const thirteenHoursAgo = Date.now() - (13 * HOUR_MS);

                const updateQuery = sql.prepare("UPDATE streaks SET lastMessageTimestamp = ?, has12hWarning = 0 WHERE id = ?");
                updateQuery.run(thirteenHoursAgo, id);

                await reply(`✅ تم ضبط ${targetUser} ليكون "قبل 13 ساعة" و "غير مُحذر".\n**... جاري تشغيل فحص التحذيرات الآن...**`, true);

                await sendStreakWarnings(client, sql);

                return followUp(`✅ تم الانتهاء من فحص التحذيرات. (تفقد الرسائل الخاصة للمستخدم ${targetUser}).`);
            }

            const newTimestamp = Date.now() - (hours * HOUR_MS); 

            let updates = [
                'lastMessageTimestamp = @lastMessageTimestamp',
                'has12hWarning = 0' 
            ];

            let params = {
                lastMessageTimestamp: newTimestamp,
                id: id
            };

            let replyMsg = `✅ تم "السفر بالزمن" للمستخدم ${targetUser}.\nآخر رسالة له أصبحت "قبل ${hours} ساعة".\n`; 
            replyMsg += `🔔 حالة التحذير أُعيد ضبطها إلى **0** (جاهز للاختبار).\n`;

            if (graceShield !== null && (graceShield === 0 || graceShield === 1)) {
                updates.push('hasGracePeriod = @hasGracePeriod');
                params.hasGracePeriod = graceShield;
                replyMsg += `🛡️ الدرع المجاني ضُبط إلى: **${graceShield}**\n`;
            }

            if (itemShield !== null && (itemShield === 0 || itemShield === 1)) {
                updates.push('hasItemShield = @hasItemShield');
                params.hasItemShield = itemShield;
                replyMsg += `⚔️ درع المتجر ضُبط إلى: **${itemShield}**\n`;
            }

            const setStreak = sql.prepare(`UPDATE streaks SET ${updates.join(', ')} WHERE id = @id`);
            const info = setStreak.run(params);

            if (info.changes > 0) {
                await reply(replyMsg + "**... جاري تشغيل فحص الستريك (12 ليلاً) الآن لاختبار النتيجة...**", true);

                await checkDailyStreaks(client, sql);

                await followUp(`✅ تم الانتهاء من الفحص. (تفقد الرسائل الخاصة للمستخدم ${targetUser} ولقبه).`);

            } else {
                await reply("❌ حدث خطأ أثناء تحديث بيانات المستخدم.", true);
            }
        } catch (err) {
            console.error(err);
            reply("حدث خطأ في قاعدة البيانات.", true);
        }
    }
};