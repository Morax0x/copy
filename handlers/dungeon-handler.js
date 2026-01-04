const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, MessageFlags, ChannelType } = require('discord.js');
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');

// ⚠️ تم إيقاف استدعاء ملف المعركة مؤقتاً لعزل المشكلة
// const { runDungeon } = require('./dungeon-battle.js'); 

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
            let arabCls = cls === 'Leader' ? 'القائد 👑' : cls;
            return `\`${i+1}.\` <@${id}> — **${arabCls}**`;
        }).join('\n');

        const imageUrl = theme.image || 'https://i.postimg.cc/NMkWVyLV/line.png';

        return new EmbedBuilder()
            .setTitle(`${theme.emoji} بوابة الدانجون: ${theme.name}`)
            .setDescription(`**القائد:** ${host}\n**الشروط:** لفل 5+ و 100 ${EMOJI_MORA}\n\n🔮 **تم فتح البوابة إلى ${theme.name}!**\nاختر تخصصك واستعد للمعركة.\n\n👥 **الفريق:**\n${memberList}`)
            .setColor('DarkRed')
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

                if (!party.includes(i.user.id) && i.user.id !== OWNER_ID) {
                     // التحقق من الشروط (تم اختصاره للكود النظيف)
                     const jData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
                     if (!jData || jData.level < 5 || jData.mora < 100) return i.reply({ content: "🚫 لا تستوفي الشروط.", flags: [MessageFlags.Ephemeral] });
                }

                // ... منطق اختيار الكلاس (مختصر) ...
                if (!party.includes(i.user.id)) {
                    party.push(i.user.id);
                    partyClasses.set(i.user.id, 'Warrior'); // افتراضي للتجربة
                    await i.reply({ content: "✅ تم الانضمام (تجريبي)", flags: [MessageFlags.Ephemeral] });
                    await msg.edit({ embeds: [updateEmbed()] });
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
            try {
                const thread = await msg.channel.threads.create({
                    name: `غارة-${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'Start Dungeon Battle'
                });

                await thread.send(`🔔 **بدأت المعركة!** (وضع التصحيح Debug Mode)`);
                if (msg.editable) await msg.edit({ content: `✅ **بدأت المعركة!** <#${thread.id}>`, components: [] });

                // ⚠️ هنا بدلاً من استدعاء الملف المعطوب، نرسل رسالة فقط
                await thread.send("✅ **نجاح!** ملف `dungeon-handler.js` يعمل بشكل صحيح.\n🔴 **المشكلة الحقيقية:** ملف `handlers/dungeon-battle.js` تالف أو غير مكتمل.");
                
            } catch (e) {
                console.error(e);
                msg.channel.send("❌ خطأ في إنشاء الثريد.");
            }
        } else {
            activeDungeonRequests.delete(host.id);
            if (msg.editable) msg.edit({ content: "❌ تم الإلغاء.", components: [], embeds: [] });
        }
    });
}

module.exports = { startDungeon };
