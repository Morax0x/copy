// handlers/dungeon-handler.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags, Colors } = require('discord.js');
const { runDungeon } = require('./dungeon-battle.js'); 
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');
const { manageTickets } = require('./dungeon/utils.js');

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 3 * 60 * 60 * 1000; // 3 ساعات

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

    // 🔥 تعديل ألوان الأزرار هنا 🔥
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'), // أخضر
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Primary).setEmoji('⚔️'), // أزرق
        new ButtonBuilder().setCustomId('cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️') // أحمر
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
                    
                    // 🔥 فحص الحد اليومي (Check Daily Limit) 🔥
                    const limitCheck = manageTickets(i.user.id, guildId, sql, 'check');
                    
                    if (limitCheck.tickets <= 0) {
                        const now = new Date();
                        const nextReset = new Date(now);
                        nextReset.setUTCHours(21, 0, 0, 0); // 21:00 UTC = 00:00 KSA
                        if (now > nextReset) nextReset.setDate(nextReset.getDate() + 1);
                        
                        const timestamp = Math.floor(nextReset.getTime() / 1000);

                        return i.reply({ 
                            content: `🚫 **استنفذت محاولاتك اليومية!**\nلديك **0/${limitCheck.max}** محاولة.\nتتجدد المحاولات يومياً الساعة 12:00 ص بتوقيت السعودية.\n⏳ **الوقت المتبقي:** <t:${timestamp}:R>`, 
                            flags: [MessageFlags.Ephemeral] 
                        });
                    }
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
                    
                    if (sel.replied || sel.deferred) return; 

                    if (dCheck.includes(chosen)) {
                        return sel.update({ content: "🚫 سبقك بها غيرك.", components: [] }).catch(()=>{});
                    }

                    await sel.deferUpdate().catch(()=>{});
                    
                    partyClasses.set(i.user.id, chosen);
                    if (!party.includes(i.user.id)) party.push(i.user.id);
                      
                    await sel.editReply({ content: `✅ تم: **${chosen}**`, components: [] }).catch(()=>{});
                    await msg.edit({ embeds: [updateEmbed()] }).catch(()=>{});
                } else {
                    await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
                }

            } else if (i.customId === 'start') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ القائد فقط.", flags: [MessageFlags.Ephemeral] });
                
                // ✅ حماية التحديث
                if (!i.replied && !i.deferred) await i.deferUpdate();
                collector.stop('start');

            } else if (i.customId === 'cancel') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ القائد فقط.", flags: [MessageFlags.Ephemeral] });
                
                // ✅ حماية التحديث
                if (!i.replied && !i.deferred) await i.deferUpdate();
                collector.stop('user_cancel');
            }
        } catch (e) { console.error(e); }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();
            
            // 🔥 خصم المحاولات (Entries) والمورا الآن (عند الانطلاق) 🔥
            let validParty = [];
            let kickedMembers = [];

            for (const id of party) {
                if (id === host.id || id === OWNER_ID) {
                    // القائد والأونر لا يخصم منهم محاولات دخول
                    validParty.push(id);
                    sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                    if (id === host.id && id !== OWNER_ID) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, guildId);
                    }
                } else {
                    // الأعضاء: خصم محاولة يومية
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
                        // فشل الخصم (وصل للحد الأقصى أثناء الانتظار أو خطأ ما)
                        kickedMembers.push(id);
                    }
                }
            }

            for (const kickedId of kickedMembers) { partyClasses.delete(kickedId); }

            if (kickedMembers.length > 0) {
                msg.channel.send(`⚠️ **تنبيه:** تم استبعاد ${kickedMembers.map(id => `<@${id}>`).join(', ')} لانتهاء محاولاتهم اليومية!`).catch(()=>{});
            }

            try {
                const thread = await msg.channel.threads.create({
                    name: `دانجون-${theme.name.replace(/ /g, '-')}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'Start Dungeon Battle'
                });

                for (const uid of validParty) { try { await thread.members.add(uid); } catch(e){} }

                // 🔥🔥🔥 إزالة المنشن من هنا 🔥🔥🔥
                await thread.send(`🔔 **بدأت المعركة!**`);
                
                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                await runDungeon(thread, msg.channel, validParty, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (e) {
                console.error(e);
                activeDungeonRequests.delete(host.id);
                msg.channel.send("❌ خطأ في إنشاء الثريد.");
            }
        } else {
            // =========================================================
            // 🔥🔥 معالجة الإلغاء وتطبيق عقوبة الـ 3 دقائق 🔥🔥
            // =========================================================
            activeDungeonRequests.delete(host.id);
            if (msg.editable) {
                try {
                    const fetchedMsg = await msg.fetch().catch(() => null);
                    if (fetchedMsg && fetchedMsg.embeds.length > 0) {
                        const oldEmbed = fetchedMsg.embeds[0];
                        const cancelledEmbed = EmbedBuilder.from(oldEmbed)
                            .setTitle(`🚫 تم إلغاء الغارة: ${theme.name}`)
                            .setColor(Colors.Red);
                        
                        if (reason === 'user_cancel') {
                             // 1. حساب عقوبة الـ 3 دقائق
                             const penaltyMs = 3 * 60 * 1000; // 3 دقائق
                             const fullCooldown = 3 * 60 * 60 * 1000; // 3 ساعات

                             // 2. تحديث الداتابيس: نضبط الوقت بحيث يتبقى 3 دقائق فقط على انتهاء الكولداون
                             // المعادلة: الوقت الحالي - (الكولداون الكامل - العقوبة)
                             const newLastDungeon = Date.now() - (fullCooldown - penaltyMs);
                             
                             sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?")
                                .run(newLastDungeon, host.id, guildId);

                             // 3. تجهيز التوقيت للرسالة (بعد 3 دقائق من الآن)
                             const readyTimestamp = Math.floor((Date.now() + penaltyMs) / 1000);
                             
                             cancelledEmbed.setDescription(`**قمـت بـ الغـاء الغـارة الاخيـرة .. انتـظر <t:${readyTimestamp}:R> لتفتح غـارة جديدة**`);
                             cancelledEmbed.setFooter({ text: "قام القائد بإلغاء الغارة" });
                        } else {
                             cancelledEmbed.setFooter({ text: "انتهى وقت الانتظار" });
                        }
                        
                        await msg.edit({ content: '', embeds: [cancelledEmbed], components: [] });
                    } else {
                        await msg.edit({ content: "❌ تم الإلغاء.", components: [] });
                    }
                } catch (err) {
                    console.log("Error updating cancelled embed:", err);
                }
            }
        }
    });
}

module.exports = { startDungeon };
