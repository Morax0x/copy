const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const path = require('path');

// محاولة استدعاء ملف الهاندلر لحساب البفات
let streakHandler;
try {
    streakHandler = require('../../streak-handler.js');
} catch (e) {}

// 1. قائمة اللاعبين النشطين (لمنع السبام)
const activePlayers = new Set();
const cooldowns = new Map();

// 2. آيدي المالك (للتجاوز)
const OWNER_ID = "1145327691772481577";

// ثوابت الرهان
const MIN_BET = 10;
const MAX_BET = 100;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
    // ⬇️ بيانات السلاش كوماند
    data: new SlashCommandBuilder()
        .setName('arrange')
        .setDescription('لعبة ترتيب الأرقام')
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('مبلغ الرهان (بين 10 و 100)')
                .setRequired(false)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
        ),

    name: 'arrange',
    aliases: ['رتب', 'ترتيب'],
    category: "Economy", // للتوافق مع الكازينو
    description: 'لعبـة ترتيــب الأرقــام',
    
    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, guild, channel, betArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            guild = interaction.guild;
            channel = interaction.channel;
            betArg = interaction.options.getInteger('amount');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            guild = message.guild;
            channel = message.channel;
            betArg = args[0] ? parseInt(args[0]) : null;
        }

        const userId = user.id;
        const guildId = guild.id;
        
        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        const replyError = async (content) => {
            const payload = { content: content };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const client = isSlash ? interaction.client : message.client;
        if (!client.sql) return replyError("❌ خطأ: قاعدة البيانات غير متصلة.");
        
        const db = client.sql; 
        const MORA_EMOJI = client.EMOJI_MORA || '<:mora:1435647151349698621>';

        const clearActive = () => activePlayers.delete(userId);

        if (activePlayers.has(userId)) {
            return replyError("🚫 **لديك عملية نشطة بالفعل!** أكمل اللعبة أو الرهان الحالي أولاً.");
        }

        if (userId !== OWNER_ID) {
            if (cooldowns.has(userId)) {
                const expirationTime = cooldowns.get(userId) + 3600000;
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000 / 60;
                    return replyError(`<:stop:1436337453098340442> **ريــلاكــس!** يمكنك اللعب مجدداً بعد **${timeLeft.toFixed(0)} دقيقة**.`);
                }
            }
        }

        activePlayers.add(userId);

        // --- دالة تشغيل اللعبة ---
        const startGame = async (finalBetAmount) => {
            try {
                // جلب بيانات المستخدم مرة أخرى قبل البدء للتأكد من الرصيد
                const userCheck = db.prepare('SELECT mora FROM levels WHERE user = ? AND guild = ?').get(userId, guildId);
                
                // في حالة الرهان التلقائي، إذا كان الرصيد أقل من 100، نعدل الرهان ليكون الرصيد المتاح (بشرط أن يكون فوق الحد الأدنى)
                if (userCheck && userCheck.mora < finalBetAmount && !betArg) {
                     finalBetAmount = userCheck.mora;
                }

                if (!userCheck || userCheck.mora < finalBetAmount) {
                      clearActive(); 
                      return replyError(`💸 **رصيدك غير كافــي!** <:mirkk:1435648219488190525>`);
                }
                
                if (finalBetAmount < MIN_BET) {
                    clearActive();
                    return replyError(`❌ **الحد الأدنى للرهان هو ${MIN_BET} ${MORA_EMOJI}**`);
                }

                db.prepare('UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?').run(finalBetAmount, userId, guildId);

                // تسجيل الكولداون ووقت آخر استخدام في قاعدة البيانات
                if (userId !== OWNER_ID) {
                    cooldowns.set(userId, Date.now());
                }
                
                // تحديث عمود lastArrange في قاعدة البيانات للأوامر المعتمدة على الوقت
                try {
                    db.prepare("UPDATE levels SET lastArrange = ? WHERE user = ? AND guild = ?").run(Date.now(), userId, guildId);
                } catch (e) {
                    // تجاهل الخطأ في حال عدم وجود العمود مؤقتاً
                }

                const numbersCount = 9;
                const randomNumbers = [];
                while (randomNumbers.length < numbersCount) {
                    let n = getRandomInt(1, 99);
                    if (!randomNumbers.includes(n)) randomNumbers.push(n);
                }

                const sortedSolution = [...randomNumbers].sort((a, b) => a - b);
                let currentStep = 0; 

                const buttons = randomNumbers.map(num => 
                    new ButtonBuilder()
                        .setCustomId(`num_${num}`)
                        .setLabel(`${num}`)
                        .setStyle(ButtonStyle.Secondary)
                );

                const shuffledButtons = buttons.sort(() => Math.random() - 0.5);
                const row1 = new ActionRowBuilder().addComponents(shuffledButtons.slice(0, 3));
                const row2 = new ActionRowBuilder().addComponents(shuffledButtons.slice(3, 6));
                const row3 = new ActionRowBuilder().addComponents(shuffledButtons.slice(6, 9));

                const gameEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setThumbnail(user.displayAvatarURL())
                    .setTitle('❖ رتـب الأرقـام مـن الأصغر للأكـبر')
                    .setDescription(`❖ الرهــان: **${finalBetAmount} ${MORA_EMOJI}**\nاضغط الأزرار بالترتيب الصحيح قبل انتهاء الوقت!`)
                    .setFooter({ text: '❖ لــديــك 25 ثـانيــة' });

                const gameMsg = isSlash 
                    ? await interaction.editReply({ content: '', embeds: [gameEmbed], components: [row1, row2, row3] })
                    : await message.channel.send({ embeds: [gameEmbed], components: [row1, row2, row3] });

                const startTime = Date.now();
                const collector = gameMsg.createMessageComponentCollector({ 
                    componentType: ComponentType.Button, 
                    time: 25000 
                });

                // دوال مساعدة للأزرار
                const updateButtonInRows = (customId, style, disabled = false) => {
                    const rows = [row1, row2, row3];
                    for (const row of rows) {
                        const btnIndex = row.components.findIndex(b => b.data.custom_id === customId);
                        if (btnIndex !== -1) {
                            row.components[btnIndex].setStyle(style);
                            if (disabled) row.components[btnIndex].setDisabled(true);
                            return;
                        }
                    }
                };

                const disableAll = (style) => {
                    [row1, row2, row3].forEach(row => {
                        row.components.forEach(btn => {
                            btn.setDisabled(true);
                            if (btn.data.style === ButtonStyle.Secondary) btn.setStyle(style);
                        });
                    });
                };

                // دالة لإنهاء اللعبة (تستدعى من الزر أو من الوقت)
                const finishGame = async (i, reason) => {
                    clearActive(); 
                    
                    try {
                        if (reason === 'win') {
                            const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
                            
                            let moraMultiplier = 1.0;
                            const memberObj = isSlash ? interaction.member : message.member;
                            
                            // حساب نسبة البف (إذا وجدت)
                            if (streakHandler && streakHandler.calculateMoraBuff) {
                                moraMultiplier = streakHandler.calculateMoraBuff(memberObj, db);
                            }
                            
                            // الربح = الرهان × 3
                            const profit = Math.floor(finalBetAmount * 3.0 * moraMultiplier); 
                            const totalPrize = finalBetAmount + profit; 
                            
                            const buffOnlyPercent = Math.round((moraMultiplier - 1) * 100);
                            let buffText = "";
                            if (buffOnlyPercent > 0) buffText = ` (معزز +${buffOnlyPercent}%)`;

                            db.prepare('UPDATE levels SET mora = mora + ? WHERE user = ? AND guild = ?').run(totalPrize, userId, guildId);

                            const winEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle('❖ كفــوو عليك <:2BCrikka:1437806481071411391>')
                                .setDescription(`✶ جبتها صــح!\n⏱️ الوقت: **${timeTaken}ث**\n💰 ربـحـت: **${profit}** ${MORA_EMOJI}${buffText}`);

                            disableAll(ButtonStyle.Success);
                            
                            if (i) {
                                await i.editReply({ embeds: [winEmbed], components: [row1, row2, row3] });
                            } else {
                                await gameMsg.edit({ embeds: [winEmbed], components: [row1, row2, row3] });
                            }

                        } else if (reason === 'lose') {
                            let reasonText = 'ضغطت رقم غلط!';
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle(' خـسـرت <:catla:1437335118153781360>!')
                                .setDescription(`${reasonText}\nراحت عليك **${finalBetAmount} ${MORA_EMOJI}**`);

                            disableAll(ButtonStyle.Secondary);
                            
                            if (i) {
                                await i.editReply({ embeds: [loseEmbed], components: [row1, row2, row3] });
                            } else {
                                await gameMsg.edit({ embeds: [loseEmbed], components: [row1, row2, row3] });
                            }

                        } else if (reason === 'time') {
                            // هنا انتهى الوقت، لا يوجد زر مضغوط، لذا نستخدم gameMsg.edit
                            let reasonText = ' انتهى الوقت!';
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle(' خـسـرت <:catla:1437335118153781360>!')
                                .setDescription(`${reasonText}\nراحت عليك **${finalBetAmount} ${MORA_EMOJI}**`);

                            disableAll(ButtonStyle.Secondary);
                            await gameMsg.edit({ embeds: [loseEmbed], components: [row1, row2, row3] }).catch(() => {});
                        }
                    } catch (err) {
                        console.error("Game finish error:", err);
                    }
                };

                collector.on('collect', async i => {
                    if (i.user.id !== userId) return i.reply({ content: 'هذه اللعبة ليست لك!', ephemeral: true });

                    if (!i.deferred && !i.replied) await i.deferUpdate();

                    const clickedNum = parseInt(i.customId.split('_')[1]);
                    const correctNum = sortedSolution[currentStep];

                    if (clickedNum === correctNum) {
                        currentStep++;
                        // تحديث الزر الحالي للأخضر
                        updateButtonInRows(i.customId, ButtonStyle.Success, true);

                        if (currentStep === sortedSolution.length) {
                            // فوز: استدعاء دالة النهاية فوراً وإيقاف الكوليكتور
                            collector.stop('finished');
                            await finishGame(i, 'win');
                        } else {
                            // استمرار اللعب: تحديث الأزرار فقط (باستخدام editReply لأننا عملنا deferUpdate)
                            await i.editReply({ components: [row1, row2, row3] });
                        }
                    } else {
                        // خسارة: تحديث الزر للأحمر وإنهاء اللعبة فوراً
                        updateButtonInRows(i.customId, ButtonStyle.Danger, false);
                        collector.stop('finished');
                        await finishGame(i, 'lose');
                    }
                });

                collector.on('end', async (collected, reason) => {
                    // إذا انتهى الوقت فقط نستدعي دالة النهاية (لأن الفوز والخسارة تمت معالجتهم في collect)
                    if (reason === 'time') {
                        await finishGame(null, 'time');
                    } else if (reason !== 'finished') {
                        // حالة طوارئ (حذف الرسالة أو غيره)
                        clearActive();
                    }
                });

            } catch (err) {
                clearActive();
                console.error("خطأ أثناء بدء اللعبة:", err);
                replyError("حدث خطأ أثناء بدء اللعبة.");
            }
        };

        // ============================================================
        //  معالجة الأمر (Input Logic)
        // ============================================================
        
        // التحقق من المدخلات غير الصالحة
        if (betArg && isNaN(betArg)) {
             clearActive();
             return replyError("❌ **الرجاء إدخال مبلغ رهان صحيح (أرقام فقط).**");
        }

        let finalBetAmount = betArg;

        // 1. إذا حدد رقم مباشرة (رهان يدوي)
        if (finalBetAmount) {
            if (finalBetAmount < MIN_BET) {
                clearActive(); return replyError(`❌ **الحد الأدنى للرهان هو ${MIN_BET} ${MORA_EMOJI}**`);
            }
            if (finalBetAmount > MAX_BET) {
                clearActive(); return replyError(`❌ **الحد الأقصى للرهان هو ${MAX_BET} ${MORA_EMOJI}**`);
            }
            return startGame(finalBetAmount);
        }

        // 2. نظام الرهان التلقائي (اذا لم يحدد رقم)
        // نراهن تلقائياً بـ 100، أو الرصيد الموجود إذا كان أقل من 100
        let userData = db.prepare('SELECT mora FROM levels WHERE user = ? AND guild = ?').get(userId, guildId);
        
        if (!userData || userData.mora < MIN_BET) {
            clearActive();
            return replyError(`💸 **ليس لديك مورا كافية للعب! (الحد الأدنى ${MIN_BET})** <:catla:1437335118153781360>`);
        }

        let proposedBet = 100;
        if (userData.mora < 100) proposedBet = userData.mora;

        // ابدأ اللعبة مباشرة بالرهان المقترح
        return startGame(proposedBet);
    }
};
