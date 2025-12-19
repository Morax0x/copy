const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    // بيانات السلاش كوماند
    data: new SlashCommandBuilder()
        .setName('تغيير-البريفكس')
        .setDescription('تغيير البريفكس (البادئة) الخاصة بأوامر البوت.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('البريفكس-الجديد')
            .setDescription('البريفكس الجديد الذي تريده (مثل ! أو $)')
            .setRequired(true)),

    name: 'prefix',
    aliases: ['set-prefix', 'تغيير-البريفكس'],
    category: "Admin",
    description: "Set server prefix",
    cooldown: 3,

    async execute (interactionOrMessage, args) {
        // 1. معالج الأوامر الهجينة (يعمل مع الرسائل والسلاش)
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: false }); // جعل الرد عاماً
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const sql = client.sql;

        // 2. دوال الرد الموحدة
        const reply = async (content) => {
            const payload = typeof content === 'string' ? { content } : content;
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload); // نستخدم edit لأننا عملنا defer سابقاً
            return message.reply(payload);
        };

        // التحقق من الصلاحيات
        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`❌ **عذراً، لا تملك صلاحية \`ManageGuild\` لاستخدام هذا الأمر.**`);
        }

        // 3. جلب البريفكس الجديد
        let newPrefix;
        if (isSlash) {
            newPrefix = interaction.options.getString('البريفكس-الجديد');
        } else {
            if (!args[0]) return replyError(`❌ **الرجاء كتابة البريفكس الجديد.**\nمثال: \`-prefix !\``);
            newPrefix = args[0];
        }

        // 4. [تصحيح هام] القراءة من جدول settings بدلاً من prefix
        let currentPrefix = "-";
        try {
            const row = sql.prepare("SELECT prefix FROM settings WHERE guild = ?").get(guild.id);
            if (row && row.prefix) currentPrefix = row.prefix;
        } catch (e) {
            // الجدول قد لا يكون موجوداً بعد، وهذا طبيعي
        }

        if(newPrefix === currentPrefix) {
            return replyError(`⚠ **هذا هو البريفكس الحالي بالفعل!**`);
        }

        // 5. [تصحيح هام] الحفظ في جدول settings مع الحفاظ على البيانات الأخرى
        // نستخدم ON CONFLICT للحفاظ على إعدادات القنوات الأخرى لو كانت موجودة
        try {
            sql.prepare(`
                INSERT INTO settings (guild, prefix) 
                VALUES (?, ?) 
                ON CONFLICT(guild) DO UPDATE SET prefix = excluded.prefix
            `).run(guild.id, newPrefix);
            
            return reply(`✅ **تم تغيير بريفكس السيرفر بنجاح إلى:** \`${newPrefix}\``);
            
        } catch (error) {
            console.error(error);
            return replyError("❌ **حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.**");
        }
    }
}
