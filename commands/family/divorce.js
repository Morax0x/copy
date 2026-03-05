const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require("discord.js");

const ALIMONY_AMOUNT = 2500; 
const MORA_EMOJI = '<:mora:1435647151349698621>';

const DIVORCE_GIFS = [
    "https://media.tenor.com/B7y-Y8qX3pkAAAAC/break-up.gif",
    "https://media.tenor.com/uP_kX8vM8Q0AAAAC/sad-anime.gif",
    "https://media.tenor.com/Images/breakup.gif",
    "https://media.tenor.com/2P_D8-9Q8-0AAAAC/divorce-anime.gif",
    "https://media.tenor.com/images/1381036c9dcf14117351747e672ed515/tenor.gif"
];

module.exports = {
    name: 'divorce',
    description: 'إنهاء الزواج (الطلاق/الخلع) مع دعم تعدد الزوجات والطلاق التلقائي للمغادرين',
    aliases: ['طلاق', 'انفصال', 'خلع'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const user = message.member;
        const guildId = message.guild.id;

        try {
            const targetMember = message.mentions.members.first();
            let partnerId;
            let partner;

            let allMarriages = [];
            try {
                const res = await db.query("SELECT * FROM marriages WHERE userID = $1 AND guildID = $2", [user.id, guildId]);
                allMarriages = res.rows;
            } catch(e) {}

            if (allMarriages.length === 0) {
                const msg = await message.reply("🚫 **أنت لست متزوجاً أصلاً!**");
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            if (targetMember) {
                const specificMarriage = allMarriages.find(m => (m.partnerid || m.partnerID) === targetMember.id);
                if (!specificMarriage) {
                    const msg = await message.reply(`🚫 **أنت لست متزوجاً من ${targetMember.displayName}!**`);
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                    return;
                }
                partnerId = targetMember.id;
                partner = targetMember;
            } else {
                if (allMarriages.length === 1) {
                    partnerId = allMarriages[0].partnerid || allMarriages[0].partnerID;
                    partner = await message.guild.members.fetch(partnerId).catch(() => null);
                } else {
                    const options = await Promise.all(allMarriages.map(async (m) => {
                        const pid = m.partnerid || m.partnerID;
                        const p = await message.guild.members.fetch(pid).catch(() => null);
                        return {
                            label: p ? p.displayName : `Unknown User (${pid})`,
                            value: pid,
                            description: `الزوجة رقم ${m.id}`,
                            emoji: '💍'
                        };
                    }));

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_wife_divorce')
                        .setPlaceholder('اختر الزوجة التي تريد طلاقها')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    
                    const selectMsg = await message.reply({ content: "**لديك أكثر من زوجة، اختر من تريد طلاقها:**", components: [row] });

                    const filter = i => i.customId === 'select_wife_divorce' && i.user.id === user.id;
                    try {
                        const selection = await selectMsg.awaitMessageComponent({ filter, time: 30000, componentType: ComponentType.StringSelect });
                        partnerId = selection.values[0];
                        partner = await message.guild.members.fetch(partnerId).catch(() => null);
                        await selection.deferUpdate(); 
                        await selectMsg.delete().catch(() => {});
                    } catch (e) {
                        return selectMsg.edit({ content: "⏰ **انتهى الوقت!** حاول مرة أخرى.", components: [] });
                    }
                }
            }

            if (!partner) {
                try {
                    await db.query('BEGIN');
                    await db.query("DELETE FROM marriages WHERE userID = $1 AND partnerID = $2 AND guildID = $3", [user.id, partnerId, guildId]); 
                    await db.query("UPDATE children SET parentID = $1 WHERE parentID = $2 AND guildID = $3", [user.id, partnerId, guildId]);
                    await db.query('COMMIT');
                } catch(e) {
                    await db.query('ROLLBACK');
                }

                const embed = new EmbedBuilder()
                    .setColor("Grey")
                    .setTitle("⚖️ فسخ عقد تلقائي")
                    .setDescription(
                        `بما أن الشريك (<@${partnerId}>) غادر السيرفر، تم فسخ عقد الزواج تلقائياً.\n` +
                        `👶 **الحضانة:** انتقلت حضانة جميع الأطفال إليك.`
                    )
                    .setFooter({ text: "نظام الطلاق التلقائي" });

                const msg = await message.reply({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => {}), 15000);
                return;
            }

            let familyConfig = null;
            try {
                const confRes = await db.query("SELECT * FROM family_config WHERE guildID = $1", [guildId]);
                familyConfig = confRes.rows[0];
            } catch(e) {}
            
            const checkRole = (rolesData) => {
                if (!rolesData) return false;
                try {
                    const roleIds = JSON.parse(rolesData);
                    if (Array.isArray(roleIds)) return roleIds.some(id => user.roles.cache.has(id));
                } catch {
                    return user.roles.cache.has(rolesData);
                }
                return false;
            };

            const isMale = familyConfig && checkRole(familyConfig.malerole || familyConfig.maleRole);
            
            let title, desc, footer;
            let cost = 0;

            if (isMale) {
                title = "✥ طـلب طــلاق";
                desc = `
    ✶ تقـدم ${user} بطلب الطـلاق منـك
    ✶ حـكمـت المحكمـة عليـه بدفع نفـقة لك ومقدراها **${ALIMONY_AMOUNT.toLocaleString()}** ${MORA_EMOJI}
                `;
                cost = ALIMONY_AMOUNT;
                footer = "المدعي: الزوج";
            } else {
                title = "✥ طـلب خـلـع";
                desc = `
    ✶ تقـدمت ${user} بطلب الخـلـع منـك
    ✶ حـكمـت المحكمـة عليـها بدفع تعويض لك ومقداره **${ALIMONY_AMOUNT.toLocaleString()}** ${MORA_EMOJI}
                `;
                cost = ALIMONY_AMOUNT;
                footer = "المدعية: الزوجة";
            }

            let children = [];
            try {
                const childRes = await db.query("SELECT * FROM children WHERE (parentID = $1 OR parentID = $2) AND guildID = $3", [user.id, partner.id, guildId]);
                children = childRes.rows;
            } catch(e) {}
            
            const hasChildren = children.length > 0;

            if (hasChildren) {
                desc += `\n✶ حضـانـة اطفالـكم ستكـون بالتراضـي قـرروا من يحتفظ بالاطفـال`;
            }

            let userData = await client.getLevel(user.id, guildId);
            if (!userData || Number(userData.mora) < cost) {
                const msg = await message.reply(`💸 **لا تملك قيمة النفقة/التعويض!** المطلوب: ${cost.toLocaleString()} ${MORA_EMOJI}`);
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            const row = new ActionRowBuilder();
            
            if (hasChildren) {
                row.addComponents(
                    new ButtonBuilder().setCustomId('custody_session').setLabel('حضـانـة الاطفـال').setStyle(ButtonStyle.Primary).setEmoji('👶')
                );
            } else {
                row.addComponents(
                    new ButtonBuilder().setCustomId('confirm_divorce_direct').setLabel('تأكيد الانفصال').setStyle(ButtonStyle.Danger).setEmoji('💔')
                );
            }
            
            row.addComponents(
                new ButtonBuilder().setCustomId('cancel_divorce').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
            );

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor("Random")
                .setDescription(desc)
                .setFooter({ text: footer });

            const courtMsg = await message.channel.send({ content: `${partner}`, embeds: [embed], components: [row] });

            let custodyVotes = { [user.id]: null, [partner.id]: null };

            const collector = courtMsg.createMessageComponentCollector({ 
                filter: i => (i.user.id === user.id || i.user.id === partner.id),
                time: 300000 
            });

            collector.on('collect', async i => {
                if (i.customId === 'cancel_divorce') {
                    await i.deferUpdate(); 
                    await courtMsg.delete().catch(() => {}); 
                    const msg = await message.channel.send({ content: `🏳️ **تم إلغاء إجراءات الطلاق.**` });
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                    return;
                }

                if (i.customId === 'confirm_divorce_direct') {
                    if (i.user.id !== user.id) return i.reply({ content: `⚠️ **هذا القرار بيد صاحب الطلب (${user.displayName}) فقط!**`, ephemeral: true });
                    
                    await performDivorce(i, user, partner, cost, null, true); 
                    return;
                }

                if (i.customId === 'custody_session') {
                    const custodyRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('keep_kids').setLabel('الاحتفـاظ بحضانـة الاطفال').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('leave_kids').setLabel('التخـلي عن حضـانة الاطفـال').setStyle(ButtonStyle.Danger)
                    );

                    const secretMsg = await i.reply({ 
                        content: `🔒 **جلسة سرية:** ماذا تريد أن تفعل بالأطفال؟\n(اختر بحكمة، إذا تخلى أحدكما سيتم الطلاق فوراً للحاضن)`, 
                        components: [custodyRow], 
                        ephemeral: true,
                        fetchReply: true 
                    });

                    const secretCollector = secretMsg.createMessageComponentCollector({ 
                        filter: btn => btn.user.id === i.user.id, 
                        time: 60000, 
                        max: 1 
                    });

                    secretCollector.on('collect', async btn => {
                        const choice = btn.customId === 'keep_kids' ? 'keep' : 'leave';
                        custodyVotes[btn.user.id] = choice;

                        await btn.update({ content: `✅ تم تسجيل رغبتك: **${choice === 'keep' ? 'الاحتفاظ' : 'التخلي'}**`, components: [] });
                        
                        if (choice === 'leave') {
                            const keeper = btn.user.id === user.id ? partner : user;
                            await performDivorce(null, user, partner, cost, keeper, false); 
                            return;
                        }

                        if (custodyVotes[user.id] === 'keep' && custodyVotes[partner.id] === 'keep') {
                            await courtMsg.edit({ 
                                content: `❌ **فشل الطلاق!**\nكلاكما يتمسك بالحضانة. يجب أن يتنازل أحدكما.\nحاولوا مرة أخرى بتفاهم أكبر.`, 
                                embeds: [], 
                                components: [] 
                            });
                            setTimeout(() => courtMsg.delete().catch(() => {}), 15000);
                        }
                    });
                }
            });

            async function performDivorce(interaction, payer, receiver, amount, kidsKeeper, isDirectUpdate) {
                try {
                    await db.query('BEGIN');
                    
                    const payerDB = await client.getLevel(payer.id, guildId);
                    if (Number(payerDB.mora) < amount) {
                        await db.query('ROLLBACK');
                        const msg = `❌ **فشلت العملية:** ${payer.displayName} أفلس أثناء المحكمة!`;
                        if (isDirectUpdate && interaction) await interaction.update({ content: msg, components: [], embeds: [] });
                        else await courtMsg.edit({ content: msg, components: [], embeds: [] });
                        return;
                    }

                    payerDB.mora = Number(payerDB.mora) - amount;
                    await client.setLevel(payerDB);

                    let receiverDB = await client.getLevel(receiver.id, guildId);
                    if (!receiverDB) receiverDB = { id: `${guildId}-${receiver.id}`, user: receiver.id, guild: guildId, xp: 0, level: 1, mora: 0 };
                    receiverDB.mora = Number(receiverDB.mora) + amount;
                    await client.setLevel(receiverDB);

                    await db.query("DELETE FROM marriages WHERE ((userID = $1 AND partnerID = $2) OR (userID = $2 AND partnerID = $1)) AND guildID = $3", [payer.id, receiver.id, guildId]);

                    let kidsMsg = "";
                    if (kidsKeeper && children.length > 0) {
                        await db.query("UPDATE children SET parentID = $1 WHERE (parentID = $2 OR parentID = $3) AND guildID = $4", [kidsKeeper.id, payer.id, receiver.id, guildId]);
                        kidsMsg = `\n👶 **الحضانة:** انتقلت جميع الأطفال إلى كفالة **${kidsKeeper.displayName}**.`;
                    }

                    await db.query('COMMIT');

                    const finalGif = DIVORCE_GIFS[Math.floor(Math.random() * DIVORCE_GIFS.length)];

                    const finalEmbed = new EmbedBuilder()
                        .setColor("Grey")
                        .setTitle(`⚖️ حكمت المحكمة`)
                        .setDescription(
                            `تم التفريق بين **${payer.displayName}** و **${receiver.displayName}** رسمياً.\n` +
                            `💸 **النفقة المدفوعة:** ${amount.toLocaleString()} ${MORA_EMOJI}\n` +
                            kidsMsg
                        )
                        .setImage(finalGif)
                        .setTimestamp();

                    try {
                        if (isDirectUpdate && interaction) {
                            await interaction.update({ content: ``, embeds: [finalEmbed], components: [] });
                        } else {
                            await courtMsg.edit({ content: ``, embeds: [finalEmbed], components: [] });
                        }
                        
                        setTimeout(() => {
                            if (isDirectUpdate && interaction) interaction.deleteReply().catch(() => {});
                            else courtMsg.delete().catch(() => {});
                        }, 15000);

                    } catch (err) {
                        const msg = await message.channel.send({ embeds: [finalEmbed] });
                        setTimeout(() => msg.delete().catch(() => {}), 15000);
                    }

                } catch (error) {
                    await db.query('ROLLBACK');
                    console.error("Divorce Transaction Error:", error);
                    const msg = `❌ حدث خطأ داخلي أثناء تنفيذ الطلاق.`;
                    if (isDirectUpdate && interaction) await interaction.update({ content: msg, components: [], embeds: [] });
                    else await courtMsg.edit({ content: msg, components: [], embeds: [] });
                }
            }

        } catch (error) {
            console.error("Error in divorce command:", error);
            message.reply("❌ حدث خطأ غير متوقع أثناء تنفيذ الأمر.");
        }
    }
};
