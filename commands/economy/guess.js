const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000;
const MAX_LOAN_BET = 500; 
const OWNER_ID = "1145327691772481577";

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getMaxAttempts(level) {
    if (level >= 51) return 7;
    if (level >= 30) return 6;
    return 5;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تخمين')
        .setDescription('تحدي البوت (فردي) أو أصدقائك (جماعي) في لعبة تخمين الرقم.')
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

    name: 'guess',
    aliases: ['خمن', 'g', 'تخمين'],
    category: "Economy",
    description: `تحدي البوت (فردي) أو تحدي أصدقائك (جماعي) في لعبة تخمين الرقم.`,

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

        if (client.activeGames.has(channel.id)) {
            return reply({ content: "🚫 **هناك لعبة جارية في هذه القناة.** انتظر انتهائها.", ephemeral: true });
        }

        let userData = client.getLevel.get(author.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: author.id, guild: guild.id };

        const now = Date.now();
        if (author.id !== OWNER_ID) {
            const timeLeft = (userData.lastGuess || 0) + COOLDOWN_MS - now;
            if (timeLeft > 0) {
                return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل اللعب مرة أخرى.` });
            }
        }

        if (!betInput) {
            let proposedBet = 100;
            const userBalance = userData.mora;

            if (userBalance < MIN_BET) return replyError(`❌ لا تملك مورا كافية للعب (الحد الأدنى ${MIN_BET})!`);
            if (userBalance < 100) proposedBet = userBalance;

            return startGuessGame(channel, author, opponents, proposedBet, client, guild, sql, replyError, reply);
        } else {
            return startGuessGame(channel, author, opponents, betInput, client, guild, sql, replyError, reply);
        }
    }
};

async function startGuessGame(channel, author, opponents, bet, client, guild, sql, replyError, replyFunction) {
    const channelId = channel.id;

    if (client.activeGames.has(channelId)) {
        const msg = "🚫 هناك لعبة نشطة بالفعل في هذه القناة!";
        if (replyFunction) await replyFunction({ content: msg, ephemeral: true });
        else channel.send(msg);
        return;
    }

    if (client.activePlayers.has(author.id)) {
         return; 
    }

    if (bet < MIN_BET) {
        return replyError(`الحد الأدنى للرهان هو **${MIN_BET}** ${EMOJI_MORA} !`);
    }

    const getScore = client.getLevel;
    const setScore = client.setLevel;
    let authorData = getScore.get(author.id, guild.id);
    if (!authorData) authorData = { ...client.defaultData, user: author.id, guild: guild.id };

    if (authorData.mora < bet) {
        return replyError(`ليس لديك مورا كافية لهذا الرهان! (رصيدك: ${authorData.mora})`);
    }

    if (opponents.size === 0) {
        if (bet > MAX_BET_SOLO) {
            return replyError(`🚫 **تنبيه:** الحد الأقصى للرهان في اللعب الفردي (ضد البوت) هو **${MAX_BET_SOLO}** ${EMOJI_MORA}!\n(للعب بمبالغ أكبر، تحدى لاعبين آخرين).`);
        }
        
        client.activeGames.add(channelId);
        client.activePlayers.add(author.id);

        if (author.id !== OWNER_ID) authorData.lastGuess = Date.now();
        setScore.run(authorData);
        
        try {
            await playSolo(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client);
        } catch (err) {
            console.error("Solo Guess Error:", err);
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
        }

    } else {
        if (bet > MAX_LOAN_BET) {
            const authorLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(author.id, guild.id);
            if (authorLoan && authorLoan.remainingAmount > 0) {
                return replyError(`❌ **عذراً!** عليك قرض. حدك الأقصى للرهان الجماعي هو **${MAX_LOAN_BET}** ${EMOJI_MORA} حتى تسدد قرضك.`);
            }
        }

        if (bet > MAX_LOAN_BET) {
            for (const opponent of opponents.values()) {
                const opponentLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(opponent.id, guild.id);
                if (opponentLoan && opponentLoan.remainingAmount > 0) {
                    return replyError(`❌ اللاعب ${opponent.displayName} عليه قرض ولا يمكنه المشاركة برهان أعلى من **${MAX_LOAN_BET}**.`);
                }
            }
        }

        client.activeGames.add(channelId);
        client.activePlayers.add(author.id); 

        if (author.id !== OWNER_ID) authorData.lastGuess = Date.now();
        setScore.run(authorData);
        
        try {
            await playChallenge(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client);
        } catch (err) {
            console.error("Challenge Guess Error:", err);
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            opponents.forEach(o => client.activePlayers.delete(o.id)); 
        }
    }
}

async function playSolo(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client) {
    const channelId = channel.id;
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;

    const maxAttempts = getMaxAttempts(authorData.level);

    authorData.mora -= bet;
    setScore.run(authorData);

    const startingPrize = bet * 5; 
    let currentWinnings = startingPrize;
    const penaltyPerGuess = Math.floor(startingPrize / maxAttempts);

    const embed = new EmbedBuilder()
        .setTitle('🎲 لعبة التخـمـين')
        .setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة الحالية: **${currentWinnings}** ${EMOJI_MORA}\nاختر رقماً سريــاً بين 1 و 100.\nلديك **${maxAttempts}** محاولات.\n\nاكتب تخمينك في الشات!`)
        .setColor("Random")
        .setImage('https://i.postimg.cc/Vs9bp19q/download-3.gif')
        .setFooter({ text: `المحاولات المتبقية: ${maxAttempts}` });

    await replyFunction({ embeds: [embed] });

    const filter = (m) => m.author.id === author.id && !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 60000, max: maxAttempts });

    let hasWon = false;

    collector.on('collect', (msg) => {
        const guess = parseInt(msg.content);
        if (isNaN(guess)) return;

        attempts++;
        const attemptsLeft = maxAttempts - attempts;

        if (guess === targetNumber) {
            hasWon = true; 
            const moraMultiplier = calculateMoraBuff(author, sql);
            let finalWinnings = Math.floor(currentWinnings * moraMultiplier);

            let casinoTax = 0;
            let taxText = "";
            const settings = sql.prepare("SELECT roleCasinoKing FROM settings WHERE guild = ?").get(channel.guild.id);
            if (settings && settings.roleCasinoKing && !author.roles.cache.has(settings.roleCasinoKing)) {
                const kingMembers = channel.guild.roles.cache.get(settings.roleCasinoKing)?.members;
                if (kingMembers && kingMembers.size > 0) {
                    const king = kingMembers.first();
                    casinoTax = Math.floor(finalWinnings * 0.01);
                    if (casinoTax > 0) {
                        finalWinnings -= casinoTax;
                        taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                        sql.prepare('UPDATE levels SET bank = bank + ? WHERE user = ? AND guild = ?').run(casinoTax, king.id, channel.guild.id);
                    }
                }
            }

            authorData.mora += finalWinnings;
            setScore.run(authorData);

            if (updateGuildStat) {
                updateGuildStat(client, channel.guild.id, author.id, 'casino_profit', finalWinnings - bet);
            }

            let buffString = "";
            const buffPercent = Math.round((moraMultiplier - 1) * 100);
            if (buffPercent > 0) buffString = ` (+${buffPercent}%)`;

            const winEmbed = new EmbedBuilder()
                .setTitle(`✥ الـفـائـز ${author.displayName}!`)
                .setDescription(`✶ نجح في تخمين الرقم الصحيح **${targetNumber}**!\n\nربـح **${finalWinnings.toLocaleString()}** ${EMOJI_MORA}!${buffString}${taxText}`)
                .setColor("Green")
                .setImage('https://i.postimg.cc/NfMfDwp4/download-2.gif')
                .setThumbnail(author.user.displayAvatarURL());

            channel.send({ embeds: [winEmbed] });
            collector.stop('win');

        } else if (attemptsLeft > 0) {
            currentWinnings -= penaltyPerGuess;
            if (currentWinnings < 0) currentWinnings = 0;

            const hint = guess > targetNumber ? 'أصغر 🔽' : 'أكبر 🔼';
            const hintEmbed = new EmbedBuilder()
                .setTitle(`محاولة خاطئة...`)
                .setDescription(`الـرقـم  **${hint}** من ${guess}.\nالجائزة المتبقية: **${currentWinnings}** ${EMOJI_MORA}`)
                .setColor("Orange")
                .setFooter({ text: `المحاولات المتبقية: ${attemptsLeft}` });
            channel.send({ embeds: [hintEmbed] });
        } else {
            collector.stop('lose');
        }
    });

    collector.on('end', (collected, reason) => {
        client.activeGames.delete(channelId);
        client.activePlayers.delete(author.id);

        if (!hasWon && (reason === 'limit' || reason === 'lose' || reason === 'time')) {
            const loseEmbed = new EmbedBuilder()
                .setTitle(reason === 'time' ? '⏰ انتهى الوقت! لقد خسرت...' : '💔 لقد خسرت...')
                .setDescription(`انتهت المحاولات أو الوقت.\nكـان الـرقـم **${targetNumber}**.\nخسرت **${bet}** ${EMOJI_MORA} 💸.`) 
                .setColor("Red")
                .setImage('https://i.postimg.cc/SNsNdpgq/download.jpg');
            channel.send({ embeds: [loseEmbed] });
        }
    });
}

async function playChallenge(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client) {
    const channelId = channel.id;
    const requiredOpponentsIDs = opponents.map(o => o.id);

    for (const opponent of opponents.values()) {
        if (opponent.id === author.id) {
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: "تتـحـدى نفـسـك؟ متوحـد انـت؟؟  <a:MugiStronk:1438795606872166462>", ephemeral: true });
        }
        if (client.activePlayers.has(opponent.id)) {
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: `اللاعب ${opponent.displayName} مشغول في لعبة أخرى!`, ephemeral: true });
        }
        if (opponent.user.bot) {
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: "لا يمكنك تحدي البوت في اللعب الجماعي!", ephemeral: true });
        }

        let opponentData = getScore.get(opponent.id, channel.guild.id);
        if (!opponentData || opponentData.mora < bet) {
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            return replyFunction({ content: `اللاعب ${opponent.displayName} لا يملك مورا كافية لهذا الرهان!`, ephemeral: true });
        }
    }

    opponents.forEach(o => client.activePlayers.add(o.id));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guess_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('guess_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
    );

    const totalPot = bet * (opponents.size + 1);

    const description = [
        `✥ قـام ${author}`,
        `✶ بدعـوتـك ${opponents.map(o => o.toString()).join(', ')}`,
        `على سـباق تخـمين الأرقـام!`,
        `مـبـلغ الـرهـان ${bet} ${EMOJI_MORA} (لكل شخص)`,
        `الجائـزة الكـبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}`
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🏁 تـحـدي تـخمـين الأرقـام!`)
        .setDescription(description)
        .setColor("Orange")
        .setImage('https://i.postimg.cc/Vs9bp19q/download-3.gif');

    let challengeMsg;
    try {
        challengeMsg = await replyFunction({ 
            content: opponents.map(o => o.toString()).join(' '), 
            embeds: [embed], 
            components: [row], 
            fetchReply: true 
        });
    } catch (e) {
        client.activeGames.delete(channelId);
        client.activePlayers.delete(author.id);
        opponents.forEach(o => client.activePlayers.delete(o.id));
        return;
    }

    const acceptedOpponentsIDs = new Set(); 
    const challengeCollector = challengeMsg.createMessageComponentCollector({ time: 60000 });

    const startGame = async () => {
        challengeCollector.stop('started');
        
        try {
            const finalPlayers = [author];
            opponents.forEach(o => finalPlayers.push(o));
            const finalPlayerIDs = finalPlayers.map(p => p.id);

            const playerAttempts = new Map();
            const maxAttemptsMap = new Map();

            for (const player of finalPlayers) {
                let data = getScore.get(player.id, channel.guild.id);
                if (!data) data = { ...channel.client.defaultData, user: player.id, guild: channel.guild.id };
                
                data.mora -= bet;
                if (player.id !== OWNER_ID && player.id !== author.id) data.lastGuess = Date.now();
                setScore.run(data);
                
                playerAttempts.set(player.id, 0); 
                maxAttemptsMap.set(player.id, getMaxAttempts(data.level));
            }
            
            if (author.id !== OWNER_ID) {
                authorData.lastGuess = Date.now();
                setScore.run(authorData);
            }

            const targetNumber = Math.floor(Math.random() * 100) + 1;

            const gameEmbed = new EmbedBuilder()
                .setTitle('🏁 بدأ السباق!')
                .setDescription(`✶ قبل الجميع التـحدي! ابـدأوا التـخمـين!\n\nالرقم السري بين 1 و 100. أول من يخمنه يربح **${totalPot.toLocaleString()}** ${EMOJI_MORA}!\n(عدد المحاولات يعتمد على مستواك 🔒)`)
                .setColor("Blue")
                .setImage('https://i.postimg.cc/Vs9bp19q/download-3.gif');

            await challengeMsg.edit({ content: finalPlayers.map(p => p.toString()).join(' '), embeds: [gameEmbed], components: [] });

            const filter = (m) => finalPlayerIDs.includes(m.author.id) && !isNaN(parseInt(m.content));
            const gameCollector = channel.createMessageCollector({ filter, time: 60000 });

            gameCollector.on('collect', (msg) => {
                const guess = parseInt(msg.content);
                if (isNaN(guess)) return;

                const currentAttempts = playerAttempts.get(msg.author.id) || 0;
                const maxForThisPlayer = maxAttemptsMap.get(msg.author.id);

                if (currentAttempts >= maxForThisPlayer) {
                    return msg.reply({ content: `🚫 لقد استهلكت جميع محاولاتك (${maxForThisPlayer})!`, ephemeral: true });
                }
                playerAttempts.set(msg.author.id, currentAttempts + 1);

                if (guess === targetNumber) {
                    let winnerData = getScore.get(msg.author.id, channel.guild.id);
                    let finalWinnings = totalPot;

                    let taxText = "";

                    winnerData.mora += finalWinnings;
                    setScore.run(winnerData);

                    if (updateGuildStat) {
                        updateGuildStat(client, channel.guild.id, msg.author.id, 'casino_profit', finalWinnings - bet);
                    }

                    const winEmbed = new EmbedBuilder()
                        .setTitle(`✥ الـفـائـز ${msg.member.displayName}!`)
                        .setDescription(`✶ نجح ${msg.member} في تخمين الرقم الصحيح **${targetNumber}**!\n\nربـح الجائـزة الكـبرى **${finalWinnings.toLocaleString()}** ${EMOJI_MORA}!${taxText}`)
                        .setColor("Green")
                        .setImage('https://i.postimg.cc/NfMfDwp4/download-2.gif')
                        .setThumbnail(msg.author.displayAvatarURL());

                    channel.send({ embeds: [winEmbed] });
                    gameCollector.stop('win');

                } else if (guess > targetNumber) {
                    channel.send(`**${msg.member.displayName}**: أصغر 🔽! (${maxForThisPlayer - (currentAttempts + 1)} محاولات باقية)`);
                } else if (guess < targetNumber) {
                    channel.send(`**${msg.member.displayName}**: أكبر 🔼! (${maxForThisPlayer - (currentAttempts + 1)} محاولات باقية)`);
                }
            });

            gameCollector.on('end', (collected, reason) => {
                client.activeGames.delete(channelId);
                client.activePlayers.delete(author.id);
                finalPlayers.forEach(p => client.activePlayers.delete(p.id));

                if (reason !== 'win') {
                    const loseEmbed = new EmbedBuilder()
                        .setTitle('✥ انتهى الوقت!')
                        .setDescription(`لـم يتمكن أحـد من تخمين الرقم الصحيح (**${targetNumber}**).\n\nللأسف، خسر الجميع رهاناتهم **${bet}** ${EMOJI_MORA} 💸.`) 
                        .setColor("Red")
                        .setImage('https://i.postimg.cc/SNsNdpgq/download.jpg');

                    channel.send({ embeds: [loseEmbed] });
                }
            });
        } catch (error) {
            console.error("Critical Error inside Challenge Game:", error);
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            opponents.forEach(o => client.activePlayers.delete(o.id));
        }
    };

    challengeCollector.on('collect', async i => {
        if (!requiredOpponentsIDs.includes(i.user.id)) {
            return i.reply({ content: `التحدي ليس مرسلاً لك!`, ephemeral: true });
        }

        if (i.customId === 'guess_pvp_decline') {
            challengeCollector.stop('decline');
            return i.update({
                content: `✬ رفـض ${i.member.displayName} التـحدي. تم الإلغاء.`,
                embeds: [],
                components: []
            });
        }

        if (i.customId === 'guess_pvp_accept') {
            if (!acceptedOpponentsIDs.has(i.user.id)) {
                acceptedOpponentsIDs.add(i.user.id);
                await i.reply({ content: `✦ تـم قبول التحدي!`, ephemeral: true });
                
                if (acceptedOpponentsIDs.size === requiredOpponentsIDs.length) {
                    await startGame();
                }
            } else {
                 await i.reply({ content: `أنت قبلت بالفعل!`, ephemeral: true });
            }
        }
    });

    challengeCollector.on('end', async (collected, reason) => {
        if (reason === 'decline' || reason !== 'started') {
            client.activeGames.delete(channelId);
            client.activePlayers.delete(author.id);
            opponents.forEach(o => client.activePlayers.delete(o.id));
        }
        if (reason !== 'started' && reason !== 'decline') {
            return challengeMsg.edit({ content: `✶ انتـهـى الـوقـت لـم يقـبل الجـميع التحـدي!`, embeds: [], components: [] });
        }
    });
}
