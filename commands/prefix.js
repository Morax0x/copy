const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
    // 🔥 بناء أمر السلاش ليتعرف عليه ديسكورد 🔥
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
        const db = client.sql; // PostgreSQL / Supabase Database

        let member, newPrefix, reply;

        // 🔥 تهيئة المتغيرات بناءً على طريقة الاستخدام (سلاش أو نصي) 🔥
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

        // التحقق من الصلاحيات
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply({ content: `❌ **عذراً، لا تملك صلاحية \`ManageGuild\` لاستخدام هذا الأمر.**`, ephemeral: true });
        }

        let currentPrefix = "-";
        try {
            // قراءة البريفكس الحالي من جدول settings
            let res;
            try {
                res = await db.query(`SELECT "prefix" FROM settings WHERE "guild" = $1`, [guild.id]);
            } catch(e) {
                res = await db.query(`SELECT prefix FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]}));
            }
            
            if (res && res.rows.length > 0 && (res.rows[0].prefix || res.rows[0].prefix)) {
                currentPrefix = res.rows[0].prefix || res.rows[0].prefix;
            }
        } catch (e) {
            console.error("Error fetching current prefix:", e);
        }

        if (newPrefix === currentPrefix) {
            return reply({ content: `⚠ **هذا هو البريفكس الحالي بالفعل!**`, ephemeral: true });
        }

        try {
            // تحديث البريفكس في جدول settings 
            try {
                await db.query(`
                    INSERT INTO settings ("guild", "prefix") 
                    VALUES ($1, $2) 
                    ON CONFLICT("guild") DO UPDATE SET "prefix" = EXCLUDED."prefix"
                `, [guild.id, newPrefix]);
            } catch(e) {
                await db.query(`
                    INSERT INTO settings (guild, prefix) 
                    VALUES ($1, $2) 
                    ON CONFLICT(guild) DO UPDATE SET prefix = EXCLUDED.prefix
                `, [guild.id, newPrefix]).catch(()=>{});
            }
            
            return reply(`✅ **تم تغيير بريفكس السيرفر بنجاح إلى:** \`${newPrefix}\``);
            
        } catch (error) {
            console.error("Prefix change error:", error);
            return reply({ content: "❌ **حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.**", ephemeral: true });
        }
    }
}
