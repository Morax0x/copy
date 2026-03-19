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
        const db = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        const childMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nعليك تحديد الابن الذي تريد طرده.\nمثال: \`${message.content.split(' ')[0]} @الابن\``);
        }

        try {
            // 🔥 حماية التحقق من الابن
            let isMyChildRes;
            try { isMyChildRes = await db.query(`SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2 AND "guildID" = $3`, [userId, childMember.id, guildId]); }
            catch(e) { isMyChildRes = await db.query(`SELECT 1 FROM children WHERE parentid = $1 AND childid = $2 AND guildid = $3`, [userId, childMember.id, guildId]).catch(()=>({rows:[]})); }
            
            if (isMyChildRes.rows.length === 0) {
                return replyTemp(`🚫 **${childMember.displayName}** ليس مسجلاً كابن لك! تأكد من الشخص.`);
            }
        } catch(e) {
            console.error(e);
            return replyTemp(`❌ حدث خطأ في قاعدة البيانات.`);
        }

        let partnerId = null;
        try {
            // 🔥 حماية التحقق من الشريك
            let marriageDataRes;
            try { marriageDataRes = await db.query(`SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { marriageDataRes = await db.query(`SELECT partnerid as "partnerID" FROM marriages WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            if (marriageDataRes.rows.length > 0) {
                partnerId = marriageDataRes.rows[0].partnerID || marriageDataRes.rows[0].partnerid;
            }
        } catch(e) {}
        
        let partnerMember = null;
        if (partnerId) {
            partnerMember = await message.guild.members.fetch(partnerId).catch(() => null);
        }

        const feePerPerson = partnerId ? (TOTAL_DISOWN_FEE / 2) : TOTAL_DISOWN_FEE;

        let userData = await client.getLevel(userId, guildId);
        if (!userData) userData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };
        userData.mora = Number(userData.mora) || 0;

        if (userData.mora < feePerPerson) {
            return replyTemp(`💸 **ليس لديك حصتك من التعويض!**\nالمطلوب منك: **${feePerPerson.toLocaleString()}** ${MORA_EMOJI}`);
        }

        async function performDisown(interaction, parentIds, childId, amountPerPerson, originalMsg) {
            try {
                await db.query('BEGIN');

                for (const pid of parentIds) {
                    const pData = await client.getLevel(pid, guildId);
                    const currentMora = Number(pData.mora) || 0;
                    if (currentMora < amountPerPerson) {
                        await db.query('ROLLBACK');
                        return interaction.update({ content: `❌ **فشلت العملية:** أحد الأطراف لم يعد يملك المال الكافي!`, embeds: [], components: [] });
                    }
                    pData.mora = currentMora - amountPerPerson;
                    await client.setLevel(pData);
                }

                let childData = await client.getLevel(childId, guildId);
                if (!childData) childData = { id: `${guildId}-${childId}`, user: childId, guild: guildId, xp: 0, level: 1, mora: 0 };
                
                const totalCompensation = amountPerPerson * parentIds.length; 
                childData.mora = (Number(childData.mora) || 0) + totalCompensation;
                await client.setLevel(childData);

                // 🔥 التعديل الجذري: مسح الابن من الداتابيز بشكل آمن ومؤكد 🔥
                for (const pid of parentIds) {
                    try {
                        await db.query(`DELETE FROM children WHERE "parentID" = $1 AND "childID" = $2 AND "guildID" = $3`, [pid, childId, guildId]);
                    } catch(e) {
                        await db.query(`DELETE FROM children WHERE parentid = $1 AND childid = $2 AND guildid = $3`, [pid, childId, guildId]).catch(()=>{});
                    }
                }

                await db.query('COMMIT');

                const successEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle(`🚷 تم التبرؤ رسمياً`)
                    .setDescription(
                        `تم طرد **${childMember.displayName}** من العائلة بلا رجعة!\n` +
                        `💸 **التعويض:** تم تحويل **${totalCompensation.toLocaleString()}** ${MORA_EMOJI} لرصيد الابن المطرود.`
                    )
                    .setImage(DISOWN_GIF);

                await interaction.update({ content: `||${originalMsg.author} ${childMember}||`, embeds: [successEmbed], components: [] });

            } catch (error) {
                await db.query('ROLLBACK');
                console.error("Disown Transaction Error:", error);
                return interaction.update({ content: `❌ حدث خطأ داخلي أثناء تنفيذ عملية الطرد.`, embeds: [], components: [] });
            }
        }

        if (partnerId && partnerMember) {
            let partnerData = await client.getLevel(partnerId, guildId);
            if (!partnerData) partnerData = { id: `${guildId}-${partnerId}`, user: partnerId, guild: guildId, xp: 0, level: 1, mora: 0 };
            partnerData.mora = Number(partnerData.mora) || 0;

            if (partnerData.mora < feePerPerson) {
                return replyTemp(`🚫 **لا يمكن إتمام العملية!** شريكك **${partnerMember.displayName}** لا يملك حصته من التعويض (${feePerPerson}).`);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('partner_confirm').setLabel(`موافقة ودفع (${feePerPerson})`).setStyle(ButtonStyle.Danger).setEmoji('🚷'),
                new ButtonBuilder().setCustomId('partner_reject').setLabel('رفض الطرد').setStyle(ButtonStyle.Secondary)
            );

            const confirmMsg = await message.channel.send({
                content: `${partnerMember}`, 
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

                await performDisown(confirmation, [userId, partnerId], childMember.id, feePerPerson, message);

            } catch (e) {
                confirmMsg.edit({ content: `⏳ **انتهى الوقت.** لم يرد الشريك.`, components: [], embeds: [] });
            }
        } 
        
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

                await performDisown(confirmation, [userId], childMember.id, feePerPerson, message);

            } catch (e) {
                confirmMsg.edit({ content: `⏳ **انتهى الوقت.**`, components: [], embeds: [] });
            }
        }
    }
};
