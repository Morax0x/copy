const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { loadRoleSettings } = require("../../handlers/reaction-role-handler.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رتبة-مضادة')
        .setDescription('إدارة الرتب المتعارضة (التي يتم إزالتها تلقائياً عند اختيار رتبة أخرى).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .addSubcommand(sub => sub
            .setName('اضافة')
            .setDescription('أضف رتبة تتعارض مع الرتبة الأصلية (سيتم إزالتها عند اختيار الأصلية).')
            .addRoleOption(opt => opt.setName('الرول_الاصلي').setDescription('الرول الموجود في القائمة (الذي سيختاره العضو).').setRequired(true))
            .addRoleOption(opt => opt.setName('الرول_المضاد').setDescription('الرول الذي سيتم حذفه تلقائياً من العضو.').setRequired(true))
            .addBooleanOption(opt => opt.setName('قابل_للازالة').setDescription('هل يمكن للعضو إزالة الرول بالضغط عليه مجدداً؟ (افتراضي: نعم)').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('حذف')
            .setDescription('إلغاء التعارض بين رتبتين.')
            .addRoleOption(opt => opt.setName('الرول_الاصلي').setDescription('الرول الأصلي.').setRequired(true))
            .addRoleOption(opt => opt.setName('الرول_المضاد').setDescription('الرول الذي تريد إزالته من قائمة التعارض.').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('عرض')
            .setDescription('عرض الرتب المضادة المسجلة لرتبة معينة.')
            .addRoleOption(opt => opt.setName('الرول').setDescription('الرول الذي تريد كشف إعداداته.').setRequired(true))
        ),

    name: 'rr-anti-role',
    category: "Admin",

    async execute(interaction, args) {
        // دعم للأوامر القديمة والجديدة
        if (!interaction.isChatInputCommand && !interaction.isCommand) return; 

        const sql = interaction.client.sql;
        if (!sql) return interaction.reply({ content: '❌ خطأ: قاعدة البيانات غير متصلة.', ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        // --- ( اضافة ) ---
        if (subcommand === 'اضافة') {
            const mainRole = interaction.options.getRole('الرول_الاصلي');
            const antiRole = interaction.options.getRole('الرول_المضاد');
            const isRemovableInput = interaction.options.getBoolean('قابل_للازالة');

            if (mainRole.id === antiRole.id) {
                return interaction.editReply("❌ لا يمكن أن تكون الرتبة مضادة لنفسها.");
            }

            // جلب الإعدادات الحالية
            let currentSettings = sql.prepare("SELECT * FROM role_settings WHERE role_id = ?").get(mainRole.id);
            
            let antiRolesList = [];
            let isRemovable = 1; // الافتراضي true

            if (currentSettings) {
                // إذا وجدنا إعدادات سابقة، نحلل القائمة
                if (currentSettings.anti_roles && currentSettings.anti_roles.length > 0) {
                    antiRolesList = currentSettings.anti_roles.split(',');
                }
                // نحافظ على إعداد قابلية الإزالة القديم إلا إذا تم تغييره
                isRemovable = currentSettings.is_removable;
            }

            // إضافة الرول الجديد للقائمة إذا لم يكن موجوداً
            if (!antiRolesList.includes(antiRole.id)) {
                antiRolesList.push(antiRole.id);
            } else {
                return interaction.editReply(`ℹ️ الرول **${antiRole.name}** مضاف بالفعل كرتبة مضادة لـ **${mainRole.name}**.`);
            }

            // تحديث قابلية الإزالة إذا تم تحديدها
            if (isRemovableInput !== null) {
                isRemovable = isRemovableInput ? 1 : 0;
            }

            const newAntiRolesStr = antiRolesList.join(',');

            // الحفظ في القاعدة
            sql.prepare(`
                INSERT INTO role_settings (role_id, anti_roles, is_removable) 
                VALUES (?, ?, ?)
                ON CONFLICT(role_id) DO UPDATE SET 
                anti_roles = excluded.anti_roles,
                is_removable = excluded.is_removable
            `).run(mainRole.id, newAntiRolesStr, isRemovable);

            // تحديث الكاش فوراً
            await loadRoleSettings(sql, interaction.client.antiRolesCache);

            return interaction.editReply(`✅ **تم التحديث:**\nعند اختيار **${mainRole.name}**، سيتم إزالة **${antiRole.name}** تلقائياً.`);
        
        // --- ( حذف ) ---
        } else if (subcommand === 'حذف') {
            const mainRole = interaction.options.getRole('الرول_الاصلي');
            const antiRole = interaction.options.getRole('الرول_المضاد');

            let currentSettings = sql.prepare("SELECT * FROM role_settings WHERE role_id = ?").get(mainRole.id);

            if (!currentSettings || !currentSettings.anti_roles) {
                return interaction.editReply(`❌ لا توجد أي رتب مضادة مسجلة لـ **${mainRole.name}**.`);
            }

            let antiRolesList = currentSettings.anti_roles.split(',');

            if (!antiRolesList.includes(antiRole.id)) {
                return interaction.editReply(`❌ الرول **${antiRole.name}** ليس مسجلاً كمضاد لـ **${mainRole.name}**.`);
            }

            // إزالة الرول من القائمة
            antiRolesList = antiRolesList.filter(id => id !== antiRole.id);
            const newAntiRolesStr = antiRolesList.join(',');

            if (antiRolesList.length === 0) {
                // إذا أصبحت القائمة فارغة، نحذف السجل بالكامل لتنظيف القاعدة
                sql.prepare("DELETE FROM role_settings WHERE role_id = ?").run(mainRole.id);
            } else {
                sql.prepare("UPDATE role_settings SET anti_roles = ? WHERE role_id = ?").run(newAntiRolesStr, mainRole.id);
            }

            // تحديث الكاش
            await loadRoleSettings(sql, interaction.client.antiRolesCache);

            return interaction.editReply(`✅ تم فك الارتباط: **${antiRole.name}** لم يعد يتعارض مع **${mainRole.name}**.`);

        // --- ( عرض ) ---
        } else if (subcommand === 'عرض') {
            const role = interaction.options.getRole('الرول');
            const settings = sql.prepare("SELECT * FROM role_settings WHERE role_id = ?").get(role.id);

            if (!settings) {
                return interaction.editReply(`ℹ️ لا توجد إعدادات خاصة أو رتب مضادة لـ **${role.name}**.`);
            }

            const antiRolesIds = settings.anti_roles ? settings.anti_roles.split(',') : [];
            
            // تحويل الآيديات إلى منشن (مع التعامل مع الرولات المحذوفة)
            const antiRolesMentions = antiRolesIds.map(id => {
                const r = interaction.guild.roles.cache.get(id);
                return r ? `${r} (\`${id}\`)` : `Deleted Role (\`${id}\`)`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`⚙️ إعدادات الرتبة: ${role.name}`)
                .setColor(role.color || 'Blue')
                .addFields(
                    { name: '📥 قابل للإزالة (Toggle)', value: settings.is_removable ? '✅ نعم' : '❌ لا (إجباري)', inline: true },
                    { name: '🚫 الرتب المضادة (سيتم حذفها)', value: antiRolesMentions.length > 0 ? antiRolesMentions.join('\n') : 'لا يوجد', inline: false }
                )
                .setFooter({ text: 'استخدم /رتبة-مضادة للتعديل' });

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
