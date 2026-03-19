const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const TOTAL_DISOWN_FEE = 2000;
const MORA_EMOJI = '<:mora:1435647151349698621>'; 
const DISOWN_GIF = "https://media.tenor.com/images/3f3d3263013697669536067759367295/tenor.gif"; 
const BOT_REJECT_IMAGE = "https://i.postimg.cc/0jQvvNNh/fort.jpg"; 

module.exports = {
    name: 'disown',
    description: 'التبرؤ من ابن وطرده من العائلة (يتطلب موافقة الشريك ودفع تعويض للابن)',
    aliases: ['تبرؤ', 'طرد-ابن', 'kickchild'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;
        const OWNER_ID = "1145327691772481577"; 

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 8000); 
        };

        if (args[0] === 'clean' || args[0] === 'تنظيف') {
            let childrenRes;
            try { childrenRes = await db.query(`SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { childrenRes = await db.query(`SELECT childid as "childID" FROM children WHERE parentid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            let removed = 0;
            for (const row of childrenRes.rows) {
                const cId = row.childID || row.childid;
                const member = await message.guild.members.fetch(cId).catch(()=>null);
                if (!member) {
                    try { await db.query(`DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [cId, guildId]); }
                    catch(e) { await db.query(`DELETE FROM children WHERE childid = $1 AND guildid = $2`, [cId, guildId]).catch(()=>{}); }
                    removed++;
                }
            }
            
            if (removed > 0) {
                return replyTemp(`🧹 **تم التنظيف بنجاح!**\nتم مسح **${removed}** أبناء معلقين غادروا السيرفر من شجرة عائلتك.`);
            } else {
                return replyTemp(`✅ **شجرة عائلتك نظيفة!** جميع أبنائك متواجدون في السيرفر.`);
            }
        }

        let childMember = message.mentions.members.first();
        if (!childMember && args[0]) {
            const cleanId = args[0].replace(/[<@!>]/g, '');
            childMember = await message.guild.members.fetch(cleanId).catch(()=>null);
        }

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nعليك تحديد الابن: \`!disown @الابن\`\nأو للتنظيف: \`!disown clean\``);
        }

        if (childMember.id === client.user.id || childMember.id === OWNER_ID) {
            return message.reply({ content: "❌ لا يمكنك التبرؤ من أسياد القلعة!", files: [BOT_REJECT_IMAGE] }).catch(()=>{});
        }

        let isMyChildRes;
        try { isMyChildRes = await db.query(`SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2 AND "guildID" = $3`, [userId, childMember.id, guildId]); }
        catch(e) { isMyChildRes = await db.query(`SELECT 1 FROM children WHERE parentid = $1 AND childid = $2 AND guildid = $3`, [userId, childMember.id, guildId]).catch(()=>({rows:[]})); }
        
        if (isMyChildRes.rows.length === 0) {
            return replyTemp(`🚫 **${childMember.displayName}** ليس مسجلاً كابن لك في السجلات.`);
        }

        let partnerId = null;
        try {
            let marriageDataRes;
            try { marriageDataRes = await db.query(`SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { marriageDataRes = await db.query(`SELECT partnerid as "partnerID" FROM marriages WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            if (marriageDataRes.rows.length > 0) {
                partnerId = marriageDataRes.rows[0].partnerID || marriageDataRes.rows[0].partnerid;
            }
        } catch(e) {}
        
        let partnerMember = partnerId ? await message.guild.members.fetch(partnerId).catch(() => null) : null;

        const feePerPerson = partnerMember ? (TOTAL_DISOWN_FEE / 2) : TOTAL_DISOWN_FEE;

        async function performDisown(interaction, parentIds, childId, amountPerPerson) {
            try {
                await db.query('BEGIN');

                for (const pid of parentIds) {
                    const pData = await client.getLevel(pid, guildId);
                    if (!pData || (Number(pData.mora) || 0) < amountPerPerson) {
                        await db.query('ROLLBACK');
                        return interaction.update({ content: `❌ **فشلت العملية:** أحد الآباء لا يملك مورا كافية للتعويض!`, embeds: [], components: [] });
                    }
                    pData.mora = (Number(pData.mora) || 0) - amountPerPerson;
                    await client.setLevel(pData);
                }

                let childData = await client.getLevel(childId, guildId);
                if (!childData) childData = { user: childId, guild: guildId, xp: 0, level: 1, mora: 0 };
                
                const totalCompensation = amountPerPerson * parentIds.length; 
                childData.mora = (Number(childData.mora) || 0) + totalCompensation;
                await client.setLevel(childData);

                try {
                    await db.query(`DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [childId, guildId]);
                } catch(e) {
                    await db.query(`DELETE FROM children WHERE childid = $1 AND guildid = $2`, [childId, guildId]).catch(()=>{});
                }

                await db.query('COMMIT');

                const successEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle(`🚷 تم التبرؤ من الابن`)
                    .setDescription(`تم طرد **${childMember.displayName}** من العائلة.\n💸 تم منح الابن **${totalCompensation.toLocaleString()}** ${MORA_EMOJI} كتعويض إجباري.`)
                    .setImage(DISOWN_GIF);

                await interaction.update({ content: null, embeds: [successEmbed], components: [] });

            } catch (error) {
                await db.query('ROLLBACK');
                console.error("Disown Error:", error);
                return interaction.update({ content: `❌ خطأ في النظام.`, embeds: [], components: [] });
            }
        }

        if (partnerMember) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm').setLabel(`موافقة ودفع ${feePerPerson}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel').setLabel('رفض').setStyle(ButtonStyle.Secondary)
            );

            const confirmMsg = await message.channel.send({
                content: `${partnerMember}`,
                embeds: [new EmbedBuilder()
                    .setTitle('🚷 تصويت على طرد ابن')
                    .setDescription(`يريد ${message.author} التبرؤ من **${childMember}**.\nيجب على كل منكما دفع **${feePerPerson}** ${MORA_EMOJI}.\nهل توافق يا ${partnerMember}؟`)
                    .setColor(Colors.Orange)
                ],
                components: [row]
            });

            const collector = confirmMsg.createMessageComponentCollector({ filter: i => i.user.id === partnerId, time: 60000, max: 1 });

            collector.on('collect', async i => {
                if (i.customId === 'cancel') return i.update({ content: "✅ تم إلغاء قرار الطرد.", embeds: [], components: [] });
                await performDisown(i, [userId, partnerId], childMember.id, feePerPerson);
            });
        } else {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('solo_confirm').setLabel(`تأكيد الطرد دفع ${feePerPerson}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('solo_cancel').setLabel('تراجع').setStyle(ButtonStyle.Secondary)
            );

            const soloMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('⚠️ تأكيد التبرؤ')
                    .setDescription(`هل أنت متأكد من طرد **${childMember.displayName}**؟\nستدفع تعويضاً قدره **${feePerPerson}** ${MORA_EMOJI}.`)
                    .setColor(Colors.DarkRed)
                ],
                components: [row]
            });

            const collector = soloMsg.createMessageComponentCollector({ filter: i => i.user.id === userId, time: 60000, max: 1 });

            collector.on('collect', async i => {
                if (i.customId === 'solo_cancel') return i.update({ content: "✅ تم التراجع.", embeds: [], components: [] });
                await performDisown(i, [userId], childMember.id, feePerPerson);
            });
        }
    }
};
