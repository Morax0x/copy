const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType } = require('discord.js');
const path = require('path');

// استدعاء محرك المعركة
const { runDungeon } = require('./dungeon-battle.js');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const DUNGEON_COOLDOWN = 3 * 60 * 60 * 1000; 
const OWNER_ID = "1145327691772481577"; 

const activeDungeonRequests = new Set();

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", ephemeral: true });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **10** لتتمكن من قيادة غارة دانجون.", ephemeral: true });
    }

    activeDungeonRequests.add(user.id);

    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        const expirationTime = lastDungeon + DUNGEON_COOLDOWN;

        if (now < expirationTime) {
            const finishTimeUnix = Math.floor(expirationTime / 1000);
            activeDungeonRequests.delete(user.id); 
            return interaction.reply({ content: `⏳ **استرح قليلاً!** يمكنك بدء غارة جديدة <t:${finishTimeUnix}:R>.`, ephemeral: true });
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
    
    // 🔥 [تعديل] إصلاح توزيع الأزرار (5 في كل صف بدلاً من 2)
    if (buttons.length > 0) row1.addComponents(buttons.slice(0, 5));
    if (buttons.length > 5) row2.addComponents(buttons.slice(5, 10));

    const components = [row1];
    if (row2.components.length > 0) components.push(row2);

    const embed = new EmbedBuilder()
        .setTitle('⚔️ بوابة الدانجون')
        .setDescription(`أهلاً بك أيها القائد **${user.username}**!\nاختر المنطقة التي تود غزوها:`)
        .setColor('#2B2D31')
        .setImage('https://i.postimg.cc/NMkWVyLV/line.png');

    const msg = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });

    const filter = i => i.user.id === user.id && i.customId.startsWith('dungeon_theme_');
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
        try {
            await i.deferUpdate(); 
            
            // 🔥 [إصلاح هام] إيقاف الكوليكتور فوراً عند الاختيار لمنع انتهاء الوقت وتدمير اللوبي
            collector.stop('selected'); 

            const themeKey = i.customId.replace('dungeon_theme_', '');
            const theme = dungeonConfig.themes[themeKey];
            
            await lobbyPhase(i, theme, sql); 
        } catch (err) {
            console.error("Error in theme selection:", err);
            activeDungeonRequests.delete(user.id);
        }
    });

    collector.on('end', (c, reason) => {
        // 🔥 [إصلاح هام] الحذف فقط إذا انتهى الوقت ولم يختر أحد
        if (reason === 'time') {
            activeDungeonRequests.delete(user.id); 
            if (msg.editable) msg.edit({ content: "⏰ انتهى وقت الاختيار.", components: [] }).catch(()=>{});
        }
    });
}

async function lobbyPhase(interaction, theme, sql) {
    const host = interaction.user;
    
    let partyClasses = new Map();
    partyClasses.set(host.id, 'Leader');
    let party = [host.id];
      
    const updateEmbed = () => {
        const memberList = party.map((id, i) => {
            const cls = partyClasses.get(id) || 'جاري الاختيار...';
            let arabCls = cls;
            if (cls === 'Leader') arabCls = 'القائد 👑';
            else if (cls === 'Tank') arabCls = 'مُدرّع 🛡️';
            else if (cls === 'Priest') arabCls = 'كاهن ✨';
            else if (cls === 'Mage') arabCls = 'ساحر ❄️';
            else if (cls === 'Summoner') arabCls = 'مستدعٍ 🐺';

            return `\`${i+1}.\` <@${id}> — **${arabCls}**`;
        }).join('\n');

        return new EmbedBuilder()
            .setTitle(`${theme.emoji} بوابة الدانجون: ${theme.name}`)
            .setDescription(`**القائد:** ${host}\n**الشروط:** لفل 5+ و 100 ${EMOJI_MORA}\n\n🔮 اخـتر التخصص الذي يناسبك!\n\n👥 **الفريق:**\n${memberList}`)
            .setColor('DarkRed')
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    // نستخدم editReply لأن التفاعل تم تأجيله (deferred) سابقاً في startDungeon
    await interaction.editReply({ content: null, embeds: [updateEmbed()], components: [row] });
    
    const msg = interaction.message || await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        try {
            if (i.customId === 'join') {
                if (i.user.id === host.id) {
                    return i.reply({ content: "👑 أنت القائد (Leader).", ephemeral: true });
                }

                if (party.includes(i.user.id)) {
                    // موجود مسبقاً، يمكن تجاهله أو إرسال رسالة
                    return i.reply({ content: "✅ أنت منضم بالفعل.", ephemeral: true });
                } else if (party.length >= 5) {
                    return i.reply({ content: "🚫 الفريق ممتلئ.", ephemeral: true });
                } else {
                    if (i.user.id !== OWNER_ID) {
                        const joinData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                        const now = Date.now();
                        const resetTime = (joinData?.last_join_reset || 0);
                        
                        if (now - resetTime < DUNGEON_COOLDOWN) {
                            if ((joinData?.dungeon_join_count || 0) >= 3) {
                                return i.reply({ content: "🚫 استنفذت محاولات الانضمام.", ephemeral: true });
                            }
                        }

                        const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                        if (!joinerData || joinerData.level < 5) return i.reply({ content: "🚫 لفل منخفض.", ephemeral: true });
                        if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك المال.`, ephemeral: true });
                    }
                }

                const takenClasses = Array.from(partyClasses.values());
                const availableOptions = [];

                const isAvailable = (clsName) => {
                    return !takenClasses.includes(clsName) || partyClasses.get(i.user.id) === clsName;
                };

                if (isAvailable('Tank')) availableOptions.push(new StringSelectMenuOptionBuilder().setLabel('المُدرّع (Tank)').setValue('Tank').setDescription('دفاع وحماية.').setEmoji('🛡️'));
                if (isAvailable('Priest')) availableOptions.push(new StringSelectMenuOptionBuilder().setLabel('الكاهن (Priest)').setValue('Priest').setDescription('شفاء وإحياء.').setEmoji('✨'));
                if (isAvailable('Mage')) availableOptions.push(new StringSelectMenuOptionBuilder().setLabel('الساحر (Mage)').setValue('Mage').setDescription('تجميد وتحكم.').setEmoji('❄️'));
                if (isAvailable('Summoner')) availableOptions.push(new StringSelectMenuOptionBuilder().setLabel('المستدعي (Summoner)').setValue('Summoner').setDescription('استدعاء وهجوم.').setEmoji('🐺'));

                if (availableOptions.length === 0) {
                    return i.reply({ content: "🚫 جميع التخصصات مأخوذة!", ephemeral: true });
                }

                const classRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('class_select')
                        .setPlaceholder('اختر تخصصاً...')
                        .addOptions(availableOptions)
                );

                const selectMsg = await i.reply({ content: "🛡️ **اختر تخصصك:**", components: [classRow], ephemeral: true, fetchReply: true });
                
                try {
                    const selection = await selectMsg.awaitMessageComponent({ 
                        filter: subI => subI.user.id === i.user.id && subI.customId === 'class_select', 
                        time: 20000,
                        componentType: ComponentType.StringSelect 
                    });
                    
                    const selectedClass = selection.values[0];
                    const currentTaken = Array.from(partyClasses.entries()).filter(([uid, cls]) => uid !== i.user.id).map(([_, cls]) => cls);
                    
                    if (currentTaken.includes(selectedClass)) {
                        return selection.update({ content: `🚫 **سبقك بها عكاشة!**`, components: [] });
                    }

                    partyClasses.set(i.user.id, selectedClass);
                    
                    if (!party.includes(i.user.id)) {
                        party.push(i.user.id);
                    }
                    
                    let displayClassName = selectedClass;
                    if(selectedClass === 'Tank') displayClassName = 'المُدرّع';
                    else if(selectedClass === 'Priest') displayClassName = 'الكاهن';
                    else if(selectedClass === 'Mage') displayClassName = 'الساحر';
                    else if(selectedClass === 'Summoner') displayClassName = 'المستدعي';

                    if (!selection.deferred && !selection.replied) await selection.deferUpdate();
                    await selection.editReply({ content: `✅ تم تعيينك كـ **${displayClassName}**.`, components: [] });
                    
                    await msg.edit({ embeds: [updateEmbed()] });

                    if (party.length >= 5) {
                        collector.stop('start'); 
                    }
                    
                } catch (e) {
                    await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
                }

            } else if (i.customId === 'start') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يمكنه البدء.", ephemeral: true });
                if (party.length < 1) return i.reply({ content: "خطأ", ephemeral: true });
                
                if (!i.deferred && !i.replied) await i.deferUpdate();
                collector.stop('start');
            }
        } catch (err) {
            console.error("Dungeon Interaction Error:", err);
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();

            party.forEach(id => {
                sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                if (id === host.id) {
                    if (id !== OWNER_ID) sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                } else {
                    if (id !== OWNER_ID) {
                        const jData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(id, interaction.guild.id);
                        const lastReset = jData?.last_join_reset || 0;
                        if (now - lastReset > DUNGEON_COOLDOWN) sql.prepare("UPDATE levels SET last_join_reset = ?, dungeon_join_count = 1 WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                        else sql.prepare("UPDATE levels SET dungeon_join_count = dungeon_join_count + 1 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
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

                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (err) {
                console.error(err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ.");
            }
        } else {
            // 🔥 [إصلاح هام] تنظيف القائمة إذا تم الإلغاء أو انتهاء الوقت
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تم إلغاء الدانجون.", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
