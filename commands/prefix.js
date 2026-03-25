const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('تغيير بادئة (بريفكس) الأوامر في السيرفر.')
        .addStringOption(option =>
            option.setName('البريفكس')
                .setDescription('اكتب البريفكس الجديد الذي تريده للسيرفر')
                .setRequired(true)),

    name: 'prefix',
    aliases: ['set-prefix', 'بريفكس'],
    category: "Admin",
    description: "Set server prefix",
    cooldown: 3,

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const guild = interactionOrMessage.guild;
        const db = client.sql; // SQLite Database

        let member, newPrefix, reply;

        if (isSlash) {
            member = interactionOrMessage.member;
            newPrefix = interactionOrMessage.options.getString('البريفكس');
            reply = (payload) => interactionOrMessage.reply(payload);
        } else {
            member = interactionOrMessage.member;
            if (!args[0]) return interactionOrMessage.reply(`❌ **الرجاء كتابة البريفكس الجديد.**\nمثال: \`-prefix !\``);
            newPrefix = args[0];
            reply = (payload) => interactionOrMessage.reply(payload);
        }

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply({ content: `❌ **عذراً، لا تملك صلاحية \`ManageGuild\` لاستخدام هذا الأمر.**`, ephemeral: true });
        }

        let currentPrefix = "-";
        try {
            // قراءة البريفكس الحالي من جدول settings (SQLite)
            const res = db.prepare("SELECT prefix FROM settings WHERE guild = ?").get(guild.id);
            if (res && res.prefix) currentPrefix = res.prefix;
        } catch (e) {
            console.error("Error fetching current prefix:", e);
        }

        if (newPrefix === currentPrefix) {
            return reply({ content: `⚠ **هذا هو البريفكس الحالي بالفعل!**`, ephemeral: true });
        }

        try {
            // تحديث البريفكس في جدول settings (SQLite)
            db.prepare(`
                INSERT INTO settings (guild, prefix) 
                VALUES (?, ?) 
                ON CONFLICT(guild) DO UPDATE SET prefix = EXCLUDED.prefix
            `).run(guild.id, newPrefix);
            
            return reply(`✅ **تم تغيير بريفكس السيرفر بنجاح إلى:** \`${newPrefix}\``);
            
        } catch (error) {
            console.error("Prefix change error:", error);
            return reply({ content: "❌ **حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.**", ephemeral: true });
        }
    }
}
