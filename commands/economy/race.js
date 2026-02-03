const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js'); 

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // ساعة واحدة (لم يتم التغيير)
const MAX_LOAN_BET = 500; 
const OWNER_ID = "1145327691772481577"; 
const RACE_ICONS = ['🐎', '🦄', '🦓', '🐪', '🐂', '🐆', '🐢', '🐉', '🦖', '🐇'];
const TRACK_LENGTH = 20;

// 🔥 تم تقليل مدة فك التعليق التلقائي إلى 2 دقيقة
const STUCK_TIMEOUT = 2 * 60 * 1000; 

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
    "🚧 تحويلة مرورية في المسار رقم 3!",
    "🌮 الحصان اشتم ريحة كبسة وراح يركض لها!",
    "🦎 ضب دخل المضمار والخيول هربت!",
    "💍 حصان وقف يخطب فرس بنص السباق!",
    "🚁 هليكوبتر الشرطة تلاحق المتصدر للسرعة الزائدة!",
    "🤡 مهرج نزل الحلبة وضحك الخيول!",
    "🧊 الأرضية تجمدت! الخيول تتزحلق!",
    "🔥 حماس المعلق خلى الحصان يركض أسرع!",
    "🥊 ملاكمة مفاجئة بين حصانين في الخلف!",
    "🕶️ الحصان لبس نظارة شمسية وشاف نفسه!",
    "🏃‍♂️ متسابق نزل من الحصان وقام يركض بنفسه!",
    "🛑 رادار ساهر صور الحصان رقم 2!",
    "🕊️ حمامة وقفت على راس المتسابق وشتت انتباهه!",
    "🎶 دي جي اشتغل والخيول قامت تهز!",
    "🧹 عامل النظافة يكنس المضمار والسباق شغال!",
    "💰 كيس فلوس طاح والخيول تهاوشت عليه!",
    "🌧️ مطرت فجأة والخيول خايفة تتبلل!",
    "🚗 سيارة دخلت بالغلط تحسبه شارع عام!",
    "🧙‍♂️ ساحر حول الحصان الأول لأرنب!",
    "💤 الجمهور نام من الملل.. اصحوا!",
    "🍔 راعي الحصان يلوح له ببرجر عشان يسرع!",
    "🧘‍♂️ حصان قرر يسوي يوغا بنص الطريق!"
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
                playerIds.forEach(id => {
                    client.activePlayers.delete(`race_${id}`); // ✅ إزالة المفتاح الخاص بالسباق
                    if (client.raceTimestamps) client.raceTimestamps.delete(`race_${id}`);
                });
            } else if (playerIds) {
                client.activePlayers.delete(`race_${playerIds}`); // ✅ إزالة المفتاح الخاص بالسباق
                if (client.raceTimestamps) client.raceTimestamps.delete(`race_${playerIds}`);
            }
        }
    } catch (e) {
        console.error("[Race Cleanup Error]", e);
    }
}

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
        .addUserOption(option => option.setName('الخصم1').setDescription('الخصم الأول').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('الخصم الثاني').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('الخصم الثالث').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('الخصم الرابع').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('الخصم الخامس').setRequired(false)),

    name: 'race',
    aliases: ['سباق', 'سابق', 'سباق_خيول', 'race'],
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

            try { if (sql.open) sql.prepare("ALTER TABLE levels ADD COLUMN lastRace INTEGER DEFAULT 0").run(); } catch (e) { }

            if (!client.activeGames) client.activeGames = new Set();
            if (!client.activePlayers) client.activePlayers = new Set();
            if (!client.raceTimestamps) client.raceTimestamps = new Map(); 

            // 🔥🔥 استخدام مفتاح خاص للسباق للسماح بالألعاب الأخرى 🔥🔥
            const raceKey = `race_${author.id}`;

            if (client.activePlayers.has(raceKey)) {
                const startTime = client.raceTimestamps.get(raceKey) || 0;
                const timeDiff = Date.now() - startTime;

                if (timeDiff > STUCK_TIMEOUT || startTime === 0) {
                    safeCleanup(client, `${channel.id}-${author.id}`, author.id);
                } else {
                    return reply({ content: `🚫 **لديك سباق جارٍ حالياً!**\nإذا كان السباق معلقاً، سيتم فتحه تلقائياً بعد مرور دقيقتين.`, ephemeral: true });
                }
            }

            let row = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(author.id, guild.id);
            if (!row) {
                const defaultD = { ...client.defaultData, user: author.id, guild: guild.id };
                client.setLevel.run(defaultD);
                row = defaultD;
            }

            const now = Date.now();
            
            // فحص الكولداون (بقي كما هو ساعة)
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

                // تسجيل اللاعب ووقت البدء باستخدام المفتاح الخاص
                client.activePlayers.add(raceKey);
                client.raceTimestamps.set(raceKey, Date.now());
                const gameKey = `${channel.id}-${author.id}`; 
                client.activeGames.add(gameKey);

                // بدء اللعبة مباشرة بالرهان المقترح
                return startRaceGame(channel, author, opponents, proposedBet, client, guild, sql, replyError, reply);
            } else {
                client.activePlayers.add(raceKey);
                client.raceTimestamps.set(raceKey, Date.now());
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
            opponents.forEach(o => {
                const opKey = `race_${o.id}`;
                client.activePlayers.add(opKey);
                client.raceTimestamps.set(opKey, Date.now());
            });

            await playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey);
        }
    } catch (err) {
        console.error("[Start Race Game Error]", err);
        safeCleanup(client, gameKey, [author.id, ...opponents.map(o => o.id)]);
        replyError("حدث خطأ أثناء بدء اللعبة.");
    }
}

// 🟢 دالة اختيار الحصان للسباق الفردي (أزرار بدلاً من قائمة) 🟢
async function playSoloRaceSelection(channel, author, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    try {
        const shuffledIcons = shuffleArray([...RACE_ICONS]);
        const raceOptions = shuffledIcons.slice(0, 2); // 🔥 تم التعديل: 2 متسابقين فقط بدلاً من 4
        
        // ألوان مختلفة لكل زر
        const buttonStyles = [ButtonStyle.Primary, ButtonStyle.Danger]; // ألوان للمتسابقين الاثنين

        // 🔥 استبدال القائمة بالأزرار الملونة بدون نص 🔥
        const row = new ActionRowBuilder();
        raceOptions.forEach((icon, index) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`race_pick_${index}`)
                    .setEmoji(icon) // إيموجي فقط
                    .setStyle(buttonStyles[index % buttonStyles.length]) // لون مختلف لكل زر
            );
        });

        const embed = new EmbedBuilder()
            .setTitle('🐎 اختر متسابقك!')
            .setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\n\nاضغط على الزر الخاص بالحصان الذي تراهن عليه!`)
            .setColor("Blue");

        const msg = await replyFunction({ embeds: [embed], components: [row], fetchReply: true });

        const filter = i => i.user.id === author.id && i.customId.startsWith('race_pick_');
        
        try {
            const selection = await msg.awaitMessageComponent({ filter, time: 30000 });
            await selection.deferUpdate();
            
            const selectedIndex = parseInt(selection.customId.split('_')[2]);
            
            // تحديث الكولداون
            if (author.id !== OWNER_ID) {
                 try {
                     sql.prepare("UPDATE levels SET lastRace = ? WHERE user = ? AND guild = ?").run(Date.now(), author.id, channel.guild.id);
                     authorData.lastRace = Date.now();
                 } catch (e) {}
            }

            await msg.delete().catch(()=>{});
            
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
        // خصم الرهان
        authorData.mora -= bet;
        setScore.run(authorData);

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
                        const moraMultiplier = calculateMoraBuff(author, sql); 
                        const totalWin = Math.floor(bet * moraMultiplier); 
                        const finalPayout = bet + totalWin;

                        let currentData = getScore.get(author.id, channel.guild.id);
                        if (currentData) {
                            currentData.mora += finalPayout;
                            setScore.run(currentData);
                        }

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
            }
        }, 2000); // 🔥 تقليل وقت التحديث لجعل السباق أسرع قليلاً
    } catch (err) {
        safeCleanup(client, gameKey, author.id);
    }
}

async function playChallengeRace(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction, client, gameKey) {
    const allPlayerIds = [author.id, ...opponents.map(o => o.id)];

    try {
        const requiredOpponentsIDs = opponents.map(o => o.id);

        for (const opponent of opponents.values()) {
            const opKey = `race_${opponent.id}`;
            if (client.activePlayers.has(opKey)) { // ✅ فحص المفتاح الخاص بالسباق
                // تحقق إذا كان الخصم معلقاً
                const startTime = client.raceTimestamps.get(opKey) || 0;
                if (Date.now() - startTime > STUCK_TIMEOUT) {
                    safeCleanup(client, `${channel.id}-${opponent.id}`, opponent.id);
                } else {
                    safeCleanup(client, gameKey, author.id); 
                    return replyFunction({ content: `اللاعب ${opponent.displayName} مشغول في سباق آخر!`, ephemeral: true });
                }
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

        const startRace = async () => {
            challengeCollector.stop('started');
            const finalPlayers = [author];
            opponents.forEach(o => finalPlayers.push(o));

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
            }, 2000); // 🔥 تقليل وقت التحديث
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
