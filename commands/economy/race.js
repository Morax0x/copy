const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // ساعة واحدة
const MAX_LOAN_BET = 500; 
const OWNER_ID = "1145327691772481577"; // استثناء لك أنت
const RACE_ICONS = ['🐎', '🦄', '🦓', '🐪', '🐂', '🐆', '🐢'];
const TRACK_LENGTH = 20;

// 😂 قائمة التعليقات المضحكة والمتنوعة
const COMMENTS = [
    "🌯 أحد الخيول وقف يطلب شاورما!",
    "☕ الحصان تعب.. يبي له كرك يعدل المزاج!",
    "🚀 يا ساتر! انطلاقة صاروخية لا تصدق!",
    "👀 الحكم يطالع في الجوال والخيول تغش!",
    "🐢 سباق سلاحف ولا خيول هذا؟ تحركوا!",
    "💸 الجمهور يطالب باسترجاع فلوس التذاكر!",
    "⚡ سرعة خيالية! هل مركب تيربو؟",
    "🥕 حصانك شاف جزرة ووقف ياكلها!",
    "🌪️ عاصفة غبارية تقلب الموازين!",
    "🛌 أحد المتسابقين قرر ياخذ قيلولة!",
    "😱 منافسة أشرس من خصم الراتب!",
    "📸 سيلفي مع الجمهور قبل خط النهاية!",
    "🦵 عرقلة واضحة! وين الـ VAR؟",
    "🦁 الأسد يطارد المتصدر.. اهرب!",
    "🧼 الأرضية زلقة.. انتبهوا من الزحلقة!"
];

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// دالة تنظيف آمنة لضمان إزالة اللاعبين من القائمة النشطة
function safeCleanup(client, gameKey, playerIds) {
    try {
        if (client.activeGames) client.activeGames.delete(gameKey);
        if (client.activePlayers) {
            if (Array.isArray(playerIds)) {
                playerIds.forEach(id => client.activePlayers.delete(id));
            } else if (playerIds) {
                client.activePlayers.delete(playerIds);
            }
        }
    } catch (e) {
        console.error("[Race Cleanup Error]", e);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سباق')
        .setDescription('تحدي البوت (فردي) أو أصدقائك (جماعي) في سباق الخيول.')
        .addIntegerOption(option =>
            option.setName('الرهان')
                .setDescription(`المبلغ الذي تريد المراهنة به `)
                .setRequired(false)
                .setMinValue(MIN_BET)
        )
        .addUserOption(option => option.setName('الخصم1').setDescription('الخصم الأول (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('الخصم الثاني (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('الخصم الثالث (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('الخصم الرابع (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('الخصم الخامس (لعبة جماعية)').setRequired(false)),

    name: 'race',
    aliases: ['سباق', 'سابق', 'سباق_خيول', 'r', 'race'],
    category: "Economy",
    description: `تحدي البوت أو تحدي أصدقائك في سباق الخيول.`,

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, author, client, guild, sql, channel;
        let betInput, opponents = new Collection();

        try {
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

            // ضمان وجود الجداول والأعمدة
            try {
                if (sql.open) sql.prepare("ALTER TABLE levels ADD COLUMN lastRace INTEGER DEFAULT 0").run();
            } catch (e) { }

            if (!client.activeGames) client.activeGames = new Set();
            if (!client.activePlayers) client.activePlayers = new Set();

            if (client.activePlayers.has(author.id)) {
                return reply({ content: "🚫 **لديك لعبة نشطة بالفعل!** أكملها أولاً.", ephemeral: true });
            }

            // جلب البيانات مع إنشاء صف جديد إذا لم يوجد
            let row = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(author.id, guild.id);
            if (!row) {
                const defaultD = { ...client.defaultData, user: author.id, guild: guild.id };
                client.setLevel.run(defaultD);
                row = defaultD;
            }

            const now = Date.now();
            
            // فحص الكولداون
            if (author.id !== OWNER_ID) {
                const lastRaceTime = row.lastRace || 0; 
                const timeLeft = lastRaceTime + COOLDOWN_MS - now;
                if (timeLeft > 0) {
                    return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل التسابق مرة أخرى.` });
                }
            }

            // --- المراهنة التلقائية ---
            if (!betInput) {
                let proposedBet = 100;
                const userBalance = row.mora || 0;

                if (userBalance < MIN_BET) return replyError(`❌ لا تملك مورا كافية للعب (الحد الأدنى ${MIN_BET})!`);
                if (userBalance < 100) proposedBet = userBalance;

                // إضافة اللاعب للقائمة مؤقتًا
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

                const rowBtns = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('race_auto_confirm').setLabel('مـراهـنـة').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('race_auto_cancel').setLabel('رفـض').setStyle(ButtonStyle.Danger)
                );

                const confirmMsg = await reply({ embeds: [autoBetEmbed], components: [rowBtns], fetchReply: true });
                
                const filter = i => i.user.id === author.id && (i.customId === 'race_auto_confirm' || i.customId === 'race_auto_cancel');
                
                try {
                    const confirmation = await confirmMsg.awaitMessageComponent({ filter, time: 15000 });
                    
                    if (confirmation.customId === 'race_auto_cancel') {
                        await confirmation.update({ content: '❌ تم الإلغاء.', embeds: [], components: [] });
                        safeCleanup(client, gameKey, author.id);
                        return;
                    }

                    if (confirmation.customId === 'race_auto_confirm') {
                        await confirmation.deferUpdate();
                        if (!isSlash) await confirmMsg.delete().catch(() => {});
                        else await confirmation.editReply({ content: '✅', embeds: [], components: [] });

                        // إزالة اللعبة من القائمة النشطة لبدء اللعبة الفعلية
                        client.activeGames.delete(gameKey); 
                        
                        return startRaceGame(channel, author, opponents, proposedBet, client, guild, sql, replyError, reply);
                    }
                } catch (e) {
                    safeCleanup(client, gameKey, author.id);
                    if (!isSlash) await confirmMsg.delete().catch(() => {});
                    else await interaction.editReply({ content: '⏰ انتهى الوقت.', embeds: [], components: [] });
                    return;
                }
            } else {
                client.activePlayers.add(author.id);
                return startRaceGame(channel, author, opponents, betInput, client, guild, sql, replyError, reply);
            }
        } catch (err) {
            console.error("[Race Command Error]", err);
            // تنظيف في حالة حدوث خطأ غير متوقع في البداية
            if (author) safeCleanup(client, `${channel?.id}-${author.id}`, author.id);
            const msg = "حدث خطأ غير متوقع.";
            if (interaction && isSlash) interaction.editReply({ content: msg, ephemeral: true }).catch(() => {});
            else if (message) message.reply(msg).catch(() => {});
        }
    }
};

async function startRaceGame(channel, author, opponents, bet, client, guild, sql, replyError, replyFunction) {
    const gameKey = `${channel.id}-${author.id}`; 

    // تنظيف أي لعبة سابقة عالقة لنفس المفتاح (احتياط)
    if (client.activeGames.has(gameKey)) {
        client.activeGames.delete(gameKey);
    }

    try {
        if (bet < MIN_BET) {
            safeCleanup(client, gameKey, author.id);
            return replyError(`الحد الأدنى للرهان هو **${MIN_BET}** ${EMOJI_MORA} !`);
        }

        const getScore = client.getLevel;
        const setScore = client.setLevel;
        
        let authorData = getScore.get(author.id, guild.id);
        if (!authorData) {
            authorData = { ...client.defaultData, user: author.id, guild: guild.id };
            setScore.run(authorData);
        }

        if (authorData.mora < bet) {
            safeCleanup(client, gameKey, author.id);
            return replyError(`ليس لديك مورا كافية لهذا الرهان! (رصيدك: ${authorData.mora})`);
        }

        // --- الفرز بين الفردي والجماعي ---
        if (opponents.size === 0) {
            // --- فردي ---
            if (bet > MAX_BET_SOLO) {
                safeCleanup(client, gameKey, author.id);
                return replyError(`🚫 **تنبيه:** الحد الأقصى للرهان في السباق الفردي (ضد البوت) هو **${MAX_BET_SOLO}** ${EMOJI_MORA}!\n(للعب بمبالغ أكبر، تحدى لاعبين آخرين).`);
            }
            client.activeGames.add(gameKey);
            
            // تحديث الكولداون
            if (author.id !== OWNER_ID) {
                 try {
                     sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), author.id, guild.id);
                     authorData.lastRace = Date.now();
                 } catch (e) { console.error("[Race Cooldown Update Error]", e); }
            }
            
            await playSoloRace(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);

        } else {
            // --- جماعي ---
            if (bet > MAX_LOAN_BET) {
                const authorLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(author.id, guild.id);
                if (authorLoan && authorLoan.remainingAmount > 0) {
                    safeCleanup(client, gameKey, author.id);
                    return replyError(`❌ **عذراً!** عليك قرض. حدك الأقصى للرهان الجماعي هو **${MAX_LOAN_BET}** ${EMOJI_MORA} حتى تسدد قرضك.`);
                }
            }

            if (bet > MAX_LOAN_BET) {
                for (const opponent of opponents.values()) {
                    const opponentLoan = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(opponent.id, guild.id);
                    if (opponentLoan && opponentLoan.remainingAmount > 0) {
                        safeCleanup(client, gameKey, author.id);
                        return replyError(`❌ اللاعب ${opponent.displayName} عليه قرض ولا يمكنه المشاركة برهان أعلى من **${MAX_LOAN_BET}**.`);
                    }
                }
            }

            client.activeGames.add(gameKey);
            
            // تحديث الكولداون للمضيف
            if (author.id !== OWNER_ID) {
                 try {
                     sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), author.id, guild.id);
                     authorData.lastRace = Date.now();
                 } catch (e) { console.error("[Race Cooldown Update Error]", e); }
            }

            // إضافة الخصوم للقائمة النشطة
            opponents.forEach(o => client.activePlayers.add(o.id));

            await playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);
        }
    } catch (err) {
        console.error("[Start Race Game Error]", err);
        safeCleanup(client, gameKey, [author.id, ...opponents.map(o => o.id)]);
        replyError("حدث خطأ أثناء بدء اللعبة.");
    }
}

async function playSoloRace(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    try {
        // خصم المبلغ
        authorData.mora -= bet;
        setScore.run(authorData);

        const prize = bet * 2; 
        
        const playerIcon = RACE_ICONS[Math.floor(Math.random() * RACE_ICONS.length)];
        const availableBotIcons = RACE_ICONS.filter(i => i !== playerIcon);
        const botIcon = availableBotIcons[Math.floor(Math.random() * availableBotIcons.length)];

        const participants = [
            { id: author.id, name: author.displayName, icon: playerIcon, progress: 0, isPlayer: true, status: "" },
            { id: 'bot', name: 'الخصم', icon: botIcon, progress: 0, isPlayer: false, status: "" }
        ];

        const renderTrack = () => {
            return participants.map(p => {
                const spaces = Math.floor(p.progress);
                const remaining = TRACK_LENGTH - spaces;
                const trackLine = '🏁' + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
                return `**${p.name}** ${p.status}\n${trackLine}`;
            }).join('\n\n');
        };

        const embed = new EmbedBuilder()
            .setTitle('🐎 سباق الخيول')
            .setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة: **${prize}** ${EMOJI_MORA}\n\n${renderTrack()}`)
            .setColor("Orange")
            .setFooter({ text: "السباق جارٍ..." });

        const raceMsg = await replyFunction({ embeds: [embed] });

        const raceInterval = setInterval(async () => {
            try {
                let winner = null;
                const randomComment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];

                participants.forEach(p => {
                    // أحداث عشوائية
                    const chance = Math.random();
                    let move = 0;
                    p.status = ""; 

                    if (chance < 0.05) { // 5% نوم
                        move = 0;
                        p.status = "💤";
                    } else if (chance < 0.15) { // 10% أكل جزرة (بطء)
                        move = 0.3;
                        p.status = "🥕";
                    } else if (chance > 0.90) { // 10% تيربو
                        move = 4;
                        p.status = "🚀";
                    } else if (chance > 0.80) { // 10% عاصفة
                        move = 2.5;
                        p.status = "🌪️";
                    } else {
                        move = Math.random() * 3 + 0.5;
                    }

                    p.progress += move;
                    if (p.progress >= TRACK_LENGTH && !winner) winner = p;
                });

                embed.setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة: **${prize}** ${EMOJI_MORA}\n\n${renderTrack()}\n\n🎙️ **${randomComment}**`);
                await raceMsg.edit({ embeds: [embed] }).catch(() => clearInterval(raceInterval));

                if (winner) {
                    clearInterval(raceInterval);
                    safeCleanup(client, gameKey, author.id); // تنظيف فوري

                    if (winner.isPlayer) {
                        const moraMultiplier = calculateMoraBuff(author, sql);
                        const profit = bet;
                        const buffedProfit = Math.floor(profit * moraMultiplier);
                        const finalWinnings = bet + buffedProfit;
                        const buffPercent = Math.round((moraMultiplier - 1) * 100);
                        const buffText = buffPercent > 0 ? ` (+${buffPercent}%)` : "";

                        // إعادة جلب البيانات لضمان التحديث الصحيح
                        let currentData = getScore.get(author.id, channel.guild.id);
                        if (currentData) {
                            currentData.mora += finalWinnings;
                            setScore.run(currentData);
                        }

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
            } catch (err) {
                clearInterval(raceInterval);
                safeCleanup(client, gameKey, author.id);
                console.error("[Solo Race Interval Error]", err);
            }
        }, 2500);
    } catch (err) {
        console.error("[Play Solo Race Error]", err);
        safeCleanup(client, gameKey, author.id);
    }
}

async function playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    const allPlayerIds = [author.id, ...opponents.map(o => o.id)];

    try {
        const requiredOpponentsIDs = opponents.map(o => o.id);

        for (const opponent of opponents.values()) {
            if (opponent.id === author.id) {
                safeCleanup(client, gameKey, allPlayerIds);
                return replyFunction({ content: "لا يمكنك تحدي نفسك!", ephemeral: true });
            }
            if (client.activePlayers.has(opponent.id)) {
                safeCleanup(client, gameKey, author.id); 
                safeCleanup(client, gameKey, allPlayerIds);
                return replyFunction({ content: `اللاعب ${opponent.displayName} مشغول في لعبة أخرى!`, ephemeral: true });
            }
            if (opponent.user.bot) {
                safeCleanup(client, gameKey, allPlayerIds);
                return replyFunction({ content: "لا يمكنك تحدي البوت في اللعب الجماعي!", ephemeral: true });
            }

            let opponentData = getScore.get(opponent.id, channel.guild.id);
            if (!opponentData || opponentData.mora < bet) {
                safeCleanup(client, gameKey, allPlayerIds);
                return replyFunction({ content: `اللاعب ${opponent.displayName} لا يملك مورا كافية لهذا الرهان!`, ephemeral: true });
            }
        }

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
                     try { sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), player.id, guild.id); } catch(e){}
                }
                setScore.run(data);
            }
            
            const participants = finalPlayers.map((p, index) => ({
                id: p.id,
                name: p.displayName,
                avatar: p.user.displayAvatarURL(),
                icon: RACE_ICONS[index % RACE_ICONS.length],
                progress: 0,
                status: ""
            }));

            const renderTrack = () => {
                return participants.map(p => {
                    const spaces = Math.floor(p.progress);
                    const remaining = TRACK_LENGTH - spaces;
                    const trackLine = '🏁' + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
                    return `**${p.name}** ${p.status}\n${trackLine}`;
                }).join('\n\n');
            };

            const raceEmbed = new EmbedBuilder()
                .setTitle('🐎 السباق بدأ!')
                .setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}`)
                .setColor("Blue");

            await challengeMsg.edit({ content: null, embeds: [raceEmbed], components: [] });

            const raceInterval = setInterval(async () => {
                try {
                    let winner = null;
                    const randomComment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];

                    participants.forEach(p => {
                        // أحداث عشوائية للسباق الجماعي
                        const chance = Math.random();
                        let move = 0;
                        p.status = "";

                        if (chance < 0.1) {
                            move = 0.2;
                            p.status = "💤";
                        } else if (chance > 0.85) {
                            move = Math.random() * 4 + 2; 
                            p.status = "💨";
                        } else {
                            move = Math.random() * 3 + 0.5;
                        }

                        p.progress += move;
                        if (p.progress >= TRACK_LENGTH && !winner) winner = p;
                    });

                    raceEmbed.setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}\n\n🎙️ **${randomComment}**`);
                    await challengeMsg.edit({ embeds: [raceEmbed] }).catch(() => clearInterval(raceInterval));

                    if (winner) {
                        clearInterval(raceInterval);
                        safeCleanup(client, gameKey, allPlayerIds);

                        let winnerData = getScore.get(winner.id, channel.guild.id);
                        if (winnerData) {
                            winnerData.mora += totalPot;
                            setScore.run(winnerData);
                        }

                        const winEmbed = new EmbedBuilder()
                            .setTitle(`🏆 الفائز هو ${winner.name}!`)
                            .setDescription(`🎉 **${winner.name}** اكتسح السباق وحصل على **${totalPot.toLocaleString()}** ${EMOJI_MORA}!`)
                            .setColor("Gold")
                            .setThumbnail(winner.avatar);

                        channel.send({ content: `<@${winner.id}>`, embeds: [winEmbed] });
                    }
                } catch (e) {
                    clearInterval(raceInterval);
                    safeCleanup(client, gameKey, allPlayerIds);
                    console.error("[Race Loop Error]", e);
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
                safeCleanup(client, gameKey, allPlayerIds);
            }
            if (reason !== 'started' && reason !== 'decline') {
                return challengeMsg.edit({ content: `✶ انتـهـى الـوقـت لـم يقـبل الجـميع التحـدي!`, embeds: [], components: [] });
            }
        });
    } catch (err) {
        console.error("[Play Challenge Race Error]", err);
        safeCleanup(client, gameKey, allPlayerIds);
    }
}
