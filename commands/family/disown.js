const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const TOTAL_DISOWN_FEE = 2000;
const MORA_EMOJI = '<:mora:1435647151349698621>'; 
const DISOWN_GIF = "https://media.tenor.com/images/3f3d3263013697669536067759367295/tenor.gif"; 

module.exports = {
    name: 'disown',
    description: 'التبرؤ من ابن وطرده من العائلة (يتطلب موافقة الشريك ودفع تعويض للابن)',
    aliases: ['تبرؤ', 'طرد-ابن', 'kickchild'],

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        // دالة مساعدة للردود المؤقتة
        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        // 1. التحقق من المدخلات
        const childMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nعليك تحديد الابن الذي تريد طرده.\nمثال: \`${message.content.split(' ')[0]} @الابن\``);
        }

        // 2. هل هو ابنك فعلاً؟
        const isMyChild = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ? AND guildID = ?").get(userId, childMember.id, guildId);

        if (!isMyChild) {
            return replyTemp(`🚫 **${childMember.displayName}** ليس مسجلاً كابن لك! تأكد من الشخص.`);
        }

        // 3. التحقق من وجود شريك (زوج/زوجة)
        const marriageData = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(userId, guildId);
        const partnerId = marriageData ? marriageData.partnerID : null;
        
        let partnerMember = null;
        if (partnerId) {
            partnerMember = await message.guild.members.fetch(partnerId).catch(() => null);
        }

        // تحديد التكلفة لكل طرف
        const feePerPerson = partnerId ? (TOTAL_DISOWN_FEE / 2) : TOTAL_DISOWN_FEE;

        // 4. التحقق من رصيد الأب (صاحب الطلب)
        let userData = client.getLevel.get(userId, guildId);
        if (!userData) userData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };

        if (userData.mora < feePerPerson) {
            return replyTemp(`💸 **ليس لديك حصتك من التعويض!**\nالمطلوب منك: **${feePerPerson.toLocaleString()}** ${MORA_EMOJI}`);
        }

        // ==========================================================
        // 🚨 الحالة أ: يوجد شريك (يجب موافقته ودفع حصته)
        // ==========================================================
        if (partnerId && partnerMember) {
            // التحقق من رصيد الشريك مبدئياً
            let partnerData = client.getLevel.get(partnerId, guildId);
            if (!partnerData) partnerData = { id: `${guildId}-${partnerId}`, user: partnerId, guild: guildId, xp: 0, level: 1, mora: 0 };

            if (partnerData.mora < feePerPerson) {
                return replyTemp(`🚫 **لا يمكن إتمام العملية!** شريكك **${partnerMember.displayName}** لا يملك حصته من التعويض (${feePerPerson}).`);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('partner_confirm').setLabel(`موافقة ودفع (${feePerPerson})`).setStyle(ButtonStyle.Danger).setEmoji('🚷'),
                new ButtonBuilder().setCustomId('partner_reject').setLabel('رفض الطرد').setStyle(ButtonStyle.Secondary)
            );

            const confirmMsg = await message.channel.send({
                content: `${partnerMember}`, // منشن للشريك
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle('🚷 قرار عائلي مصيري')
                    .setDescription(
                        `يا **${partnerMember.displayName}**، شريكك **${message.member.displayName}** يريد التبرؤ من ابنكم **${childMember.displayName}**.\n\n` +
                        `💰 **التكلفة:** يجب على كل منكما دفع **${feePerPerson}** ${MORA_EMOJI} (المجموع 2000) كتعويض للابن.\n` +
                        `⚠️ **هل توافق على طرده ودفع حصتك؟**`
                    )
                ],
                components: [row]
            });

            try {
                const confirmation = await confirmMsg.awaitMessageComponent({
                    filter: i => i.user.id === partnerId,
                    time: 60000,
                    componentType: ComponentType.Button
                });

                if (confirmation.customId === 'partner_reject') {
                    await confirmation.update({ content: `✅ **رفض الشريك طرد الابن.** العائلة ما زالت متماسكة.`, embeds: [], components: [] });
                    return;
                }

                // تنفيذ الخصم والتحويل (للشريكين)
                await performDisown(confirmation, [userId, partnerId], childMember.id, feePerPerson, message);

            } catch (e) {
                confirmMsg.edit({ content: `⏳ **انتهى الوقت.** لم يرد الشريك.`, components: [], embeds: [] });
            }
        } 
        
        // ==========================================================
        // 👤 الحالة ب: الأب وحيد (يدفع المبلغ كاملاً)
        // ==========================================================
        else {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('solo_confirm').setLabel(`نعم، ادفع ${feePerPerson} واطرده`).setStyle(ButtonStyle.Danger).setEmoji('🚷'),
                new ButtonBuilder().setCustomId('solo_cancel').setLabel('تراجع').setStyle(ButtonStyle.Secondary)
            );

            const confirmMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.DarkRed)
                    .setTitle('🚷 قرار التبرؤ')
                    .setDescription(
                        `هل أنت متأكد من طرد **${childMember.displayName}**؟\n` +
                        `💸 **التكلفة:** ستدفع **${feePerPerson}** ${MORA_EMOJI} كاملة كتعويض له.`
                    )
                ],
                components: [row]
            });

            try {
                const confirmation = await confirmMsg.awaitMessageComponent({
                    filter: i => i.user.id === userId,
                    time: 60000,
                    componentType: ComponentType.Button
                });

                if (confirmation.customId === 'solo_cancel') {
                    await confirmation.update({ content: `✅ **تراجعت عن القرار.**`, embeds: [], components: [] });
                    return;
                }

                // تنفيذ الخصم والتحويل (للأب فقط)
                await performDisown(confirmation, [userId], childMember.id, feePerPerson, message);

            } catch (e) {
                confirmMsg.edit({ content: `⏳ **انتهى الوقت.**`, components: [], embeds: [] });
            }
        }

        // ==========================================================
        // 🛠️ دالة التنفيذ (الخصم، التحويل، الحذف)
        // ==========================================================
        async function performDisown(interaction, parentIds, childId, amountPerPerson, originalMsg) {
            // 1. إعادة فحص الأرصدة (للاحتياط)
            for (const pid of parentIds) {
                const pData = client.getLevel.get(pid, guildId);
                if (pData.mora < amountPerPerson) {
                    return interaction.update({ content: `❌ **فشلت العملية:** أحد الأطراف لم يعد يملك المال الكافي!`, embeds: [], components: [] });
                }
            }

            // 2. الخصم من الآباء
            for (const pid of parentIds) {
                const pData = client.getLevel.get(pid, guildId);
                pData.mora -= amountPerPerson;
                client.setLevel.run(pData);
            }

            // 3. التحويل للابن (التعويض)
            let childData = client.getLevel.get(childId, guildId);
            if (!childData) childData = { id: `${guildId}-${childId}`, user: childId, guild: guildId, xp: 0, level: 1, mora: 0 };
            
            const totalCompensation = amountPerPerson * parentIds.length; // 2000
            childData.mora += totalCompensation;
            client.setLevel.run(childData);

            // 4. الحذف من السجلات (فك الرابط مع جميع الآباء المذكورين)
            const stmt = sql.prepare("DELETE FROM children WHERE parentID = ? AND childID = ? AND guildID = ?");
            for (const pid of parentIds) {
                stmt.run(pid, childId, guildId);
            }

            // 5. الرسالة النهائية
            const successEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle(`🚷 تم التبرؤ رسمياً`)
                .setDescription(
                    `تم طرد **${childMember.displayName}** من العائلة بلا رجعة!\n` +
                    `💸 **التعويض:** تم تحويل **${totalCompensation.toLocaleString()}** ${MORA_EMOJI} لرصيد الابن المطرود.`
                )
                .setImage(DISOWN_GIF);

            await interaction.update({ content: `||${originalMsg.author} ${childMember}||`, embeds: [successEmbed], components: [] });
        }
    }
};
