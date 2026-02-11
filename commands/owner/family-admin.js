// commands/owner/family-admin.js

const { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ComponentType, 
    Colors,
    EmbedBuilder
} = require("discord.js");

const OWNER_ID = "1145327691772481577"; // 👑 الآيدي الخاص بك

module.exports = {
    name: 'family-admin',
    description: 'لوحة التحكم بالعائلات (بريفكس فقط)',
    aliases: ['fa', 'fam', 'fadmin'], 
    category: "Owner",

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;

        // 🔒 حماية الإمبراطور
        if (message.author.id !== OWNER_ID) return; 

        // دالة مساعدة لتحليل المدخلات (ID أو Mention أو Username)
        const resolveUser = async (input) => {
            if (!input) return null;
            // تنظيف المدخلات من الأقواس <@! >
            let cleanId = input.replace(/[<@!>]/g, '');
            
            // 1. محاولة كآيدي مباشر
            try {
                const user = await client.users.fetch(cleanId);
                return user.id;
            } catch (e) {}

            // 2. محاولة البحث بالاسم داخل السيرفر
            const member = message.guild.members.cache.find(m => 
                m.user.username.toLowerCase() === input.toLowerCase() || 
                m.displayName.toLowerCase() === input.toLowerCase()
            );
            if (member) return member.id;

            return null;
        };

        // القائمة الرئيسية
        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('family_admin_menu')
                .setPlaceholder('🔻 اختر إجراءً إمبراطورياً...')
                .addOptions([
                    { label: 'تزويج إجباري', value: 'force_marry', emoji: '💍' },
                    { label: 'طلاق إجباري', value: 'force_divorce', emoji: '💔' },
                    { label: 'تبني إجباري', value: 'force_adopt', emoji: '👶' },
                    { label: 'تحرير ابن', value: 'force_disown', emoji: '🦅' },
                    { label: 'تصفير عضو', value: 'reset_user', emoji: '☢️' }
                ])
        );

        const embed = new EmbedBuilder()
            .setColor(Colors.DarkGold)
            .setTitle('👑 لوحة التحكم بالعائلات')
            .setDescription('اختر الإجراء من القائمة أدناه.\nيمكنك إدخال (الآيدي) أو (المنشن) أو (اسم المستخدم) في الحقول.')
            .setThumbnail(message.author.displayAvatarURL());

        const response = await message.reply({ embeds: [embed], components: [menuRow] });

        // التعامل مع القائمة
        const filter = i => i.user.id === OWNER_ID && i.customId === 'family_admin_menu';
        const collector = response.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async i => {
            const choice = i.values[0];
            let modal;

            if (choice === 'force_marry') {
                modal = new ModalBuilder().setCustomId('modal_force_marry').setTitle('💍 تزويج إجباري');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user1').setLabel('الطرف الأول (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user2').setLabel('الطرف الثاني (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short))
                );
            } else if (choice === 'force_divorce') {
                modal = new ModalBuilder().setCustomId('modal_force_divorce').setTitle('💔 طلاق إجباري');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('الشخص (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)));
            } else if (choice === 'force_adopt') {
                modal = new ModalBuilder().setCustomId('modal_force_adopt').setTitle('👶 تبني إجباري');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('parent').setLabel('الأب (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('child').setLabel('الابن (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short))
                );
            } else if (choice === 'force_disown') {
                modal = new ModalBuilder().setCustomId('modal_force_disown').setTitle('🦅 تحرير ابن');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('child').setLabel('الابن (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)));
            } else if (choice === 'reset_user') {
                modal = new ModalBuilder().setCustomId('modal_reset_user').setTitle('☢️ تصفير عضو');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('العضو (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)));
            }

            await i.showModal(modal);

            // انتظار الـ Modal Submit في نفس السياق
            try {
                const submitted = await i.awaitModalSubmit({ time: 60000, filter: sub => sub.user.id === OWNER_ID });
                
                // --- معالجة التزويج ---
                if (submitted.customId === 'modal_force_marry') {
                    const rawU1 = submitted.fields.getTextInputValue('user1');
                    const rawU2 = submitted.fields.getTextInputValue('user2');
                    
                    const u1 = await resolveUser(rawU1);
                    const u2 = await resolveUser(rawU2);

                    if (!u1 || !u2) return submitted.reply({ content: `❌ لم يتم العثور على الأعضاء: ${rawU1} أو ${rawU2}`, ephemeral: true });
                    if (u1 === u2) return submitted.reply({ content: "❌ نفس الشخص!", ephemeral: true });

                    sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(u1, u1);
                    sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(u2, u2);
                    const now = Date.now();
                    sql.prepare("INSERT INTO marriages (userID, partnerID, guildID, marriageDate) VALUES (?, ?, ?, ?)").run(u1, u2, guildId, now);
                    sql.prepare("INSERT INTO marriages (userID, partnerID, guildID, marriageDate) VALUES (?, ?, ?, ?)").run(u2, u1, guildId, now);
                    await submitted.reply({ content: `✅ **تم تزويج <@${u1}> و <@${u2}> بنجاح!**` });
                }
                
                // --- معالجة الطلاق ---
                else if (submitted.customId === 'modal_force_divorce') {
                    const rawT = submitted.fields.getTextInputValue('target');
                    const t = await resolveUser(rawT);
                    if (!t) return submitted.reply({ content: `❌ لم يتم العثور على: ${rawT}`, ephemeral: true });

                    sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(t, t);
                    await submitted.reply({ content: `✅ **تم تطليق <@${t}> من أي شريك.**` });
                }
                
                // --- معالجة التبني ---
                else if (submitted.customId === 'modal_force_adopt') {
                    const rawP = submitted.fields.getTextInputValue('parent');
                    const rawC = submitted.fields.getTextInputValue('child');
                    const p = await resolveUser(rawP);
                    const c = await resolveUser(rawC);

                    if (!p || !c) return submitted.reply({ content: `❌ خطأ في الأعضاء.`, ephemeral: true });
                    if (p === c) return submitted.reply({ content: "❌ نفس الشخص!", ephemeral: true });

                    sql.prepare("DELETE FROM children WHERE childID = ? AND guildID = ?").run(c, guildId);
                    sql.prepare("INSERT INTO children (parentID, childID, adoptDate, guildID) VALUES (?, ?, ?, ?)").run(p, c, Date.now(), guildId);
                    await submitted.reply({ content: `✅ **<@${c}> أصبح ابن <@${p}>!**` });
                }
                
                // --- معالجة التحرير ---
                else if (submitted.customId === 'modal_force_disown') {
                    const rawC = submitted.fields.getTextInputValue('child');
                    const c = await resolveUser(rawC);
                    if (!c) return submitted.reply({ content: `❌ لم يتم العثور على العضو.`, ephemeral: true });

                    sql.prepare("DELETE FROM children WHERE childID = ? AND guildID = ?").run(c, guildId);
                    await submitted.reply({ content: `✅ **تم تحرير <@${c}>!**` });
                }
                
                // --- معالجة التصفير ---
                else if (submitted.customId === 'modal_reset_user') {
                    const rawT = submitted.fields.getTextInputValue('target');
                    const t = await resolveUser(rawT);
                    if (!t) return submitted.reply({ content: `❌ لم يتم العثور على العضو.`, ephemeral: true });

                    sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(t, t);
                    sql.prepare("DELETE FROM children WHERE childID = ?").run(t);
                    sql.prepare("DELETE FROM children WHERE parentID = ?").run(t);
                    await submitted.reply({ content: `✅ **تم تصفير <@${t}> بالكامل!**` });
                }

                // حذف القائمة بعد الانتهاء
                await response.delete().catch(()=>{});

            } catch (err) {
                // Time expired or error
            }
        });
    }
};
