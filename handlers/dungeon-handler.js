const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags } = require('discord.js');
const { runDungeon } = require('./dungeon-battle.js'); // ✅ استدعاء النظام الجديد
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 3 * 60 * 60 * 1000;

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    // 1. التحقق من الطلبات النشطة
    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", flags: [MessageFlags.Ephemeral] });
    }

    // 2. التحقق من المستوى
    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "🚫 **عذراً!** يجب أن تصل للمستوى **10** لتتمكن من قيادة غارة دانجون.", flags: [MessageFlags.Ephemeral] });
    }

    // 3. التحقق الإضافي من الكولداون (لضمان عدم التلاعب)
    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        if (now - lastDungeon < COOLDOWN_TIME) {
             return interaction.reply({ content: `⏳ **استرح قليلاً!** الكولداون نشط.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    // تسجيل الطلب
    activeDungeonRequests.set(user.id, { status: 'selecting_theme' });

    // اختيار الثيم
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

    const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    const components = [row1];
    if (buttons.length > 5) {
        const row2 = new ActionRowBuilder().addComponents(buttons.slice(5, 10));
        components.push(row2);
    }

    const embed = new EmbedBuilder()
        .setTitle('⚔️ بوابة الدانجون')
        .setDescription(`أهلاً بك أيها القائد **${user.username}**!\nاختر المنطقة التي تود غزوها:`)
        .setColor('#2B2D31')
        .setImage('https://i.postimg.cc/NMkWVyLV/line.png');

    const msg = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });
    // حفظ الرد إذا كان رسالة عادية
    if (!interaction.isChatInputCommand && interaction.lastBotReply) interaction.lastBotReply = msg;

    const collector = msg.createMessageComponentCollector({ 
        filter: i => i.user.id === user.id && i.customId.startsWith('dungeon_theme_'), 
        time: 30000, 
        max: 1 
    });

    collector.on('collect', async i => {
        try {
            if (!i.deferred && !i.replied) await i.deferUpdate();
            collector.stop('selected');

            const themeKey = i.customId.replace('dungeon_theme_', '');
            const theme = { ...dungeonConfig.themes[themeKey], key: themeKey };
            
            await lobbyPhase(interaction, msg, theme, sql);
        } catch (err) {
            console.error(err);
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

async function lobbyPhase(interaction, msg, theme, sql) {
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

    await msg.edit({ embeds: [updateEmbed()], components: [row] });
    
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.replied || i.deferred) return;

        try {
            if (i.customId === 'join') {
                if (i.user.id === host.id) return i.reply({ content: "👑 أنت القائد.", flags: [MessageFlags.Ephemeral] });
                if (party.length >= 5 && !party.includes(i.user.id)) return i.reply({ content: "🚫 الفريق ممتلئ.", flags: [MessageFlags.Ephemeral] });

                // شروط المنضم
                if (!party.includes(i.user.id) && i.user.id !== OWNER_ID) {
                    const jData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
                    if (!jData || jData.level < 5 || jData.mora < 100) return i.reply({ content: "🚫 لا تستوفي الشروط.", flags: [MessageFlags.Ephemeral] });
                    const now = Date.now();
                    const reset = jData.last_join_reset || 0;
                    if (now - reset < COOLDOWN_TIME && (jData.dungeon_join_count || 0) >= 3) return i.reply({ content: "🚫 استنفذت المحاولات.", flags: [MessageFlags.Ephemeral] });
                }

                // قائمة التخصصات
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
        } catch (err) { console.error(err); }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();
            party.forEach(id => {
                sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, guildId);
                if (id === host.id && id !== OWNER_ID) sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, guildId);
                else if (id !== OWNER_ID) {
                    const d = sql.prepare("SELECT last_join_reset FROM levels WHERE user = ? AND guild = ?").get(id, guildId);
                    if (now - (d?.last_join_reset||0) > COOLDOWN_TIME) sql.prepare("UPDATE levels SET last_join_reset = ?, dungeon_join_count = 1 WHERE user = ? AND guild = ?").run(now, id, guildId);
                    else sql.prepare("UPDATE levels SET dungeon_join_count = dungeon_join_count + 1 WHERE user = ? AND guild = ?").run(id, guildId);
                }
            });

            try {
                const thread = await msg.channel.threads.create({
                    name: `غارة-${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'Start Dungeon'
                });

                // إضافة الأعضاء
                for (const uid of party) { try { await thread.members.add(uid); } catch(e){} }

                await thread.send(`🔔 **بدأت المعركة!** ${party.map(id=>`<@${id}>`).join(' ')}`);
                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // تشغيل المحرك الجديد
                await runDungeon(thread, msg.channel, party, theme, sql, host.id, partyClasses, activeDungeonRequests);

            } catch (err) {
                console.error(err);
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
