const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags } = require('discord.js');
const { runDungeon } = require('./dungeon-battle.js'); 
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');
const { manageTickets } = require('./dungeon/utils.js');

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 3 * 60 * 60 * 1000;

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", flags: [MessageFlags.Ephemeral] });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 5) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **5** لتتمكن من قيادة غارة دانجون.", flags: [MessageFlags.Ephemeral] });
    }

    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        if (now - lastDungeon < COOLDOWN_TIME) {
             return interaction.reply({ content: `⏳ **استرح قليلاً!** الكولداون نشط.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    const themeKeys = Object.keys(dungeonConfig.themes || {});
    if (themeKeys.length === 0) {
        return interaction.reply({ content: "❌ لا توجد بيانات للدانجون حالياً.", flags: [MessageFlags.Ephemeral] });
    }

    const randomKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    const selectedTheme = { ...dungeonConfig.themes[randomKey], key: randomKey };
     
    activeDungeonRequests.set(user.id, { status: 'lobby' });

    try {
        await lobbyPhase(interaction, null, selectedTheme, sql);
    } catch (err) {
        console.error(err);
        activeDungeonRequests.delete(user.id);
        interaction.followUp({ content: "❌ حدث خطأ أثناء بدء اللوبي.", ephemeral: true }).catch(()=>{});
    }
}

async function lobbyPhase(interaction, oldMsg, theme, sql) {
    const host = interaction.user;
    const guildId = interaction.guild.id;
     
    let partyClasses = new Map();
    partyClasses.set(host.id, 'Leader');
    let party = [host.id];
      
    const updateEmbed = () => {
        const memberList = party.map((id, i) => {
            const cls = partyClasses.get(id);
            let arabCls = cls;
            if (cls === 'Leader') arabCls = 'القائد 👑';
            else if (cls === 'Tank') arabCls = 'مُدرّع 🛡️';
            else if (cls === 'Priest') arabCls = 'كاهن ✨';
            else if (cls === 'Mage') arabCls = 'ساحر ❄️';
            else if (cls === 'Summoner') arabCls = 'مستدعٍ 🐺';
            return `\`${i+1}.\` <@${id}> — **${arabCls}**`;
        }).join('\n');

        const imageUrl = theme.image || 'https://i.postimg.cc/NMkWVyLV/line.png';

        return new EmbedBuilder()
            .setTitle(`دانجون: ${theme.name}`) 
            .setColor(theme.color || '#2F3136') 
            .setDescription(`**القائد:** ${host}\n**الشروط:** لفل 5+ و 100 ${EMOJI_MORA}\n\n🔮 **تم فتح البوابة إلى ${theme.name}!**\nاختر تخصصك واستعد للمعركة.\n\n👥 **الفريق:**\n${memberList}`)
            .setImage(imageUrl) 
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    let msg = await interaction.reply({ embeds: [updateEmbed()], components: [row], fetchReply: true });
     
    if (!interaction.isChatInputCommand && interaction.lastBotReply) interaction.lastBotReply = msg;
     
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.replied || i.deferred) return;

        try {
            if (i.customId === 'join') {
                if (i.user.id === host.id) return i.reply({ content: "👑 أنت القائد.", flags: [MessageFlags.Ephemeral] });
                if (party.length >= 5 && !party.includes(i.user.id)) return i.reply({ content: "🚫 الفريق ممتلئ.", flags: [MessageFlags.Ephemeral] });

                // التحقق من الشروط
                if (!party.includes(i.user.id) && i.user.id !== OWNER_ID) {
                    const jData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
                    
                    if (!jData || jData.level < 5 || jData.mora < 100) return i.reply({ content: "🚫 لا تستوفي الشروط (لفل 5+ ومورا 100).", flags: [MessageFlags.Ephemeral] });
                    
                    // 🔥 تعديل 1: فحص التذاكر فقط (بدون خصم) 🔥
                    const ticketResult = manageTickets(i.user.id, guildId, sql, 'check');
                    
                    if (ticketResult.tickets <= 0) {
                        return i.reply({ 
                            content: `🚫 **لا تملك تذاكر كافية!**\nتتجدد التذاكر الساعة 12:00 ص بتوقيت السعودية.\nرصيدك: **0/${ticketResult.max}**`, 
                            flags: [MessageFlags.Ephemeral] 
                        });
                    }
                    // إذا عنده تذكرة، نسمح له يكمل لاختيار التخصص (الخصم لاحقاً عند البدء)
                }

                const takenClasses = [];
                partyClasses.forEach((c, u) => { if(u !== i.user.id) takenClasses.push(c); });
                const opts = [];
                const addOpt = (v, l, e) => { if(!takenClasses.includes(v)) opts.push(new StringSelectMenuOptionBuilder().setLabel(l).setValue(v).setEmoji(e)); };
                 
                addOpt('Tank', 'المُدرّع', '🛡️'); 
                addOpt('Priest', 'الكاهن', '✨'); 
                addOpt('Mage', 'الساحر', '❄️'); 
                addOpt('Summoner', 'المستدعي', '🐺');

                if (opts.length === 0) return i.reply({ content: "🚫 جميع التخصصات مأخوذة.", flags: [MessageFlags.Ephemeral] });

                const sRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cls').setPlaceholder('اختر تخصصك...').addOptions(opts));
                const sMsg = await i.reply({ content: "🛡️ اختر تخصصك:", components: [sRow], flags: [MessageFlags.Ephemeral], fetchReply: true });

                const sel = await sMsg.awaitMessageComponent({ filter: x => x.user.id === i.user.id, time: 20000, componentType: ComponentType.StringSelect }).catch(() => null);
                if (sel) {
                    const chosen = sel.values[0];
                    const dCheck = Array.from(partyClasses.entries()).filter(x => x[0] !== i.user.id).map(x => x[1]);
                    if (dCheck.includes(chosen)) return sel.update({ content: "🚫 سبقك بها غيرك.", components: [] });

                    await sel.deferUpdate();
                    partyClasses.set(i.user.id, chosen);
                    if (!party.includes(i.user.id)) party.push(i.user.id);
                     
                    await sel.editReply({ content: `✅ تم: **${chosen}**`, components: [] });
                    await msg.edit({ embeds: [updateEmbed()] });
                } else {
                    await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
                }

            } else if (i.customId === 'start') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ القائد فقط.", flags: [MessageFlags.Ephemeral] });
                await i.deferUpdate();
                collector.stop('start');
            }
        } catch (e) { console.error(e); }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();
            
            // 🔥 تعديل 2: تصفية الفريق وخصم التذاكر الآن (عند الانطلاق) 🔥
            let validParty = [];
            let kickedMembers = [];

            for (const id of party) {
                // القائد والأونر لا يخصم منهم تذاكر (حسب النظام: القائد يدفع مورا وكولداون)
                if (id === host.id || id === OWNER_ID) {
                    validParty.push(id);
                    
                    // خصم المورا وتحديث الكولداون (للهوست)
                    sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                    if (id === host.id && id !== OWNER_ID) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, guildId);
                    }
                } else {
                    // الأعضاء: محاولة خصم التذكرة الآن
                    const consumeResult = manageTickets(id, guildId, sql, 'consume');
                    
                    if (consumeResult.success) {
                        validParty.push(id);
                        // خصم المورا
                        sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                        
                        // تحديث إحصائيات الانضمام
                        const d = sql.prepare("SELECT last_join_reset FROM levels WHERE user = ? AND guild = ?").get(id, guildId);
                        if (now - (d?.last_join_reset||0) > COOLDOWN_TIME) sql.prepare("UPDATE levels SET last_join_reset = ?, dungeon_join_count = 1 WHERE user = ? AND guild = ?").run(now, id, guildId);
                        else sql.prepare("UPDATE levels SET dungeon_join_count = dungeon_join_count + 1 WHERE user = ? AND guild = ?").run(id, guildId);
                    } else {
                        // فشل الخصم (صرف التذكرة في مكان آخر مثلاً)
                        kickedMembers.push(id);
                    }
                }
            }

            // تحديث قائمة الكلاسات بناءً على من تبقى
            for (const kickedId of kickedMembers) {
                partyClasses.delete(kickedId);
            }

            if (kickedMembers.length > 0) {
                msg.channel.send(`⚠️ **تنبيه:** تم استبعاد ${kickedMembers.map(id => `<@${id}>`).join(', ')} لعدم توفر تذاكر لحظة البدء!`).catch(()=>{});
            }

            try {
                const thread = await msg.channel.threads.create({
                    name: `دانجون-${theme.name.replace(/ /g, '-')}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'Start Dungeon Battle'
                });

                for (const uid of validParty) { try { await thread.members.add(uid); } catch(e){} }

                await thread.send(`🔔 **بدأت المعركة!** ${validParty.map(id=>`<@${id}>`).join(' ')}`);
                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // تشغيل المحرك مع الفريق المعتمد (validParty)
                await runDungeon(thread, msg.channel, validParty, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (e) {
                console.error(e);
                activeDungeonRequests.delete(host.id);
                msg.channel.send("❌ خطأ في إنشاء الثريد.");
            }
        } else {
            // إلغاء الدانجون - التذاكر لم تُخصم أصلاً
            activeDungeonRequests.delete(host.id);
            if (msg.editable) msg.edit({ content: "❌ تم الإلغاء (انتهى الوقت أو ألغى القائد).", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
