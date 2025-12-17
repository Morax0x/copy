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

// تتبع الطلبات النشطة
const activeDungeonRequests = new Set();

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل! أنهِ المعركة الحالية أو انتظر قليلاً.", ephemeral: true });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **10** لتتمكن من قيادة غارة دانجون.", ephemeral: true });
    }

    activeDungeonRequests.add(user.id);

    // التحقق من الكولداون للمالك
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

    // أزرار اختيار الثيم
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
        .setDescription(`أهلاً بك أيها القائد **${user.username}**!\nاختر المنطقة التي تود غزوها:`)
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
    
    // 🔥🔥 إصلاح: تهيئة خريطة الكلاسات بشكل صحيح 🔥🔥
    // القائد يبدأ كـ Leader، لكن يمكنه تغييره
    let partyClasses = new Map();
    partyClasses.set(host.id, 'Leader');
    
    let party = [host.id];
      
    // دالة تحديث واجهة اللوبي
    const updateEmbed = () => {
        const memberList = party.map((id, i) => {
            const cls = partyClasses.get(id) || 'Unknown';
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
            .setDescription(`**القائد:** ${host}\n**المطلوب:** لفل 5+ و 100 ${EMOJI_MORA}\n\n👇 **اضغط "انضمام" لاختيار تخصصك!**\n\n👥 **الفريق الحالي:**\n${memberList}`)
            .setColor('DarkRed')
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام / تغيير التخصص').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    // تحديث الرسالة لواجهة اللوبي
    await interaction.update({ content: null, embeds: [updateEmbed()], components: [row] });
    const msg = await interaction.message;
    
    // كوليكتور يستمع للأزرار
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        // ==========================================
        // 🛡️ زر الانضمام واختيار الكلاس
        // ==========================================
        if (i.customId === 'join') {
            const isJoined = party.includes(i.user.id);

            // التحقق من العدد
            if (party.length >= 5 && !isJoined) {
                return i.reply({ content: "🚫 الفريق ممتلئ.", ephemeral: true });
            }
            
            // التحقق من الشروط (لغير المالك والمنضمين الجدد)
            if (!isJoined && i.user.id !== OWNER_ID) {
                const joinData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                const now = Date.now();
                const resetTime = (joinData?.last_join_reset || 0);
                
                if (now - resetTime < DUNGEON_COOLDOWN) {
                    if ((joinData?.dungeon_join_count || 0) >= 3) {
                        return i.reply({ content: "🚫 استنفذت محاولات الانضمام (3/3).", ephemeral: true });
                    }
                }

                const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                if (!joinerData || joinerData.level < 5) return i.reply({ content: "🚫 مستواك أقل من 5.", ephemeral: true });
                if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك 100 ${EMOJI_MORA}.`, ephemeral: true });
            }
            
            // 🔥 إنشاء قائمة الكلاسات 🔥
            const classRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('class_select')
                    .setPlaceholder('اختر تخصصك للمعركة...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('المُدرّع (Tank)').setValue('Tank').setDescription('دفاع عالي، يحمي الفريق.').setEmoji('🛡️'),
                        new StringSelectMenuOptionBuilder().setLabel('الكاهن (Priest)').setValue('Priest').setDescription('يعالج الفريق ويحيي الموتى.').setEmoji('✨'),
                        new StringSelectMenuOptionBuilder().setLabel('الساحر (Mage)').setValue('Mage').setDescription('يجمد الوحش ويمنعه من الهجوم.').setEmoji('❄️'),
                        new StringSelectMenuOptionBuilder().setLabel('المستدعي (Summoner)').setValue('Summoner').setDescription('يستدعي وحشاً ليقاتل معه.').setEmoji('🐺'),
                        // خيار القائد يظهر فقط للمضيف
                        ...(i.user.id === host.id ? [new StringSelectMenuOptionBuilder().setLabel('القائد (Leader)').setValue('Leader').setDescription('يزيد ضرر الفريق بالكامل.').setEmoji('👑')] : [])
                    )
            );

            // إرسال القائمة بشكل خاص (Ephemeral)
            const selectMsg = await i.reply({ content: "⚔️ **اختر دورك في المعركة:**", components: [classRow], ephemeral: true, fetchReply: true });
            
            try {
                // انتظار اختيار اللاعب من القائمة
                const selection = await selectMsg.awaitMessageComponent({ 
                    filter: subI => subI.user.id === i.user.id && subI.customId === 'class_select', 
                    time: 20000,
                    componentType: ComponentType.StringSelect 
                });
                
                const selectedClass = selection.values[0];
                
                // ✅ أهم نقطة: حفظ الكلاس في الماب
                partyClasses.set(i.user.id, selectedClass);
                
                // إذا لم يكن في القائمة، نضيفه
                if (!isJoined) {
                    party.push(i.user.id);
                }
                
                // تأكيد الاختيار للاعب
                await selection.update({ content: `✅ **تم اختيار: ${selectedClass}**! استعد.`, components: [] });
                
                // تحديث رسالة اللوبي الرئيسية ليظهر التخصص الجديد
                await msg.edit({ embeds: [updateEmbed()] });
                
            } catch (e) {
                // إذا انتهى الوقت ولم يختر
                await i.editReply({ content: "⏰ انتهى وقت اختيار التخصص.", components: [] }).catch(()=>{});
            }

        // ==========================================
        // ⚔️ زر الانطلاق
        // ==========================================
        } else if (i.customId === 'start') {
            if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يمكنه بدء المعركة.", ephemeral: true });
            
            // التأكد من أن الجميع اختار كلاس (ولو أنهم لا ينضمون إلا باختيار، لكن للاحتياط)
            if (party.some(id => !partyClasses.has(id))) {
                return i.reply({ content: "⚠️ هناك لاعب لم يختر تخصصه بعد!", ephemeral: true });
            }

            collector.stop('start');
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();

            // خصم المورا وتحديث الكولداون
            party.forEach(id => {
                sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                
                if (id !== OWNER_ID) {
                    if (id === host.id) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                    } else {
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

                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // 🔥 تمرير بيانات الكلاسات الصحيحة للمعركة 🔥
                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (err) {
                console.error(err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ أثناء إنشاء ساحة المعركة.");
            }
        } else {
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تم إلغاء الدانجون (انتهى الوقت).", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
