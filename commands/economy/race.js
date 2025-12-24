const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // ساعة واحدة
const MAX_LOAN_BET = 500; 
const OWNER_ID = "1145327691772481577"; // استثناء لك أنت
const RACE_ICONS = ['🐎', '🦄', '🦓', '🐪', '🐂', '🐆', '🐢', '🐉', '🦖', '🐇'];
const TRACK_LENGTH = 20;

// 😂 قائمة التعليقات المضحكة (تمت زيادتها)
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
    "🧼 الأرضية زلقة.. انتبهوا من الزحلقة!",
    "🚑 الإسعاف وصل.. خيلك دايخ!",
    "💃 الخيل قام يرقص بنص الحلبة!",
    "📱 فارس مشغول يصور سناب!",
    "🛑 إشارة حمراء بنص الحلبة.. الكل وقف!",
    "🦟 ذبانة دخلت في عين المتصدر!",
    "🐸 ضفدع عملاق يعترض الطريق!",
    "🍌 قشرة موز.. وزززحححلقة!",
    "👻 يقولون في جنّي يدف الحصان الأخير!",
    "🛒 أحد الخيول راح البقالة ورجع!",
    "🚜 الحصان قلب تراكتر وبدأ يحرث الأرض!",
    "📡 انقطع الاتصال مع الفارس!",
    "🔋 بطارية الحصان خلصت.. اشحنوه!",
    "🥤 استراحة مياه.. الجو حار!",
    "🎮 المتسابق يفكر إنه يلعب فيفا!",
    "🚽 أحد الخيول طلب إذن يروح الحمام!",
    "🔭 الحكم يحتاج نظارة مو شايف شي!",
    "🎈 بالونة خوفت الخيول ورجعتهم ورا!",
    "🚧 تحويلة مرورية في المسار رقم 3!"
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

// دالة تنظيف آمنة
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

// دالة مساعدة لخلط المصفوفة
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
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

            // ضمان وجود الجداول
            try { if (sql.open) sql.prepare("ALTER TABLE levels ADD COLUMN lastRace INTEGER DEFAULT 0").run(); } catch (e) { }

            if (!client.activeGames) client.activeGames = new Set();
            if (!client.activePlayers) client.activePlayers = new Set();

            if (client.activePlayers.has(author.id)) {
                return reply({ content: "🚫 **لديك لعبة نشطة بالفعل!** أكملها أولاً.", ephemeral: true });
            }

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
            if (author) safeCleanup(client, `${channel?.id}-${author.id}`, author.id);
            const msg = "حدث خطأ غير متوقع.";
            if (interaction && isSlash) interaction.editReply({ content: msg, ephemeral: true }).catch(() => {});
            else if (message) message.reply(msg).catch(() => {});
        }
    }
};

async function startRaceGame(channel, author, opponents, bet, client, guild, sql, replyError, replyFunction) {
    const gameKey = `${channel.id}-${author.id}`; 

    if (client.activeGames.has(gameKey)) client.activeGames.delete(gameKey);

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
            
            // اختيار الحصان قبل البدء
            await playSoloRaceSelection(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);

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
            opponents.forEach(o => client.activePlayers.add(o.id));

            await playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);
        }
    } catch (err) {
        console.error("[Start Race Game Error]", err);
        safeCleanup(client, gameKey, [author.id, ...opponents.map(o => o.id)]);
        replyError("حدث خطأ أثناء بدء اللعبة.");
    }
}

// 🟢 دالة اختيار الحصان للسباق الفردي 🟢
async function playSoloRaceSelection(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    try {
        // اختيار 4 حيوانات عشوائية للمشاركة
        const shuffledIcons = shuffleArray([...RACE_ICONS]);
        const raceOptions = shuffledIcons.slice(0, 4); // نأخذ أول 4

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_horse')
            .setPlaceholder('اختر الحصان الذي تراهن عليه...')
            .addOptions(
                raceOptions.map((icon, index) => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`المتسابق رقم ${index + 1}`)
                        .setDescription(`راهن على ${icon}`)
                        .setValue(index.toString())
                        .setEmoji(icon)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🐎 اختر متسابقك!')
            .setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\n\nاختر الحصان الذي تتوقع فوزه من القائمة بالأسفل!`)
            .setColor("Blue");

        const msg = await replyFunction({ embeds: [embed], components: [row], fetchReply: true });

        const filter = i => i.user.id === author.id && i.customId === 'select_horse';
        
        try {
            const selection = await msg.awaitMessageComponent({ filter, time: 30000 });
            await selection.deferUpdate();
            
            const selectedIndex = parseInt(selection.values[0]);
            const selectedIcon = raceOptions[selectedIndex];

            // تحديث الكولداون (فقط بعد الاختيار وبدء السباق الفعلي)
            if (author.id !== OWNER_ID) {
                 try {
                     sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), author.id, channel.guild.id);
                     authorData.lastRace = Date.now();
                 } catch (e) {}
            }

            await msg.delete().catch(()=>{});
            
            // بدء السباق الفعلي
            await playSoloRace(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey, raceOptions, selectedIndex);

        } catch (e) {
            safeCleanup(client, gameKey, author.id);
            await msg.edit({ content: '⏰ انتهى وقت الاختيار.', components: [] }).catch(()=>{});
        }

    } catch (err) {
        console.error("[Race Selection Error]", err);
        safeCleanup(client, gameKey, author.id);
    }
}

async function playSoloRace(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey, raceOptions, selectedIndex) {
    try {
        // 🔥 خصم الرهان في البداية
        authorData.mora -= bet;
        setScore.run(authorData);

        // تجهيز المتسابقين
        const participants = raceOptions.map((icon, index) => ({
            id: index === selectedIndex ? author.id : `bot_${index}`,
            name: index === selectedIndex ? author.displayName : `المنافس ${index + 1}`,
            icon: icon,
            progress: 0,
            isPlayer: index === selectedIndex,
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

        const embed = new EmbedBuilder()
            .setTitle('🐎 السباق الكبير!')
            .setDescription(`لقد راهنت على: ${participants.find(p=>p.isPlayer).icon}\nالرهان: **${bet}** ${EMOJI_MORA}\n\n${renderTrack()}`)
            .setColor("Orange")
            .setFooter({ text: "السباق جارٍ..." });

        const raceMsg = await channel.send({ embeds: [embed] });

        const raceInterval = setInterval(async () => {
            try {
                let winner = null;
                const randomComment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];

                participants.forEach(p => {
                    const chance = Math.random();
                    let move = 0;
                    p.status = ""; 

                    if (chance < 0.05) { move = 0; p.status = "💤"; }
                    else if (chance < 0.15) { move = 0.3; p.status = "🥕"; }
                    else if (chance > 0.90) { move = 4; p.status = "🚀"; }
                    else if (chance > 0.80) { move = 2.5; p.status = "🌪️"; }
                    else { move = Math.random() * 3 + 0.5; }

                    p.progress += move;
                    if (p.progress >= TRACK_LENGTH && !winner) winner = p;
                });

                embed.setDescription(`لقد راهنت على: ${participants.find(p=>p.isPlayer).icon}\nالرهان: **${bet}** ${EMOJI_MORA}\n\n${renderTrack()}\n\n🎙️ **${randomComment}**`);
                await raceMsg.edit({ embeds: [embed] }).catch(() => clearInterval(raceInterval));

                if (winner) {
                    clearInterval(raceInterval);
                    safeCleanup(client, gameKey, author.id);

                    if (winner.isPlayer) {
                        // 🔥 حساب البوف والمبلغ النهائي (التعديل المطلوب)
                        const moraMultiplier = calculateMoraBuff(author, sql); // مثال: 1.45 للبوف 45%
                        const totalWin = Math.floor(bet * moraMultiplier); // 100 * 1.45 = 145
                        
                        // تحديث الداتابيس
                        let currentData = getScore.get(author.id, channel.guild.id);
                        if (currentData) {
                            currentData.mora += totalWin;
                            setScore.run(currentData);
                        }

                        // حساب نسبة البوف للعرض
                        const buffPercent = Math.floor((moraMultiplier - 1) * 100);
                        const buffText = buffPercent > 0 ? ` (+%${buffPercent})` : '';

                        const winEmbed = new EmbedBuilder()
                            .setTitle(`🏆 فـاز خيلك بالمركز الأول!`)
                            .setDescription(`🎉 مبروك! توقعك كان في محله!\n\n✶ ربحـت: ${totalWin.toLocaleString()} ${EMOJI_MORA}${buffText}`)
                            .setColor("Green")
                            .setThumbnail(author.user.displayAvatarURL());
                        
                        channel.send({ embeds: [winEmbed] });
                    } else {
                        const loseEmbed = new EmbedBuilder()
                            .setTitle('💔 خسر خيلك...')
                            .setDescription(`الفائز كان: **${winner.name}** ${winner.icon}\nخسرت الرهان **${bet}** ${EMOJI_MORA}.`)
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

        // فحوصات سريعة قبل إرسال الرسالة
        for (const opponent of opponents.values()) {
            if (client.activePlayers.has(opponent.id)) {
                safeCleanup(client, gameKey, author.id); 
                return replyFunction({ content: `اللاعب ${opponent.displayName} مشغول في لعبة أخرى!`, ephemeral: true });
            }
            if (opponent.user.bot) return replyFunction({ content: "لا يمكنك تحدي البوت!", ephemeral: true });
            let opponentData = getScore.get(opponent.id, channel.guild.id);
            if (!opponentData || opponentData.mora < bet) return replyFunction({ content: `اللاعب ${opponent.displayName} مفلس!`, ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('race_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('race_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );

        const totalPot = bet * (opponents.size + 1);
        const embed = new EmbedBuilder()
            .setTitle(`🏁 تـحـدي سباق الخيول!`)
            .setDescription(`✥ قـام ${author}\n✶ بدعـوتـك ${opponents.map(o => o.toString()).join(', ')}\nعلى سـباق خيول جماعي! 🐎\nمـبـلغ الـرهـان ${bet} ${EMOJI_MORA} (لكل شخص)\nالجائـزة الكـبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}`)
            .setColor("Orange");

        const challengeMsg = await replyFunction({ content: opponents.map(o => o.toString()).join(' '), embeds: [embed], components: [row], fetchReply: true });
        const acceptedOpponentsIDs = new Set(); 
        const challengeCollector = challengeMsg.createMessageComponentCollector({ time: 60000 });

        // بدء السباق
        const startRace = async () => {
            challengeCollector.stop('started');
            const finalPlayers = [author];
            opponents.forEach(o => finalPlayers.push(o));

            // خصم المبالغ وتفعيل الكولداون فقط عند البدء الفعلي
            for (const player of finalPlayers) {
                let data = getScore.get(player.id, channel.guild.id);
                if (!data) data = { ...channel.client.defaultData, user: player.id, guild: channel.guild.id };
                data.mora -= bet;
                if (player.id !== OWNER_ID) {
                     try { sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), player.id, guild.id); } catch(e){}
                }
                setScore.run(data);
            }
            
            const participants = finalPlayers.map((p, index) => ({
                id: p.id, name: p.displayName, avatar: p.user.displayAvatarURL(),
                icon: RACE_ICONS[index % RACE_ICONS.length], progress: 0, status: ""
            }));

            const renderTrack = () => participants.map(p => {
                const spaces = Math.floor(p.progress);
                const remaining = TRACK_LENGTH - spaces;
                return `**${p.name}** ${p.status}\n🏁` + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
            }).join('\n\n');

            const raceEmbed = new EmbedBuilder().setTitle('🐎 السباق بدأ!').setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}`).setColor("Blue");
            await challengeMsg.edit({ content: null, embeds: [raceEmbed], components: [] });

            const raceInterval = setInterval(async () => {
                try {
                    let winner = null;
                    const randomComment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];

                    participants.forEach(p => {
                        const chance = Math.random();
                        let move = 0;
                        p.status = "";
                        if (chance < 0.05) { move = 0; p.status = "💤"; }
                        else if (chance < 0.15) { move = 0.3; p.status = "🥕"; }
                        else if (chance > 0.90) { move = 4; p.status = "🚀"; }
                        else { move = Math.random() * 3 + 0.5; }
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
                        const winEmbed = new EmbedBuilder().setTitle(`🏆 الفائز هو ${winner.name}!`).setDescription(`🎉 **${winner.name}** اكتسح السباق وحصل على **${totalPot.toLocaleString()}** ${EMOJI_MORA}!`).setColor("Gold").setThumbnail(winner.avatar);
                        channel.send({ content: `<@${winner.id}>`, embeds: [winEmbed] });
                    }
                } catch (e) {
                    clearInterval(raceInterval);
                    safeCleanup(client, gameKey, allPlayerIds);
                }
            }, 2500);
        };

        challengeCollector.on('collect', async i => {
            if (!requiredOpponentsIDs.includes(i.user.id)) return i.reply({ content: `التحدي ليس مرسلاً لك!`, ephemeral: true });
            if (i.customId === 'race_pvp_decline') {
                challengeCollector.stop('decline');
                return i.update({ content: `✬ رفـض ${i.member.displayName} التـحدي. تم الإلغاء.`, embeds: [], components: [] });
            }
            if (i.customId === 'race_pvp_accept') {
                if (!acceptedOpponentsIDs.has(i.user.id)) {
                    acceptedOpponentsIDs.add(i.user.id);
                    await i.reply({ content: `✦ تـم قبول التحدي!`, ephemeral: true });
                    if (acceptedOpponentsIDs.size === requiredOpponentsIDs.length) await startRace();
                } else {
                     await i.reply({ content: `أنت قبلت بالفعل!`, ephemeral: true });
                }
            }
        });

        challengeCollector.on('end', async (collected, reason) => {
            if (reason === 'decline' || reason !== 'started') {
                // 🔥 إلغاء اللعبة بالكامل دون تطبيق كولداون لأن السباق لم يبدأ
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
