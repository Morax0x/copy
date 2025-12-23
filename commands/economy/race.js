const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 50;
const MAX_BET_SOLO = 200; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000;
const MAX_LOAN_BET = 500; 
const OWNER_ID = "1145327691772481577";
const RACE_ICONS = ['🐎', '🦄', '🦓', '🐪', '🐂'];
const TRACK_LENGTH = 20;

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سباق')
        .setDescription('تحدي البوت (فردي) أو أصدقائك (جماعي) في سباق الخيول.')
        .addIntegerOption(option =>
            option.setName('الرهان')
                .setDescription(`المبلغ الذي تريد المراهنة به (اختياري)`)
                .setRequired(false)
                .setMinValue(MIN_BET)
        )
        .addUserOption(option => option.setName('الخصم1').setDescription('الخصم الأول (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('الخصم الثاني (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('الخصم الثالث (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('الخصم الرابع (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('الخصم الخامس (لعبة جماعية)').setRequired(false)),

    name: 'race',
    // 🔥 تم تحديث الاختصارات لتعمل العربية بشكل مؤكد 🔥
    aliases: ['سباق', 'سابق', 'سباق_خيول', 'r', 'race'],
    category: "Economy",
    description: `تحدي البوت أو تحدي أصدقائك في سباق الخيول.`,

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, author, client, guild, sql, channel;
        let betInput, opponents = new Collection();

        if (isSlash) {
            interaction = interactionOrMessage;
            author = interaction.member;
            client = interaction.client;
            guild = interaction.guild;
            channel = interaction.channel;
            sql = client.sql; 
            betInput = interaction.options.getInteger('الرهان');
            for (let i = 1; i <= 5; i++) {
                const user = interaction.options.getUser(`الخصم${i}`);
                if (user) {
                    const member = await guild.members.fetch(user.id).catch(() => null);
                    if (member) opponents.set(member.id, member);
                }
            }
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            author = message.member;
            client = message.client;
            guild = message.guild;
            channel = message.channel;
            sql = client.sql; 
            if (args[0] && !isNaN(parseInt(args[0]))) {
                betInput = parseInt(args[0]);
                if (message.mentions.members.size > 0) opponents = message.mentions.members;
            } else if (message.mentions.members.size > 0) {
                opponents = message.mentions.members;
                if (args[1] && !isNaN(parseInt(args[1]))) betInput = parseInt(args[1]);
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        const replyError = async (content) => {
             const payload = { content, ephemeral: true };
             if (isSlash) return interaction.editReply(payload);
             return message.reply(payload);
        };

        if (!client.activeGames) client.activeGames = new Set();
        if (!client.activePlayers) client.activePlayers = new Set();

        if (client.activePlayers.has(author.id)) {
            return reply({ content: "🚫 **لديك لعبة نشطة بالفعل!** أكملها أولاً.", ephemeral: true });
        }

        if (client.activeGames.has(`${channel.id}-${author.id}`)) {
             return reply({ content: "🚫 **لديك لعبة جارية في هذه القناة.**", ephemeral: true });
        }

        let userData = client.getLevel.get(author.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: author.id, guild: guild.id };

        const now = Date.now();
        if (author.id !== OWNER_ID) {
            const lastRaceTime = userData.lastRace || 0; 
            const timeLeft = lastRaceTime + COOLDOWN_MS - now;
            if (timeLeft > 0) {
                return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل التسابق مرة أخرى.` });
            }
        }

        // --- المراهنة التلقائية ---
        if (!betInput) {
            let proposedBet = 100;
            const userBalance = userData.mora;

            if (userBalance < MIN_BET) return replyError(`❌ لا تملك مورا كافية للعب (الحد الأدنى ${MIN_BET})!`);
            if (userBalance < 100) proposedBet = userBalance;

            client.activePlayers.add(author.id);
            const gameKey = `${channel.id}-${author.id}`; 
            client.activeGames.add(gameKey);

            const autoBetEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setDescription(
                    `✥ المـراهـنـة التلقائية بـ **${proposedBet}** ${EMOJI_MORA} ؟\n` +
                    `✥ طريقة الاستخدام لتحديد المبلغ:\n` +
                    `\`سباق <مبلغ الرهان> [@لاعب اختياري]\``
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('race_auto_confirm').setLabel('مـراهـنـة').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('race_auto_cancel').setLabel('رفـض').setStyle(ButtonStyle.Danger)
            );

            const confirmMsg = await reply({ embeds: [autoBetEmbed], components: [row], fetchReply: true });
            
            const filter = i => i.user.id === author.id && (i.customId === 'race_auto_confirm' || i.customId === 'race_auto_cancel');
            
            try {
                const confirmation = await confirmMsg.awaitMessageComponent({ filter, time: 15000 });
                
                if (confirmation.customId === 'race_auto_cancel') {
                    await confirmation.update({ content: '❌ تم الإلغاء.', embeds: [], components: [] });
                    client.activeGames.delete(gameKey);
                    client.activePlayers.delete(author.id);
                    return;
                }

                if (confirmation.customId === 'race_auto_confirm') {
                    await confirmation.deferUpdate();
                    if (!isSlash) await confirmMsg.delete().catch(() => {});
                    else await confirmation.editReply({ content: '✅', embeds: [], components: [] });

                    client.activeGames.delete(gameKey); 
                    
                    return startRaceGame(channel, author, opponents, proposedBet, client, guild, sql, replyError, reply);
                }
            } catch (e) {
                client.activeGames.delete(gameKey);
                client.activePlayers.delete(author.id);
                if (!isSlash) await confirmMsg.delete().catch(() => {});
                else await interaction.editReply({ content: '⏰ انتهى الوقت.', embeds: [], components: [] });
                return;
            }
        } else {
            client.activePlayers.add(author.id);
            return startRaceGame(channel, author, opponents, betInput, client, guild, sql, replyError, reply);
        }
    }
};

async function startRaceGame(channel, author, opponents, bet, client, guild, sql, replyError, replyFunction) {
    const gameKey = `${channel.id}-${author.id}`; 

    if (client.activeGames.has(gameKey)) {
        client.activePlayers.delete(author.id);
        const msg = "🚫 لديك لعبة جارية بالفعل!";
        if (replyFunction) await replyFunction({ content: msg, ephemeral: true });
        else channel.send(msg);
        return;
    }

    if (bet < MIN_BET) {
        client.activePlayers.delete(author.id);
        return replyError(`الحد الأدنى للرهان هو **${MIN_BET}** ${EMOJI_MORA} !`);
    }

    const getScore = client.getLevel;
    const setScore = client.setLevel;
    let authorData = getScore.get(author.id, guild.id);
    if (!authorData) authorData = { ...client.defaultData, user: author.id, guild: guild.id };

    if (authorData.mora < bet) {
        client.activePlayers.delete(author.id);
        return replyError(`ليس لديك مورا كافية لهذا الرهان! (رصيدك: ${authorData.mora})`);
    }

    // --- الفرز بين الفردي والجماعي ---
    if (opponents.size === 0) {
        // --- فردي ---
        if (bet > MAX_BET_SOLO) {
            client.activePlayers.delete(author.id);
            return replyError(`🚫 **تنبيه:** الحد الأقصى للرهان في السباق الفردي (ضد البوت) هو **${MAX_BET_SOLO}** ${EMOJI_MORA}!\n(للعب بمبالغ أكبر، تحدى لاعبين آخرين).`);
        }
        client.activeGames.add(gameKey);
        
        if (author.id !== OWNER_ID) {
             try { sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), author.id, guild.id); } 
             catch(e) { /* العمود غير موجود، لا بأس */ }
        }
        
        setScore.run(authorData);
        await playSoloRace(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);

    } else {
        // --- جماعي ---
        if (bet > MAX_LOAN_BET) {
            const authorLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(author.id, guild.id);
            if (authorLoan && authorLoan.remainingAmount > 0) {
                client.activePlayers.delete(author.id);
                return replyError(`❌ **عذراً!** عليك قرض. حدك الأقصى للرهان الجماعي هو **${MAX_LOAN_BET}** ${EMOJI_MORA} حتى تسدد قرضك.`);
            }
        }

        if (bet > MAX_LOAN_BET) {
            for (const opponent of opponents.values()) {
                const opponentLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(opponent.id, guild.id);
                if (opponentLoan && opponentLoan.remainingAmount > 0) {
                    client.activePlayers.delete(author.id);
                    return replyError(`❌ اللاعب ${opponent.displayName} عليه قرض ولا يمكنه المشاركة برهان أعلى من **${MAX_LOAN_BET}**.`);
                }
            }
        }

        client.activeGames.add(gameKey);
        if (author.id !== OWNER_ID) {
             try { sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), author.id, guild.id); } 
             catch(e) {}
        }
        setScore.run(authorData);
        await playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);
    }
}

async function playSoloRace(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    authorData.mora -= bet;
    setScore.run(authorData);

    const prize = bet * 2; 
    
    // اختيار عشوائي للأيقونات
    const playerIcon = RACE_ICONS[Math.floor(Math.random() * RACE_ICONS.length)];
    const availableBotIcons = RACE_ICONS.filter(i => i !== playerIcon);
    const botIcon = availableBotIcons[Math.floor(Math.random() * availableBotIcons.length)];

    const participants = [
        { id: author.id, name: author.displayName, icon: playerIcon, progress: 0, isPlayer: true },
        { id: 'bot', name: 'الخصم', icon: botIcon, progress: 0, isPlayer: false }
    ];

    // 🔥🔥 تعديل: عكس اتجاه العرض 🔥🔥
    const renderTrack = () => {
        return participants.map(p => {
            const spaces = Math.floor(p.progress);
            const remaining = TRACK_LENGTH - spaces;
            // 1. الاسم أولاً
            // 2. خط النهاية (🏁)
            // 3. المسافة المتبقية (➖)
            // 4. الأيقونة
            // 5. المسافة المقطوعة (➖)
            // 6. خط البداية (|)
            const trackLine = '🏁' + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
            return `**${p.name}**\n${trackLine}`;
        }).join('\n\n');
    };

    const embed = new EmbedBuilder()
        // 🔥 تم حذف كلمة (فردي) من هنا 🔥
        .setTitle('🐎 سباق الخيول')
        .setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة: **${prize}** ${EMOJI_MORA}\n\n${renderTrack()}`)
        .setColor("Orange")
        .setFooter({ text: "السباق جارٍ..." });

    const raceMsg = await replyFunction({ embeds: [embed] });

    const raceInterval = setInterval(async () => {
        let winner = null;

        participants.forEach(p => {
            // سرعة عشوائية لكل متسابق
            const move = Math.random() * 3 + 0.5; 
            p.progress += move;
            if (p.progress >= TRACK_LENGTH && !winner) winner = p;
        });

        embed.setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة: **${prize}** ${EMOJI_MORA}\n\n${renderTrack()}`);
        await raceMsg.edit({ embeds: [embed] }).catch(() => clearInterval(raceInterval));

        if (winner) {
            clearInterval(raceInterval);
            client.activeGames.delete(gameKey);
            client.activePlayers.delete(author.id);

            if (winner.isPlayer) {
                const moraMultiplier = calculateMoraBuff(author, sql);
                
                // حساب الربح المبفف
                const profit = bet;
                const buffedProfit = Math.floor(profit * moraMultiplier);
                const finalWinnings = bet + buffedProfit;
                
                // حساب نسبة الزيادة للعرض
                const buffPercent = Math.round((moraMultiplier - 1) * 100);
                const buffText = buffPercent > 0 ? ` (+${buffPercent}%)` : "";

                authorData.mora += finalWinnings;
                setScore.run(authorData);

                const winEmbed = new EmbedBuilder()
                    .setTitle(`🏆 فـاز ${author.displayName}!`)
                    .setDescription(`🎉 مبروك! سبقت الخصم!\n\nربـحت **${finalWinnings.toLocaleString()}** ${EMOJI_MORA}${buffText}`)
                    .setColor("Green")
                    .setThumbnail(author.user.displayAvatarURL());
                
                channel.send({ embeds: [winEmbed] });
            } else {
                const loseEmbed = new EmbedBuilder()
                    .setTitle('💔 خسرت السباق...')
                    .setDescription(`سبقك الخصم لخط النهاية.\nخسرت **${bet}** ${EMOJI_MORA} 💸.`)
                    .setColor("Red");
                
                channel.send({ embeds: [loseEmbed] });
            }
        }
    }, 2500);
}

async function playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    const requiredOpponentsIDs = opponents.map(o => o.id);

    for (const opponent of opponents.values()) {
        if (opponent.id === author.id) {
            client.activeGames.delete(gameKey);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: "لا يمكنك تحدي نفسك!", ephemeral: true });
        }
        if (client.activePlayers.has(opponent.id)) {
            client.activeGames.delete(gameKey);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: `اللاعب ${opponent.displayName} مشغول في لعبة أخرى!`, ephemeral: true });
        }
        if (opponent.user.bot) {
            client.activeGames.delete(gameKey);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: "لا يمكنك تحدي البوت في اللعب الجماعي!", ephemeral: true });
        }

        let opponentData = getScore.get(opponent.id, channel.guild.id);
        if (!opponentData || opponentData.mora < bet) {
            client.activeGames.delete(gameKey);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: `اللاعب ${opponent.displayName} لا يملك مورا كافية لهذا الرهان!`, ephemeral: true });
        }
    }

    opponents.forEach(o => client.activePlayers.add(o.id));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('race_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('race_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
    );

    const totalPot = bet * (opponents.size + 1);

    const description = [
        `✥ قـام ${author}`,
        `✶ بدعـوتـك ${opponents.map(o => o.toString()).join(', ')}`,
        `على سـباق خيول جماعي! 🐎`,
        `مـبـلغ الـرهـان ${bet} ${EMOJI_MORA} (لكل شخص)`,
        `الجائـزة الكـبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}`
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🏁 تـحـدي سباق الخيول!`)
        .setDescription(description)
        .setColor("Orange");

    const challengeMsg = await replyFunction({ 
        content: opponents.map(o => o.toString()).join(' '), 
        embeds: [embed], 
        components: [row], 
        fetchReply: true 
    });

    const acceptedOpponentsIDs = new Set(); 
    const challengeCollector = challengeMsg.createMessageComponentCollector({ time: 60000 });

    const startRace = async () => {
        challengeCollector.stop('started');
        
        const finalPlayers = [author];
        opponents.forEach(o => finalPlayers.push(o));

        for (const player of finalPlayers) {
            let data = getScore.get(player.id, channel.guild.id);
            if (!data) data = { ...channel.client.defaultData, user: player.id, guild: channel.guild.id };
            data.mora -= bet;
            if (player.id !== OWNER_ID && player.id !== author.id) {
                 try { sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), player.id, guild.id); } catch(e) {}
            }
            setScore.run(data);
        }
        
        const participants = finalPlayers.map((p, index) => ({
            id: p.id,
            name: p.displayName,
            avatar: p.user.displayAvatarURL(),
            icon: RACE_ICONS[index % RACE_ICONS.length],
            progress: 0
        }));

        // 🔥🔥 تعديل: عكس اتجاه العرض للجماعي أيضاً 🔥🔥
        const renderTrack = () => {
            return participants.map(p => {
                const spaces = Math.floor(p.progress);
                const remaining = TRACK_LENGTH - spaces;
                const trackLine = '🏁' + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
                return `**${p.name}**\n${trackLine}`;
            }).join('\n\n');
        };

        const raceEmbed = new EmbedBuilder()
            .setTitle('🐎 السباق بدأ!')
            .setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}`)
            .setColor("Blue");

        await challengeMsg.edit({ content: null, embeds: [raceEmbed], components: [] });

        const raceInterval = setInterval(async () => {
            let winner = null;

            participants.forEach(p => {
                const move = Math.random() * 3 + 0.5;
                p.progress += move;
                if (p.progress >= TRACK_LENGTH && !winner) winner = p;
            });

            raceEmbed.setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}`);
            await challengeMsg.edit({ embeds: [raceEmbed] }).catch(() => clearInterval(raceInterval));

            if (winner) {
                clearInterval(raceInterval);
                client.activeGames.delete(gameKey);
                finalPlayers.forEach(p => client.activePlayers.delete(p.id));

                let winnerData = getScore.get(winner.id, channel.guild.id);
                winnerData.mora += totalPot;
                setScore.run(winnerData);

                const winEmbed = new EmbedBuilder()
                    .setTitle(`🏆 الفائز هو ${winner.name}!`)
                    .setDescription(`🎉 **${winner.name}** اكتسح السباق وحصل على **${totalPot.toLocaleString()}** ${EMOJI_MORA}!`)
                    .setColor("Gold")
                    .setThumbnail(winner.avatar);

                channel.send({ content: `<@${winner.id}>`, embeds: [winEmbed] });
            }
        }, 2500);
    };

    challengeCollector.on('collect', async i => {
        if (!requiredOpponentsIDs.includes(i.user.id)) {
            return i.reply({ content: `التحدي ليس مرسلاً لك!`, ephemeral: true });
        }

        if (i.customId === 'race_pvp_decline') {
            challengeCollector.stop('decline');
            return i.update({
                content: `✬ رفـض ${i.member.displayName} التـحدي. تم الإلغاء.`,
                embeds: [],
                components: []
            });
        }

        if (i.customId === 'race_pvp_accept') {
            if (!acceptedOpponentsIDs.has(i.user.id)) {
                acceptedOpponentsIDs.add(i.user.id);
                await i.reply({ content: `✦ تـم قبول التحدي!`, ephemeral: true });
                
                if (acceptedOpponentsIDs.size === requiredOpponentsIDs.length) {
                    await startRace();
                }
            } else {
                 await i.reply({ content: `أنت قبلت بالفعل!`, ephemeral: true });
            }
        }
    });

    challengeCollector.on('end', async (collected, reason) => {
        if (reason === 'decline' || reason !== 'started') {
            client.activeGames.delete(gameKey);
            client.activePlayers.delete(author.id);
            opponents.forEach(o => client.activePlayers.delete(o.id));
        }
        if (reason !== 'started' && reason !== 'decline') {
            return challengeMsg.edit({ content: `✶ انتـهـى الـوقـت لـم يقـبل الجـميع التحـدي!`, embeds: [], components: [] });
        }
    });
}
