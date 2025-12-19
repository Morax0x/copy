const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رد-تلقائي')
        .setDescription('إدارة نظام الردود التلقائية.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub
            .setName('اضافة')
            .setDescription('إضافة رد تلقائي جديد.')
            .addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة أو الجملة التي تثير الرد.').setRequired(true))
            .addStringOption(opt => opt.setName('الرد').setDescription('الرد (افصل بين الردود العشوائية بـ | )').setRequired(true))
            .addStringOption(opt => opt.setName('الصور').setDescription('روابط صور (افصل بينها بمسافة) - اختياري').setRequired(false))
            .addStringOption(opt => opt.setName('المطابقة').setDescription('طريقة البحث عن الكلمة').setRequired(false)
                .addChoices({ name: 'تطابق تام (Exact)', value: 'exact' }, { name: 'يحتوي على (Contains)', value: 'contains' }))
            .addIntegerOption(opt => opt.setName('كولداون').setDescription('وقت الانتظار بالثواني بين الردود (لغير المالك)').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('حذف')
            .setDescription('حذف رد تلقائي.')
            .addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة المراد حذفها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('قائمة')
            .setDescription('عرض جميع الردود التلقائية.')
            .addIntegerOption(opt => opt.setName('صفحة').setDescription('رقم الصفحة').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('تخصيص-قناة')
            .setDescription('السماح أو المنع في قنوات معينة.')
            .addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة المستهدفة').setRequired(true))
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة المعنية').setRequired(true))
            .addStringOption(opt => opt.setName('الاجراء').setDescription('سماح أم منع؟').setRequired(true)
                .addChoices({ name: 'سماح فقط (Allow)', value: 'allow' }, { name: 'منع (Ignore)', value: 'ignore' }))
        ),

    name: 'auto-responder',
    aliases: ['ar', 'ردود'],
    category: "Admin",
    description: "نظام الردود التلقائية.",

    async execute(interaction) {
        // دعم الأوامر العادية (Prefix) والسلاش (Slash)
        const isSlash = !!interaction.isChatInputCommand;
        
        let client, sql, guildID, user, sub;
        
        if (isSlash) {
            client = interaction.client;
            sql = interaction.client.sql;
            guildID = interaction.guild.id;
            user = interaction.user;
            sub = interaction.options.getSubcommand();
        } else {
            // دعم البريفكس (إذا تم استدعاؤه كأمر عادي)
            // ملاحظة: هذا الملف مصمم كـ SlashCommandBuilder، لذا قد تحتاج لتعديل بسيط إذا كنت تستخدمه كأمر عادي أيضاً
            // سأفترض هنا أنه Slash فقط كما هو في الكود الأصلي
            return; 
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            if (sub === 'اضافة') {
                const trigger = interaction.options.getString('الكلمة').toLowerCase();
                const response = interaction.options.getString('الرد');
                const images = interaction.options.getString('الصور') || "";
                const matchType = interaction.options.getString('المطابقة') || 'exact';
                const cooldown = interaction.options.getInteger('كولداون') || 0;

                const exists = sql.prepare("SELECT id FROM auto_responses WHERE guildID = ? AND trigger = ?").get(guildID, trigger);
                if (exists) return interaction.editReply("❌ هذا الرد موجود مسبقاً. قم بحذفه أولاً للتعديل.");

                // معالجة الصور (التأكد من الروابط)
                const imageList = images.split(/\s+/).filter(url => url.startsWith('http'));

                sql.prepare(`
                    INSERT INTO auto_responses (guildID, trigger, response, images, matchType, cooldown, createdBy) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(guildID, trigger, response, JSON.stringify(imageList), matchType, cooldown, user.id);

                return interaction.editReply(`✅ تم إضافة الرد على: **"${trigger}"** بنجاح.\nنوع المطابقة: ${matchType}\nالكولداون: ${cooldown} ثانية.`);
            }

            if (sub === 'حذف') {
                const trigger = interaction.options.getString('الكلمة').toLowerCase();
                const result = sql.prepare("DELETE FROM auto_responses WHERE guildID = ? AND trigger = ?").run(guildID, trigger);
                
                if (result.changes > 0) return interaction.editReply(`✅ تم حذف الرد الخاص بـ **"${trigger}"**.`);
                return interaction.editReply(`❌ لم يتم العثور على رد لهذه الكلمة.`);
            }

            if (sub === 'قائمة') {
                const page = interaction.options.getInteger('صفحة') || 1;
                // جلب جميع البيانات بما فيها تاريخ الانتهاء وصاحب الرد
                const rows = sql.prepare("SELECT trigger, matchType, cooldown, expiresAt, createdBy FROM auto_responses WHERE guildID = ?").all(guildID);
                
                if (rows.length === 0) return interaction.editReply("📭 لا توجد ردود تلقائية مسجلة.");

                const itemsPerPage = 10;
                const totalPages = Math.ceil(rows.length / itemsPerPage);
                const start = (page - 1) * itemsPerPage;
                const currentItems = rows.slice(start, start + itemsPerPage);

                const desc = currentItems.map((r, i) => {
                    let status = "♾️ دائم";
                    if (r.expiresAt) {
                        status = `⏳ ينتهي: <t:${Math.floor(r.expiresAt / 1000)}:R>`;
                    }
                    let creator = r.createdBy ? `<@${r.createdBy}>` : "إداري";
                    
                    return `**${start + i + 1}.** \`${r.trigger}\` (${r.matchType === 'exact' ? 'تطابق' : 'يحتوي'}) | ⏳ ${r.cooldown}ث\n   ↳ ${status} | 👤 بواسطة: ${creator}`;
                }).join('\n\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📜 قائمة الردود التلقائية (${rows.length})`)
                    .setDescription(desc || "لا توجد ردود في هذه الصفحة.")
                    .setFooter({ text: `صفحة ${page} من ${totalPages}` })
                    .setColor(Colors.Blue);

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'تخصيص-قناة') {
                const trigger = interaction.options.getString('الكلمة').toLowerCase();
                const channel = interaction.options.getChannel('القناة');
                const action = interaction.options.getString('الاجراء');

                const row = sql.prepare("SELECT * FROM auto_responses WHERE guildID = ? AND trigger = ?").get(guildID, trigger);
                if (!row) return interaction.editReply("❌ هذا الرد غير موجود.");

                let allowed = row.allowedChannels ? JSON.parse(row.allowedChannels) : [];
                let ignored = row.ignoredChannels ? JSON.parse(row.ignoredChannels) : [];

                if (action === 'allow') {
                    if (!allowed.includes(channel.id)) allowed.push(channel.id);
                    ignored = ignored.filter(id => id !== channel.id);
                } else {
                    if (!ignored.includes(channel.id)) ignored.push(channel.id);
                    allowed = allowed.filter(id => id !== channel.id);
                }

                sql.prepare("UPDATE auto_responses SET allowedChannels = ?, ignoredChannels = ? WHERE id = ?")
                   .run(JSON.stringify(allowed), JSON.stringify(ignored), row.id);

                return interaction.editReply(`✅ تم تحديث إعدادات القناة للرد **"${trigger}"**.`);
            }

        } catch (error) {
            console.error("[Auto Responder Execute Error]", error);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content: "❌ حدث خطأ داخلي أثناء تنفيذ الأمر.", ephemeral: true });
            } else {
                return interaction.reply({ content: "❌ حدث خطأ داخلي أثناء تنفيذ الأمر.", ephemeral: true });
            }
        }
    }
};
