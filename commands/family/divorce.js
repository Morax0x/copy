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
    description: 'إنهاء الزواج (الطلاق/الخلع) مع دعم تعدد الزوجات',
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
            // الحالة أ: المستخدم حدد شخصاً (منشن)
            const specificMarriage = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND partnerID = ? AND guildID = ?").get(user.id, targetMember.id, guildId);
            
            if (!specificMarriage) {
                const msg = await message.reply(`🚫 **أنت لست متزوجاً من ${targetMember.displayName}!**`);
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }
            partnerId = targetMember.id;

        } else {
            // الحالة ب: المستخدم لم يمنشن أحداً
            const allMarriages = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND guildID = ?").all(user.id, guildId);

            if (allMarriages.length === 0) {
                const msg = await message.reply("🚫 **أنت لست متزوجاً أصلاً!**");
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            if (allMarriages.length > 1) {
                // 🛑 هنا الرد التعليمي عند الخطأ (تعدد الزوجات بدون تحديد)
                const msg = await message.reply({
                    content: `🛑 **لديك ${allMarriages.length} زوجات!**\nيجب عليك تحديد من تريد طلاقها.\n\n📝 **الصيغة الصحيحة:** \`!divorce @الزوجة\``
                });
                // حذف الرسالة بعد 5 ثواني
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            // عنده زوجة واحدة فقط -> نختارها تلقائياً
            partnerId = allMarriages[0].partnerID;
        }

        // جلب كائن العضو (Partner)
        const partner = await message.guild.members.fetch(partnerId).catch(() => null);
        if (!partner) return message.reply("⚠️ **الشريك غير موجود بالسيرفر!** سيتم فسخ العقد تلقائياً (تواصل مع الإدارة).");

        // 2. تحديد نوع الإجراء (طلاق أم خلع)
        const familyConfig = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(guildId);
        const isMale = user.roles.cache.has(familyConfig?.maleRole);
        
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

        // 3. التحقق من وجود أطفال مشتركين
        const children = sql.prepare("SELECT * FROM children WHERE (parentID = ? OR parentID = ?) AND guildID = ?").all(user.id, partner.id, guildId);
        const hasChildren = children.length > 0;

        if (hasChildren) {
            desc += `\n✶ حضـانـة اطفالـكم ستكـون بالتراضـي قـرروا من يحتفظ بالاطفـال`;
        }

        // 4. التحقق من الرصيد
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

        const courtMsg = await message.channel.send({ content: `${partner}`, embeds: [embed], components: [row] });

        let custodyVotes = { [user.id]: null, [partner.id]: null };

        const collector = courtMsg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            if (i.customId === 'cancel_divorce') {
                if (i.user.id !== user.id && i.user.id !== partner.id) return i.reply({ content: 'ليس لك علاقة!', ephemeral: true });
                await i.update({ content: `🏳️ **تم إلغاء الإجراءات.**`, embeds: [], components: [] });
                return;
            }

            if (i.customId === 'confirm_divorce_direct') {
                if (i.user.id !== user.id) return i.reply({ content: `⚠️ **هذا القرار بيد صاحب الطلب (${user.displayName}) فقط!**`, ephemeral: true });
                await performDivorce(i, user, partner, cost, null);
                return;
            }

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

            if (i.customId === 'keep_kids' || i.customId === 'leave_kids') {
                const choice = i.customId === 'keep_kids' ? 'keep' : 'leave';
                custodyVotes[i.user.id] = choice;

                await i.update({ content: `✅ تم تسجيل رغبتك: **${choice === 'keep' ? 'الاحتفاظ' : 'التخلي'}**`, components: [] });

                if (custodyVotes[user.id] && custodyVotes[partner.id]) {
                    if (custodyVotes[user.id] !== custodyVotes[partner.id]) {
                        const keeper = custodyVotes[user.id] === 'keep' ? user : partner;
                        await performDivorce(courtMsg, user, partner, cost, keeper); 
                    } else {
                        await courtMsg.edit({ 
                            content: `❌ **فشل الطلاق!**\nاختلف الطرفان على الحضانة.\nحاولوا مرة أخرى.`, 
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
            if (payerDB.mora < amount) {
                const msg = `❌ **فشلت العملية:** ${payer.displayName} أفلس أثناء المحكمة!`;
                if (interactionOrMsg.edit) interactionOrMsg.edit({ content: msg, components: [], embeds: [] });
                else interactionOrMsg.update({ content: msg, components: [], embeds: [] });
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

            if (interactionOrMsg.edit) await interactionOrMsg.edit({ content: ``, embeds: [finalEmbed], components: [] });
            else await interactionOrMsg.update({ content: ``, embeds: [finalEmbed], components: [] });
        }
    }
};
