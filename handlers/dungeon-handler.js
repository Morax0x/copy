// handlers/dungeon-handler.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags, Colors } = require('discord.js');
const { runDungeon } = require('./dungeon-battle.js'); 
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');
const { manageTickets } = require('./dungeon/utils.js');

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 1 * 60 * 60 * 1000; // 🔥 ساعة واحدة فقط 🔥

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    // 🔥🔥 معالجة زر نصب المخيم (Campfire) القادم من داخل اللعبة 🔥🔥
    // ✅ التأكد من أن isButton دالة موجودة قبل استدعائها لمنع الكراش
    const isButtonInteraction = interaction.isButton && typeof interaction.isButton === 'function' && interaction.isButton();

    if (isButtonInteraction && interaction.customId === 'dungeon_campfire') {
        // هذا الجزء احتياطي، المعالجة الفعلية تتم في dungeon-battle.js و rest-phase.js
        return; 
    }

    // --- بداية الدانجون (من الأمر الرئيسي) ---

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", flags: [MessageFlags.Ephemeral] });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    
    // شرط القائد لفل 10
    if (!leaderData || leaderData.level < 10) {
        const denyEmbed = new EmbedBuilder()
            .setTitle("✶ لا تستوفي الشروط")
            .setDescription("- الـدانجـون محفوف بالمخـاطر، ارفع مستواك إلى **10** لتتمكن من قيادة غارة الدانجون.")
            .setColor(Colors[Object.keys(Colors)[Math.floor(Math.random() * Object.keys(Colors).length)]])
            .setThumbnail('https://i.postimg.cc/hPxYnBZ7/adaft-ʿnwan.png');

        return interaction.reply({ embeds: [denyEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        if (now - lastDungeon < COOLDOWN_TIME) {
             const remaining = lastDungeon + COOLDOWN_TIME;
             return interaction.reply({ content: `⏳ **استرح قليلاً!** الكولداون ينتهي <t:${Math.floor(remaining/1000)}:R>.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    const themeKeys = Object.keys(dungeonConfig.themes || {});
    if (themeKeys.length === 0) {
        return interaction.reply({ content: "❌ لا توجد بيانات للدانجون حالياً.", flags: [MessageFlags.Ephemeral] });
    }

    const randomKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    const selectedTheme = { ...dungeonConfig.themes[randomKey], key: randomKey };
      
    // 🔥🔥 فحص الاستكمال التلقائي (بدون رسالة سؤال) 🔥🔥
    let startFloor = 1;
    const save = sql.prepare("SELECT * FROM dungeon_saves WHERE hostID = ?").get(user.id);

    if (save) {
        // التحقق من صلاحية الحفظ
        let expiryTime = 24 * 60 * 60 * 1000;
        const member = interaction.member || (interaction.guild ? interaction.guild.members.cache.get(user.id) : null);
        
        if (member) {
            if (member.roles.cache.has('1422160802416164885')) expiryTime = 72 * 60 * 60 * 1000;
            else if (member.roles.cache.has('1395674235002945636')) expiryTime = 35 * 60 * 60 * 1000;
        }

        const timeLeft = expiryTime - (Date.now() - save.timestamp);

        if (timeLeft > 0) {
            startFloor = save.floor; // ✅ وجدنا حفظاً صالحاً، نعتمد الطابق فوراً
        } else {
            // انتهى وقت الحفظ، نحذفه
            sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(user.id);
        }
    }

    activeDungeonRequests.set(user.id, { status: 'lobby' });

    try {
        // نمرر startFloor مباشرة للوبي ليظهر في الإيمبد ويبدأ منه
        await lobbyPhase(interaction, null, selectedTheme, sql, startFloor);
    } catch (err) {
        console.error(err);
        activeDungeonRequests.delete(user.id);
        const replyFunc = interaction.reply ? interaction.reply.bind(interaction) : interaction.channel.send.bind(interaction.channel);
        replyFunc({ content: "❌ حدث خطأ أثناء بدء اللوبي.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    }
}

// ✅ اللوبي (يظهر ملاحظة الاستكمال إن وجد)
async function lobbyPhase(interaction, oldMsg, theme, sql, startFloor = 1) {
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

        // 🔥 إضافة ملاحظة الاستكمال في الوصف كما طلبت 🔥
        let desc = `**القائد:** ${host}\n**الشروط:** لفل 5+ و 100 ${EMOJI_MORA}\n\n🔮 **تم فتح البوابة إلى ${theme.name}!**`;
        
        if (startFloor > 1) {
            desc += `\n🏕️ **(سيتم استكمال الرحلة من الطابق ${startFloor})**`;
        }

        desc += `\nاختر تخصصك واستعد للمعركة.\n\n👥 **الفريق:**\n${memberList}`;

        return new EmbedBuilder()
            .setTitle(`دانجون: ${theme.name}`) 
            .setColor(theme.color || '#2F3136') 
            .setDescription(desc)
            .setImage(imageUrl) 
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'), 
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Primary).setEmoji('⚔️'), 
        new ButtonBuilder().setCustomId('cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️') 
    );

    let msg;
    // التأكد من طريقة الرد (سلاش أو رسالة عادية)
    if (interaction.reply && typeof interaction.reply === 'function') {
        if (interaction.replied || interaction.deferred) {
            msg = await interaction.followUp({ embeds: [updateEmbed()], components: [row], fetchReply: true });
        } else {
            msg = await interaction.reply({ embeds: [updateEmbed()], components: [row], fetchReply: true });
        }
    } else {
        msg = await interaction.channel.send({ embeds: [updateEmbed()], components: [row] });
    }
      
    if (!interaction.isChatInputCommand && interaction.lastBotReply) interaction.lastBotReply = msg;
      
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.replied || i.deferred) return;

        try {
            if (i.customId === 'join') {
                if (i.user.id === host.id) return i.reply({ content: "👑 أنت القائد.", flags: [MessageFlags.Ephemeral] });
                if (party.length >= 5 && !party.includes(i.user.id)) return i.reply({ content: "🚫 الفريق ممتلئ.", flags: [MessageFlags.Ephemeral] });

                if (!party.includes(i.user.id) && i.user.id !== OWNER_ID) {
                    const jData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
                    
                    if (!jData || jData.level < 5 || jData.mora < 100) return i.reply({ content: "🚫 لا تستوفي الشروط (لفل 5+ ومورا 100).", flags: [MessageFlags.Ephemeral] });
                    
                    const limitCheck = manageTickets(i.user.id, guildId, sql, 'check', i.member);
                    
                    if (limitCheck.tickets <= 0) {
                        const now = new Date();
                        const nextReset = new Date(now);
                        nextReset.setUTCHours(21, 0, 0, 0); 
                        if (now > nextReset) nextReset.setDate(nextReset.getDate() + 1);
                        const timestamp = Math.floor(nextReset.getTime() / 1000);

                        return i.reply({ 
                            content: `✶ **نفـذت تذاكـرك!** انتظر إلى أن تصرف نقابة المغامرين تذاكرك الجديدة.\n- **وقت تجديد التذاكر:** <t:${timestamp}:R>`, 
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
                
                if (!i.replied && !i.deferred) await i.deferUpdate();
                collector.stop('start');

            } else if (i.customId === 'cancel') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ القائد فقط.", flags: [MessageFlags.Ephemeral] });
                
                if (!i.replied && !i.deferred) await i.deferUpdate();
                collector.stop('user_cancel');
            }
        } catch (e) { console.error(e); }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();
            
            // 🔥 عند الانطلاق، إذا كان هناك حفظ سابق، نحذفه (لأنه تم استخدامه الآن) 🔥
            if (startFloor > 1) {
                sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(host.id);
            }

            let validParty = [];
            let kickedMembers = [];

            for (const id of party) {
                if (id === host.id || id === OWNER_ID) {
                    validParty.push(id);
                    sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                    if (id === host.id && id !== OWNER_ID) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, guildId);
                    }
                } else {
                    const memberObj = await msg.guild.members.fetch(id).catch(() => null);
                    const consumeResult = manageTickets(id, guildId, sql, 'consume', memberObj);
                    
                    if (consumeResult.success) {
                        validParty.push(id);
                        sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                        
                        const d = sql.prepare("SELECT last_join_reset FROM levels WHERE user = ? AND guild = ?").get(id, guildId);
                        if (now - (d?.last_join_reset||0) > COOLDOWN_TIME) sql.prepare("UPDATE levels SET last_join_reset = ?, dungeon_join_count = 1 WHERE user = ? AND guild = ?").run(now, id, guildId);
                        else sql.prepare("UPDATE levels SET dungeon_join_count = dungeon_join_count + 1 WHERE user = ? AND guild = ?").run(id, guildId);
                    } else {
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

                await thread.send(`🔔 **بدأت المعركة!**`);
                
                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // 🔥 تمرير startFloor الصحيح للمعركة 🔥
                await runDungeon(thread, msg.channel, validParty, theme, sql, host.id, partyClasses, activeDungeonRequests, startFloor);

            } catch (e) {
                console.error(e);
                activeDungeonRequests.delete(host.id);
                msg.channel.send("❌ خطأ في إنشاء الثريد.");
            }
        } else {
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
                             const penaltyMs = 3 * 60 * 1000; 
                             const fullCooldown = 1 * 60 * 60 * 1000; 

                             const newLastDungeon = Date.now() - (fullCooldown - penaltyMs);
                             
                             sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?")
                                .run(newLastDungeon, host.id, guildId);

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
