// commands/family/divorce.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

const ALIMONY_AMOUNT = 2500; // مبلغ النفقة
const MORA_EMOJI = '<:mora:1435647151349698621>';

// 💔 قائمة صور الانفصال
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
        const sql = client.sql;
        const user = message.member;
        const guildId = message.guild.id;

        // 1. تحديد الزوجة المستهدفة (الذكاء في الاختيار) 🧠
        const targetMember = message.mentions.members.first();
        let partnerId;

        if (targetMember) {
            const specificMarriage = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND partnerID = ? AND guildID = ?").get(user.id, targetMember.id, guildId);
            
            if (!specificMarriage) {
                const msg = await message.reply(`🚫 **أنت لست متزوجاً من ${targetMember.displayName}!**`);
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }
            partnerId = targetMember.id;

        } else {
            const allMarriages = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND guildID = ?").all(user.id, guildId);

            if (allMarriages.length === 0) {
                const msg = await message.reply("🚫 **أنت لست متزوجاً أصلاً!**");
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            if (allMarriages.length > 1) {
                const msg = await message.reply({
                    content: `🛑 **لديك ${allMarriages.length} زوجات!**\nيجب عليك تحديد من تريد طلاقها.\n\n📝 **الصيغة الصحيحة:** \`!divorce @الزوجة\``
                });
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            partnerId = allMarriages[0].partnerID;
        }

        // 🔥🔥 التحقق من وجود الشريك في السيرفر (Auto-Divorce Logic) 🔥🔥
        let partner = await message.guild.members.fetch(partnerId).catch(() => null);

        if (!partner) {
            const stmt = sql.prepare("DELETE FROM marriages WHERE (userID = ? AND partnerID = ?) OR (userID = ? AND partnerID = ?) AND guildID = ?");
            stmt.run(user.id, partnerId, partnerId, user.id, guildId);

            sql.prepare("UPDATE children SET parentID = ? WHERE parentID = ? AND guildID = ?").run(user.id, partnerId, guildId);

            const embed = new EmbedBuilder()
                .setColor("Grey")
                .setTitle("⚖️ فسخ عقد تلقائي")
                .setDescription(
                    `بما أن الشريك (<@${partnerId}>) غادر السيرفر، تم فسخ عقد الزواج تلقائياً.\n` +
                    `👶 **الحضانة:** انتقلت حضانة جميع الأطفال إليك.`
                )
                .setFooter({ text: "نظام الطلاق التلقائي" });

            return message.reply({ embeds: [embed] });
        }

        // ==========================================================
        // 🔄 إجراءات الطلاق العادية (الشريك موجود)
        // ==========================================================

        const familyConfig = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(guildId);
        
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

        const isMale = familyConfig && checkRole(familyConfig.maleRole);
        
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

        const children = sql.prepare("SELECT * FROM children WHERE (parentID = ? OR parentID = ?) AND guildID = ?").all(user.id, partner.id, guildId);
        const hasChildren = children.length > 0;

        if (hasChildren) {
            desc += `\n✶ حضـانـة اطفالـكم ستكـون بالتراضـي قـرروا من يحتفظ بالاطفـال`;
        }

        let userData = client.getLevel.get(user.id, guildId);
        if (!userData || userData.mora < cost) {
            const msg = await message.reply(`💸 **لا تملك قيمة النفقة/التعويض!** المطلوب: ${cost.toLocaleString()} ${MORA_EMOJI}`);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        // ==========================================================
        // ⚖️ إرسال "جلسة المحكمة"
        // ==========================================================

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

        // نرسل الرسالة ونحفظها في متغير
        const courtMsg = await message.channel.send({ content: `${partner}`, embeds: [embed], components: [row] });

        let custodyVotes = { [user.id]: null, [partner.id]: null };

        const collector = courtMsg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            // إلغاء الطلاق
            if (i.customId === 'cancel_divorce') {
                if (i.user.id !== user.id && i.user.id !== partner.id) return i.reply({ content: 'ليس لك علاقة!', ephemeral: true });
                await i.update({ content: `🏳️ **تم إلغاء الإجراءات.**`, embeds: [], components: [] });
                return;
            }

            // تأكيد الطلاق المباشر (بدون أطفال)
            if (i.customId === 'confirm_divorce_direct') {
                if (i.user.id !== user.id) return i.reply({ content: `⚠️ **هذا القرار بيد صاحب الطلب (${user.displayName}) فقط!**`, ephemeral: true });
                // نمرر courtMsg هنا وليس i لأن i قد لا يكون قادراً على تعديل الرسالة الأصلية بعد الرد
                // لكن بما أنه direct، نستخدم i للتحديث المباشر
                await performDivorce(i, user, partner, cost, null); 
                return;
            }

            // بدء جلسة الحضانة
            if (i.customId === 'custody_session') {
                if (i.user.id !== user.id && i.user.id !== partner.id) return i.reply({ content: 'للمتزوجين فقط!', ephemeral: true });

                const custodyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('keep_kids').setLabel('الاحتفـاظ بحضانـة الاطفال').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('leave_kids').setLabel('التخـلي عن حضـانة الاطفـال').setStyle(ButtonStyle.Danger)
                );

                await i.reply({ 
                    content: `🔒 **جلسة سرية:** ماذا تريد أن تفعل بالأطفال؟\n(يجب أن يختار أحدكما "احتفاظ" والآخر "تخلي" ليتم الأمر)`, 
                    components: [custodyRow], 
                    ephemeral: true 
                });
            }

            // خيارات الحضانة
            if (i.customId === 'keep_kids' || i.customId === 'leave_kids') {
                const choice = i.customId === 'keep_kids' ? 'keep' : 'leave';
                custodyVotes[i.user.id] = choice;

                // تحديث الرد السري للمستخدم فقط
                await i.update({ content: `✅ تم تسجيل رغبتك: **${choice === 'keep' ? 'الاحتفاظ' : 'التخلي'}**`, components: [] });

                // التحقق من اكتمال التصويت
                if (custodyVotes[user.id] && custodyVotes[partner.id]) {
                    if (custodyVotes[user.id] !== custodyVotes[partner.id]) {
                        // اتفاق ناجح (واحد يبي والثاني ما يبي)
                        const keeper = custodyVotes[user.id] === 'keep' ? user : partner;
                        
                        // 🔥🔥 التعديل الهام هنا 🔥🔥
                        // نستخدم courtMsg لتنفيذ الطلاق لأن i هنا هو تفاعل سري (ephemeral) ولا يمكنه تعديل الرسالة العامة الأصلية بسهولة
                        // لذا نمرر courtMsg كـ interactionOrMsg ولكن يجب التعامل معه كرسالة
                        await performDivorce(courtMsg, user, partner, cost, keeper); 
                    } else {
                        // تعارض (الاثنين يبون أو الاثنين ما يبون)
                        await courtMsg.edit({ 
                            content: `❌ **فشل الطلاق!**\nاختلف الطرفان على الحضانة (كلاكما اخترتما نفس الخيار).\nحاولوا مرة أخرى بتفاهم أكبر.`, 
                            embeds: [], 
                            components: [] 
                        });
                    }
                }
            }
        });

        // ==========================================================
        // 🛠️ دالة تنفيذ الطلاق
        // ==========================================================
        async function performDivorce(interactionOrMsg, payer, receiver, amount, kidsKeeper) {
            const payerDB = client.getLevel.get(payer.id, guildId);
            // إعادة التحقق من الرصيد لحظة التنفيذ
            if (payerDB.mora < amount) {
                const msg = `❌ **فشلت العملية:** ${payer.displayName} أفلس أثناء المحكمة!`;
                // التعامل مع نوع الكائن (هل هو interaction أم message؟)
                if (interactionOrMsg.editReply) await interactionOrMsg.editReply({ content: msg, components: [], embeds: [] }); // للـ interaction المؤجل
                else if (interactionOrMsg.update) await interactionOrMsg.update({ content: msg, components: [], embeds: [] }); // للـ interaction العادي
                else await interactionOrMsg.edit({ content: msg, components: [], embeds: [] }); // للرسالة العادية (مثل courtMsg)
                return;
            }

            // 1. تحويل الأموال
            payerDB.mora -= amount;
            client.setLevel.run(payerDB);

            let receiverDB = client.getLevel.get(receiver.id, guildId);
            if (!receiverDB) receiverDB = { id: `${guildId}-${receiver.id}`, user: receiver.id, guild: guildId, xp: 0, level: 1, mora: 0 };
            receiverDB.mora += amount;
            client.setLevel.run(receiverDB);

            // 2. حذف الزواج
            const stmt = sql.prepare("DELETE FROM marriages WHERE (userID = ? AND partnerID = ?) OR (userID = ? AND partnerID = ?) AND guildID = ?");
            stmt.run(payer.id, receiver.id, receiver.id, payer.id, guildId);

            // 3. نقل الأطفال
            let kidsMsg = "";
            if (kidsKeeper && children.length > 0) {
                // نصحح الاستعلام: نحدث كل طفل يملكه أحد الوالدين ليصبح تابعاً للحاضن الجديد
                const moveStmt = sql.prepare("UPDATE children SET parentID = ? WHERE (parentID = ? OR parentID = ?) AND guildID = ?");
                moveStmt.run(kidsKeeper.id, payer.id, receiver.id, guildId);
                kidsMsg = `\n👶 **الحضانة:** انتقلت جميع الأطفال إلى كفالة **${kidsKeeper.displayName}**.`;
            }

            // 4. الرسالة النهائية مع الصورة
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

            // التعامل النهائي مع الرسالة/التفاعل
            try {
                if (interactionOrMsg.update) {
                    await interactionOrMsg.update({ content: ``, embeds: [finalEmbed], components: [] });
                } else {
                    await interactionOrMsg.edit({ content: ``, embeds: [finalEmbed], components: [] });
                }
            } catch (err) {
                // في حال فشل التعديل (مثلاً الرد السري اختفى)، نرسل رسالة جديدة في القناة
                await message.channel.send({ embeds: [finalEmbed] });
            }
        }
    }
};
