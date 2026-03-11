const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, Colors } = require("discord.js");

module.exports = {
    name: 'set-family-role',
    description: 'لوحة تفاعلية لتحديد رتب العائلة للذكور والإناث بكل سهولة',
    aliases: ['sfr', 'set-role'],
    
    async execute(message, args) {
        // 1. التحقق من الصلاحيات
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("🚫 **عذراً، هذا الأمر للمسؤولين (Admins) فقط!**");
        }

        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;

        // 2. تجهيز قاعدة البيانات
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS family_config (
                    "guildID" TEXT PRIMARY KEY,
                    "maleRole" TEXT,
                    "femaleRole" TEXT,
                    "divorceFee" BIGINT DEFAULT 5000,
                    "adoptFee" BIGINT DEFAULT 2000
                )
            `);
            await db.query(`INSERT INTO family_config ("guildID") VALUES ($1) ON CONFLICT ("guildID") DO NOTHING`, [guildId]);
        } catch (e) {
            console.error("Family Config DB Error:", e);
            return message.reply("❌ حدث خطأ في قاعدة البيانات.");
        }

        // 3. جلب الإعدادات الحالية لعرضها
        let currentMale = "لم يتم التحديد";
        let currentFemale = "لم يتم التحديد";
        try {
            const res = await db.query(`SELECT "maleRole", "femaleRole" FROM family_config WHERE "guildID" = $1`, [guildId]);
            if (res.rows.length > 0) {
                if (res.rows[0].maleRole || res.rows[0].malerole) {
                    const parsedMale = JSON.parse(res.rows[0].maleRole || res.rows[0].malerole);
                    currentMale = parsedMale.map(id => `<@&${id}>`).join(' , ');
                }
                if (res.rows[0].femaleRole || res.rows[0].femalerole) {
                    const parsedFemale = JSON.parse(res.rows[0].femaleRole || res.rows[0].femalerole);
                    currentFemale = parsedFemale.map(id => `<@&${id}>`).join(' , ');
                }
            }
        } catch(e) {}

        // 4. إنشاء واجهة لوحة التحكم
        const embed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('⚙️ لوحة إعدادات رتب العائلة')
            .setDescription('اختر الرتب المخصصة للذكور والإناث من القوائم بالأسفل.\n*(يمكنك تحديد أكثر من رتبة في نفس الوقت من القائمة)*')
            .addFields(
                { name: '👨 رتب الذكور الحالية:', value: currentMale, inline: false },
                { name: '👩 رتب الإناث الحالية:', value: currentFemale, inline: false }
            )
            .setFooter({ text: 'اللوحة صالحة لمدة دقيقتين' });

        // إنشاء قائمة اختيار رتب الذكور
        const maleSelectMenu = new RoleSelectMenuBuilder()
            .setCustomId('select_male_roles')
            .setPlaceholder('👨 اضغط هنا لاختيار رتب الذكور...')
            .setMinValues(1)
            .setMaxValues(10); // يسمح بتحديد من 1 إلى 10 رتب

        // إنشاء قائمة اختيار رتب الإناث
        const femaleSelectMenu = new RoleSelectMenuBuilder()
            .setCustomId('select_female_roles')
            .setPlaceholder('👩 اضغط هنا لاختيار رتب الإناث...')
            .setMinValues(1)
            .setMaxValues(10);

        const row1 = new ActionRowBuilder().addComponents(maleSelectMenu);
        const row2 = new ActionRowBuilder().addComponents(femaleSelectMenu);

        // إرسال اللوحة
        const panelMsg = await message.reply({ embeds: [embed], components: [row1, row2] });

        // 5. استقبال تفاعل الإدارة مع اللوحة
        const collector = panelMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 120000 // 120 ثانية
        });

        collector.on('collect', async interaction => {
            const isMale = interaction.customId === 'select_male_roles';
            const column = isMale ? "maleRole" : "femaleRole";
            const selectedRoles = interaction.values; // مصفوفة من ID الرتب
            const typeText = isMale ? "👨 الذكور" : "👩 الإناث";

            try {
                // حفظ الرتب كـ JSON في قاعدة البيانات
                await db.query(`UPDATE family_config SET "${column}" = $1 WHERE "guildID" = $2`, [JSON.stringify(selectedRoles), guildId]);

                const roleMentions = selectedRoles.map(id => `<@&${id}>`).join(' , ');

                // تحديث اللوحة والإشعار بالنجاح
                await interaction.reply({ 
                    content: `✅ **تم بنجاح تحديث رتب ${typeText} إلى:**\n${roleMentions}`, 
                    ephemeral: true 
                });

            } catch (error) {
                console.error(error);
                await interaction.reply({ content: "❌ حدث خطأ أثناء حفظ البيانات.", ephemeral: true });
            }
        });

        // عند انتهاء الوقت، نقوم بإزالة الأزرار
        collector.on('end', () => {
            panelMsg.edit({ components: [] }).catch(() => {});
        });
    }
};
