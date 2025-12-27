const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { calculateMoraBuff } = require('../../streak-handler.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 50;
const MAX_BET_SOLO = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 
const MEMORY_TIME = 3000; 

const EMOJI_POOL = [
    '🍎', '🍌', '🍇', '🍉', '🍒', '🍓', '🍍', '🥝', '🥥', '🥑', 
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🥊', '🥋',
    '🚗', '🚕', '🚙', '🚌', '🚒', '✈️', '🚀', '🛸', '🛶', '🚤',
    '😀', '😎', '🥳', '😡', '🥶', '🤡', '👽', '🤖', '👻', '💀',
    '⌚', '📱', '💻', '📷', '📺', '💡', '🔦', '💎', '💍', '👑'
];

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor(((ms % 360000) % 60000) / 1000);
    return `${minutes} دقيقة و ${seconds} ثانية`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ايموجي')
        .setDescription('لعبة الذاكرة: احفظ أماكن الإيموجيات واربح!')
        .addIntegerOption(option => 
            option.setName('الرهان')
                .setDescription('مبلغ الرهان (اختياري)')
                .setRequired(false)
                .setMinValue(MIN_BET)
        ),

    name: 'emoji',
    aliases: ['ايموجي', 'ذاكرة', 'mem', 'e'],
    category: "Economy",
    description: "لعبة تحدي الذاكرة (3x3).",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, member, guild, client, channel;
        let betInput;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            channel = interaction.channel;
            betInput = interaction.options.getInteger('الرهان');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            member = message.member;
            guild = message.guild;
            client = message.client;
            channel = message.channel;
            if (args[0] && !isNaN(parseInt(args[0]))) betInput = parseInt(args[0]);
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

        if (!client.activePlayers) client.activePlayers = new Set();
        
        // التحقق من اللاعب فقط (هل هو يلعب حالياً؟)
        // تم إزالة التحقق من القناة للسماح بتعدد الألعاب
        if (client.activePlayers.has(user.id)) {
            return replyError("🚫 لديك لعبة نشطة بالفعل! أكملها أولاً.");
        }

        const sql = client.sql;
        let userData = client.getLevel.get(user.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

        const now = Date.now();
        const OWNER_ID = "1145327691772481577"; 
        if (user.id !== OWNER_ID) {
            const lastPlayed = userData.lastMemory || 0; 
            const timeLeft = lastPlayed + COOLDOWN_MS - now;
            if (timeLeft > 0) {
                return replyError(`🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل اللعب مرة أخرى.`);
            }
        }

        // --- المراهنة التلقائية ---
        if (!betInput) {
            let proposedBet = 100;
            if (userData.mora < MIN_BET) return replyError(`❌ لا تملك مورا كافية (الحد الأدنى ${MIN_BET})!`);
            if (userData.mora < 100) proposedBet = userData.mora;

            const autoBetEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setDescription(
                    `✥ المـراهـنـة التلقائية بـ **${proposedBet}** ${EMOJI_MORA} ؟\n` +
                    `✥ ستظهر 9 إيموجيات لمدة 3 ثواني.. احفظ مكانها جيداً!`
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mem_auto_confirm').setLabel('ابدأ اللعب').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('mem_auto_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
            );

            const confirmMsg = await reply({ embeds: [autoBetEmbed], components: [row], fetchReply: true });
            
            // قفل اللاعب
            client.activePlayers.add(user.id);

            const filter = i => i.user.id === user.id && (i.customId === 'mem_auto_confirm' || i.customId === 'mem_auto_cancel');
            
            try {
                const confirmation = await confirmMsg.awaitMessageComponent({ filter, time: 15000 });
                
                if (confirmation.customId === 'mem_auto_cancel') {
                    await confirmation.update({ content: '❌ تم الإلغاء.', embeds: [], components: [] });
                    client.activePlayers.delete(user.id);
                    return;
                }

                if (confirmation.customId === 'mem_auto_confirm') {
                    await confirmation.deferUpdate(); 
                    // تحرير مؤقت للدخول في startMemoryGame (لأن الدالة ستغلق عليه مرة أخرى)
                    client.activePlayers.delete(user.id);
                    return startMemoryGame(channel, user, member, proposedBet, client, guild, sql, confirmation);
                }
            } catch (e) {
                // تحرير عند انتهاء الوقت أو الخطأ
                client.activePlayers.delete(user.id);
                if (!isSlash) await confirmMsg.delete().catch(() => {});
                else await interaction.editReply({ content: '⏰ انتهى الوقت.', embeds: [], components: [] });
                return;
            }
        } else {
            return startMemoryGame(channel, user, member, betInput, client, guild, sql, isSlash ? interaction : null);
        }
    }
};

async function startMemoryGame(channel, user, member, bet, client, guild, sql, interaction) {
    // قفل اللاعب مجدداً
    if (client.activePlayers.has(user.id)) return;
    
    let userData = client.getLevel.get(user.id, guild.id);
    if (!userData || userData.mora < bet) {
        const msg = `❌ ليس لديك مورا كافية! (رصيدك: ${userData ? userData.mora : 0})`;
        if (interaction && !interaction.replied && !interaction.deferred) await interaction.reply({ content: msg, ephemeral: true });
        else if (interaction) await interaction.editReply({ content: msg, ephemeral: true });
        else channel.send(msg);
        return;
    }

    if (bet > MAX_BET_SOLO) {
        const msg = `🚫 الحد الأقصى للرهان هو **${MAX_BET_SOLO}** ${EMOJI_MORA}.`;
        if (interaction && !interaction.replied && !interaction.deferred) await interaction.reply({ content: msg, ephemeral: true });
        else if (interaction) await interaction.editReply({ content: msg, ephemeral: true });
        else channel.send(msg);
        return;
    }

    // قفل اللاعب
    client.activePlayers.add(user.id);
    
    // خصم المورا وتحديث الوقت
    userData.mora -= bet;
    userData.lastMemory = Date.now(); 
    client.setLevel.run(userData);

    // 1. اختيار 9 إيموجيات عشوائية فريدة
    let gridEmojis = [];
    const poolCopy = [...EMOJI_POOL];
    for(let i=0; i<9; i++) {
        const randomIndex = Math.floor(Math.random() * poolCopy.length);
        gridEmojis.push(poolCopy[randomIndex]);
        poolCopy.splice(randomIndex, 1);
    }

    // 2. اختيار الهدف
    const targetIndex = Math.floor(Math.random() * 9);
    const targetEmoji = gridEmojis[targetIndex];

    // 3. بناء الشبكة (مرحلة الحفظ)
    const rowsReveal = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const index = (i * 3) + j;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mem_reveal_${index}`)
                    .setEmoji(gridEmojis[index])
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true) 
            );
        }
        rowsReveal.push(row);
    }

    const memorizeEmbed = new EmbedBuilder()
        .setTitle('🧠 تحدي الذاكرة!')
        .setDescription(`**احفظ أماكن الإيموجيات!**\nستختفي بعد **3 ثواني**...`)
        .setColor(Colors.Gold)
        .setFooter({ text: `الرهان: ${bet}` });

    let gameMsg;
    try {
        if (interaction) {
            gameMsg = await interaction.editReply({ content: " ", embeds: [memorizeEmbed], components: rowsReveal });
        } else {
            gameMsg = await channel.send({ content: `${user}`, embeds: [memorizeEmbed], components: rowsReveal });
        }
    } catch (e) {
        // 🔥 تحرير إذا فشل الإرسال 🔥
        client.activePlayers.delete(user.id);
        return;
    }

    // الانتظار ثم الإخفاء
    setTimeout(async () => {
        try {
            // بناء الشبكة المخفية (مرحلة السؤال)
            const rowsHidden = [];
            for (let i = 0; i < 3; i++) {
                const row = new ActionRowBuilder();
                for (let j = 0; j < 3; j++) {
                    const index = (i * 3) + j;
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`mem_guess_${index}`)
                            .setLabel('❓') // إخفاء الإيموجي
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                rowsHidden.push(row);
            }

            const askEmbed = new EmbedBuilder()
                .setTitle('🤔 أين كان هذا الإيموجي؟')
                .setDescription(`## ${targetEmoji}\n\nاضغط على الزر الصحيح الذي كان يحتوي على هذا الإيموجي!`)
                .setColor(Colors.Blue);

            await gameMsg.edit({ embeds: [askEmbed], components: rowsHidden });

            // بدء الاستقبال
            const collector = gameMsg.createMessageComponentCollector({ 
                filter: i => i.user.id === user.id, 
                time: 10000,
                max: 1
            });

            collector.on('collect', async i => {
                try {
                    await i.deferUpdate();
                    const clickedIndex = parseInt(i.customId.split('_')[2]);

                    // بناء الشبكة النهائية (كشف المستور)
                    const rowsFinal = [];
                    for (let r = 0; r < 3; r++) {
                        const row = new ActionRowBuilder();
                        for (let c = 0; c < 3; c++) {
                            const idx = (r * 3) + c;
                            const btn = new ButtonBuilder()
                                .setCustomId(`mem_end_${idx}`)
                                .setEmoji(gridEmojis[idx])
                                .setDisabled(true);

                            if (idx === targetIndex) {
                                btn.setStyle(ButtonStyle.Success); // الهدف
                            } else if (idx === clickedIndex && clickedIndex !== targetIndex) {
                                btn.setStyle(ButtonStyle.Danger); // الخطأ
                            } else {
                                btn.setStyle(ButtonStyle.Secondary);
                            }
                            row.addComponents(btn);
                        }
                        rowsFinal.push(row);
                    }

                    if (clickedIndex === targetIndex) {
                        let moraMultiplier = 1.0;
                        if (calculateMoraBuff) {
                            moraMultiplier = calculateMoraBuff(member, sql);
                        }

                        const profit = Math.floor(bet * moraMultiplier);
                        const totalPrize = bet + profit;
                        
                        let buffString = "";
                        const buffPercent = Math.round((moraMultiplier - 1) * 100);
                        if (buffPercent > 0) buffString = ` (+${buffPercent}%)`;

                        userData.mora += totalPrize;
                        client.setLevel.run(userData);

                        const winEmbed = new EmbedBuilder()
                            .setTitle('🎉 ذاكــرة قويــة!')
                            .setDescription(`✶ أحسنت! إجابة صحيحة.\n\nربـحت **${profit.toLocaleString()}** ${EMOJI_MORA} ${buffString}`)
                            .setColor(Colors.Green)
                            .setThumbnail(user.displayAvatarURL());

                        await gameMsg.edit({ embeds: [winEmbed], components: rowsFinal });

                    } else {
                        const loseEmbed = new EmbedBuilder()
                            .setTitle('❌ ذاكرة سمـكـة')
                            .setDescription(`✶ خطـأ اختـرت ايموجـي مختلف.\n\nخـسرت **${bet}** ${EMOJI_MORA}`)
                            .setColor(Colors.Red);

                        await gameMsg.edit({ embeds: [loseEmbed], components: rowsFinal });
                    }
                } catch (err) {
                    console.error("Error in memory collector:", err);
                }
            });

            collector.on('end', (collected, reason) => {
                // 🔥🔥🔥 تحرير اللاعب عند النهاية مهما حدث 🔥🔥🔥
                client.activePlayers.delete(user.id);
                
                if (reason === 'time') {
                    const timeEmbed = new EmbedBuilder()
                        .setTitle('⏰ انتهى الوقت!')
                        .setDescription(`لم تختر شيئاً.\nخـسرت **${bet}** ${EMOJI_MORA}`)
                        .setColor(Colors.Red);
                    gameMsg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                }
            });

        } catch (err) {
            // 🔥 تحرير عند أي خطأ مفاجئ أثناء اللعب 🔥
            console.error("Memory Game Error:", err);
            client.activePlayers.delete(user.id);
        }

    }, MEMORY_TIME);
}
