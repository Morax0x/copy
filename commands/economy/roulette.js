const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js'); 

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 20;
const MAX_BET_SOLO = 100; 
const MAX_LOAN_BET = 500; // 🔒 الحد الأقصى للمقترضين في الجماعي
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 
const CHAMBER_COUNT = 6;
const OWNER_ID = "1145327691772481577";

const PULL_EMOJIS = ['🎯', '😮‍💨', '🥶', '🤯', '👑'];

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getMultipliers(playerCount) {
    if (playerCount === 1) return [1.2, 1.5, 2.0, 3.0, 4.0];
    return [1.1, 1.2, 1.3, 1.5, 1.8];
}

function setupChambers() {
    const chambers = Array(CHAMBER_COUNT).fill(0);
    const bulletPosition = Math.floor(Math.random() * CHAMBER_COUNT);
    chambers[bulletPosition] = 1;
    return chambers;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('روليت')
        .setDescription('لعبة الروليت الروسية (فردي أو جماعي).')
        .addIntegerOption(option => 
            option.setName('الرهان')
                .setDescription('مبلغ الرهان (اختياري)')
                .setMinValue(MIN_BET)
                .setRequired(false))
        .addUserOption(option => option.setName('الخصم1').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('تحدي لاعب آخر').setRequired(false)),

    name: 'roulette',
    aliases: ['روليت', 'rl'],
    category: "Economy",
    description: "لعبة الروليت الروسية.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, member, guild, client, channel;
        let betInput, opponents = new Collection();

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            member = interaction.member; 
            guild = interaction.guild;
            client = interaction.client;
            channel = interaction.channel;
            betInput = interaction.options.getInteger('الرهان');
            for (let i = 1; i <= 5; i++) {
                const opp = interaction.options.getUser(`الخصم${i}`);
                if (opp) {
                    const m = await guild.members.fetch(opp.id).catch(() => null);
                    if (m && !m.user.bot && m.id !== user.id) opponents.set(m.id, m);
                }
            }
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            member = message.member; 
            guild = message.guild;
            client = message.client;
            channel = message.channel;
            if (args[0] && !isNaN(parseInt(args[0]))) {
                betInput = parseInt(args[0]);
                opponents = message.mentions.members.filter(m => !m.user.bot && m.id !== user.id);
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        // تم إزالة تعريف activeGames لأنه لم يعد مستخدمًا
        if (!client.activePlayers) client.activePlayers = new Set(); 
        
        // التحقق فقط من اللاعب، وليس القناة
        if (client.activePlayers.has(user.id)) return reply({ content: "🚫 لديك لعبة نشطة! أكملها أولاً.", ephemeral: true });

        const sql = client.sql;
        let userData = client.getLevel.get(user.id, guild.id) || { ...client.defaultData, user: user.id, guild: guild.id };
        const now = Date.now();

        if (user.id !== OWNER_ID) {
            const timeLeft = (userData.lastRoulette || 0) + COOLDOWN_MS - now;
            if (timeLeft > 0) return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`**.` });
        }

        if (!betInput) {
            let proposedBet = userData.mora < MIN_BET ? 0 : (userData.mora < 100 ? userData.mora : 100);
            if (userData.mora < MIN_BET) return reply({ content: `❌ لا تملك مورا كافية!`, ephemeral: true });

            const autoBetEmbed = new EmbedBuilder().setColor(Colors.Blue).setDescription(`✥ المراهنة بـ **${proposedBet}** ${EMOJI_MORA} ؟`);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rl_auto_confirm').setLabel('مـراهـنـة').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('rl_auto_cancel').setLabel('رفـض').setStyle(ButtonStyle.Danger)
            );
            const confirmMsg = await reply({ embeds: [autoBetEmbed], components: [row], fetchReply: true });
            
            // قفل اللاعب فقط
            client.activePlayers.add(user.id);
            const filter = i => i.user.id === user.id && ['rl_auto_confirm', 'rl_auto_cancel'].includes(i.customId);
            
            try {
                const conf = await confirmMsg.awaitMessageComponent({ filter, time: 15000 });
                if (conf.customId === 'rl_auto_cancel') {
                    await conf.update({ content: '❌ ألغيت.', embeds: [], components: [] });
                    client.activePlayers.delete(user.id); // تحرير اللاعب
                    return;
                }
                await conf.deferUpdate();
                if (!isSlash) await confirmMsg.delete().catch(() => {}); else await conf.editReply({ content: '✅', embeds: [], components: [] });
                
                client.activePlayers.delete(user.id); // تحرير مؤقت للدخول في الدالة الرئيسية
                return startRoulette(channel, user, member, opponents, proposedBet, client, guild, sql, isSlash ? interaction : null);
            } catch (e) {
                client.activePlayers.delete(user.id); // تحرير اللاعب عند انتهاء الوقت
                if (!isSlash) await confirmMsg.delete().catch(() => {}); else await interaction.editReply({ content: '⏰ الوقت انتهى.', embeds: [], components: [] });
            }
        } else {
            return startRoulette(channel, user, member, opponents, betInput, client, guild, sql, isSlash ? interaction : null);
        }
    }
};

async function startRoulette(channel, user, member, opponents, bet, client, guild, sql, interaction) {
    // تم إزالة التحقق من القناة (client.activeGames)

    if (client.activePlayers.has(user.id)) return; // حماية إضافية

    let userData = client.getLevel.get(user.id, guild.id);
    if (!userData || userData.mora < bet) {
        const msg = `❌ ليس لديك مورا كافية!`;
        if (interaction) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
        return;
    }

    if (opponents.size > 0) {
        // --- PvP (الجماعي) ---
        
        // 🔥 1. فحص قرض المتحدي 🔥
        if (bet > MAX_LOAN_BET) {
            const myLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(user.id, guild.id);
            if (myLoan && myLoan.remainingAmount > 0) {
                const msg = `❌ **عذراً!** عليك قرض. حدك الأقصى في الجماعي **${MAX_LOAN_BET}** ${EMOJI_MORA}.`;
                if (interaction) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
                return;
            }
        }

        for (const opp of opponents.values()) {
            // 🔥 2. فحص قروض الخصوم 🔥
            if (bet > MAX_LOAN_BET) {
                const oppLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(opp.id, guild.id);
                if (oppLoan && oppLoan.remainingAmount > 0) {
                    const msg = `❌ اللاعب ${opp} عليه قرض ولا يمكنه المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA}.`;
                    if (interaction) await interaction.followUp(msg); else channel.send(msg);
                    return;
                }
            }

            if (client.activePlayers.has(opp.id)) {
                const msg = `🚫 اللاعب ${opp} مشغول في لعبة أخرى.`;
                if (interaction) await interaction.followUp(msg); else channel.send(msg);
                return;
            }
            
            const oppData = client.getLevel.get(opp.id, guild.id);
            if (!oppData || oppData.mora < bet) {
                const msg = `🚫 اللاعب ${opp} مفلس.`;
                if (interaction) await interaction.followUp(msg); else channel.send(msg);
                return;
            }
        }
        
        // إضافة جميع اللاعبين لقائمة النشطين
        client.activePlayers.add(user.id);
        opponents.forEach(o => client.activePlayers.add(o.id));

        const totalPot = bet * (opponents.size + 1);
        const players = [user, ...opponents.values()];
        const playerIds = players.map(p => p.id);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rl_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rl_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder().setTitle(`🔫 روليت جماعي!`).setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة: **${totalPot}** ${EMOJI_MORA}`).setColor(Colors.Orange).setImage('https://i.postimg.cc/J44F9YWS/gun.gif');

        let inviteMsg;
        if (interaction) inviteMsg = await interaction.editReply({ content: `${opponents.map(o => o.toString()).join(' ')}`, embeds: [embed], components: [row] });
        else inviteMsg = await channel.send({ content: `${opponents.map(o => o.toString()).join(' ')}`, embeds: [embed], components: [row] });

        const accepted = new Set([user.id]);
        const collector = inviteMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (!playerIds.includes(i.user.id)) return i.reply({ content: "ليس لك.", ephemeral: true });
            
            if (i.customId === 'rl_pvp_decline') {
                collector.stop('declined');
                await i.update({ content: `❌ تم الإلغاء.`, embeds: [], components: [] });
                return;
            }
            if (i.customId === 'rl_pvp_accept') {
                if (accepted.has(i.user.id)) return i.reply({ content: "قبلت بالفعل.", ephemeral: true });
                accepted.add(i.user.id);
                await i.reply({ content: `✅`, ephemeral: true });
                if (accepted.size === players.length) collector.stop('start');
            }
        });

        collector.on('end', async (c, reason) => {
            if (reason !== 'start') {
                // تحرير اللاعبين عند انتهاء/إلغاء اللعبة
                players.forEach(p => client.activePlayers.delete(p.id));
                if (reason !== 'declined') inviteMsg.edit({ content: "⏰ انتهى الوقت.", embeds: [], components: [] });
                return;
            }
            for (const p of players) {
                let d = client.getLevel.get(p.id, guild.id);
                d.mora -= bet;
                if (p.id !== OWNER_ID) d.lastRoulette = Date.now();
                client.setLevel.run(d);
            }
            await playMultiplayerGame(inviteMsg, players, bet, totalPot, client, guild);
        });

    } else {
        // --- Solo ---
        if (bet > MAX_BET_SOLO) {
            const msg = `🚫 الحد الأقصى للرهان الفردي هو **${MAX_BET_SOLO}** ${EMOJI_MORA}.`;
            if (interaction) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
            return;
        }

        // قفل اللاعب فقط
        client.activePlayers.add(user.id);
        userData.mora -= bet;
        if (user.id !== OWNER_ID) userData.lastRoulette = Date.now();
        client.setLevel.run(userData);

        const initialEmbed = new EmbedBuilder().setTitle('❖ رولــيـت (فردي)').setColor("Random").setImage('https://i.postimg.cc/J44F9YWS/gun.gif').addFields({ name: 'الطلقة الحالية', value: `1 / ${CHAMBER_COUNT}`, inline: true }, { name: 'المضاعف الحالي', value: 'x1.0', inline: true });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rl_pull').setLabel('سحب الزناد').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('rl_cashout').setLabel('انسحاب (Cash Out)').setStyle(ButtonStyle.Success).setDisabled(true)
        );

        let msg;
        if (interaction) msg = await interaction.editReply({ content: " ", embeds: [initialEmbed], components: [row] });
        else msg = await channel.send({ content: " ", embeds: [initialEmbed], components: [row] });

        await playSoloRound(msg, user, member, bet, userData, client, sql);
    }
}

async function playSoloRound(message, user, member, bet, userData, client, sql) {
    let chambers = setupChambers();
    let currentTurn = 0;
    let currentMultiplier = 1.0;
    const MULTIPLIERS = getMultipliers(1);
    const buttonStyles = [ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Success, ButtonStyle.Danger];

    const updateEmbed = () => {
        return new EmbedBuilder().setTitle('❖ رولــيـت (فردي)').setColor("Random").setImage('https://i.postimg.cc/J44F9YWS/gun.gif').addFields(
            { name: 'الطلقة الحالية', value: `${currentTurn + 1} / ${CHAMBER_COUNT}`, inline: true },
            { name: 'المضاعف الحالي', value: `x${currentMultiplier}`, inline: true }
        );
    };

    const collector = message.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 120000 });

    collector.on('collect', async i => {
        await i.deferUpdate().catch(() => {});

        if (i.customId === 'rl_cashout') {
            const win = Math.floor(bet * currentMultiplier * calculateMoraBuff(member, sql));
            userData.mora += win; client.setLevel.run(userData);
            
            const winEmbed = new EmbedBuilder()
                .setTitle('✅ نجاة!')
                .setDescription(`انـسـحبـت من اللعـبـة ونجـوت بـ: **${win}** ${EMOJI_MORA}`)
                .setColor(Colors.Green)
                .setImage('https://i.postimg.cc/K8QBCQmS/download-1.gif')
                .setThumbnail(user.displayAvatarURL());

            await message.edit({ embeds: [winEmbed], components: [] });
            collector.stop('finished');
        } 
        else if (i.customId === 'rl_pull') {
            if (chambers[currentTurn] === 1) {
                const loseEmbed = new EmbedBuilder().setTitle('💥 بــــووم!').setDescription(`خسرت **${bet}** ${EMOJI_MORA}`).setColor(Colors.Red).setImage('https://i.postimg.cc/3Np26Tx9/download.gif').setThumbnail(user.displayAvatarURL());
                await message.edit({ embeds: [loseEmbed], components: [] });
                collector.stop('finished');
            } else {
                currentMultiplier = MULTIPLIERS[currentTurn];
                currentTurn++;
                if (currentTurn === 5) {
                    const win = Math.floor(bet * MULTIPLIERS[4] * calculateMoraBuff(member, sql));
                    userData.mora += win; client.setLevel.run(userData);
                    const maxEmbed = new EmbedBuilder().setTitle('🏆 نجاة أسطورية!').setDescription(`ربحت **${win}** ${EMOJI_MORA}`).setColor("Gold").setImage('https://i.postimg.cc/K8QBCQmS/download-1.gif').setThumbnail(user.displayAvatarURL());
                    await message.edit({ embeds: [maxEmbed], components: [] });
                    collector.stop('finished');
                } else {
                    const win = Math.floor(bet * currentMultiplier * calculateMoraBuff(member, sql));
                    const nextEmbed = updateEmbed();
                    nextEmbed.setDescription(`*كليك*... فارغة! 😅`);
                    
                    const randomStyle = buttonStyles[Math.floor(Math.random() * buttonStyles.length)];

                    const newRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('rl_pull').setLabel('سحب الزناد مجدداً').setStyle(randomStyle),
                        new ButtonBuilder().setCustomId('rl_cashout').setLabel(`انسحاب (${win})`).setStyle(ButtonStyle.Success)
                    );
                    await message.edit({ embeds: [nextEmbed], components: [newRow] });
                }
            }
        }
    });

    collector.on('end', async (collected, reason) => {
        // تحرير اللاعب فقط
        client.activePlayers.delete(user.id);
        if (reason === 'time') message.edit({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
    });
}

async function playMultiplayerGame(msg, players, bet, totalPot, client, guild) {
    const MULTIPLIERS = getMultipliers(players.length);
    const gameStates = new Map();
    players.forEach(p => gameStates.set(p.id, { chambers: setupChambers(), turn: 0, multiplier: 1.0, status: 'playing', player: p }));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rl_race_pull').setLabel('🔥 إطلاق').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rl_race_out').setLabel('🏳️ انسحاب').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setTitle('🔫 بدأ السباق!').setColor("Orange").setDescription(`الكل دفع **${bet}**. الجائزة: **${totalPot}**`);
    await msg.edit({ content: " ", embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ time: 90000 });

    collector.on('collect', async i => {
        await i.deferUpdate().catch(()=>{}); 
        const state = gameStates.get(i.user.id);
        if (!state || state.status !== 'playing') return;

        if (i.customId === 'rl_race_out') {
            state.status = 'cashed_out';
            await i.followUp({ content: `انسحبت x${state.multiplier}`, ephemeral: true });
        } else {
            if (state.chambers[state.turn] === 1) {
                state.status = 'dead'; state.multiplier = 0;
                await i.followUp({ content: `💥 مت!`, ephemeral: true });
            } else {
                state.multiplier = MULTIPLIERS[state.turn]; state.turn++;
                if (state.turn === 5) { state.status = 'max_win'; await i.followUp({ content: `🏆 Max!`, ephemeral: true }); }
                else await i.followUp({ content: `نجاة! التالي x${MULTIPLIERS[state.turn]}`, ephemeral: true });
            }
        }
        if (Array.from(gameStates.values()).every(s => s.status !== 'playing')) collector.stop();
    });

    collector.on('end', () => {
        // تحرير جميع اللاعبين
        players.forEach(p => client.activePlayers.delete(p.id));
        
        let winner = null, maxMult = 0;
        for (const s of gameStates.values()) {
            if (s.multiplier > maxMult) { maxMult = s.multiplier; winner = s.player; }
        }
        if (winner && maxMult > 1) {
            let d = client.getLevel.get(winner.id, guild.id); d.mora += totalPot; client.setLevel.run(d);
            const embed = new EmbedBuilder().setTitle(`🏆 الفائز: ${winner.displayName}`).setDescription(`ربـح **${totalPot}** ${EMOJI_MORA}`).setColor("Gold");
            msg.edit({ embeds: [embed], components: [] });
        } else {
            const embed = new EmbedBuilder().setTitle("💀 لا فائز").setDescription(`استرجاع الأموال.`).setColor("Red");
            players.forEach(p => { let d = client.getLevel.get(p.id, guild.id); d.mora += bet; client.setLevel.run(d); });
            msg.edit({ embeds: [embed], components: [] });
        }
    });
}
