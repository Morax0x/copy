const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags } = require('discord.js');
const path = require('path');

// استدعاء محرك المعركة
const { runDungeon } = require('./dungeon-battle.js');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
let dungeonConfig = {};
try {
    dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
} catch (e) { console.error("Error loading dungeon config:", e); }

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const DUNGEON_COOLDOWN = 3 * 60 * 60 * 1000; 
const OWNER_ID = "1145327691772481577"; 

const activeDungeonRequests = new Set();

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", flags: [MessageFlags.Ephemeral] });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **10** لتتمكن من قيادة غارة دانجون.", flags: [MessageFlags.Ephemeral] });
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
            return interaction.reply({ content: `⏳ **استرح قليلاً!** يمكنك بدء غارة جديدة <t:${finishTimeUnix}:R>.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    const themes = Object.keys(dungeonConfig.themes || {});
    if (themes.length === 0) {
        activeDungeonRequests.delete(user.id);
        return interaction.reply({ content: "❌ لا توجد بيانات للدانجون حالياً.", flags: [MessageFlags.Ephemeral] });
    }

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
     
    // 🔥 [إصلاح] توزيع الأزرار 5 في كل صف
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
            // 🔥 الإصلاح الأساسي: الرد فوراً لتجنب Unknown Interaction
            if (!i.deferred && !i.replied) await i.deferUpdate(); 
            
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

    // نستخدم editReply لأن التفاعل تم تأجيله (deferred) سابقاً
    await interaction.editReply({ content: null, embeds: [updateEmbed()], components: [row] });
    
    const msg = interaction.message || await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        // التحقق من التفاعل المجهول قبل البدء
        if (i.replied || i.deferred) return;

        try {
            if (i.customId === 'join') {
                // الفحوصات الأولية (ردود سريعة ephemeral)
                if (i.user.id === host.id) {
                    return i.reply({ content: "👑 أنت القائد (Leader).", flags: [MessageFlags.Ephemeral] });
                }

                if (party.includes(i.user.id)) {
                    return i.reply({ content: "✅ أنت منضم بالفعل.", flags: [MessageFlags.Ephemeral] });
                } else if (party.length >= 5) {
                    return i.reply({ content: "🚫 الفريق ممتلئ.", flags: [MessageFlags.Ephemeral] });
                } else {
                    if (i.user.id !== OWNER_ID) {
                        const joinData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                        const now = Date.now();
                        const resetTime = (joinData?.last_join_reset || 0);
                        
                        if (now - resetTime < DUNGEON_COOLDOWN) {
                            if ((joinData?.dungeon_join_count || 0) >= 3) {
                                return i.reply({ content: "🚫 استنفذت محاولات الانضمام.", flags: [MessageFlags.Ephemeral] });
                            }
                        }

                        const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                        if (!joinerData || joinerData.level < 5) return i.reply({ content: "🚫 لفل منخفض.", flags: [MessageFlags.Ephemeral] });
                        if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك المال.`, flags: [MessageFlags.Ephemeral] });
                    }
                }

                // تجهيز قائمة الكلاسات
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
                    return i.reply({ content: "🚫 جميع التخصصات مأخوذة!", flags: [MessageFlags.Ephemeral] });
                }

                const classRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('class_select')
                        .setPlaceholder('اختر تخصصاً...')
                        .addOptions(availableOptions)
                );

                const selectMsg = await i.reply({ content: "🛡️ **اختر تخصصك:**", components: [classRow], flags: [MessageFlags.Ephemeral], fetchReply: true });
                
                try {
                    const selection = await selectMsg.awaitMessageComponent({ 
                        filter: subI => subI.user.id === i.user.id && subI.customId === 'class_select', 
                        time: 20000,
                        componentType: ComponentType.StringSelect 
                    });
                    
                    // 🔥🔥 إصلاح: الرد الفوري عند اختيار التخصص 🔥🔥
                    const selectedClass = selection.values[0];
                    const currentTaken = Array.from(partyClasses.entries()).filter(([uid, cls]) => uid !== i.user.id).map(([_, cls]) => cls);
                    
                    if (currentTaken.includes(selectedClass)) {
                        return selection.update({ content: `🚫 **سبقك بها عكاشة!** اختر تخصصاً آخر.`, components: [] });
                    }

                    // حالة القبول - تأجيل الرد فوراً
                    await selection.deferUpdate(); 

                    partyClasses.set(i.user.id, selectedClass);
                    
                    if (!party.includes(i.user.id)) {
                        party.push(i.user.id);
                    }
                    
                    let displayClassName = selectedClass;
                    if(selectedClass === 'Tank') displayClassName = 'المُدرّع';
                    else if(selectedClass === 'Priest') displayClassName = 'الكاهن';
                    else if(selectedClass === 'Mage') displayClassName = 'الساحر';
                    else if(selectedClass === 'Summoner') displayClassName = 'المستدعي';

                    // تحديث رسالة القائمة المختفية
                    await selection.editReply({ content: `✅ تم تعيينك كـ **${displayClassName}**.`, components: [] });
                    
                    // تحديث اللوبي الرئيسي
                    await msg.edit({ embeds: [updateEmbed()] });

                    if (party.length >= 5) {
                        collector.stop('start'); 
                    }
                    
                } catch (e) {
                    // في حال انتهاء الوقت وعدم الاختيار
                    if (e.code !== 'InteractionCollectorError') console.log(e);
                    await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
                }

            } else if (i.customId === 'start') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يمكنه البدء.", flags: [MessageFlags.Ephemeral] });
                if (party.length < 1) return i.reply({ content: "خطأ", flags: [MessageFlags.Ephemeral] });
                
                // 🔥🔥 إصلاح: تأجيل الرد فوراً عند الضغط على start 🔥🔥
                await i.deferUpdate();
                
                collector.stop('start');
            }
        } catch (err) {
            if (err.code === 10062) return; // تجاهل خطأ التفاعل المجهول إذا حدث
            console.error("Dungeon Interaction Error:", err);
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();

            // تنفيذ الخصومات والتحديثات
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
                // إنشاء الثريد
                const thread = await msg.channel.threads.create({
                    name: `⚔️ دانجون ${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread, 
                    reason: 'Start Dungeon Battle'
                });

                const allMentions = party.map(id => `<@${id}>`).join(' ');
                await thread.send({ content: `🔔 **دقت طبول الحرب!** ${allMentions}` });

                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // تشغيل المعركة
                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (err) {
                console.error(err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ أثناء إنشاء المعركة.");
            }
        } else {
            // إذا انتهى الوقت أو تم الإلغاء
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تم إلغاء الدانجون.", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
