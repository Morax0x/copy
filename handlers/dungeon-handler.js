const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags } = require('discord.js');
const { runDungeon } = require('./dungeon-battle.js'); 
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');
const { manageTickets } = require('./dungeon/utils.js'); // ✅ استدعاء دالة التذاكر

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 3 * 60 * 60 * 1000;

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    // التحقق من الطلبات
    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", flags: [MessageFlags.Ephemeral] });
    }

    // التحقق من المستوى (5)
    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 5) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **5** لتتمكن من قيادة غارة دانجون.", flags: [MessageFlags.Ephemeral] });
    }

    // كولداون (لغير الأونر) - للهوست فقط
    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        if (now - lastDungeon < COOLDOWN_TIME) {
             return interaction.reply({ content: `⏳ **استرح قليلاً!** الكولداون نشط.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    // 🔥 اختيار عشوائي للثيم 🔥
    const themeKeys = Object.keys(dungeonConfig.themes || {});
    if (themeKeys.length === 0) {
        return interaction.reply({ content: "❌ لا توجد بيانات للدانجون حالياً.", flags: [MessageFlags.Ephemeral] });
    }

    const randomKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    const selectedTheme = { ...dungeonConfig.themes[randomKey], key: randomKey };
     
    // تسجيل الحالة
    activeDungeonRequests.set(user.id, { status: 'lobby' });

    // الانتقال للوبي مباشرة
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

        // 🔥 سحب الصورة من ملف الكونفج 🔥
        const imageUrl = theme.image || 'https://i.postimg.cc/NMkWVyLV/line.png';

        // 🔥🔥🔥 التعديلات هنا (العنوان واللون) 🔥🔥🔥
        return new EmbedBuilder()
            // العنوان بصيغة: دانجون: اسم البوابة
            .setTitle(`دانجون: ${theme.name}`) 
             
            // اللون يتم سحبه من الكونفج (واذا مو موجود ياخذ لون احتياطي)
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

                // التحقق من الشروط وإدارة التذاكر
                if (!party.includes(i.user.id) && i.user.id !== OWNER_ID) {
                    const jData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
                    
                    // شرط اللفل والمورا
                    if (!jData || jData.level < 5 || jData.mora < 100) return i.reply({ content: "🚫 لا تستوفي الشروط (لفل 5+ ومورا 100).", flags: [MessageFlags.Ephemeral] });
                    
                    // 🔥 نظام التذاكر الجديد 🔥
                    const ticketResult = manageTickets(i.user.id, guildId, sql, 'consume');
                    
                    if (!ticketResult.success) {
                        return i.reply({ 
                            content: `🚫 **نفذت تذاكرك لليوم!**\nتتجدد التذاكر الساعة 12:00 ص بتوقيت السعودية.\nتذاكرك الحالية: **0/${ticketResult.max}**`, 
                            flags: [MessageFlags.Ephemeral] 
                        });
                    }
                    
                    // تم خصم التذكرة بنجاح، نكمل الكود...
                    // (يمكنك إضافة رسالة تأكيد هنا إذا أردت، لكننا سنكمل مباشرة لاختيار التخصص)
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
            party.forEach(id => {
                // خصم المورا من الجميع
                sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                
                // تحديث كولداون الهوست فقط
                if (id === host.id && id !== OWNER_ID) {
                    sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, guildId);
                }
                
                // 🛑 تم حذف كود الكولداون القديم للأعضاء (لأننا اعتمدنا التذاكر) 🛑
            });

            try {
                // 🔥🔥🔥 تعديل اسم الثريد هنا ليصبح (دانجون-اسم البوابة) 🔥🔥🔥
                const thread = await msg.channel.threads.create({
                    name: `دانجون-${theme.name.replace(/ /g, '-')}`, // استبدال المسافات بشرطات
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'Start Dungeon Battle'
                });

                for (const uid of party) { try { await thread.members.add(uid); } catch(e){} }

                await thread.send(`🔔 **بدأت المعركة!** ${party.map(id=>`<@${id}>`).join(' ')}`);
                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // تشغيل المحرك
                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (e) {
                console.error(e);
                activeDungeonRequests.delete(host.id);
                msg.channel.send("❌ خطأ في إنشاء الثريد.");
            }
        } else {
            activeDungeonRequests.delete(host.id);
            if (msg.editable) msg.edit({ content: "❌ تم الإلغاء.", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
