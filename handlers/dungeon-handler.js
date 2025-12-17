const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType } = require('discord.js');
const path = require('path');

// استدعاء محرك المعركة من الملف المجاور
const { runDungeon } = require('./dungeon-battle.js');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const DUNGEON_COOLDOWN = 3 * 60 * 60 * 1000; 
const OWNER_ID = "1145327691772481577"; 

// لتتبع الطلبات النشطة ومنع التكرار (Global Lock)
const activeDungeonRequests = new Set();

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    // منع اللاعب من فتح أكثر من دانجون في نفس الوقت
    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل! أنهِ المعركة الحالية أولاً.", ephemeral: true });
    }

    // التحقق من مستوى القائد
    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **10** لتتمكن من قيادة غارة دانجون.", ephemeral: true });
    }

    // قفل اللاعب مؤقتاً حتى ينتهي أو يلغي
    activeDungeonRequests.add(user.id);

    // التحقق من الكولداون (لغير المالك)
    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        const expirationTime = lastDungeon + DUNGEON_COOLDOWN;

        if (now < expirationTime) {
            const finishTimeUnix = Math.floor(expirationTime / 1000);
            const cooldownEmbed = new EmbedBuilder()
                .setTitle('❖ استـراحـة مـحـارب ..')
                .setDescription(`✶ استـرح قليلاً ايـهـا المحـارب \n✶ يمكنـك غـزو الـدانجون مجدداً: \n<t:${finishTimeUnix}:R>`)
                .setColor("Random")
                .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png');

            activeDungeonRequests.delete(user.id); 
            
            const isSlash = !!interaction.isChatInputCommand;
            if (isSlash) return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
            else return interaction.reply({ embeds: [cooldownEmbed], allowedMentions: { repliedUser: false } });
        }
    }

    // بناء أزرار اختيار المنطقة (Theme)
    const themes = Object.keys(dungeonConfig.themes);
    const buttons = themes.map(key => {
        const theme = dungeonConfig.themes[key];
        return new ButtonBuilder()
            .setCustomId(`dungeon_theme_${key}`)
            .setLabel(theme.name)
            .setEmoji(theme.emoji)
            .setStyle(ButtonStyle.Secondary);
    });

    // ترتيب الأزرار في صفوف (كل صف يتحمل 5 أزرار، هنا نقسمها 2-2 للترتيب)
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    if (buttons.length > 0) row1.addComponents(buttons.slice(0, 2));
    if (buttons.length > 2) row2.addComponents(buttons.slice(2, 4));

    const components = [row1];
    if (row2.components.length > 0) components.push(row2);

    const embed = new EmbedBuilder()
        .setTitle('⚔️ بوابة الدانجون')
        .setDescription(`أهلاً بك أيها القائد **${user.username}**!\nاختر المنطقة التي تود غزوها مع فريقك:`)
        .setColor('#2B2D31')
        .setImage('https://i.postimg.cc/NMkWVyLV/line.png');

    // إرسال رسالة الاختيار
    const msg = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });

    // كوليكتور لاختيار الثيم
    const filter = i => i.user.id === user.id && i.customId.startsWith('dungeon_theme_');
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
        const themeKey = i.customId.replace('dungeon_theme_', '');
        const theme = dungeonConfig.themes[themeKey];
        // الانتقال لمرحلة اللوبي
        await lobbyPhase(i, theme, sql); 
    });

    collector.on('end', (c, reason) => {
        if (reason === 'time') {
            activeDungeonRequests.delete(user.id); 
            if (msg.editable) msg.edit({ content: "⏰ انتهى وقت اختيار المنطقة.", components: [] }).catch(()=>{});
        }
    });
}

async function lobbyPhase(interaction, theme, sql) {
    const host = interaction.user;
    
    // تخزين الكلاسات لكل لاعب. القائد دائماً Leader
    let partyClasses = new Map();
    partyClasses.set(host.id, 'Leader');
    
    let party = [host.id];
      
    // دالة لتحديث الإيمبد بقائمة اللاعبين الحالية
    const updateEmbed = () => {
        const memberList = party.map((id, i) => {
            const cls = partyClasses.get(id) || 'Unknown';
            // تعريب العرض في القائمة
            let arabCls = cls;
            if (cls === 'Leader') arabCls = 'القائد 👑';
            else if (cls === 'Tank') arabCls = 'مُدرّع 🛡️';
            else if (cls === 'Priest') arabCls = 'كاهن ✨';
            else if (cls === 'Mage') arabCls = 'ساحر ❄️';
            else if (cls === 'Summoner') arabCls = 'مستدعٍ 🐺';

            return `\`${i+1}.\` <@${id}> [${arabCls}]`;
        }).join('\n');

        return new EmbedBuilder()
            .setTitle(`${theme.emoji} بوابة الدانجون: ${theme.name}`)
            .setDescription(`**القائد:** ${host}\n**مستوى الانضمام المطلوب:** 5 وما فوق\n**التكلفة:** 100 ${EMOJI_MORA}\n\n👥 **كتيبة الأبطال:**\n${memberList}`)
            .setColor('DarkRed')
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام وتحديد التخصص').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('start').setLabel('إعلان النفير (انطلاق)').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    // تحديث الرسالة الحالية
    await interaction.update({ content: null, embeds: [updateEmbed()], components: [row] });
    const msg = await interaction.message;
    
    // كوليكتور الانضمام والبدء (لمدة 60 ثانية)
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        // --- زر الانضمام ---
        if (i.customId === 'join') {
            if (party.includes(i.user.id)) return i.reply({ content: "⚠️ أنت منضم بالفعل للفريق.", ephemeral: true });
            if (party.length >= 5) return i.reply({ content: "🚫 الفريق ممتلئ (الحد الأقصى 5).", ephemeral: true });
            
            // شروط الانضمام لغير المالك
            if (i.user.id !== OWNER_ID) {
                const joinData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                const now = Date.now();
                const resetTime = (joinData?.last_join_reset || 0);
                
                if (now - resetTime < DUNGEON_COOLDOWN) {
                    if ((joinData?.dungeon_join_count || 0) >= 3) {
                        return i.reply({ content: "🚫 لقد استنفذت مرات الانضمام المسموحة (3 مرات كل 3 ساعات).", ephemeral: true });
                    }
                }
            }

            // التحقق من المستوى والمورا
            const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
            if (!joinerData || joinerData.level < 5) return i.reply({ content: "🚫 مستواك منخفض جداً! يجب أن تكون لفل 5+.", ephemeral: true });
            if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك ما يكفي من المال (مطلوب 100 ${EMOJI_MORA}).`, ephemeral: true });
            
            // --- إرسال قائمة اختيار التخصص (Select Menu) ---
            const classRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('class_select')
                    .setPlaceholder('حدد تخصصك القتالي...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('المُدرّع (The Tank)')
                            .setValue('Tank')
                            .setDescription('حصن الفريق: دفاع عالٍ واجتذاب هجمات العدو.')
                            .setEmoji('🛡️'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('الكاهن (The Priest)')
                            .setValue('Priest')
                            .setDescription('نبض الحياة: شفاء الجراح وإحياء الساقطين.')
                            .setEmoji('✨'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('الساحر (Mage)')
                            .setValue('Mage')
                            .setDescription('سيد العناصر: تجميد الخصوم وشل حركتهم.')
                            .setEmoji('❄️'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('المستدعي (Summoner)')
                            .setValue('Summoner')
                            .setDescription('استحضار الأرواح: استدعاء وحش حارس للمساندة.')
                            .setEmoji('🐺')
                    )
            );

            // رسالة مخفية (Ephemeral) يختار منها اللاعب
            const selectMsg = await i.reply({ content: "⚜️ **اختر المسار الذي ستسلكه في المعركة:**", components: [classRow], ephemeral: true, fetchReply: true });
            
            try {
                // انتظار الاختيار
                const selection = await selectMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                const selectedClass = selection.values[0];
                
                // تسجيل اللاعب وتخصصه
                partyClasses.set(i.user.id, selectedClass);
                party.push(i.user.id);
                
                // ترجمة الاسم للعرض في رسالة التأكيد
                let displayClassName = selectedClass;
                if(selectedClass === 'Tank') displayClassName = 'المُدرّع';
                if(selectedClass === 'Priest') displayClassName = 'الكاهن';
                if(selectedClass === 'Mage') displayClassName = 'الساحر';
                if(selectedClass === 'Summoner') displayClassName = 'المستدعي';

                await selection.update({ content: `✅ لقد اخترت مسار **${displayClassName}**. استعد للقتال!`, components: [] });
                
                // تحديث اللوبي العام
                await msg.edit({ embeds: [updateEmbed()] });
                
                // إذا اكتمل العدد، ابدأ تلقائياً (اختياري، هنا نوقف الكوليكتور فقط)
                if (party.length >= 5) collector.stop('start');

            } catch (e) {
                // إذا انتهى الوقت ولم يختر كلاس
                await i.editReply({ content: "⏰ انتهى وقت اختيار التخصص، لم يتم ضمك للفريق.", components: [] }).catch(()=>{});
            }

        // --- زر البدء (Start) ---
        } else if (i.customId === 'start') {
            if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يملك صلاحية إعلان النفير.", ephemeral: true });
            collector.stop('start');
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();

            // خصم المورا وتحديث الكولداون لجميع المشاركين
            party.forEach(id => {
                sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                
                if (id === host.id) {
                    if (id !== OWNER_ID) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                    }
                } else {
                    if (id !== OWNER_ID) {
                        const jData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(id, interaction.guild.id);
                        const lastReset = jData?.last_join_reset || 0;

                        if (now - lastReset > DUNGEON_COOLDOWN) {
                            sql.prepare("UPDATE levels SET last_join_reset = ?, dungeon_join_count = 1 WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                        } else {
                            sql.prepare("UPDATE levels SET dungeon_join_count = dungeon_join_count + 1 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                        }
                    }
                }
            });

            try {
                // إنشاء ثريد المعركة
                const thread = await msg.channel.threads.create({
                    name: `⚔️ دانجون ${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread, 
                    reason: 'Start Dungeon Battle'
                });

                const allMentions = party.map(id => `<@${id}>`).join(' ');
                await thread.send({ content: `🔔 **دقت طبول الحرب!** ${allMentions}` });

                if (msg.editable) await msg.edit({ content: `✅ **انطلق الأبطال نحو المجهول!** <#${thread.id}>`, components: [] });

                // 🔥 استدعاء محرك المعركة من الملف الخارجي 🔥
                // نمرر partyClasses و activeDungeonRequests
                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (err) {
                console.error(err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ تقني أثناء بدء المعركة.");
            }
        } else {
            // إذا انتهى وقت اللوبي ولم يبدأ القائد
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تفرق الجمع وأُلغيت الغزوة (انتهى الوقت).", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
