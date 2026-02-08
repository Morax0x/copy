const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

// 🟢 قوائم صور الموافقة
const ACCEPT_GIFS = [
    "https://i.postimg.cc/MKdNxXLS/f71198155e2fcceb77d434526689b006.gif",
    "https://i.postimg.cc/VLYp3XDr/92ee950095047a2744b85532cbb34b71.gif",
    "https://i.postimg.cc/qqrSBK0N/be1fd3b9ce4580bb31cb376eccf5e315.gif",
    "https://i.postimg.cc/ydc2zPM0/38f1e9010a069eb6bb8a5e7f04fe1d1b.gif",
    "https://i.postimg.cc/JzYf3t3N/fbb3746bdbc7507d07ae0a0b23ab1071.gif",
    "https://i.postimg.cc/02P1PT2D/314dfa902c28d93c285e53453111cf57.gif",
    "https://i.postimg.cc/Fzgt0ZGY/ed8113a52d8517b31b4073b9ee9db314.gif"
];

// 🔴 قوائم صور الرفض
const REJECT_GIFS = [
    "https://i.postimg.cc/cJsv39ms/6fced129ae6541ed381b5b5809c09ae6.gif",
    "https://i.postimg.cc/6px2W54M/7b6519089cc27135155459ece52f51f4.gif",
    "https://i.postimg.cc/DfD4NcvF/1381036c9dcf14117351747e672ed515.gif"
];

const MORA_EMOJI = '<:mora:1435647151349698621>'; 

module.exports = {
    name: 'marry',
    description: 'طلب زواج مع تحديد المهر',
    aliases: ['زواج', 'خطبة'],
    
    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;

        // دالة مساعدة للردود المؤقتة (تحذف بعد 5 ثواني)
        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        // =========================================================================
        // 📜 قسم المساعدة (إذا لم يكتب المستخدم أي شيء بعد الأمر)
        // =========================================================================
        // الشرط: لم يكتب أي حجج (args) أو لم يمنشن أحد
        if (!args[0]) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('show_family_help')
                    .setLabel('أوامـر الـزواج والعائلـة')
                    .setStyle(ButtonStyle.Primary) 
                    .setEmoji('💍')
            );

            const promptEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle('💍 نظام العائلة والزواج')
                .setDescription('**لاستعراض كافة الأوامر المتاحة وتفاصيلها، اضغط على الزر أدناه.**')
                .setFooter({ text: 'قائمة الأوامر ستظهر لك فقط (مخفية).' });

            const helpMsg = await message.reply({
                embeds: [promptEmbed],
                components: [row]
            });

            // كوليكتور لزر المساعدة (يحذف الرسالة الأصلية بعد 30 ثانية)
            const collector = helpMsg.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async i => {
                if (i.customId === 'show_family_help') {
                    
                    const helpListEmbed = new EmbedBuilder()
                        .setColor(Colors.Gold)
                        .setTitle('📜 دليل أوامر العائلة')
                        .setDescription('إليك قائمة بجميع الأوامر المتاحة في النظام:')
                        .addFields(
                            { name: '🔹 زواج منشن مبلغ', value: 'لطلب الزواج من عضو ودفع المهر المحدد.', inline: false },
                            { name: '🔹 طلاق', value: 'لإنهاء العلاقة الزوجية (طلاق أو خلع).', inline: false },
                            { name: '🔹 تبني منشن', value: 'لتبني عضو جديد وضمه لشجرة عائلتك.', inline: false },
                            { name: '🔹 طلب-اب منشن', value: 'لتقديم طلب للانضمام لعائلة شخص ما كابن.', inline: false },
                            { name: '🔹 تبرؤ منشن', value: 'لطرد ابن من العائلة وحذفه من السجلات.', inline: false },
                            { name: '🔹 هروب', value: 'للهروب من العائلة والاستقلال (تدفع تعويض).', inline: false },
                            { name: '🔹 شجرة', value: 'لعرض بطاقة شجرة العائلة المصورة.', inline: false },
                            { name: '🔹 قرابة منشن', value: 'لكشف صلة القرابة بينك وبين عضو آخر.', inline: false }
                        )
                        .setFooter({ text: 'نظام العائلة • الإمبراطورية' });

                    // الرد المخفي (Ephemeral)
                    await i.reply({
                        embeds: [helpListEmbed],
                        ephemeral: true 
                    });
                }
            });

            // حذف رسالة الزر تلقائياً بعد انتهاء الوقت
            collector.on('end', () => helpMsg.delete().catch(() => {}));
            return;
        }

        // =========================================================================
        // 💍 بداية كود الزواج الفعلي
        // =========================================================================

        // 1. التأكد من جدول الزواج
        sql.prepare(`
            CREATE TABLE IF NOT EXISTS marriages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userID TEXT,
                partnerID TEXT,
                marriageDate INTEGER,
                guildID TEXT
            )
        `).run();

        // 2. جلب الإعدادات
        const familyConfig = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(message.guild.id);
        if (!familyConfig || !familyConfig.maleRole || !familyConfig.femaleRole) {
            return message.reply("🚫 **لم يتم إعداد رتب العائلة!** اطلب من الإدارة استخدام `set-family-roles`.");
        }

        // 3. التحقق من المدخلات
        const targetMember = message.mentions.members.first();
        let dowry = parseInt(args[1]);

        // إذا وصل هنا، يعني كتب شي بس غلط (مثلاً: زواج @فلان ونسي المبلغ)
        if (!targetMember || isNaN(dowry) || dowry < 0) {
            return replyTemp(`⚠️ **صيغـة غير صحيحة!**\nالاستخدام الصحيح: \`زواج @الطرف_الثاني المبلغ\`\nمثال: \`زواج @فلان 5000\``);
        }

        if (targetMember.id === message.author.id) return replyTemp("❌ تبي تتزوج نفسك؟ استهدي بالله.");
        if (targetMember.user.bot) return replyTemp("🤖 لا يمكنك الزواج من الروبوتات!");

        // 4. تحديد الجنس والرتب
        const isAuthorMale = message.member.roles.cache.has(familyConfig.maleRole);
        const isAuthorFemale = message.member.roles.cache.has(familyConfig.femaleRole);
        const isTargetMale = targetMember.roles.cache.has(familyConfig.maleRole);
        const isTargetFemale = targetMember.roles.cache.has(familyConfig.femaleRole);

        if (!isAuthorMale && !isAuthorFemale) return replyTemp("🚫 **يجب عليك تحديد جنسك أولاً!** (خذ رتبة ولد أو بنت).");
        if (!isTargetMale && !isTargetFemale) return replyTemp("🚫 **الطرف الآخر لم يحدد جنسه بعد!**");

        // 5. قوانين الزواج (منع المثلية)
        if ((isAuthorMale && isTargetMale) || (isAuthorFemale && isTargetFemale)) {
            return replyTemp("<:5gyy:1414564326496534628> **مـا نستقـبل شـواذ اذلـف**");
        }

        // 6. التحقق من الحد الأقصى (الشرع)
        const authorCount = sql.prepare("SELECT count(*) as count FROM marriages WHERE userID = ? AND guildID = ?").get(message.author.id, message.guild.id).count;
        const targetCount = sql.prepare("SELECT count(*) as count FROM marriages WHERE userID = ? AND guildID = ?").get(targetMember.id, message.guild.id).count;

        if (isAuthorMale && authorCount >= 4) return replyTemp("🚫 **عـنـدك 4 زوجـات ارقـد**");
        if (isAuthorFemale && authorCount >= 1) return replyTemp("🚫 **أنتِ متزوجة بالفعل!**");

        if (isTargetMale && targetCount >= 4) return replyTemp(`🚫 **${targetMember.displayName} وصل للحد الأقصى من الزوجات!**`);
        if (isTargetFemale && targetCount >= 1) return replyTemp(`🚫 **${targetMember.displayName} متزوجة بالفعـل!**`);

        const alreadyMarried = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND partnerID = ? AND guildID = ?").get(message.author.id, targetMember.id, message.guild.id);
        if (alreadyMarried) return replyTemp("❌ **أنتم متزوجين بعض أصـلاً!**");

        // 7. فحص المال
        let authorData = client.getLevel.get(message.author.id, message.guild.id);
        if (!authorData || authorData.mora < dowry) {
            return replyTemp(`💸 **رصيدك لا يكفي للمهر!** تملك: ${authorData ? authorData.mora : 0} ${MORA_EMOJI}`);
        }

        // ==========================================================
        // 💌 إرسال الإيمبد (طلب الزواج)
        // ==========================================================
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept_marry').setLabel('المـوافـقـة').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('reject_marry').setLabel('رفــض').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle('✥ طـلـب زواج !')
            .setColor("Random")
            .setDescription(`
✶ ${targetMember}
✶ ${message.author}

طـلـب الزواج منـك !
دفـع لك مهـر بقيمـة: **${dowry.toLocaleString()}** ${MORA_EMOJI}
            `)
            .setThumbnail(message.author.displayAvatarURL())
            .setTimestamp();

        const proposalMsg = await message.channel.send({ content: `${targetMember}`, embeds: [embed], components: [row] });

        const filter = i => i.user.id === targetMember.id;
        const collector = proposalMsg.createMessageComponentCollector({ filter, time: 120000, max: 1 });

        collector.on('collect', async i => {
            // 🔴 حالة الرفض
            if (i.customId === 'reject_marry') {
                const rejectGif = REJECT_GIFS[Math.floor(Math.random() * REJECT_GIFS.length)];

                const rejectEmbed = new EmbedBuilder()
                    .setTitle('✥ زواج مـرفـوض ...')
                    .setColor("Red")
                    .setDescription(`✶ قـام ${targetMember} برفـض الزواج منـك !`)
                    .setImage(rejectGif);

                await i.update({ content: ``, embeds: [rejectEmbed], components: [] });
                return;
            }

            // 🟢 حالة القبول
            if (i.customId === 'accept_marry') {
                // إعادة فحص المال
                authorData = client.getLevel.get(message.author.id, message.guild.id);
                if (authorData.mora < dowry) {
                    return i.update({ content: `❌ **فشلت العملية:** العريس صرف فلوسه أثناء الانتظار!`, components: [], embeds: [] });
                }

                // خصم وإضافة المهر
                authorData.mora -= dowry;
                client.setLevel.run(authorData);

                let targetData = client.getLevel.get(targetMember.id, message.guild.id);
                if (!targetData) targetData = { id: `${message.guild.id}-${targetMember.id}`, user: targetMember.id, guild: message.guild.id, xp: 0, level: 1, mora: 0 };
                targetData.mora += dowry;
                client.setLevel.run(targetData);

                // تسجيل الزواج
                const now = Date.now();
                const insert = sql.prepare("INSERT INTO marriages (userID, partnerID, marriageDate, guildID) VALUES (?, ?, ?, ?)");
                insert.run(message.author.id, targetMember.id, now, message.guild.id);
                insert.run(targetMember.id, message.author.id, now, message.guild.id);

                const acceptGif = ACCEPT_GIFS[Math.floor(Math.random() * ACCEPT_GIFS.length)];

                const acceptEmbed = new EmbedBuilder()
                    .setColor("Green")
                    .setTitle(`💍 مـبـروك الـزواج 💍`)
                    .setDescription(`
تم عقد قران **${message.member.displayName}** و **${targetMember.displayName}**!
تم تحويل المهر: **${dowry.toLocaleString()}** ${MORA_EMOJI}
                    `)
                    .setImage(acceptGif);

                await i.update({ content: `||${message.author} ${targetMember}||`, embeds: [acceptEmbed], components: [] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                proposalMsg.edit({ content: `⏳ **انتهى الوقت..** يبدو أن ${targetMember.displayName} يفكر/تفكر في الأمر.`, components: [], embeds: [] });
            }
        });
    }
};
