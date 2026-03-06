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

const OWNER_ID = "1145327691772481577"; 

module.exports = {
    name: 'family-admin',
    description: 'لوحة التحكم بالعائلات (بريفكس فقط)',
    aliases: ['fa', 'fam', 'fadmin'], 
    category: "Owner",

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;

        if (message.author.id !== OWNER_ID) return; 

        const resolveUser = async (input) => {
            if (!input) return null;
            let cleanId = input.replace(/[<@!>]/g, '');
            
            try {
                const user = await client.users.fetch(cleanId);
                return user.id;
            } catch (e) {}

            const member = message.guild.members.cache.find(m => 
                m.user.username.toLowerCase() === input.toLowerCase() || 
                m.displayName.toLowerCase() === input.toLowerCase()
            );
            if (member) return member.id;

            return null;
        };

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

            try {
                const submitted = await i.awaitModalSubmit({ time: 60000, filter: sub => sub.user.id === OWNER_ID });
                
                if (submitted.customId === 'modal_force_marry') {
                    const rawU1 = submitted.fields.getTextInputValue('user1');
                    const rawU2 = submitted.fields.getTextInputValue('user2');
                    
                    const u1 = await resolveUser(rawU1);
                    const u2 = await resolveUser(rawU2);

                    if (!u1 || !u2) return submitted.reply({ content: `❌ لم يتم العثور على الأعضاء: ${rawU1} أو ${rawU2}`, ephemeral: true });
                    if (u1 === u2) return submitted.reply({ content: "❌ نفس الشخص!", ephemeral: true });

                    await db.query("DELETE FROM marriages WHERE userID = $1 OR partnerID = $2", [u1, u1]);
                    await db.query("DELETE FROM marriages WHERE userID = $1 OR partnerID = $2", [u2, u2]);
                    const now = Date.now();
                    await db.query("INSERT INTO marriages (userID, partnerID, guildID, marriageDate) VALUES ($1, $2, $3, $4)", [u1, u2, guildId, now]);
                    await db.query("INSERT INTO marriages (userID, partnerID, guildID, marriageDate) VALUES ($1, $2, $3, $4)", [u2, u1, guildId, now]);
                    await submitted.reply({ content: `✅ **تم تزويج <@${u1}> و <@${u2}> بنجاح!**` });
                }
                
                else if (submitted.customId === 'modal_force_divorce') {
                    const rawT = submitted.fields.getTextInputValue('target');
                    const t = await resolveUser(rawT);
                    if (!t) return submitted.reply({ content: `❌ لم يتم العثور على: ${rawT}`, ephemeral: true });

                    await db.query("DELETE FROM marriages WHERE userID = $1 OR partnerID = $2", [t, t]);
                    await submitted.reply({ content: `✅ **تم تطليق <@${t}> من أي شريك.**` });
                }
                
                else if (submitted.customId === 'modal_force_adopt') {
                    const rawP = submitted.fields.getTextInputValue('parent');
                    const rawC = submitted.fields.getTextInputValue('child');
                    const p = await resolveUser(rawP);
                    const c = await resolveUser(rawC);

                    if (!p || !c) return submitted.reply({ content: `❌ خطأ في الأعضاء.`, ephemeral: true });
                    if (p === c) return submitted.reply({ content: "❌ نفس الشخص!", ephemeral: true });

                    await db.query("DELETE FROM children WHERE childID = $1 AND guildID = $2", [c, guildId]);
                    await db.query("INSERT INTO children (parentID, childID, adoptDate, guildID) VALUES ($1, $2, $3, $4)", [p, c, Date.now(), guildId]);
                    await submitted.reply({ content: `✅ **<@${c}> أصبح ابن <@${p}>!**` });
                }
                
                else if (submitted.customId === 'modal_force_disown') {
                    const rawC = submitted.fields.getTextInputValue('child');
                    const c = await resolveUser(rawC);
                    if (!c) return submitted.reply({ content: `❌ لم يتم العثور على العضو.`, ephemeral: true });

                    await db.query("DELETE FROM children WHERE childID = $1 AND guildID = $2", [c, guildId]);
                    await submitted.reply({ content: `✅ **تم تحرير <@${c}>!**` });
                }
                
                else if (submitted.customId === 'modal_reset_user') {
                    const rawT = submitted.fields.getTextInputValue('target');
                    const t = await resolveUser(rawT);
                    if (!t) return submitted.reply({ content: `❌ لم يتم العثور على العضو.`, ephemeral: true });

                    await db.query("DELETE FROM marriages WHERE userID = $1 OR partnerID = $2", [t, t]);
                    await db.query("DELETE FROM children WHERE childID = $1", [t]);
                    await db.query("DELETE FROM children WHERE parentID = $1", [t]);
                    await submitted.reply({ content: `✅ **تم تصفير <@${t}> بالكامل!**` });
                }

                await response.delete().catch(()=>{});

            } catch (err) {
                // Time expired or error
            }
        });
    }
};
