// commands/owner/family-admin.js

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ComponentType, 
    Colors 
} = require("discord.js");

const OWNER_ID = "1145327691772481577"; // 👑 الآيدي الخاص بك

module.exports = {
    // إعدادات السلاش كوماند (اختياري)
    data: new SlashCommandBuilder()
        .setName('family-admin')
        .setDescription('👑 لوحة التحكم بالعائلات (للإمبراطور فقط)'),

    // إعدادات الكوماند العادي (Text Command)
    name: 'family-admin',
    description: 'لوحة التحكم بالعائلات',
    aliases: ['fa', 'fam', 'fadmin'], // الاختصارات المطلوبة
    category: "Owner",

    async execute(interactionOrMessage, args) {
        // تحديد نوع الأمر (سلاش أو رسالة عادية)
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        // 🔒 حماية الإمبراطور
        if (user.id !== OWNER_ID) {
            const replyContent = "🚫 **هذا الأمر خاص بالإمبراطور فقط!**";
            if (isSlash) return interactionOrMessage.reply({ content: replyContent, ephemeral: true });
            return interactionOrMessage.reply(replyContent);
        }

        // إنشاء القائمة المنسدلة (Main Menu)
        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('family_admin_menu')
                .setPlaceholder('🔻 اختر إجراءً إمبراطورياً...')
                .addOptions([
                    {
                        label: 'تزويج إجباري (Force Marry)',
                        description: 'ربط عضوين بعقد زواج فوراً',
                        value: 'force_marry',
                        emoji: '💍'
                    },
                    {
                        label: 'طلاق إجباري (Force Divorce)',
                        description: 'فسخ عقد زواج لأي عضو',
                        value: 'force_divorce',
                        emoji: '💔'
                    },
                    {
                        label: 'تبني إجباري (Force Adopt)',
                        description: 'إضافة ابن لشخص بالقوة',
                        value: 'force_adopt',
                        emoji: '👶'
                    },
                    {
                        label: 'تحرير ابن (Force Disown)',
                        description: 'إخراج ابن من عائلته',
                        value: 'force_disown',
                        emoji: '🦅'
                    },
                    {
                        label: 'تصفير عضو (Reset User)',
                        description: 'مسح كل بيانات العائلة لشخص (زواج/أبناء/آباء)',
                        value: 'reset_user',
                        emoji: '☢️'
                    }
                ])
        );

        const embed = new EmbedBuilder()
            .setColor(Colors.DarkGold)
            .setTitle('👑 لوحة التحكم بالعائلات')
            .setDescription('أهلاً بك يا إمبراطور.\nاختر الإجراء الذي تريد تنفيذه من القائمة أدناه.')
            .setThumbnail(user.displayAvatarURL());

        let response;
        if (isSlash) {
            response = await interactionOrMessage.reply({ embeds: [embed], components: [menuRow], ephemeral: true });
        } else {
            response = await interactionOrMessage.reply({ embeds: [embed], components: [menuRow] });
        }

        // إنشاء Collector للاستماع للاختيارات
        // ملاحظة: نستخدم createMessageComponentCollector على القناة أو الرد
        // بالنسبة للرسائل العادية، الرد هو message.
        // بالنسبة للسلاش، الرد هو interaction response.
        
        const collectorContext = isSlash ? interactionOrMessage.channel : response;
        // في حال السلاش ephemeral، الكوليكتور يحتاج handling خاص، لكن للسهولة سننشئه على الرسالة إذا أمكن أو القناة
        
        const filter = i => i.user.id === OWNER_ID && i.customId === 'family_admin_menu';
        const collector = response.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async i => {
            const choice = i.values[0];

            // 1. معالجة خيار "تزويج إجباري"
            if (choice === 'force_marry') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_force_marry')
                    .setTitle('💍 تزويج إجباري');

                const input1 = new TextInputBuilder()
                    .setCustomId('user1_id')
                    .setLabel('آيدي الطرف الأول')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const input2 = new TextInputBuilder()
                    .setCustomId('user2_id')
                    .setLabel('آيدي الطرف الثاني')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2));
                await i.showModal(modal);
            }

            // 2. معالجة خيار "طلاق إجباري"
            else if (choice === 'force_divorce') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_force_divorce')
                    .setTitle('💔 طلاق إجباري');

                const input = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('آيدي الشخص المراد تطليقه')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }

            // 3. معالجة خيار "تبني إجباري"
            else if (choice === 'force_adopt') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_force_adopt')
                    .setTitle('👶 تبني إجباري');

                const inputParent = new TextInputBuilder()
                    .setCustomId('parent_id')
                    .setLabel('آيدي الأب/الأم')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const inputChild = new TextInputBuilder()
                    .setCustomId('child_id')
                    .setLabel('آيدي الابن')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(inputParent), new ActionRowBuilder().addComponents(inputChild));
                await i.showModal(modal);
            }

            // 4. معالجة خيار "تحرير ابن"
            else if (choice === 'force_disown') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_force_disown')
                    .setTitle('🦅 تحرير ابن');

                const input = new TextInputBuilder()
                    .setCustomId('child_id')
                    .setLabel('آيدي الابن')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }

            // 5. معالجة خيار "تصفير عضو"
            else if (choice === 'reset_user') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_reset_user')
                    .setTitle('☢️ تصفير عضو');

                const input = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('آيدي العضو')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }
        });

        // ---------------------------------------------------------
        // الاستماع للـ Modal Submission (يتم في ملف main أو interactionCreate)
        // لكن للتبسيط، سأضع المعالج هنا باستخدام interaction collector على مستوى الكلاينت أو القناة
        // الطريقة الأفضل في الأوامر المعقدة هي الانتظار في نفس السياق إذا أمكن، 
        // أو الاعتماد على أن المودال سيُرسل interaction جديد.
        // ---------------------------------------------------------
        
        // ملاحظة: awaitModalSubmit تعمل فقط على التفاعل الذي فتح المودال.
        // بما أننا فتحنا المودال داخل الـ collect، سنحتاج لانتظار الـ submit هناك.
        // سأقوم بتحديث الـ collector logic أعلاه ليكون async ويستخدم awaitModalSubmit.
        
        // تم تحديث المنطق ليكون داخل الـ collector في الأسفل 👇
    }
};

// =====================================================================
// ⚠️ ملاحظة هامة: يجب وضع هذا الكود في ملف منفصل (مثلاً events/interactionCreate.js)
// أو إضافته هنا كـ "Event Listener" مؤقت (وهو ما سأفعله ليعمل الكود بملف واحد)
// =====================================================================

// سنضيف مستمعاً مؤقتاً للـ Modals الخاصة بهذا الأمر
const { Events } = require('discord.js');

module.exports.init = (client) => {
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isModalSubmit()) return;
        if (interaction.user.id !== OWNER_ID) return;

        const sql = client.sql;
        const guildId = interaction.guild.id;

        try {
            // --- معالجة التزويج ---
            if (interaction.customId === 'modal_force_marry') {
                const u1 = interaction.fields.getTextInputValue('user1_id');
                const u2 = interaction.fields.getTextInputValue('user2_id');

                if (u1 === u2) return interaction.reply({ content: "❌ نفس الشخص!", ephemeral: true });

                sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(u1, u1);
                sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(u2, u2);

                const now = Date.now();
                sql.prepare("INSERT INTO marriages (userID, partnerID, guildID, marriageDate) VALUES (?, ?, ?, ?)").run(u1, u2, guildId, now);
                sql.prepare("INSERT INTO marriages (userID, partnerID, guildID, marriageDate) VALUES (?, ?, ?, ?)").run(u2, u1, guildId, now);

                await interaction.reply({ content: `✅ **تم تزويج <@${u1}> و <@${u2}> بنجاح!**`, ephemeral: false });
            }

            // --- معالجة الطلاق ---
            if (interaction.customId === 'modal_force_divorce') {
                const target = interaction.fields.getTextInputValue('target_id');
                sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(target, target);
                await interaction.reply({ content: `✅ **تم تطليق <@${target}> من أي شريك.**`, ephemeral: false });
            }

            // --- معالجة التبني ---
            if (interaction.customId === 'modal_force_adopt') {
                const parent = interaction.fields.getTextInputValue('parent_id');
                const child = interaction.fields.getTextInputValue('child_id');

                if (parent === child) return interaction.reply({ content: "❌ نفس الشخص!", ephemeral: true });

                sql.prepare("DELETE FROM children WHERE childID = ? AND guildID = ?").run(child, guildId);
                const now = Date.now();
                sql.prepare("INSERT INTO children (parentID, childID, adoptDate, guildID) VALUES (?, ?, ?, ?)").run(parent, child, now, guildId);

                await interaction.reply({ content: `✅ **أصبح <@${child}> ابناً لـ <@${parent}> رسمياً.**`, ephemeral: false });
            }

            // --- معالجة التحرير (Disown) ---
            if (interaction.customId === 'modal_force_disown') {
                const child = interaction.fields.getTextInputValue('child_id');
                sql.prepare("DELETE FROM children WHERE childID = ? AND guildID = ?").run(child, guildId);
                await interaction.reply({ content: `✅ **تم تحرير <@${child}> من والديه.**`, ephemeral: false });
            }

            // --- معالجة التصفير ---
            if (interaction.customId === 'modal_reset_user') {
                const target = interaction.fields.getTextInputValue('target_id');
                sql.prepare("DELETE FROM marriages WHERE userID = ? OR partnerID = ?").run(target, target);
                sql.prepare("DELETE FROM children WHERE childID = ?").run(target);
                sql.prepare("DELETE FROM children WHERE parentID = ?").run(target);
                await interaction.reply({ content: `✅ **تم تصفير سجلات العائلة لـ <@${target}> بالكامل.**`, ephemeral: false });
            }

        } catch (e) {
            console.error(e);
            if (!interaction.replied) await interaction.reply({ content: `❌ حدث خطأ: ${e.message}`, ephemeral: true });
        }
    });
};
