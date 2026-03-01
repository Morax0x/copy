const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// تأكد أن المسار صحيح لملف streak-handler
const { updateNickname } = require("../../streak-handler.js"); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-الستريك')
        .setDescription('يحدد ستريك مستخدم معين يدوياً ويحدث اسمه.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد تعديل الستريك له')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('العدد')
            .setDescription('العدد الجديد للستريك')
            .setRequired(true)
            .setMinValue(0)),

    name: 'set-streak',
    aliases: ['setstreak'],
    category: "Admin",
    description: "يحدد ستريك مستخدم معين يدوياً.",

    async execute(interactionOrMessage, args) {
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

        const reply = async (content) => {
            const payload = { content, ephemeral: false }; 
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply(`❌ | ليس لديك صلاحية الإدارة!`);
        }

        let targetMember; 
        let count;

        // جلب العضو (Member) وليس المستخدم (User) لأننا نحتاج لتغيير اسمه
        if (isSlash) {
            targetMember = interaction.options.getMember('المستخدم');
            count = interaction.options.getInteger('العدد');
        } else {
            targetMember = message.mentions.members.first() || guild.members.cache.get(args[0]);
            count = parseInt(args[1]);
        }

        if (!targetMember || isNaN(count) || count < 0) {
            return reply("❌ | الاستخدام: `/تحديد-الستريك <@user> <العدد>`");
        }

        try {
            // 1. تحديث قاعدة البيانات
            const setStreak = sql.prepare(`
                INSERT INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET 
                streakCount = excluded.streakCount,
                lastMessageTimestamp = excluded.lastMessageTimestamp
            `);

            const streakId = `${guild.id}-${targetMember.id}`;
            // نستخدم التاريخ الحالي
            setStreak.run(streakId, guild.id, targetMember.id, count, Date.now(), 1, 0);

            // 2. تحديث اسم المستخدم (اللقب)
            // نمرر العضو، العدد، والاتصال بقاعدة البيانات (إذا كانت الدالة تحتاجه)
            await updateNickname(targetMember, count, sql);

            return reply(`✅ | تم تحديد ستريك ${targetMember.toString()} إلى **${count}🔥** وتم تحديث اسمه.`);

        } catch (err) {
            console.error(err);
            return reply("⚠️ | تم تحديث الستريك في القاعدة، لكن حدث خطأ أثناء تغيير الاسم (تأكد من صلاحيات البوت).");
        }
    }
};
