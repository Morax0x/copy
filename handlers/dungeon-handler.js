const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType } = require('discord.js');
const path = require('path');

// استدعاء محرك المعركة من الملف الأول
const { runDungeon } = require('./dungeon-battle.js');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const DUNGEON_COOLDOWN = 3 * 60 * 60 * 1000; 
const OWNER_ID = "1145327691772481577"; 

// لتتبع الطلبات النشطة ومنع التكرار
const activeDungeonRequests = new Set();

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", ephemeral: true });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "مـا زلـت رحالاً يا غـلام يجب ان تصل للمستوى 10", ephemeral: true });
    }

    activeDungeonRequests.add(user.id);

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

    const themes = Object.keys(dungeonConfig.themes);
    const buttons = themes.map(key => {
        const theme = dungeonConfig.themes[key];
        return new ButtonBuilder()
            .setCustomId(`dungeon_theme_${key}`)
            .setLabel(theme.name)
            .setEmoji(theme.emoji)
            .setStyle(ButtonStyle.Secondary);
    });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    if (buttons.length > 0) row1.addComponents(buttons.slice(0, 2));
    if (buttons.length > 2) row2.addComponents(buttons.slice(2, 4));

    const components = [row1];
    if (row2.components.length > 0) components.push(row2);

    const embed = new EmbedBuilder()
        .setTitle('⚔️ بوابة الدانجون')
        .setDescription(`اهـلا ايها المغامـر <@${user.id}>!\nاختر الدانجون الذي تريد غـزوه:`)
        .setColor('#2B2D31')
        .setImage('https://i.postimg.cc/NMkWVyLV/line.png');

    const msg = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });

    const filter = i => i.user.id === user.id && i.customId.startsWith('dungeon_theme_');
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
        const themeKey = i.customId.replace('dungeon_theme_', '');
        const theme = dungeonConfig.themes[themeKey];
        await lobbyPhase(i, theme, sql); 
    });

    collector.on('end', (c, reason) => {
        if (reason === 'time') {
            activeDungeonRequests.delete(user.id); 
            if (msg.editable) msg.edit({ content: "⏰ انتهى وقت الاختيار.", components: [] }).catch(()=>{});
        }
    });
}

async function lobbyPhase(interaction, theme, sql) {
    const host = interaction.user;
    // تخزين الكلاسات لكل لاعب. القائد دائما Leader
    let partyClasses = new Map();
    partyClasses.set(host.id, 'Leader');
    
    let party = [host.id];
      
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

    await interaction.update({ content: null, embeds: [updateEmbed()], components: [row] });
    const msg = await interaction.message;
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'join') {
            if (party.includes(i.user.id)) return i.reply({ content: "⚠️ أنت منضم بالفعل.", ephemeral: true });
            if (party.length >= 5) return i.reply({ content: "🚫 الفريق ممتلئ.", ephemeral: true });
            
            if (i.user.id !== OWNER_ID) {
                const joinData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                const now = Date.now();
                const resetTime = (joinData?.last_join_reset || 0);
                
                if (now - resetTime < DUNGEON_COOLDOWN) {
                    if ((joinData?.dungeon_join_count || 0) >= 3) {
                        return i.reply({ content: "🚫 لقد استنفذت مرات الانضمام (3 مرات).", ephemeral: true });
                    }
                }
            }

            const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
            if (!joinerData || joinerData.level < 5) return i.reply({ content: "🚫 مستواك أقل من 5.", ephemeral: true });
            if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك 100 ${EMOJI_MORA}.`, ephemeral: true });
            
            // --- اختيار التخصص للمنضمين ---
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

            const selectMsg = await i.reply({ content: "⚜️ **اختر المسار الذي ستسلكه في المعركة:**", components: [classRow], ephemeral: true, fetchReply: true });
            
            try {
                const selection = await selectMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                const selectedClass = selection.values[0];
                
                partyClasses.set(i.user.id, selectedClass);
                party.push(i.user.id);
                
                // ترجمة الاسم للعرض فقط
                let displayClassName = selectedClass;
                if(selectedClass === 'Tank') displayClassName = 'المُدرّع';
                if(selectedClass === 'Priest') displayClassName = 'الكاهن';
                if(selectedClass === 'Mage') displayClassName = 'الساحر';
                if(selectedClass === 'Summoner') displayClassName = 'المستدعي';

                await selection.update({ content: `✅ لقد اخترت مسار **${displayClassName}**. استعد للقتال!`, components: [] });
                await msg.edit({ embeds: [updateEmbed()] });
                
                if (party.length >= 5) collector.stop('start');
            } catch (e) {
                await i.editReply({ content: "⏰ انتهى وقت اختيار التخصص.", components: [] });
            }

        } else if (i.customId === 'start') {
            if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يملك صلاحية إعلان النفير.", ephemeral: true });
            collector.stop('start');
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();

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
                const thread = await msg.channel.threads.create({
                    name: `⚔️ دانجون ${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread, 
                    reason: 'Start Dungeon Battle'
                });

                const allMentions = party.map(id => `<@${id}>`).join(' ');
                await thread.send({ content: `🔔 **دقت طبول الحرب!** ${allMentions}` });

                if (msg.editable) await msg.edit({ content: `✅ **انطلق الأبطال نحو المجهول!** <#${thread.id}>`, components: [] });

                // استدعاء دالة التشغيل من الملف الخارجي
                // نمرر activeDungeonRequests أيضاً ليتم حذفه عند انتهاء المعركة في الملف الآخر
                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (err) {
                console.error(err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ تقني.");
            }
        } else {
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تفرق الجمع وأُلغيت الغزوة.", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
